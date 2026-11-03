/**
 * Completion-based progress (localStorage v2).
 * Structure:
 * {
 *   quizzes: { [quizId]: { completedStages: string[], lastReviewedAt: string|null } },
 *   chunks:  { [groupSlug:chunkId]: { lastCompletedAt, stageIndex, updatedAt?, enteredT1At? } },
 *   sentences: { [groupSlug]: { lastCompletedAt, stageIndex } }
 * }
 * Admission / join order is decided in Schedule (order + dense), not here.
 * stageIndex 0 = admitted into T01 once Schedule admits the chunk.
 * updatedAt is the write time used by cloud merge (last-write-wins only when
 * both sides have it). Older backups without updatedAt still load.
 *
 * enteredT1At is the 學新詞 event: the ISO time this chunk's stageIndex first
 * reached T1 (Schedule.T1_STAGE_INDEX, 3). One timestamp per chunk key.
 * skip / already_introduced / shared_with_prior_group chunks are not logged.
 * Chunks already past T1 are not backfilled — that would invent a date.
 * A chunk sitting exactly at T1 can use lastCompletedAt, because that write
 * is the crossing. Sync merge keeps the earliest stamp and never lets an
 * empty value clear it (see js/sync-merge.js).
 */
(function (global) {
  const KEY = 'website-manager-progress-v2';

  function storage() {
    return global.localStorage;
  }

  function schedule() {
    return global.Schedule;
  }

  function emptyRoot() {
    return { quizzes: {}, chunks: {}, sentences: {} };
  }

  function loadAll() {
    try {
      const raw = JSON.parse(storage().getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return emptyRoot();
      return {
        quizzes: raw.quizzes || {},
        chunks: raw.chunks || {},
        sentences: raw.sentences || {},
      };
    } catch (_) {
      return emptyRoot();
    }
  }

  function notifyLocal(kind) {
    try {
      if (global.Sync && typeof global.Sync.onLocalWrite === 'function') {
        global.Sync.onLocalWrite(kind);
      }
    } catch (e) {}
  }

  function saveAll(data) {
    storage().setItem(KEY, JSON.stringify(data));
    notifyLocal('progress');
  }

  function chunkKey(groupSlug, chunkId) {
    return groupSlug + ':' + chunkId;
  }

  function isIso(value) {
    if (typeof value !== 'string' || !value) return false;
    return !isNaN(Date.parse(value));
  }

  /**
   * Same flags as Schedule.isSkipped / isAlreadyIntroduced and
   * StatsMetrics.chunkIsLearnExcluded. Kept inline so a practice page
   * still records correctly if stats-metrics.js is not on the page.
   */
  function chunkIsLearnExcluded(chunk) {
    if (global.StatsMetrics && typeof global.StatsMetrics.chunkIsLearnExcluded === 'function') {
      return global.StatsMetrics.chunkIsLearnExcluded(chunk);
    }
    if (!chunk || typeof chunk !== 'object') return false;
    if (chunk.skip === true || chunk.skipped === true) return true;
    if (chunk.already_introduced === true) return true;
    if (chunk.shared_with_prior_group) return true;
    return false;
  }

  function t1StageIndex() {
    const api = schedule();
    if (api && api.T1_STAGE_INDEX != null) return api.T1_STAGE_INDEX | 0;
    return 3;
  }

  function resolveEnteredT1At(before, nextStageIndex, nowIso) {
    const T1 = t1StageIndex();
    if (global.StatsMetrics && typeof global.StatsMetrics.resolveEnteredT1At === 'function') {
      return global.StatsMetrics.resolveEnteredT1At(before, nextStageIndex, nowIso, T1);
    }
    if (before && isIso(before.enteredT1At)) return before.enteredT1At;
    const prev = before ? before.stageIndex | 0 : 0;
    const next = nextStageIndex | 0;
    if (prev < T1 && next >= T1 && isIso(nowIso)) return nowIso;
    if (next === T1 && before && isIso(before.lastCompletedAt)) return before.lastCompletedAt;
    if (prev === T1 && next > T1 && before && isIso(before.lastCompletedAt)) {
      return before.lastCompletedAt;
    }
    return null;
  }

  function getQuiz(quizId) {
    const all = loadAll();
    return (
      all.quizzes[quizId] || { completedStages: [], lastReviewedAt: null }
    );
  }

  /** Alias used by older call sites. */
  function get(quizId) {
    return getQuiz(quizId);
  }

  function getChunk(groupSlug, chunkId) {
    const all = loadAll();
    const k = chunkKey(groupSlug, chunkId);
    return all.chunks[k] || schedule().defaultChunkState();
  }

  function getSentence(groupSlug) {
    const all = loadAll();
    return all.sentences[groupSlug] || schedule().defaultSentenceState();
  }

  function markPassed(quizId, stagesToMark, nowIso) {
    const all = loadAll();
    const cur = all.quizzes[quizId] || {
      completedStages: [],
      lastReviewedAt: null,
    };
    const set = new Set(cur.completedStages || []);
    for (const s of stagesToMark || []) set.add(s);
    cur.completedStages = Array.from(set);
    cur.lastReviewedAt = nowIso || new Date().toISOString();
    cur.updatedAt = cur.lastReviewedAt;
    all.quizzes[quizId] = cur;
    saveAll(all);
    return cur;
  }

  /**
   * After all currently due chunk quizzes for this chunk are done,
   * record completion time and advance stageIndex so the next stage
   * unlocks after the configured wait.
   * chunk is the groups.json chunk, when the caller has it, so skip /
   * already_introduced chunks do not get an enteredT1At event.
   */
  function advanceChunk(groupSlug, chunkId, nowIso, chunk) {
    const all = loadAll();
    const k = chunkKey(groupSlug, chunkId);
    const cur = all.chunks[k] || schedule().defaultChunkState();
    const now = nowIso || new Date().toISOString();
    const nextStage = (cur.stageIndex | 0) + 1;
    const excluded = chunkIsLearnExcluded(chunk);
    const stamp = excluded ? null : resolveEnteredT1At(cur, nextStage, now);
    cur.lastCompletedAt = now;
    cur.stageIndex = nextStage;
    cur.updatedAt = now;
    if (!excluded && stamp) cur.enteredT1At = stamp;
    all.chunks[k] = cur;
    saveAll(all);
    return cur;
  }

  /**
   * Best-effort backfill for chunks currently exactly at T1.
   * Does not invent enteredT1At for stageIndex already past T1.
   * Does not log skip / already_introduced. Returns true if it wrote.
   */
  function reconcileEnteredT1(groupsData) {
    const all = loadAll();
    const excluded = Object.create(null);
    const groups = (groupsData && groupsData.groups) || [];
    groups.forEach(function (group) {
      if (!group || !group.slug) return;
      (group.chunks || []).forEach(function (chunk) {
        if (!chunk || chunk.id == null) return;
        if (chunkIsLearnExcluded(chunk)) excluded[chunkKey(group.slug, chunk.id)] = true;
      });
    });
    let changed = false;
    Object.keys(all.chunks || {}).forEach(function (key) {
      if (excluded[key]) return;
      const cur = all.chunks[key];
      if (!cur || typeof cur !== 'object') return;
      const stamp = resolveEnteredT1At(cur, cur.stageIndex | 0, cur.lastCompletedAt);
      if (!stamp || cur.enteredT1At === stamp) return;
      cur.enteredT1At = stamp;
      changed = true;
    });
    if (changed) saveAll(all);
    return changed;
  }

  /** Same for Passage Group timeline (always +3 days to next stage). */
  function advanceSentence(groupSlug, nowIso) {
    const all = loadAll();
    const cur = all.sentences[groupSlug] || schedule().defaultSentenceState();
    cur.lastCompletedAt = nowIso || new Date().toISOString();
    cur.stageIndex = (cur.stageIndex | 0) + 1;
    cur.updatedAt = cur.lastCompletedAt;
    all.sentences[groupSlug] = cur;
    saveAll(all);
    return cur;
  }

  function resetAll() {
    storage().removeItem(KEY);
  }

  const api = {
    KEY,
    loadAll,
    get,
    getQuiz,
    getChunk,
    getSentence,
    chunkKey,
    markPassed,
    advanceChunk,
    advanceSentence,
    resetAll,
    reconcileEnteredT1,
    resolveEnteredT1At,
    chunkIsLearnExcluded,
  };
  global.Progress = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
