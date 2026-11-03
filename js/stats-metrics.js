/**
 * Pure stats aggregations for the practice page. No DOM, no localStorage.
 *
 * Practice time is the sum of quiz durationMs (active quiz time).
 * Session wall-clock totalMs is not used.
 *
 * 今日 / 本週 use Asia/Hong_Kong calendar-day boundaries.
 * 本週 is the rolling last 7 HKT dates ending today (today and the 6
 * previous dates), not a Monday–Sunday week and not a 168-hour slice
 * measured from the current minute.
 *
 * 學新詞 counts chunk.enteredT1At events whose timestamp falls in the
 * window. skip / skipped / already_introduced / shared_with_prior_group
 * chunks are excluded (same flags as Schedule.isSkipped /
 * isAlreadyIntroduced). Chunks with no enteredT1At are not counted.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) root.StatsMetrics = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  var WEEK_DAYS = 7;

  /**
   * Start of the Asia/Hong_Kong calendar day that contains `ms`.
   * Hong Kong has no DST, so UTC+8 matches the zone used by Schedule.formatHKT.
   */
  function hktDayStartMs(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return NaN;
    var shifted = ms + HKT_OFFSET_MS;
    var dayIndex = Math.floor(shifted / DAY_MS);
    return dayIndex * DAY_MS - HKT_OFFSET_MS;
  }

  /**
   * Inclusive start, exclusive end, both aligned to HKT midnights.
   * weekStart is 6 midnights before todayStart (7 dates: today and 6 before).
   */
  function practiceWindows(nowMs) {
    var todayStart = hktDayStartMs(nowMs);
    return {
      todayStart: todayStart,
      todayEnd: todayStart + DAY_MS,
      weekStart: todayStart - (WEEK_DAYS - 1) * DAY_MS,
      weekEnd: todayStart + DAY_MS,
    };
  }

  /** Same cap as Timing.MAX_VALID_QUIZ_MS. Exactly 120000 ms still counts. */
  var MAX_VALID_QUIZ_MS = 120000;

  function quizDurationMs(quiz) {
    if (!quiz || typeof quiz !== 'object') return null;
    if (quiz.timingValid === false) return null;
    var ms = Number(quiz.durationMs);
    if (!isFinite(ms) || ms < 0) return null;
    if (ms > MAX_VALID_QUIZ_MS) return null;
    return ms;
  }

  /** When the quiz counts toward 今日 / 本週: startedAt, else endedAt, else session start. */
  function quizAnchorMs(quiz, session) {
    var fields = [
      quiz && quiz.startedAt,
      quiz && quiz.endedAt,
      session && session.startedAt,
    ];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] == null || fields[i] === '') continue;
      var t = Date.parse(fields[i]);
      if (!isNaN(t)) return t;
    }
    return NaN;
  }

  function inHalfOpen(ms, start, end) {
    return !isNaN(ms) && ms >= start && ms < end;
  }

  function overview(sessions, nowMs) {
    var w = practiceWindows(nowMs);
    var todayMs = 0;
    var weekMs = 0;
    var allMs = 0;
    (sessions || []).forEach(function (session) {
      if (!session || typeof session !== 'object') return;
      (session.quizzes || []).forEach(function (quiz) {
        var ms = quizDurationMs(quiz);
        if (ms == null) return;
        allMs += ms;
        var at = quizAnchorMs(quiz, session);
        if (inHalfOpen(at, w.weekStart, w.weekEnd)) weekMs += ms;
        if (inHalfOpen(at, w.todayStart, w.todayEnd)) todayMs += ms;
      });
    });
    return { todayMs: todayMs, weekMs: weekMs, allMs: allMs, window: w };
  }

  function groupRollup(sessions) {
    var map = Object.create(null);
    (sessions || []).forEach(function (session) {
      if (!session || typeof session !== 'object') return;
      var slug = session.groupSlug || '';
      if (!map[slug]) {
        map[slug] = {
          groupSlug: slug,
          groupTitle: session.groupTitle || '',
          titleAt: session.startedAt || '',
          totalMs: 0,
          quizCount: 0,
        };
      }
      var row = map[slug];
      var started = session.startedAt || '';
      if (session.groupTitle && started >= row.titleAt) {
        row.groupTitle = session.groupTitle;
        row.titleAt = started;
      }
      (session.quizzes || []).forEach(function (quiz) {
        var ms = quizDurationMs(quiz);
        if (ms == null) return;
        row.totalMs += ms;
        row.quizCount += 1;
      });
    });
    return Object.keys(map)
      .map(function (key) {
        var row = map[key];
        return {
          groupSlug: row.groupSlug,
          groupTitle: row.groupTitle,
          totalMs: row.totalMs,
          quizCount: row.quizCount,
        };
      })
      .sort(function (a, b) {
        if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
        return String(a.groupSlug).localeCompare(String(b.groupSlug));
      });
  }

  /**
   * `kind: "sentence"` with no sentenceId is a legacy Passage timing row.
   * Keep in step with timing.js timingLayer.
   */
  function timingLayer(quiz) {
    if (!quiz || typeof quiz !== 'object') return 'chunk';
    if (quiz.kind === 'passage') return 'passage';
    if (quiz.kind === 'sentence') {
      if (quiz.sentenceId != null && quiz.sentenceId !== '') return 'sentence';
      return 'passage';
    }
    return 'chunk';
  }

  function chunkKeyForQuiz(quiz) {
    var layer = timingLayer(quiz);
    if (layer === 'passage') return 'passage';
    if (layer === 'sentence') return 's:' + quiz.sentenceId;
    var id = quiz && quiz.chunkId != null ? quiz.chunkId : '?';
    return 'c' + id;
  }

  function chunkSums(sessions, groupSlug) {
    var map = Object.create(null);
    (sessions || []).forEach(function (session) {
      if (!session || typeof session !== 'object') return;
      if ((session.groupSlug || '') !== groupSlug) return;
      (session.quizzes || []).forEach(function (quiz) {
        var ms = quizDurationMs(quiz);
        if (ms == null) return;
        var key = chunkKeyForQuiz(quiz);
        var layer = timingLayer(quiz);
        if (!map[key]) {
          map[key] = {
            key: key,
            kind: layer === 'chunk' ? 'chunk' : layer,
            chunkId: layer === 'chunk' && quiz.chunkId != null ? quiz.chunkId : null,
            sentenceId: layer === 'sentence' ? quiz.sentenceId : null,
            totalMs: 0,
            quizCount: 0,
          };
        }
        map[key].totalMs += ms;
        map[key].quizCount += 1;
      });
    });
    return map;
  }

  /**
   * Every chunk defined on the group, plus timing-only chunk ids, plus a
   * sentence row when the group has a sentence or sentence quizzes exist.
   * Sorted by quiz-sum desc, then chunk id.
   */
  function groupChunkRows(sessions, groupSlug, group) {
    var sums = chunkSums(sessions, groupSlug);
    var rows = [];
    var seen = Object.create(null);
    var chunks = (group && group.chunks) || [];
    chunks.forEach(function (chunk) {
      if (!chunk || chunk.id == null) return;
      var key = 'c' + chunk.id;
      seen[key] = true;
      var sum = sums[key];
      var text = chunk.text ? String(chunk.text) : '';
      rows.push({
        key: key,
        kind: 'chunk',
        chunkId: chunk.id,
        label: text || 'c' + chunk.id,
        labelFromText: !!text,
        totalMs: sum ? sum.totalMs : 0,
        quizCount: sum ? sum.quizCount : 0,
      });
    });
    Object.keys(sums).forEach(function (key) {
      if (key === 'passage' || key.indexOf('s:') === 0 || seen[key]) return;
      var sum = sums[key];
      var idLabel = sum.chunkId != null ? 'c' + sum.chunkId : 'c?';
      rows.push({
        key: key,
        kind: 'chunk',
        chunkId: sum.chunkId,
        label: idLabel,
        labelFromText: false,
        totalMs: sum.totalMs,
        quizCount: sum.quizCount,
      });
    });
    var sentenceList = (group && group.sentences) || [];
    sentenceList.forEach(function (sentence, index) {
      if (!sentence || sentence.id == null || sentence.id === '') return;
      var key = 's:' + sentence.id;
      seen[key] = true;
      var sum = sums[key];
      var text = sentence.text ? String(sentence.text) : '';
      rows.push({
        key: key,
        kind: 'sentence',
        chunkId: null,
        sentenceId: sentence.id,
        order: index,
        label: text || '句子 ' + sentence.id,
        labelFromText: !!text,
        totalMs: sum ? sum.totalMs : 0,
        quizCount: sum ? sum.quizCount : 0,
      });
    });
    Object.keys(sums).forEach(function (key) {
      if (key.indexOf('s:') !== 0 || seen[key]) return;
      var sum = sums[key];
      rows.push({
        key: key,
        kind: 'sentence',
        chunkId: null,
        sentenceId: sum.sentenceId,
        order: 100000,
        label: '句子 ' + (sum.sentenceId != null ? sum.sentenceId : key.slice(2)),
        labelFromText: false,
        totalMs: sum.totalMs,
        quizCount: sum.quizCount,
      });
    });
    var passageSum = sums.passage;
    var passageApplicable =
      !!(group && group.sentence) || !!(passageSum && passageSum.quizCount > 0);
    if (passageApplicable) {
      rows.push({
        key: 'passage',
        kind: 'passage',
        chunkId: null,
        label: '段落題',
        labelFromText: false,
        totalMs: passageSum ? passageSum.totalMs : 0,
        quizCount: passageSum ? passageSum.quizCount : 0,
      });
    }
    rows.sort(function (a, b) {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      var ai =
        a.kind === 'passage'
          ? 1000000000
          : a.kind === 'sentence'
            ? 900000000 + (a.order || 0)
            : Number(a.chunkId);
      var bi =
        b.kind === 'passage'
          ? 1000000000
          : b.kind === 'sentence'
            ? 900000000 + (b.order || 0)
            : Number(b.chunkId);
      if (ai !== bi) return (isNaN(ai) ? 0 : ai) - (isNaN(bi) ? 0 : bi);
      return String(a.key).localeCompare(String(b.key));
    });
    return rows;
  }

  /**
   * Same flags as Schedule.isSkipped / isAlreadyIntroduced.
   * shared_with_prior_group is the groups.json alias for already introduced.
   */
  function chunkIsLearnExcluded(chunk) {
    if (!chunk || typeof chunk !== 'object') return false;
    if (chunk.skip === true || chunk.skipped === true) return true;
    if (chunk.already_introduced === true) return true;
    if (chunk.shared_with_prior_group) return true;
    return false;
  }

  function learnExcludedKeySet(groupsData) {
    var set = Object.create(null);
    var groups = (groupsData && groupsData.groups) || [];
    groups.forEach(function (group) {
      if (!group || !group.slug) return;
      (group.chunks || []).forEach(function (chunk) {
        if (!chunk || chunk.id == null) return;
        if (chunkIsLearnExcluded(chunk)) set[group.slug + ':' + chunk.id] = true;
      });
    });
    return set;
  }

  function isIso(value) {
    if (typeof value !== 'string' || !value) return false;
    return !isNaN(Date.parse(value));
  }

  /**
   * Timestamp to store when a chunk's stage is written to nextStageIndex.
   * Returns the existing enteredT1At if one is already valid.
   * Crossing from below T1 (>= t1StageIndex, default 3) uses nowIso.
   * A chunk sitting exactly at T1 can use lastCompletedAt (that write is
   * the crossing). Moving off exact T1 without a stamp uses the previous
   * lastCompletedAt. stageIndex already past T1 returns null — do not
   * invent a date from a later completion.
   */
  function resolveEnteredT1At(before, nextStageIndex, nowIso, t1StageIndex) {
    var T1 = t1StageIndex == null ? 3 : t1StageIndex | 0;
    if (before && isIso(before.enteredT1At)) return before.enteredT1At;
    var prev = before ? before.stageIndex | 0 : 0;
    var next = nextStageIndex | 0;
    if (prev < T1 && next >= T1 && isIso(nowIso)) return nowIso;
    if (next === T1 && before && isIso(before.lastCompletedAt)) return before.lastCompletedAt;
    if (prev === T1 && next > T1 && before && isIso(before.lastCompletedAt)) {
      return before.lastCompletedAt;
    }
    return null;
  }

  function countEnteredT1(progress, groupsData, nowMs) {
    var w = practiceWindows(nowMs);
    var excluded = learnExcludedKeySet(groupsData);
    var chunks = (progress && progress.chunks) || {};
    var today = 0;
    var week = 0;
    var events = [];
    Object.keys(chunks).forEach(function (key) {
      if (excluded[key]) return;
      var rec = chunks[key];
      var at = rec && rec.enteredT1At;
      if (!isIso(at)) return;
      var atMs = Date.parse(at);
      events.push({ key: key, at: at, atMs: atMs });
      if (inHalfOpen(atMs, w.weekStart, w.weekEnd)) week += 1;
      if (inHalfOpen(atMs, w.todayStart, w.todayEnd)) today += 1;
    });
    return { today: today, week: week, events: events, window: w };
  }

  return {
    DAY_MS: DAY_MS,
    HKT_OFFSET_MS: HKT_OFFSET_MS,
    WEEK_DAYS: WEEK_DAYS,
    hktDayStartMs: hktDayStartMs,
    practiceWindows: practiceWindows,
    MAX_VALID_QUIZ_MS: MAX_VALID_QUIZ_MS,
    quizDurationMs: quizDurationMs,
    quizAnchorMs: quizAnchorMs,
    overview: overview,
    groupRollup: groupRollup,
    chunkSums: chunkSums,
    groupChunkRows: groupChunkRows,
    chunkIsLearnExcluded: chunkIsLearnExcluded,
    learnExcludedKeySet: learnExcludedKeySet,
    resolveEnteredT1At: resolveEnteredT1At,
    countEnteredT1: countEnteredT1,
  };
});
