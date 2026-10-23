/**
 * Practice timing (localStorage only — never Notion).
 * Key separate from Progress SRS.
 *
 * Session: 開始練習 → queue empty (or leave after ≥1 quiz).
 * Quiz: QuizRunner.run start → onPass end.
 * Chunk: sum of quiz durations for same chunk_id (or "sentence") in that session.
 */
(function (global) {
  const KEY = 'website-manager-timing-v1';
  const MAX_SESSIONS = 200;

  function emptyRoot() {
    return { sessions: [] };
  }

  function loadAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return emptyRoot();
      return { sessions: Array.isArray(raw.sessions) ? raw.sessions : [] };
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
      _chunkAcc: Object.create(null),
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
      const durationMs = Math.max(0, now - open.startedAtMs);
      const record = {
        quizId: open.quizId,
        objective: open.objective,
        level: open.level,
        kind: open.kind,
        chunkId: open.chunkId,
        startedAt: open.startedAt,
        endedAt: new Date(now).toISOString(),
        durationMs: durationMs,
      };
      session.quizzes.push(record);
      session._openQuiz = null;

      const key =
        record.kind === 'sentence'
          ? 'sentence'
          : 'c' + (record.chunkId != null ? record.chunkId : '?');
      if (!session._chunkAcc[key]) {
        session._chunkAcc[key] = {
          key: key,
          chunkId: record.chunkId,
          kind: record.kind,
          label:
            record.kind === 'sentence'
              ? '句子題'
              : 'chunk' + record.chunkId,
          totalMs: 0,
          quizCount: 0,
        };
      }
      session._chunkAcc[key].totalMs += durationMs;
      session._chunkAcc[key].quizCount += 1;
      return record;
    }

    function finalize(reason) {
      const now = Date.now();
      // Drop open quiz without counting (abandoned mid-quiz)
      session._openQuiz = null;
      session.endedAt = new Date(now).toISOString();
      session.totalMs = Math.max(0, now - session.startedAtMs);
      // Prefer sum of quiz times if user left mid-session with only partial work?
      // Spec: session total time = wall clock from start to end.
      session.chunks = Object.keys(session._chunkAcc)
        .sort()
        .map((k) => {
          const c = session._chunkAcc[k];
          return {
            key: c.key,
            chunkId: c.chunkId,
            kind: c.kind,
            label: c.label,
            totalMs: c.totalMs,
            quizCount: c.quizCount,
          };
        });
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
    createSession,
    listSessions,
    getSession,
    clearAll,
    formatDuration,
    formatHKT,
    loadAll,
  };
})(window);
