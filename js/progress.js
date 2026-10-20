/**
 * Completion-based progress (localStorage v2).
 * Structure:
 * {
 *   quizzes: { [quizId]: { completedStages: string[], lastReviewedAt: string|null } },
 *   chunks:  { [groupSlug:chunkId]: { lastCompletedAt, stageIndex } },
 *   sentences: { [groupSlug]: { lastCompletedAt, stageIndex } }
 * }
 */
(function (global) {
  const KEY = 'website-manager-progress-v2';

  function emptyRoot() {
    return { quizzes: {}, chunks: {}, sentences: {} };
  }

  function loadAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
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

  function saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function chunkKey(groupSlug, chunkId) {
    return groupSlug + ':' + chunkId;
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
    return all.chunks[k] || Schedule.defaultChunkState();
  }

  function getSentence(groupSlug) {
    const all = loadAll();
    return all.sentences[groupSlug] || Schedule.defaultSentenceState();
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
    all.quizzes[quizId] = cur;
    saveAll(all);
    return cur;
  }

  /**
   * After all currently due chunk quizzes for this chunk are done,
   * record completion time and advance stageIndex so the next stage
   * unlocks after the configured wait.
   */
  function advanceChunk(groupSlug, chunkId, nowIso) {
    const all = loadAll();
    const k = chunkKey(groupSlug, chunkId);
    const cur = all.chunks[k] || Schedule.defaultChunkState();
    cur.lastCompletedAt = nowIso || new Date().toISOString();
    cur.stageIndex = (cur.stageIndex | 0) + 1;
    all.chunks[k] = cur;
    saveAll(all);
    return cur;
  }

  /** Same for sentence group timeline (always +3 days to next stage). */
  function advanceSentence(groupSlug, nowIso) {
    const all = loadAll();
    const cur = all.sentences[groupSlug] || Schedule.defaultSentenceState();
    cur.lastCompletedAt = nowIso || new Date().toISOString();
    cur.stageIndex = (cur.stageIndex | 0) + 1;
    all.sentences[groupSlug] = cur;
    saveAll(all);
    return cur;
  }

  function resetAll() {
    localStorage.removeItem(KEY);
  }

  global.Progress = {
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
  };
})(window);
