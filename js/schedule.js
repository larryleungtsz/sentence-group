/** Spaced-repetition stage times (Asia/Hong_Kong). */
(function (global) {
  const HOUR_MS = 3600 * 1000;
  const DAY_MS = 24 * HOUR_MS;

  /** Ordered chunk stage labels through T19. */
  function chunkStageLabels() {
    const labels = ['T01', 'T02', 'T03'];
    for (let i = 1; i <= 19; i++) labels.push('T' + i);
    return labels;
  }

  /**
   * Build absolute timestamps for each chunk stage from chunk_added_at.
   * T01 = add, T02 = T01+1h, T03 = T02+3h, T1 = T03+24h,
   * then each next interval = previous interval × 1.5 (in days).
   */
  function chunkStageTimes(chunkAddedAt) {
    const t0 = new Date(chunkAddedAt).getTime();
    if (Number.isNaN(t0)) throw new Error('Invalid chunk_added_at: ' + chunkAddedAt);
    const times = {};
    times.T01 = t0;
    times.T02 = times.T01 + 1 * HOUR_MS;
    times.T03 = times.T02 + 3 * HOUR_MS;
    times.T1 = times.T03 + 24 * HOUR_MS;
    // Interval T1→T2 is 1.5 days; then ×1.5 each step
    let prev = times.T1;
    let interval = 1.5 * DAY_MS;
    for (let n = 2; n <= 19; n++) {
      const label = 'T' + n;
      times[label] = prev + interval;
      prev = times[label];
      interval = interval * 1.5;
    }
    return times;
  }

  /** Sentence stages T+3 … T+30 every 3 days from sentence_added_at. */
  function sentenceStageTimes(sentenceAddedAt) {
    const t0 = new Date(sentenceAddedAt).getTime();
    if (Number.isNaN(t0)) throw new Error('Invalid sentence_added_at: ' + sentenceAddedAt);
    const times = {};
    for (let d = 3; d <= 30; d += 3) {
      times['T+' + d] = t0 + d * DAY_MS;
    }
    return times;
  }

  function formatHKT(ms) {
    return new Date(ms).toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }) + ' HKT';
  }

  /**
   * Due stages for an objective: in schedule, time <= now, not yet completed.
   */
  function dueStages({ objective, kind, schedule, stageTimes, completedStages, now }) {
    const table = kind === 'sentence' ? schedule.sentence_schedule : schedule.chunk_schedule;
    const planned = table[objective] || [];
    const done = new Set(completedStages || []);
    const due = [];
    for (const stage of planned) {
      const t = stageTimes[stage];
      if (t == null) continue;
      if (now >= t && !done.has(stage)) due.push(stage);
    }
    return due;
  }

  /** Latest due stage label (or null). */
  function latestDueStage(due) {
    if (!due.length) return null;
    return due[due.length - 1];
  }

  /** Stages reached by now (time <= now), in order. */
  function reachedStages(stageTimes, now) {
    return Object.keys(stageTimes)
      .filter((k) => stageTimes[k] <= now)
      .sort((a, b) => stageTimes[a] - stageTimes[b]);
  }

  global.Schedule = {
    chunkStageLabels,
    chunkStageTimes,
    sentenceStageTimes,
    formatHKT,
    dueStages,
    latestDueStage,
    reachedStages,
    HOUR_MS,
    DAY_MS,
  };
})(window);
