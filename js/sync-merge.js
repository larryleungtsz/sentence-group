/**
 * Backend-neutral merge for Passage Group cloud sync.
 *
 * localStorage keys (unchanged):
 *   website-manager-timing-v1
 *   website-manager-progress-v2
 *
 * Phone backup / export shape (one file, both keys):
 *   {
 *     "website-manager-timing-v1": <object or JSON string>,
 *     "website-manager-progress-v2": <object or JSON string>
 *   }
 * Import also accepts a raw timing document `{ sessions: [] }` or a raw
 * progress document `{ quizzes, chunks, sentences }`.
 *
 * NEVER replace one side with an empty or partial document.
 *
 * TIMING
 *   Sessions are the union, keyed by session id.
 *   Quizzes inside a session are the union, keyed by quiz id
 *   (same session id + quiz id → one record; keep the longer durationMs,
 *   then the later endedAt).
 *   The same quiz id with no id collision across different sessions stays
 *   in each session.
 *   Chunk totals are recomputed from the merged quiz list so they are not
 *   double-counted.
 *   Session wall-clock totalMs is the max, not the sum.
 *   After merge, keep the newest 200 sessions (same cap as Timing).
 *   An empty session list does not wipe the other side.
 *
 * PROGRESS (per quiz id, per chunk key "group:chunkId", per sentence slug)
 *   A missing key on one side does not delete that key on the other.
 *   An empty document (no quiz, chunk, or sentence entries) does not
 *   replace a non-empty document.
 *
 *   Quiz:
 *     completedStages = union (a stage finished on either device stays).
 *     lastReviewedAt = later ISO timestamp.
 *     updatedAt = later updatedAt, else the later lastReviewedAt.
 *     Empty completedStages never wipe stages that exist on the other side.
 *     There are no delete-tombstones: removing a key locally does not
 *     remove it from the other side on merge.
 *
 *   Chunk / sentence cursor (stageIndex + lastCompletedAt):
 *     Empty cursor = stageIndex 0 AND lastCompletedAt null/empty.
 *     An empty cursor never replaces a non-empty cursor.
 *     If BOTH sides have updatedAt and they differ: last-write-wins
 *     (the later updatedAt), even if stageIndex is lower. That is the
 *     only path that moves a cursor backwards.
 *     Otherwise (phone backups often have no updatedAt): keep the higher
 *     stageIndex. Tie → later lastCompletedAt. A clocked-but-lower record
 *     must not wipe an untimestamped phone seed that is further along.
 *
 *   T1 event (學新詞), stored as chunk.enteredT1At:
 *     One ISO timestamp per chunk key — the first time stageIndex
 *     reached T1 (index 3). The chunk map is the event log; there is
 *     no separate events[] array.
 *     Union by chunk key: a key present on only one side is kept.
 *     Empty / missing / invalid enteredT1At never clears the other side.
 *     If both sides have a timestamp, keep the earliest.
 *     This is independent of stageIndex last-write-wins. A newer cursor
 *     must not drop an older enteredT1At.
 *
 * SEED (per document, timing and progress independently)
 *   both empty            → none
 *   local data, cloud empty → push (upload local seed)
 *   local empty, cloud data → pull
 *   both have data        → merge, then save local and push the merge
 *   Never PUT an empty payload over a non-empty cloud row.
 *   Never replace non-empty local with an empty result.
 *
 * Swapping backends later should keep this file and replace js/sync.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) root.SyncMerge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TIMING_KEY = 'website-manager-timing-v1';
  var PROGRESS_KEY = 'website-manager-progress-v2';
  var MAX_SESSIONS = 200;

  function isPlain(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function timeMs(value) {
    if (value == null || value === '') return NaN;
    var t = Date.parse(value);
    return t;
  }

  function laterIso(a, b) {
    var ta = timeMs(a);
    var tb = timeMs(b);
    var aOk = !isNaN(ta);
    var bOk = !isNaN(tb);
    if (!aOk && !bOk) return a || b || null;
    if (!aOk) return b;
    if (!bOk) return a;
    return ta >= tb ? a : b;
  }

  function earlierIso(a, b) {
    var ta = timeMs(a);
    var tb = timeMs(b);
    var aOk = !isNaN(ta);
    var bOk = !isNaN(tb);
    if (!aOk && !bOk) return a || b || null;
    if (!aOk) return b;
    if (!bOk) return a;
    return ta <= tb ? a : b;
  }

  function normalizeTiming(input) {
    var sessions = [];
    if (isPlain(input) && Array.isArray(input.sessions)) {
      for (var i = 0; i < input.sessions.length; i++) {
        var s = input.sessions[i];
        if (isPlain(s)) sessions.push(s);
      }
    }
    return { sessions: sessions };
  }

  function isTimingEmpty(input) {
    return normalizeTiming(input).sessions.length === 0;
  }

  function normalizeProgress(input) {
    if (!isPlain(input)) {
      return { quizzes: {}, chunks: {}, sentences: {} };
    }
    return {
      quizzes: isPlain(input.quizzes) ? input.quizzes : {},
      chunks: isPlain(input.chunks) ? input.chunks : {},
      sentences: isPlain(input.sentences) ? input.sentences : {},
    };
  }

  function isProgressEmpty(input) {
    var n = normalizeProgress(input);
    return (
      Object.keys(n.quizzes).length === 0 &&
      Object.keys(n.chunks).length === 0 &&
      Object.keys(n.sentences).length === 0
    );
  }

  function preferQuiz(a, b) {
    var da = Number(a && a.durationMs) || 0;
    var db = Number(b && b.durationMs) || 0;
    if (db > da) return b;
    if (da > db) return a;
    var ea = String((a && a.endedAt) || '');
    var eb = String((b && b.endedAt) || '');
    return eb > ea ? b : a;
  }

  function mergeQuizLists(listA, listB) {
    var map = new Map();
    function add(q, i, side) {
      if (!isPlain(q)) return;
      var key = q.quizId
        ? 'id:' + String(q.quizId)
        : 'anon:' + side + ':' + i + ':' + JSON.stringify(q);
      var prev = map.get(key);
      map.set(key, prev ? preferQuiz(prev, q) : q);
    }
    (listA || []).forEach(function (q, i) {
      add(q, i, 'a');
    });
    (listB || []).forEach(function (q, i) {
      add(q, i, 'b');
    });
    return Array.from(map.values()).sort(function (x, y) {
      return String(x.startedAt || '').localeCompare(String(y.startedAt || ''));
    });
  }

  function recomputeChunks(quizzes) {
    var acc = Object.create(null);
    (quizzes || []).forEach(function (q) {
      var key =
        q.kind === 'sentence'
          ? 'sentence'
          : 'c' + (q.chunkId != null ? q.chunkId : '?');
      if (!acc[key]) {
        acc[key] = {
          key: key,
          chunkId: q.chunkId != null ? q.chunkId : null,
          kind: q.kind || 'chunk',
          label: q.kind === 'sentence' ? '段落題' : 'chunk' + q.chunkId,
          totalMs: 0,
          quizCount: 0,
        };
      }
      acc[key].totalMs += Number(q.durationMs) || 0;
      acc[key].quizCount += 1;
    });
    return Object.keys(acc)
      .sort()
      .map(function (k) {
        return acc[k];
      });
  }

  function mergeSessionPair(a, b) {
    var quizzes = mergeQuizLists(a.quizzes, b.quizzes);
    var meta =
      String(b.endedAt || '') > String(a.endedAt || '') ? b : a;
    return {
      id: a.id != null && String(a.id) !== '' ? a.id : b.id,
      groupSlug: meta.groupSlug || a.groupSlug || b.groupSlug || '',
      groupTitle: meta.groupTitle || a.groupTitle || b.groupTitle || '',
      startedAt: earlierIso(a.startedAt, b.startedAt),
      endedAt: laterIso(a.endedAt, b.endedAt),
      totalMs: Math.max(Number(a.totalMs) || 0, Number(b.totalMs) || 0),
      quizCount: quizzes.length,
      reason: meta.reason || a.reason || b.reason || 'complete',
      quizzes: quizzes,
      chunks: recomputeChunks(quizzes),
    };
  }

  function sessionKey(s) {
    if (s && s.id != null && String(s.id) !== '') return 'id:' + String(s.id);
    return 'anon:' + JSON.stringify(s);
  }

  /**
   * Union sessions by id; union quizzes by quiz id within a session.
   * Empty input on either side contributes nothing.
   */
  function mergeTiming(local, remote, opts) {
    var L = normalizeTiming(local);
    var R = normalizeTiming(remote);
    var map = new Map();
    function take(list) {
      list.forEach(function (s) {
        var key = sessionKey(s);
        if (!map.has(key)) map.set(key, s);
        else map.set(key, mergeSessionPair(map.get(key), s));
      });
    }
    take(L.sessions);
    take(R.sessions);
    var sessions = Array.from(map.values()).sort(function (a, b) {
      return String(b.startedAt || '').localeCompare(String(a.startedAt || ''));
    });
    var max =
      opts && opts.maxSessions != null ? opts.maxSessions : MAX_SESSIONS;
    if (max >= 0 && sessions.length > max) sessions = sessions.slice(0, max);
    return { sessions: sessions };
  }

  function isCursorEmpty(rec) {
    if (!isPlain(rec)) return true;
    return (rec.stageIndex | 0) === 0 && (rec.lastCompletedAt == null || rec.lastCompletedAt === '');
  }

  function validIso(value) {
    if (typeof value !== 'string' || !value) return null;
    var t = timeMs(value);
    if (isNaN(t)) return null;
    return value;
  }

  /** Earliest non-empty enteredT1At. A blank side does not win. */
  function earliestEnteredT1(a, b) {
    var aa = a && validIso(a.enteredT1At);
    var bb = b && validIso(b.enteredT1At);
    if (!aa && !bb) return null;
    if (!aa) return bb;
    if (!bb) return aa;
    return earlierIso(aa, bb);
  }

  function applyEnteredT1(out, a, b) {
    var stamp = earliestEnteredT1(a, b);
    if (stamp) out.enteredT1At = stamp;
    else delete out.enteredT1At;
    return out;
  }

  function copyCursor(rec) {
    var out = {
      lastCompletedAt: rec && rec.lastCompletedAt ? rec.lastCompletedAt : null,
      stageIndex: rec ? rec.stageIndex | 0 : 0,
    };
    if (rec && rec.updatedAt) out.updatedAt = rec.updatedAt;
    var stamp = rec && validIso(rec.enteredT1At);
    if (stamp) out.enteredT1At = stamp;
    return out;
  }

  function updatedMs(rec) {
    if (!rec || !rec.updatedAt) return null;
    var t = timeMs(rec.updatedAt);
    return isNaN(t) ? null : t;
  }

  /**
   * Chunk or sentence cursor. See file header for the timestamp rules.
   */
  function mergeCursor(a, b) {
    var aEmpty = isCursorEmpty(a);
    var bEmpty = isCursorEmpty(b);
    var out;
    if (aEmpty && bEmpty) out = { lastCompletedAt: null, stageIndex: 0 };
    else if (aEmpty) out = copyCursor(b);
    else if (bEmpty) out = copyCursor(a);
    else {
      var aU = updatedMs(a);
      var bU = updatedMs(b);
      if (aU != null && bU != null && aU !== bU) {
        out = copyCursor(aU > bU ? a : b);
      } else {
        var aSi = a.stageIndex | 0;
        var bSi = b.stageIndex | 0;
        if (aSi !== bSi) out = copyCursor(aSi > bSi ? a : b);
        else {
          out = {
            lastCompletedAt: laterIso(a.lastCompletedAt, b.lastCompletedAt) || null,
            stageIndex: aSi,
          };
          var stamp = laterIso(a.updatedAt, b.updatedAt);
          if (stamp) out.updatedAt = stamp;
        }
      }
    }
    // enteredT1At is unioned even when the cursor itself is empty or loses LWW.
    return applyEnteredT1(out, a, b);
  }

  function mergeQuizRecord(a, b) {
    if (!isPlain(a)) return clone(b);
    if (!isPlain(b)) return clone(a);
    var stages = [];
    var seen = Object.create(null);
    function addStages(list) {
      (list || []).forEach(function (s) {
        var key = String(s);
        if (seen[key]) return;
        seen[key] = true;
        stages.push(s);
      });
    }
    addStages(a.completedStages);
    addStages(b.completedStages);
    var out = Object.assign({}, a, b, {
      completedStages: stages,
      lastReviewedAt: laterIso(a.lastReviewedAt, b.lastReviewedAt) || null,
    });
    var stamp = laterIso(a.updatedAt, b.updatedAt) || out.lastReviewedAt;
    if (stamp) out.updatedAt = stamp;
    else delete out.updatedAt;
    return out;
  }

  function mergeRecordMap(a, b, mergeFn, copyFn) {
    var out = {};
    var keys = Object.keys(a || {}).concat(Object.keys(b || {}));
    var seen = Object.create(null);
    keys.forEach(function (k) {
      if (seen[k]) return;
      seen[k] = true;
      var av = a && Object.prototype.hasOwnProperty.call(a, k) ? a[k] : undefined;
      var bv = b && Object.prototype.hasOwnProperty.call(b, k) ? b[k] : undefined;
      if (av == null && bv == null) return;
      if (av == null) out[k] = copyFn(bv);
      else if (bv == null) out[k] = copyFn(av);
      else out[k] = mergeFn(av, bv);
    });
    return out;
  }

  function mergeProgress(local, remote) {
    var L = normalizeProgress(local);
    var R = normalizeProgress(remote);
    if (isProgressEmpty(L) && isProgressEmpty(R)) {
      return { quizzes: {}, chunks: {}, sentences: {} };
    }
    if (isProgressEmpty(L)) return clone(R);
    if (isProgressEmpty(R)) return clone(L);
    return {
      quizzes: mergeRecordMap(L.quizzes, R.quizzes, mergeQuizRecord, clone),
      chunks: mergeRecordMap(L.chunks, R.chunks, mergeCursor, copyCursor),
      sentences: mergeRecordMap(L.sentences, R.sentences, mergeCursor, copyCursor),
    };
  }

  /**
   * both empty → none
   * local only → push (seed upload)
   * remote only → pull
   * both → merge
   */
  function planDocumentSync(localEmpty, remoteMissingOrEmpty) {
    if (localEmpty && remoteMissingOrEmpty) return 'none';
    if (!localEmpty && remoteMissingOrEmpty) return 'push';
    if (localEmpty && !remoteMissingOrEmpty) return 'pull';
    return 'merge';
  }

  function remoteWriteAllowed(plan, mergedEmpty) {
    if (mergedEmpty) return false;
    return plan === 'push' || plan === 'merge';
  }

  function localWriteAllowed(localEmpty, mergedEmpty) {
    if (mergedEmpty && !localEmpty) return false;
    return true;
  }

  function looksLikeTiming(o) {
    return isPlain(o) && Array.isArray(o.sessions);
  }

  function looksLikeProgress(o) {
    if (!isPlain(o) || Array.isArray(o.sessions)) return false;
    return isPlain(o.quizzes) || isPlain(o.chunks) || isPlain(o.sentences);
  }

  function unwrapStored(v) {
    if (v == null) return null;
    var cur = v;
    var guard = 0;
    while (typeof cur === 'string' && guard < 3) {
      var t = cur.trim();
      if (!t || t === 'null') return null;
      cur = JSON.parse(t);
      guard++;
    }
    return cur;
  }

  /**
   * Accept:
   *   - export wrapper with the two localStorage keys (values object or string)
   *   - bookmarklet dump (getItem strings)
   *   - a raw timing document
   *   - a raw progress document
   * Unknown keys are ignored. A missing key does not clear that store.
   */
  function parseImport(input) {
    var data = input;
    if (typeof data === 'string') {
      var trimmed = data.trim();
      if (!trimmed) {
        throw new Error('空白，未匯入');
      }
      data = JSON.parse(trimmed);
    }
    if (typeof data === 'string') data = JSON.parse(data);
    if (!isPlain(data)) {
      throw new Error('JSON 必須係一個物件');
    }

    var hasTiming = Object.prototype.hasOwnProperty.call(data, TIMING_KEY);
    var hasProgress = Object.prototype.hasOwnProperty.call(data, PROGRESS_KEY);
    var timingSrc = hasTiming ? unwrapStored(data[TIMING_KEY]) : undefined;
    var progressSrc = hasProgress ? unwrapStored(data[PROGRESS_KEY]) : undefined;

    if (!hasTiming && !hasProgress) {
      if (looksLikeTiming(data)) {
        hasTiming = true;
        timingSrc = data;
      } else if (looksLikeProgress(data)) {
        hasProgress = true;
        progressSrc = data;
      }
    }

    if (!hasTiming && !hasProgress) {
      throw new Error(
        '搵唔到 website-manager-timing-v1 或 website-manager-progress-v2'
      );
    }

    var timing = null;
    var progress = null;
    if (hasTiming) {
      if (timingSrc == null) timing = { sessions: [] };
      else if (!looksLikeTiming(timingSrc)) {
        throw new Error('timing 格式唔啱：要有 sessions 陣列');
      } else timing = normalizeTiming(timingSrc);
    }
    if (hasProgress) {
      if (progressSrc == null) progress = emptyProgress();
      else if (!looksLikeProgress(progressSrc) && !isPlain(progressSrc)) {
        throw new Error('progress 格式唔啱');
      } else if (!isPlain(progressSrc)) {
        throw new Error('progress 格式唔啱');
      } else progress = normalizeProgress(progressSrc);
    }

    return {
      timing: timing,
      progress: progress,
      hasTiming: hasTiming,
      hasProgress: hasProgress,
    };
  }

  function emptyProgress() {
    return { quizzes: {}, chunks: {}, sentences: {} };
  }

  /**
   * Merge a parsed backup into the current local documents.
   * Keys absent from the backup are left unchanged.
   * Present-but-empty backup data does not wipe local data.
   */
  function applyImport(localTiming, localProgress, imported) {
    return {
      timing: imported.hasTiming
        ? mergeTiming(localTiming, imported.timing)
        : normalizeTiming(localTiming),
      progress: imported.hasProgress
        ? mergeProgress(localProgress, imported.progress)
        : normalizeProgress(localProgress),
    };
  }

  function buildExportObject(timing, progress, exportedAt) {
    var out = {
      source: 'sentence-group',
      exportedAt: exportedAt || new Date().toISOString(),
    };
    out[TIMING_KEY] = normalizeTiming(timing);
    out[PROGRESS_KEY] = normalizeProgress(progress);
    return out;
  }

  function countProgress(input) {
    var n = normalizeProgress(input);
    return {
      quizzes: Object.keys(n.quizzes).length,
      chunks: Object.keys(n.chunks).length,
      sentences: Object.keys(n.sentences).length,
    };
  }

  /**
   * How the 匯出 JSON button hands the file over.
   * iPhone Chrome ignores javascript: bookmarklets and often drops <a download>.
   *   desktop: try download, always leave the full-screen textarea up
   *   phone with Web Share: share sheet, then copy if that fails
   *   phone with clipboard only: copy
   *   always end on the textarea so a long-press Select All still works
   * env: { ios, canShare, canCopy, canDownload }
   */
  function planExportFallbacks(env) {
    env = env || {};
    var steps = [];
    if (!env.ios && env.canDownload !== false) {
      steps.push('download');
    } else if (env.canShare) {
      steps.push('share');
      if (env.canCopy) steps.push('copy');
    } else if (env.canCopy) {
      steps.push('copy');
    }
    steps.push('textarea');
    return steps;
  }

  return {
    TIMING_KEY: TIMING_KEY,
    PROGRESS_KEY: PROGRESS_KEY,
    MAX_SESSIONS: MAX_SESSIONS,
    normalizeTiming: normalizeTiming,
    normalizeProgress: normalizeProgress,
    isTimingEmpty: isTimingEmpty,
    isProgressEmpty: isProgressEmpty,
    mergeTiming: mergeTiming,
    mergeProgress: mergeProgress,
    mergeCursor: mergeCursor,
    mergeQuizRecord: mergeQuizRecord,
    planDocumentSync: planDocumentSync,
    remoteWriteAllowed: remoteWriteAllowed,
    localWriteAllowed: localWriteAllowed,
    parseImport: parseImport,
    applyImport: applyImport,
    buildExportObject: buildExportObject,
    countProgress: countProgress,
    recomputeChunks: recomputeChunks,
    planExportFallbacks: planExportFallbacks,
  };
});
