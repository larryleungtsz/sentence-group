/** Completion-based SRS stage unlock (Asia/Hong_Kong). Does not use added_at. */
(function (global) {
  const HOUR_MS = 3600 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const SENTENCE_WAIT_MS = 1 * DAY_MS;

  /** Dense stages: T01, T02, T03 (indices 0–2). At most one chunk in dense at a time. */
  const DENSE_MAX_INDEX = 2;
  /** T1 stage index (after T03). Next chunk may start T01 when previous unlocks T1. */
  const T1_STAGE_INDEX = 3;

  /**
   * Ordered chunk-style stage labels: T01, T02, T03, T1 … T{last}.
   * Chunk dues use the default (T19). Sentence units pass 30.
   */
  function chunkStageLabels(lastNumbered) {
    const last = lastNumbered == null ? 19 : lastNumbered | 0;
    const labels = ['T01', 'T02', 'T03'];
    for (let i = 1; i <= last; i++) labels.push('T' + i);
    return labels;
  }

  /** T01 / T02 / T03 / T1 … Tn. Passage labels are T+N and do not match. */
  function isChunkStyleStageLabel(label) {
    return /^T\d+$/.test(String(label));
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

  /** Default Passage timeline state when never practiced. */
  function defaultPassageState() {
    return { lastCompletedAt: null, stageIndex: 0 };
  }

  /**
   * Legacy name for the Passage cursor. Still the whole-passage timeline,
   * not the middle Sentence layer (`defaultSentenceUnitState`).
   */
  function defaultSentenceState() {
    return defaultPassageState();
  }

  /** Default per-sentence unit cursor. Same shape as a Passage cursor. */
  function defaultSentenceUnitState() {
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
   * Left dense: SKIP, reuse (already_introduced / shared_with_prior_group),
   * or unlocked through T1 — the same unlock the chunk layer uses before the
   * next chunk may start. Still in T01–T03, or at T1 before the 24h wait,
   * has not left dense. A missing chunk row has not.
   */
  function chunkHasLeftDense(chunk, chunkState, now) {
    if (!chunk) return false;
    if (ignoresDense(chunk)) return true;
    return hasUnlockedThroughT1(chunkState, now);
  }

  /**
   * Per-sentence under-chunk gate. Every Keep chunk in `sentence.chunk_ids`
   * must have left dense. Other sentences' chunks are not consulted.
   * Empty chunk_ids passes. A missing sentence, or a chunk id with no row,
   * fails closed.
   */
  function sentenceKeepChunksLeftDense(sentence, chunks, getChunkState, now) {
    if (!sentence || !Array.isArray(sentence.chunk_ids)) return false;
    const byId = new Map();
    (chunks || []).forEach((chunk) => {
      if (chunk && chunk.id != null) byId.set(chunk.id, chunk);
    });
    for (let i = 0; i < sentence.chunk_ids.length; i++) {
      const id = sentence.chunk_ids[i];
      const chunk = byId.get(id);
      const state = typeof getChunkState === 'function' ? getChunkState(id) : null;
      if (!chunkHasLeftDense(chunk, state, now)) return false;
    }
    return true;
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

  /**
   * Passage objectives live on `passage_schedule`.
   * A file that has not been migrated yet still has them on `sentence_schedule`
   * and no `passage_schedule` key — read that only as a fallback.
   * Once `passage_schedule` exists, `sentence_schedule` is the middle Sentence
   * layer and must not feed Passage dues.
   */
  function passageScheduleTable(schedule) {
    if (
      schedule &&
      Object.prototype.hasOwnProperty.call(schedule, 'passage_schedule') &&
      schedule.passage_schedule &&
      typeof schedule.passage_schedule === 'object'
    ) {
      return schedule.passage_schedule;
    }
    return (schedule && schedule.sentence_schedule) || {};
  }

  /**
   * Middle Sentence layer (Q20–Q26 stages). A stage is due only when a
   * manifest quiz uses that objective; missing quizzes are not invented.
   * If `passage_schedule` is absent, `sentence_schedule` is still the legacy
   * Passage table — do not treat it as Sentence objectives.
   *
   * A ready stage with no quiz for that sentence unit is already complete.
   * `vacuousSentenceAdvanceCount` is 1 in that case so callers can step the
   * cursor once; the chunk wait then applies. Full-suite units stop on the
   * stage that has a quiz. Showing those quizzes also requires every Keep
   * chunk under the sentence to have left dense.
   */
  function sentenceScheduleTable(schedule) {
    if (
      !schedule ||
      !Object.prototype.hasOwnProperty.call(schedule, 'passage_schedule')
    ) {
      return {};
    }
    const table = schedule.sentence_schedule;
    return table && typeof table === 'object' ? table : {};
  }

  function isTimelineStageReady(state, now, waitMs) {
    const cursor = state || defaultPassageState();
    const si = cursor.stageIndex | 0;
    if (si < 0) return false;
    if (si === 0) return true;
    if (!cursor.lastCompletedAt) return false;
    const unlockedAt = new Date(cursor.lastCompletedAt).getTime() + waitMs;
    return now >= unlockedAt;
  }

  function timelineStageReadyAt(state, waitMs) {
    const cursor = state || defaultPassageState();
    const si = cursor.stageIndex | 0;
    if (si === 0) return null;
    if (!cursor.lastCompletedAt) return null;
    return new Date(cursor.lastCompletedAt).getTime() + waitMs;
  }

  /** Passage wait is 1 day, so T+N lines up with day N. */
  function isPassageStageReady(passageState, now) {
    return isTimelineStageReady(passageState, now, SENTENCE_WAIT_MS);
  }

  /** Legacy name. Passage timeline, not the Sentence layer. */
  function isSentenceStageReady(sentenceState, now) {
    return isPassageStageReady(sentenceState, now);
  }

  /**
   * Flat day wait kept for older callers. Sentence units use chunk waits
   * (`chunkWaitAfterStage`), not this constant. Passage still uses 1 day.
   */
  const SENTENCE_UNIT_WAIT_MS = SENTENCE_WAIT_MS;

  /**
   * Sentence-unit waits match chunk: 1h → 3h → 24h → 1.5d → 2.25d → ×1.5.
   * Passage stays on the 1-day wait.
   */
  function isSentenceUnitStageReady(unitState, now) {
    return isChunkStageReady(unitState || defaultSentenceUnitState(), now);
  }

  function passageStageReadyAt(passageState) {
    return timelineStageReadyAt(passageState, SENTENCE_WAIT_MS);
  }

  function sentenceStageReadyAt(sentenceState) {
    return passageStageReadyAt(sentenceState);
  }

  function sentenceUnitStageReadyAt(unitState) {
    return chunkStageReadyAt(unitState || defaultSentenceUnitState());
  }

  /** Union of a schedule table's stage labels, sorted by T+N. Empty table → T+1..T+30. */
  function orderedStageLabels(table) {
    const keys = Object.keys(table || {});
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

  function passageStageLabels(schedule) {
    return orderedStageLabels(passageScheduleTable(schedule));
  }

  /** Legacy name for Passage stage labels. */
  function sentenceStageLabels(schedule) {
    return passageStageLabels(schedule);
  }

  /**
   * Chunk-style sentence tables (T01 / T02 / T03 / T1 …) walk the same
   * ordered labels as chunks, through T30, so stageIndex lines up with
   * chunkWaitAfterStage. A table that is still T+N keeps that order.
   */
  function sentenceUnitStageLabels(schedule) {
    const table = sentenceScheduleTable(schedule);
    const present = [];
    Object.keys(table).forEach((key) => {
      (table[key] || []).forEach((label) => {
        if (label) present.push(label);
      });
    });
    if (present.some(isChunkStyleStageLabel)) return chunkStageLabels(30);
    return orderedStageLabels(table);
  }

  function quizOccupiesSentenceStage(q, schedule, sentenceId, label) {
    if (!q || q.kind !== 'sentence') return false;
    if (q.sentence_id !== sentenceId) return false;
    const planned = (sentenceScheduleTable(schedule) || {})[q.objective] || [];
    if (!planned.includes(label)) return false;
    if (
      Array.isArray(q.schedule_stages) &&
      q.schedule_stages.length &&
      !q.schedule_stages.includes(label)
    ) {
      return false;
    }
    return true;
  }

  /**
   * 1 when the sentence unit's current stage is ready and no manifest quiz
   * uses it; 0 otherwise. At most one, because stepping starts the wait.
   * Does not advance past the last label.
   */
  function vacuousSentenceAdvanceCount({ schedule, quizzes, sentenceId, state, now }) {
    const labels = sentenceUnitStageLabels(schedule);
    const cursor = state || defaultSentenceUnitState();
    const si = cursor.stageIndex | 0;
    if (si < 0 || si >= labels.length - 1) return 0;
    if (!isSentenceUnitStageReady(cursor, now)) return 0;
    const label = labels[si];
    const occupies = (quizzes || []).some((q) =>
      quizOccupiesSentenceStage(q, schedule, sentenceId, label)
    );
    return occupies ? 0 : 1;
  }

  /**
   * Step every sentence whose current stage has no quiz. `advance` must
   * persist one stage and stamp lastCompletedAt so the next call sees the wait.
   */
  function fastForwardVacuousSentenceUnits({
    schedule,
    quizzes,
    sentences,
    now,
    getState,
    advance,
    keepChunksLeftDense,
  }) {
    (sentences || []).forEach((s) => {
      if (!s || s.id == null || s.id === '') return;
      if (typeof keepChunksLeftDense === 'function' && !keepChunksLeftDense(s)) return;
      let guard = 0;
      while (guard++ < 48) {
        const state = getState(s.id);
        if (
          !vacuousSentenceAdvanceCount({
            schedule,
            quizzes,
            sentenceId: s.id,
            state,
            now,
          })
        ) {
          break;
        }
        advance(s.id);
      }
    });
  }

  function dueOnTimeline(labels, state, ready, planned, scheduleStages, done) {
    const cursor = state || defaultPassageState();
    const si = cursor.stageIndex | 0;
    if (si < 0 || si >= labels.length) return [];
    if (!ready) return [];
    const label = labels[si];
    if (!planned.includes(label)) return [];
    if (
      Array.isArray(scheduleStages) &&
      scheduleStages.length &&
      !scheduleStages.includes(label)
    ) {
      return [];
    }
    if (done.has(label)) return [];
    return [label];
  }

  /**
   * Due stage labels for one quiz under completion-based unlock.
   * Only the timeline's current stage can be due (once ready and not yet marked on quiz).
   * Pass admitted=false to suppress chunk dues for a chunk not yet admitted.
   * Pass underChunkGate, or underChunksLeftDense=false, to hide sentence-layer
   * dues until every Keep chunk under that sentence has left dense.
   * That is every objective on sentence_schedule, including Q26
   * sentence_usage_feature_judgment. The left-dense rule itself is unchanged.
   * Passage dues ignore both.
   */
  function dueStages({
    objective,
    kind,
    schedule,
    chunkState,
    sentenceState,
    passageState,
    sentenceUnitState,
    completedStages,
    now,
    admitted,
    skipped,
    scheduleStages,
    underChunksLeftDense,
    underChunkGate,
  }) {
    const done = new Set(completedStages || []);
    if (kind === 'passage') {
      const state = passageState || sentenceState || defaultPassageState();
      const planned = (passageScheduleTable(schedule) || {})[objective] || [];
      return dueOnTimeline(
        passageStageLabels(schedule),
        state,
        isPassageStageReady(state, now),
        planned,
        scheduleStages,
        done
      );
    }
    if (kind === 'sentence') {
      if (underChunkGate) {
        const open = sentenceKeepChunksLeftDense(
          underChunkGate.sentence,
          underChunkGate.chunks,
          underChunkGate.getChunkState,
          now
        );
        if (!open) return [];
      } else if (underChunksLeftDense === false) {
        return [];
      }
      const state = sentenceUnitState || defaultSentenceUnitState();
      const planned = (sentenceScheduleTable(schedule) || {})[objective] || [];
      return dueOnTimeline(
        sentenceUnitStageLabels(schedule),
        state,
        isSentenceUnitStageReady(state, now),
        planned,
        scheduleStages,
        done
      );
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

  const api = {
    chunkStageLabels,
    chunkWaitAfterStage,
    defaultChunkState,
    defaultPassageState,
    defaultSentenceState,
    defaultSentenceUnitState,
    isChunkStageReady,
    chunkStageReadyAt,
    isChunkInDense,
    isAlreadyIntroduced,
    isSkipped,
    ignoresDense,
    chunkHasLeftDense,
    sentenceKeepChunksLeftDense,
    hasUnlockedThroughT1,
    isChunkAdmitted,
    admittedChunkIds,
    passageScheduleTable,
    sentenceScheduleTable,
    isPassageStageReady,
    isSentenceStageReady,
    isSentenceUnitStageReady,
    passageStageReadyAt,
    sentenceStageReadyAt,
    sentenceUnitStageReadyAt,
    passageStageLabels,
    sentenceStageLabels,
    sentenceUnitStageLabels,
    vacuousSentenceAdvanceCount,
    fastForwardVacuousSentenceUnits,
    dueStages,
    latestDueStage,
    formatHKT,
    HOUR_MS,
    DAY_MS,
    SENTENCE_WAIT_MS,
    SENTENCE_UNIT_WAIT_MS,
    DENSE_MAX_INDEX,
    T1_STAGE_INDEX,
  };
  global.Schedule = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
