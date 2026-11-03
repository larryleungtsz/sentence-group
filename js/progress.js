/**
 * Completion-based progress (localStorage v2).
 * Structure:
 * {
 *   quizzes: { [quizId]: { completedStages: string[], lastReviewedAt: string|null } },
 *   chunks:  { [groupSlug:chunkId]: { lastCompletedAt, stageIndex, updatedAt?, enteredT1At? } },
 *   passages: { [groupSlug]: { lastCompletedAt, stageIndex, updatedAt? } },
 *   sentences: { [groupSlug]: mirror of passages — legacy key, same cursors },
 *   sentenceUnits: { [groupSlug:sentenceId]: { lastCompletedAt, stageIndex, updatedAt? } }
 * }
 * `sentences` used to be the Passage timeline. Load folds it into `passages`
 * (higher stageIndex wins unless both sides have updatedAt) and writes the
 * mirror back so an older client or in-flight blob does not drop stageIndex.
 * `sentenceUnits` is the middle Sentence layer and is never stored in `sentences`.
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
    return {
      quizzes: {},
      chunks: {},
      passages: {},
      sentences: {},
      sentenceUnits: {},
    };
  }

  function isPlain(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }

  function copyCursor(rec) {
    const api = global.SyncMerge;
    if (api && typeof api.mergeCursor === 'function' && rec) {
      return api.mergeCursor(rec, rec);
    }
    const out = {
      lastCompletedAt: rec && rec.lastCompletedAt ? rec.lastCompletedAt : null,
      stageIndex: rec ? rec.stageIndex | 0 : 0,
    };
    if (rec && rec.updatedAt) out.updatedAt = rec.updatedAt;
    return out;
  }

  /**
   * Same cursor rules as sync-merge: empty never wipes a real cursor;
   * both updatedAt → later write; otherwise higher stageIndex.
   */
  function mergePassageCursor(a, b) {
    const api = global.SyncMerge;
    if (api && typeof api.mergeCursor === 'function') return api.mergeCursor(a, b);
    const aEmpty = !isPlain(a) || ((a.stageIndex | 0) === 0 && !a.lastCompletedAt);
    const bEmpty = !isPlain(b) || ((b.stageIndex | 0) === 0 && !b.lastCompletedAt);
    if (aEmpty && bEmpty) return { lastCompletedAt: null, stageIndex: 0 };
    if (aEmpty) return copyCursor(b);
    if (bEmpty) return copyCursor(a);
    const aU = a.updatedAt ? Date.parse(a.updatedAt) : NaN;
    const bU = b.updatedAt ? Date.parse(b.updatedAt) : NaN;
    if (!isNaN(aU) && !isNaN(bU) && aU !== bU) return copyCursor(aU > bU ? a : b);
    const aSi = a.stageIndex | 0;
    const bSi = b.stageIndex | 0;
    if (aSi !== bSi) return copyCursor(aSi > bSi ? a : b);
    const later =
      String(b.lastCompletedAt || '') > String(a.lastCompletedAt || '') ? b : a;
    return copyCursor(later);
  }

  /** Fold legacy `sentences` into canonical `passages`. Neither map is mutated. */
  function foldPassages(passages, legacy) {
    const base = isPlain(passages) ? passages : {};
    const old = isPlain(legacy) ? legacy : {};
    const out = {};
    const seen = Object.create(null);
    Object.keys(base).concat(Object.keys(old)).forEach(function (key) {
      if (seen[key]) return;
      seen[key] = true;
      const a = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined;
      const b = Object.prototype.hasOwnProperty.call(old, key) ? old[key] : undefined;
      if (a == null && b == null) return;
      if (a == null) out[key] = copyCursor(b);
      else if (b == null) out[key] = copyCursor(a);
      else out[key] = mergePassageCursor(a, b);
    });
    return out;
  }

  function canonicalize(raw) {
    const passages = foldPassages(raw && raw.passages, raw && raw.sentences);
    return {
      quizzes: isPlain(raw && raw.quizzes) ? raw.quizzes : {},
      chunks: isPlain(raw && raw.chunks) ? raw.chunks : {},
      passages: passages,
      sentences: JSON.parse(JSON.stringify(passages)),
      sentenceUnits: isPlain(raw && raw.sentenceUnits) ? raw.sentenceUnits : {},
    };
  }

  function shapeDiffers(raw, next) {
    if (!isPlain(raw)) return true;
    return (
      JSON.stringify(raw.quizzes || {}) !== JSON.stringify(next.quizzes) ||
      JSON.stringify(raw.chunks || {}) !== JSON.stringify(next.chunks) ||
      JSON.stringify(raw.passages || {}) !== JSON.stringify(next.passages) ||
      JSON.stringify(raw.sentences || {}) !== JSON.stringify(next.sentences) ||
      JSON.stringify(raw.sentenceUnits || {}) !== JSON.stringify(next.sentenceUnits)
    );
  }

  function loadAll() {
    let raw = null;
    try {
      raw = JSON.parse(storage().getItem(KEY) || 'null');
    } catch (_) {
      raw = null;
    }
    if (!isPlain(raw)) return emptyRoot();
    const next = canonicalize(raw);
    if (shapeDiffers(raw, next)) saveAll(next);
    return next;
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

  function passageState() {
    const api = schedule();
    if (api && typeof api.defaultPassageState === 'function') return api.defaultPassageState();
    if (api && typeof api.defaultSentenceState === 'function') return api.defaultSentenceState();
    return { lastCompletedAt: null, stageIndex: 0 };
  }

  function unitState() {
    const api = schedule();
    if (api && typeof api.defaultSentenceUnitState === 'function') {
      return api.defaultSentenceUnitState();
    }
    return { lastCompletedAt: null, stageIndex: 0 };
  }

  function getPassage(groupSlug) {
    const all = loadAll();
    return all.passages[groupSlug] || passageState();
  }

  /** Legacy name. Reads the Passage timeline (not sentenceUnits). */
  function getSentence(groupSlug) {
    return getPassage(groupSlug);
  }

  function sentenceUnitKey(groupSlug, sentenceId) {
    return groupSlug + ':' + sentenceId;
  }

  function getSentenceUnit(groupSlug, sentenceId) {
    const all = loadAll();
    return all.sentenceUnits[sentenceUnitKey(groupSlug, sentenceId)] || unitState();
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

  /**
   * Passage Group timeline. Wait before the next stage is Schedule's
   * passage wait (1 day). The legacy `sentences` map is written as a mirror.
   */
  function advancePassage(groupSlug, nowIso) {
    const all = loadAll();
    const cur = all.passages[groupSlug] || passageState();
    cur.lastCompletedAt = nowIso || new Date().toISOString();
    cur.stageIndex = (cur.stageIndex | 0) + 1;
    cur.updatedAt = cur.lastCompletedAt;
    all.passages[groupSlug] = cur;
    all.sentences[groupSlug] = JSON.parse(JSON.stringify(cur));
    saveAll(all);
    return cur;
  }

  /** Legacy name. Advances the Passage timeline, not a sentence unit. */
  function advanceSentence(groupSlug, nowIso) {
    return advancePassage(groupSlug, nowIso);
  }

  /** Middle Sentence layer. One cursor per group slug + sentence id. */
  function advanceSentenceUnit(groupSlug, sentenceId, nowIso) {
    const all = loadAll();
    const key = sentenceUnitKey(groupSlug, sentenceId);
    const cur = all.sentenceUnits[key] || unitState();
    cur.lastCompletedAt = nowIso || new Date().toISOString();
    cur.stageIndex = (cur.stageIndex | 0) + 1;
    cur.updatedAt = cur.lastCompletedAt;
    all.sentenceUnits[key] = cur;
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
    getPassage,
    getSentence,
    getSentenceUnit,
    chunkKey,
    sentenceUnitKey,
    markPassed,
    advanceChunk,
    advancePassage,
    advanceSentence,
    advanceSentenceUnit,
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
