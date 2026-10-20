/** localStorage progress per quiz_id. */
(function (global) {
  const KEY = 'website-manager-progress-v1';

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function get(quizId) {
    const all = loadAll();
    return all[quizId] || { completedStages: [], lastReviewedAt: null };
  }

  function markPassed(quizId, stagesToMark, nowIso) {
    const all = loadAll();
    const cur = all[quizId] || { completedStages: [], lastReviewedAt: null };
    const set = new Set(cur.completedStages || []);
    for (const s of stagesToMark || []) set.add(s);
    cur.completedStages = Array.from(set);
    cur.lastReviewedAt = nowIso || new Date().toISOString();
    all[quizId] = cur;
    saveAll(all);
    return cur;
  }

  function resetAll() {
    localStorage.removeItem(KEY);
  }

  global.Progress = { loadAll, get, markPassed, resetAll, KEY };
})(window);
