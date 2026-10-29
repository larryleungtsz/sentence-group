/**
 * Practice timing (localStorage only — never Notion).
 * Key separate from Progress SRS.
 *
 * Session: 開始練習 → queue empty (or leave after ≥1 quiz).
 * Quiz: QuizRunner.run start → onPass end.
 * Chunk: sum of *counted* quiz durations for same chunk_id (or "sentence") in that session.
 *
 * A completed quiz counts toward practice time only when its elapsed time is
 * <= MAX_VALID_QUIZ_MS (120000). Exactly 120000 ms is valid; 120001 ms is not.
 * Longer quizzes still complete (SRS is untouched) but are stored as
 * timingValid: false with durationMs: null, and are left out of chunk totals,
 * the session practice total, and any duration shown on the stats page.
 * Rationale: a quiz left open past 2 minutes is treated as idle / AFK.
 */
(function (global) {
  const KEY = 'website-manager-timing-v1';
  const MAX_SESSIONS = 200;
  /** Invalid when durationMs > 120000. Exactly 2:00.000 still counts. */
  const MAX_VALID_QUIZ_MS = 120000;

  function emptyRoot() {
    return { sessions: [] };
  }

  function isQuizDurationValid(durationMs) {
    return (
      typeof durationMs === 'number' &&
      isFinite(durationMs) &&
      durationMs >= 0 &&
      durationMs <= MAX_VALID_QUIZ_MS
    );
  }

  /** Counted in chunk totals, session practice total, and stats durations. */
  function isQuizCounted(quiz) {
    if (!quiz || quiz.timingValid === false) return false;
    return isQuizDurationValid(quiz.durationMs);
  }

  function chunkKeyFor(record) {
    return record.kind === 'sentence'
      ? 'sentence'
      : 'c' + (record.chunkId != null ? record.chunkId : '?');
  }

  function aggregateChunks(quizzes) {
    const acc = Object.create(null);
    (quizzes || []).forEach((record) => {
      if (!isQuizCounted(record)) return;
      const key = chunkKeyFor(record);
      if (!acc[key]) {
        acc[key] = {
          key: key,
          chunkId: record.chunkId,
          kind: record.kind,
          label: record.kind === 'sentence' ? '句子題' : 'chunk' + record.chunkId,
          totalMs: 0,
          quizCount: 0,
        };
      }
      acc[key].totalMs += record.durationMs;
      acc[key].quizCount += 1;
    });
    return Object.keys(acc)
      .sort()
      .map((k) => {
        const c = acc[k];
        return {
          key: c.key,
          chunkId: c.chunkId,
          kind: c.kind,
          label: c.label,
          totalMs: c.totalMs,
          quizCount: c.quizCount,
        };
      });
  }

  /**
   * Session practice total. New sessions already exclude invalid quizzes.
   * Older rows that still store a duration above the cap are reduced here
   * so the stats page does not keep showing that time.
   */
  function practiceTotalMs(session) {
    if (!session) return 0;
    let extra = 0;
    (session.quizzes || []).forEach((q) => {
      if (!q || q.timingValid === false) return;
      const ms = q.durationMs;
      if (typeof ms === 'number' && isFinite(ms) && ms > MAX_VALID_QUIZ_MS) {
        extra += ms;
      }
    });
    const base =
      typeof session.totalMs === 'number' && isFinite(session.totalMs)
        ? session.totalMs
        : 0;
    return Math.max(0, base - extra);
  }

  function excludedQuizCount(session) {
    if (!session || !Array.isArray(session.quizzes)) return 0;
    let n = 0;
    session.quizzes.forEach((q) => {
      if (q && !isQuizCounted(q)) n += 1;
    });
    return n;
  }

  function chunksForSession(session) {
    if (session && Array.isArray(session.quizzes)) return aggregateChunks(session.quizzes);
    return (session && session.chunks) || [];
  }

  /**
   * Stats-page label for one quiz. Uncounted quizzes do not expose a duration
   * (or a start/end pair the page could subtract).
   */
  function quizTimePresentation(quiz) {
    if (isQuizCounted(quiz)) {
      return {
        counted: true,
        durationText: formatDuration(quiz.durationMs),
        note: '',
      };
    }
    const overCap =
      (quiz && quiz.timingValid === false) ||
      (quiz &&
        typeof quiz.durationMs === 'number' &&
        quiz.durationMs > MAX_VALID_QUIZ_MS);
    return {
      counted: false,
      durationText: '不計時',
      note: overCap ? '超過 2 分鐘，未計入用時' : '未計入用時',
    };
  }

  /**
   * Older sessions stored every completed duration inside totalMs and chunks.
   * Strip those over the cap once so stored totals match the rule.
   */
  function migrateSession(session) {
    if (!session || typeof session !== 'object' || !Array.isArray(session.quizzes)) {
      return { session: session, changed: false };
    }
    let changed = false;
    let legacyExcludedMs = 0;
    const quizzes = session.quizzes.map((q) => {
      if (!q || typeof q !== 'object') return q;
      if (q.timingValid === false) {
        if (q.durationMs != null) {
          changed = true;
          const copy = {};
          Object.keys(q).forEach((k) => {
            copy[k] = q[k];
          });
          copy.durationMs = null;
          return copy;
        }
        return q;
      }
      const ms = q.durationMs;
      if (typeof ms === 'number' && isFinite(ms) && ms > MAX_VALID_QUIZ_MS) {
        changed = true;
        legacyExcludedMs += ms;
        const copy = {};
        Object.keys(q).forEach((k) => {
          copy[k] = q[k];
        });
        copy.durationMs = null;
        copy.timingValid = false;
        return copy;
      }
      return q;
    });
    if (!changed) return { session: session, changed: false };
    const base =
      typeof session.totalMs === 'number' && isFinite(session.totalMs)
        ? session.totalMs
        : 0;
    const next = {};
    Object.keys(session).forEach((k) => {
      next[k] = session[k];
    });
    next.quizzes = quizzes;
    next.chunks = aggregateChunks(quizzes);
    next.totalMs = Math.max(0, base - legacyExcludedMs);
    return { session: next, changed: true };
  }

  function loadAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return emptyRoot();
      const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
      let changed = false;
      const nextSessions = sessions.map((s) => {
        const migrated = migrateSession(s);
        if (migrated.changed) changed = true;
        return migrated.session;
      });
      const data = { sessions: nextSessions };
      if (changed) saveAll(data);
      return data;
    } catch (_) {
      return emptyRoot();
    }
  }

  function saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function uid() {
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function formatDuration(ms) {
    if (ms == null || ms < 0 || !isFinite(ms)) return '—';
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return h + ' 小時 ' + m + ' 分 ' + s + ' 秒';
    }
    if (m > 0) {
      return m + ' 分 ' + s + ' 秒';
    }
    return s + ' 秒';
  }

  function formatHKT(ms) {
    if (typeof Schedule !== 'undefined' && Schedule.formatHKT) {
      return Schedule.formatHKT(ms);
    }
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

  /**
   * Active session builder (in-memory until finalized).
   */
  function createSession(opts) {
    const startedAtMs = Date.now();
    const session = {
      id: uid(),
      groupSlug: opts.groupSlug || '',
      groupTitle: opts.groupTitle || '',
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs: startedAtMs,
      endedAt: null,
      totalMs: 0,
      quizzes: [],
      chunks: [],
      _openQuiz: null,
      _excludedMs: 0,
    };

    function startQuiz(meta) {
      const now = Date.now();
      // If a quiz was left open (shouldn't happen), close as abandoned
      if (session._openQuiz) {
        session._openQuiz = null;
      }
      session._openQuiz = {
        quizId: meta.quiz_id,
        objective: meta.objective || '',
        level: meta.level != null ? meta.level : null,
        kind: meta.kind || 'chunk',
        chunkId: meta.kind === 'chunk' ? meta.chunk_id : null,
        startedAt: new Date(now).toISOString(),
        startedAtMs: now,
      };
      return session._openQuiz;
    }

    function endQuiz(meta) {
      const now = Date.now();
      const open = session._openQuiz;
      if (!open) return null;
      const elapsedMs = Math.max(0, now - open.startedAtMs);
      const timingValid = isQuizDurationValid(elapsedMs);
      const record = {
        quizId: open.quizId,
        objective: open.objective,
        level: open.level,
        kind: open.kind,
        chunkId: open.chunkId,
        startedAt: open.startedAt,
        endedAt: new Date(now).toISOString(),
        // Drop the number when invalid so totals and the stats page cannot show it.
        durationMs: timingValid ? elapsedMs : null,
        timingValid: timingValid,
      };
      session.quizzes.push(record);
      session._openQuiz = null;
      if (!timingValid) session._excludedMs += elapsedMs;
      return record;
    }

    function finalize(reason) {
      const now = Date.now();
      // Drop open quiz without counting (abandoned mid-quiz).
      session._openQuiz = null;
      session.endedAt = new Date(now).toISOString();
      // Wall clock from 開始練習, minus completed quizzes over the 2-minute cap.
      // Quizzes at exactly MAX_VALID_QUIZ_MS stay inside this total.
      const wallMs = Math.max(0, now - session.startedAtMs);
      session.totalMs = Math.max(0, wallMs - (session._excludedMs || 0));
      session.chunks = aggregateChunks(session.quizzes);
      // Strip internal fields before save
      const saved = {
        id: session.id,
        groupSlug: session.groupSlug,
        groupTitle: session.groupTitle,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        totalMs: session.totalMs,
        quizCount: session.quizzes.length,
        reason: reason || 'complete',
        quizzes: session.quizzes,
        chunks: session.chunks,
      };
      if (saved.quizCount === 0) {
        return null; // don't persist empty sessions
      }
      const all = loadAll();
      all.sessions.unshift(saved);
      if (all.sessions.length > MAX_SESSIONS) {
        all.sessions = all.sessions.slice(0, MAX_SESSIONS);
      }
      saveAll(all);
      return saved;
    }

    function getElapsedMs() {
      return Math.max(0, Date.now() - session.startedAtMs);
    }

    return {
      id: session.id,
      startQuiz,
      endQuiz,
      finalize,
      getElapsedMs,
      get quizzes() {
        return session.quizzes;
      },
    };
  }

  function listSessions() {
    return loadAll().sessions.slice();
  }

  function getSession(id) {
    return loadAll().sessions.find((s) => s.id === id) || null;
  }

  function clearAll() {
    localStorage.removeItem(KEY);
  }

  global.Timing = {
    KEY,
    MAX_VALID_QUIZ_MS,
    isQuizDurationValid,
    isQuizCounted,
    practiceTotalMs,
    excludedQuizCount,
    chunksForSession,
    quizTimePresentation,
    createSession,
    listSessions,
    getSession,
    clearAll,
    formatDuration,
    formatHKT,
    loadAll,
  };
})(window);
