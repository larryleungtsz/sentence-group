/** Completion-based SRS stage unlock (Asia/Hong_Kong). Does not use added_at. */
(function (global) {
  const HOUR_MS = 3600 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const SENTENCE_WAIT_MS = 1 * DAY_MS;

  /** Dense stages: T01, T02, T03 (indices 0–2). At most one chunk in dense at a time. */
  const DENSE_MAX_INDEX = 2;
  /** T1 stage index (after T03). Next chunk may start T01 when previous unlocks T1. */
  const T1_STAGE_INDEX = 3;

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

  /** True while stageIndex is still T01 / T02 / T03 (dense window). */
  function isChunkInDense(chunkState) {
    const si = (chunkState || defaultChunkState()).stageIndex | 0;
    return si >= 0 && si <= DENSE_MAX_INDEX;
  }

  /**
   * Previous chunk has unlocked through T1: finished T03 and either already past T1,
   * or currently at T1 with the 24h wait elapsed (T1 ready).
   */
  function hasUnlockedThroughT1(chunkState, now) {
    const state = chunkState || defaultChunkState();
    const si = state.stageIndex | 0;
    if (si > T1_STAGE_INDEX) return true;
    if (si < T1_STAGE_INDEX) return false;
    return isChunkStageReady(state, now);
  }

  /**
   * Chunk already introduced in a prior group (or marked shared): does not
   * occupy the dense T01–T03 slot and does not gate the next *new* chunk.
   */
  function isAlreadyIntroduced(chunk) {
    return !!(
      chunk &&
      (chunk.already_introduced === true || chunk.shared_with_prior_group)
    );
  }

  /**
   * Chunk marked skip / skipped in groups.json: never emits quiz dues,
   * counts as admitted for join-ORDER (does not block the next chunk),
   * and does not occupy dense T01–T03.
   */
  function isSkipped(chunk) {
    return !!(chunk && (chunk.skip === true || chunk.skipped === true));
  }

  /** Skipped or already_introduced: no dense occupancy / dense gate role. */
  function ignoresDense(chunk) {
    return isSkipped(chunk) || isAlreadyIntroduced(chunk);
  }

  /**
   * Chunks array is join order. Two gates:
   * 1) ORDER: chunk i is admitted only after chunk i-1 has been admitted
   *    (entered T01 or later). Applies to new, already_introduced, and skip.
   *    Skipped chunks are treated as already admitted once ORDER allows,
   *    so they never block the next chunk. Never jump past an earlier chunk.
   * 2) DENSE: at most one *new* (non-skip, non-already_introduced) chunk
   *    in T01–T03. A new chunk waits until the nearest previous dense-eligible
   *    chunk has unlocked through T1. skip / already_introduced do NOT count
   *    toward dense occupancy (but still obey ORDER).
   * getChunkState(chunkId) → progress state for that chunk.
   */
  function isChunkAdmitted(chunks, chunkId, getChunkState, now) {
    return admittedChunkIds(chunks, getChunkState, now).has(chunkId);
  }

  /** Set of admitted chunk ids for a group at `now` (order + dense). */
  function admittedChunkIds(chunks, getChunkState, now) {
    const list = chunks || [];
    const out = new Set();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      // ORDER: previous chunk must already be admitted
      if (i > 0 && !out.has(list[i - 1].id)) continue;
      // skip / already_introduced: admitted for ORDER; no dense wait
      if (isSkipped(c) || isAlreadyIntroduced(c)) {
        out.add(c.id);
        continue;
      }
      // DENSE: new chunk waits for nearest prior dense-eligible chunk → T1
      let ok = true;
      for (let j = i - 1; j >= 0; j--) {
        if (ignoresDense(list[j])) continue;
        ok = hasUnlockedThroughT1(getChunkState(list[j].id), now);
        break;
      }
      if (ok) out.add(c.id);
    }
    return out;
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

  /** Ordered sentence stage labels: union of all objectives' T+N, sorted by N. */
  function sentenceStageLabels(schedule) {
    const table = (schedule && schedule.sentence_schedule) || {};
    const keys = Object.keys(table);
    if (!keys.length) {
      const labels = [];
      for (let d = 1; d <= 30; d++) labels.push('T+' + d);
      return labels;
    }
    const seen = new Set();
    for (const k of keys) {
      for (const s of table[k] || []) {
        if (s) seen.add(s);
      }
    }
    if (!seen.size) {
      const labels = [];
      for (let d = 1; d <= 30; d++) labels.push('T+' + d);
      return labels;
    }
    return Array.from(seen).sort((a, b) => {
      const na = parseInt(String(a).replace(/^T\+/, ''), 10);
      const nb = parseInt(String(b).replace(/^T\+/, ''), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }

  /**
   * Due stage labels for one quiz under completion-based unlock.
   * Only the timeline's current stage can be due (once ready and not yet marked on quiz).
   * Pass admitted=false to suppress chunk dues for a chunk not yet admitted.
   */
  function dueStages({
    objective,
    kind,
    schedule,
    chunkState,
    sentenceState,
    completedStages,
    now,
    admitted,
    skipped,
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

    // skip / skipped chunks never emit dues (even if admitted for ORDER)
    if (skipped === true) return [];
    if (admitted === false) return [];

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
    isChunkInDense,
    isAlreadyIntroduced,
    isSkipped,
    ignoresDense,
    hasUnlockedThroughT1,
    isChunkAdmitted,
    admittedChunkIds,
    isSentenceStageReady,
    sentenceStageReadyAt,
    sentenceStageLabels,
    dueStages,
    latestDueStage,
    formatHKT,
    HOUR_MS,
    DAY_MS,
    SENTENCE_WAIT_MS,
    DENSE_MAX_INDEX,
    T1_STAGE_INDEX,
  };
})(window);
