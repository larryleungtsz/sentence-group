/** Completion-based SRS stage unlock (Asia/Hong_Kong). Does not use added_at. */
(function (global) {
  const HOUR_MS = 3600 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const SENTENCE_WAIT_MS = 3 * DAY_MS;

  /** Ordered chunk stage labels: T01, T02, T03, T1 … T19. */
  function chunkStageLabels() {
    const labels = ['T01', 'T02', 'T03'];
    for (let i = 1; i <= 19; i++) labels.push('T' + i);
    return labels;
  }

  /**
   * Wait AFTER finishing all dues at completedStageIndex, before next stage unlocks.
   * T01→T02: 1h, T02→T03: 3h, T03→T1: 24h, T1→T2: 1.5d, T2→T3: 2.25d,
   * then each wait × 1.5.
   */
  function chunkWaitAfterStage(completedStageIndex) {
    if (completedStageIndex < 0) return 0;
    if (completedStageIndex === 0) return 1 * HOUR_MS;
    if (completedStageIndex === 1) return 3 * HOUR_MS;
    if (completedStageIndex === 2) return 24 * HOUR_MS;
    if (completedStageIndex === 3) return 1.5 * DAY_MS;
    // completedStageIndex >= 4 (finished T2 or later): 2.25d × 1.5^(n-4)
    let interval = 2.25 * DAY_MS;
    for (let i = 4; i < completedStageIndex; i++) interval *= 1.5;
    return interval;
  }

  /** Default chunk timeline state when never practiced. */
  function defaultChunkState() {
    return { lastCompletedAt: null, stageIndex: 0 };
  }

  /** Default sentence timeline state when never practiced. */
  function defaultSentenceState() {
    return { lastCompletedAt: null, stageIndex: 0 };
  }

  /**
   * Whether the chunk's current stageIndex is unlocked at `now`.
   * T01 (index 0) is immediate; later stages need lastCompletedAt + wait.
   */
  function isChunkStageReady(chunkState, now) {
    const state = chunkState || defaultChunkState();
    const si = state.stageIndex | 0;
    if (si < 0) return false;
    if (si === 0) return true;
    if (!state.lastCompletedAt) return false;
    const unlockedAt =
      new Date(state.lastCompletedAt).getTime() + chunkWaitAfterStage(si - 1);
    return now >= unlockedAt;
  }

  /** ISO / ms when the chunk's current stage becomes ready (null if already or unknown). */
  function chunkStageReadyAt(chunkState) {
    const state = chunkState || defaultChunkState();
    const si = state.stageIndex | 0;
    if (si === 0) return null;
    if (!state.lastCompletedAt) return null;
    return new Date(state.lastCompletedAt).getTime() + chunkWaitAfterStage(si - 1);
  }

  function isSentenceStageReady(sentenceState, now) {
    const state = sentenceState || defaultSentenceState();
    const si = state.stageIndex | 0;
    if (si < 0) return false;
    if (si === 0) return true;
    if (!state.lastCompletedAt) return false;
    const unlockedAt =
      new Date(state.lastCompletedAt).getTime() + SENTENCE_WAIT_MS;
    return now >= unlockedAt;
  }

  function sentenceStageReadyAt(sentenceState) {
    const state = sentenceState || defaultSentenceState();
    const si = state.stageIndex | 0;
    if (si === 0) return null;
    if (!state.lastCompletedAt) return null;
    return new Date(state.lastCompletedAt).getTime() + SENTENCE_WAIT_MS;
  }

  /** Ordered sentence stage labels from schedule.sentence_schedule (first objective's list, or union). */
  function sentenceStageLabels(schedule) {
    const table = (schedule && schedule.sentence_schedule) || {};
    const keys = Object.keys(table);
    if (!keys.length) {
      const labels = [];
      for (let d = 3; d <= 30; d += 3) labels.push('T+' + d);
      return labels;
    }
    // Prefer first listed objective order; fallback merge preserving first occurrence
    const first = table[keys[0]] || [];
    if (first.length) return first.slice();
    const seen = new Set();
    const out = [];
    for (const k of keys) {
      for (const s of table[k] || []) {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return out;
  }

  /**
   * Due stage labels for one quiz under completion-based unlock.
   * Only the timeline's current stage can be due (once ready and not yet marked on quiz).
   */
  function dueStages({
    objective,
    kind,
    schedule,
    chunkState,
    sentenceState,
    completedStages,
    now,
  }) {
    const done = new Set(completedStages || []);
    if (kind === 'sentence') {
      const labels = sentenceStageLabels(schedule);
      const state = sentenceState || defaultSentenceState();
      const si = state.stageIndex | 0;
      if (si < 0 || si >= labels.length) return [];
      if (!isSentenceStageReady(state, now)) return [];
      const label = labels[si];
      const planned = (schedule.sentence_schedule || {})[objective] || [];
      if (!planned.includes(label)) return [];
      if (done.has(label)) return [];
      return [label];
    }

    const labels = chunkStageLabels();
    const state = chunkState || defaultChunkState();
    const si = state.stageIndex | 0;
    if (si < 0 || si >= labels.length) return [];
    if (!isChunkStageReady(state, now)) return [];
    const label = labels[si];
    const planned = (schedule.chunk_schedule || {})[objective] || [];
    if (!planned.includes(label)) return [];
    if (done.has(label)) return [];
    return [label];
  }

  function latestDueStage(due) {
    if (!due.length) return null;
    return due[due.length - 1];
  }

  function formatHKT(ms) {
    return (
      new Date(ms).toLocaleString('zh-HK', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' HKT'
    );
  }

  global.Schedule = {
    chunkStageLabels,
    chunkWaitAfterStage,
    defaultChunkState,
    defaultSentenceState,
    isChunkStageReady,
    chunkStageReadyAt,
    isSentenceStageReady,
    sentenceStageReadyAt,
    sentenceStageLabels,
    dueStages,
    latestDueStage,
    formatHKT,
    HOUR_MS,
    DAY_MS,
    SENTENCE_WAIT_MS,
  };
})(window);
