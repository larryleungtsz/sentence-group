(async function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const titleEl = document.getElementById('group-title');
  const metaEl = document.getElementById('group-meta');
  const queueEl = document.getElementById('queue-list');
  const runnerEl = document.getElementById('runner');
  const doneEl = document.getElementById('done');
  const sessionBannerEl = document.getElementById('session-banner');

  if (!slug) {
    titleEl.textContent = '缺少 slug';
    return;
  }

  const [groupsRes, manifestRes, scheduleRes] = await Promise.all([
    fetch('data/groups.json'),
    fetch('data/manifest.json'),
    fetch('data/schedule.json'),
  ]);
  const groupsData = await groupsRes.json();
  const manifest = await manifestRes.json();
  const schedule = await scheduleRes.json();
  const group = (groupsData.groups || []).find((g) => g.slug === slug);
  if (!group) {
    titleEl.textContent = '找不到 Sentence Group：' + slug;
    return;
  }

  titleEl.textContent = group.title || group.sentence;
  const nowParam = params.get('now');
  const nowMs = nowParam ? new Date(nowParam).getTime() : Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const chunks = group.chunks || [];
  const getChunkState = (chunkId) => Progress.getChunk(slug, chunkId);

  function admittedSet() {
    return Schedule.admittedChunkIds(chunks, getChunkState, nowMs);
  }

  const groupQuizzes = (manifest.quizzes || []).filter((q) => {
    if (q.kind === 'sentence') return q.sentence === group.sentence;
    return (
      chunks.some((c) => c.id === q.chunk_id) &&
      q.sentence === group.sentence
    );
  });

  function chunkMeta(chunkId) {
    return chunks.find((c) => c.id === chunkId) || null;
  }

  function dueForMeta(meta) {
    const prog = Progress.getQuiz(meta.quiz_id);
    const kind = meta.kind;
    const chunk = kind === 'chunk' ? chunkMeta(meta.chunk_id) : null;
    const admitted =
      kind === 'chunk' ? admittedSet().has(meta.chunk_id) : true;
    const chunkState =
      kind === 'chunk' ? Progress.getChunk(slug, meta.chunk_id) : null;
    const sentenceState =
      kind === 'sentence' ? Progress.getSentence(slug) : null;
    return Schedule.dueStages({
      objective: meta.objective,
      kind,
      schedule,
      chunkState,
      sentenceState,
      completedStages: prog.completedStages,
      now: nowMs,
      admitted,
      skipped: kind === 'chunk' ? Schedule.isSkipped(chunk) : false,
    });
  }

  function buildDueQueue() {
    const due = [];
    for (const meta of groupQuizzes) {
      const stages = dueForMeta(meta);
      if (stages.length) {
        due.push({ meta, dueStages: stages });
      }
    }
    // L1 → L2 → L3 → sentence; within level by chunk_id (join order)
    due.sort((a, b) => {
      const ka = a.meta.kind === 'sentence' ? 1 : 0;
      const kb = b.meta.kind === 'sentence' ? 1 : 0;
      if (ka !== kb) return ka - kb;
      if (ka === 0) {
        const la = a.meta.level ?? 99;
        const lb = b.meta.level ?? 99;
        if (la !== lb) return la - lb;
        const ca = a.meta.chunk_id ?? 0;
        const cb = b.meta.chunk_id ?? 0;
        if (ca !== cb) return ca - cb;
      }
      return (
        (a.meta.objective || '').localeCompare(b.meta.objective || '') ||
        a.meta.quiz_id.localeCompare(b.meta.quiz_id)
      );
    });
    return due;
  }

  function chunkHasDue(chunkId) {
    return groupQuizzes.some(
      (m) => m.kind === 'chunk' && m.chunk_id === chunkId && dueForMeta(m).length
    );
  }

  function sentenceHasDue() {
    return groupQuizzes.some(
      (m) => m.kind === 'sentence' && dueForMeta(m).length
    );
  }

  function admissionHint() {
    const parts = [];
    const admitted = admittedSet();
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (admitted.has(c.id)) continue;
      if (i > 0 && !admitted.has(chunks[i - 1].id)) {
        const prev = chunks[i - 1];
        parts.push(
          'chunk' +
            c.id +
            '（' +
            (c.text || '') +
            '）等 chunk' +
            prev.id +
            '（' +
            (prev.text || '') +
            '）先加入（句子順序）'
        );
        break;
      }
      if (Schedule.isSkipped(c) || Schedule.isAlreadyIntroduced(c)) {
        break;
      }
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!Schedule.ignoresDense(chunks[j])) {
          prev = chunks[j];
          break;
        }
      }
      if (!prev) break;
      const prevSt = getChunkState(prev.id);
      if (Schedule.isChunkInDense(prevSt)) {
        const labels = Schedule.chunkStageLabels();
        const lab = labels[prevSt.stageIndex] || '?';
        parts.push(
          'chunk' +
            c.id +
            '（' +
            (c.text || '') +
            '）等 chunk' +
            prev.id +
            ' 完成密集 ' +
            lab +
            '→T1'
        );
      } else if ((prevSt.stageIndex | 0) === Schedule.T1_STAGE_INDEX) {
        const t = Schedule.chunkStageReadyAt(prevSt);
        if (t != null) {
          parts.push(
            'chunk' +
              c.id +
              '（' +
              (c.text || '') +
              '）等 chunk' +
              prev.id +
              ' T1 @ ' +
              Schedule.formatHKT(t)
          );
        }
      }
      break;
    }
    return parts.length ? ' · 加入閘：' + parts.join('；') : '';
  }

  function nextUnlockHint() {
    const parts = [];
    const admitted = admittedSet();
    for (const c of chunks) {
      if (!admitted.has(c.id)) continue;
      if (Schedule.isSkipped(c)) continue;
      const st = Progress.getChunk(slug, c.id);
      if (Schedule.isChunkStageReady(st, nowMs)) continue;
      const t = Schedule.chunkStageReadyAt(st);
      if (t != null) {
        const labels = Schedule.chunkStageLabels();
        const lab = labels[st.stageIndex] || '?';
        parts.push('chunk' + c.id + ' ' + lab + ' @ ' + Schedule.formatHKT(t));
      }
    }
    const ss = Progress.getSentence(slug);
    if (!Schedule.isSentenceStageReady(ss, nowMs)) {
      const t = Schedule.sentenceStageReadyAt(ss);
      if (t != null) {
        const labels = Schedule.sentenceStageLabels(schedule);
        const lab = labels[ss.stageIndex] || '?';
        parts.push('sentence ' + lab + ' @ ' + Schedule.formatHKT(t));
      }
    }
    const gate = admissionHint();
    return (parts.length ? ' · 下次：' + parts.join('；') : '') + gate;
  }

  let queue = buildDueQueue();
  /** @type {ReturnType<typeof Timing.createSession>|null} */
  let activeSession = null;
  let sessionSaved = false;

  function updateMeta(remaining) {
    const adm = Array.from(admittedSet()).sort((a, b) => a - b);
    metaEl.textContent =
      '而家：' +
      Schedule.formatHKT(nowMs) +
      ' · 到期 ' +
      remaining +
      ' 題' +
      (remaining === 0 ? nextUnlockHint() : '') +
      ' · 已加入 chunk：' +
      (adm.length ? adm.join(',') : '—') +
      ' · SRS＝完成後間隔；句子順序加入；最多 1 個新 chunk 密集 T01–T03（已引入／skip 唔計但仍跟順序）';
  }
  updateMeta(queue.length);

  function renderQueue() {
    queueEl.innerHTML = '';
    queue.forEach((item, i) => {
      const li = document.createElement('li');
      const chunkBit =
        item.meta.kind === 'chunk'
          ? ' c' + item.meta.chunk_id
          : '';
      li.textContent =
        i +
        1 +
        '. L' +
        (item.meta.level ?? 'S') +
        chunkBit +
        ' ' +
        item.meta.objective +
        ' [' +
        item.dueStages.join(',') +
        ']';
      queueEl.appendChild(li);
    });
  }
  renderQueue();

  function showSessionSummary(saved) {
    if (!sessionBannerEl || !saved) return;
    sessionBannerEl.hidden = false;
    sessionBannerEl.innerHTML =
      '<div class="session-banner-title">今次練習用時 ' +
      Timing.formatDuration(saved.totalMs) +
      '</div>' +
      '<div class="session-banner-meta">完成 ' +
      saved.quizCount +
      ' 題 · 詳情睇 <a href="stats.html?session=' +
      encodeURIComponent(saved.id) +
      '">統計頁</a></div>';
  }

  function saveSessionIfNeeded(reason) {
    if (!activeSession || sessionSaved) return null;
    const saved = activeSession.finalize(reason);
    sessionSaved = true;
    activeSession = null;
    return saved;
  }

  function afterPass(item) {
    Progress.markPassed(item.meta.quiz_id, item.dueStages, nowIso);

    if (item.meta.kind === 'chunk') {
      if (!chunkHasDue(item.meta.chunk_id)) {
        Progress.advanceChunk(slug, item.meta.chunk_id, nowIso);
      }
    } else if (item.meta.kind === 'sentence') {
      if (!sentenceHasDue()) {
        Progress.advanceSentence(slug, nowIso);
      }
    }
  }

  async function nextQuiz() {
    doneEl.hidden = true;
    runnerEl.hidden = false;
    if (!queue.length) {
      runnerEl.hidden = true;
      doneEl.hidden = false;
      const saved = saveSessionIfNeeded('complete');
      const timeBit = saved
        ? ' · 用時 ' + Timing.formatDuration(saved.totalMs)
        : '';
      doneEl.textContent = '今次練習完成' + timeBit + nextUnlockHint();
      showSessionSummary(saved);
      updateMeta(0);
      return;
    }
    const item = queue[0];
    if (activeSession) activeSession.startQuiz(item.meta);
    const quiz = await (await fetch(item.meta.file)).json();
    QuizRunner.run(quiz, runnerEl, {
      onPass() {
        if (activeSession) activeSession.endQuiz(item.meta);
        afterPass(item);
        queue.shift();
        renderQueue();
        updateMeta(queue.length);
        nextQuiz();
      },
    });
  }

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-btn').hidden = true;
    sessionSaved = false;
    activeSession = Timing.createSession({
      groupSlug: slug,
      groupTitle: group.title || group.sentence || slug,
    });
    nextQuiz();
  });

  // Persist partial session if user leaves after completing ≥1 quiz
  function onLeave() {
    saveSessionIfNeeded('leave');
  }
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
})();
