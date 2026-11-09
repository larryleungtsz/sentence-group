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

  const syncReady =
    window.Sync && typeof Sync.ready === 'function'
      ? Sync.ready()
      : Promise.resolve();
  const [groupsRes, manifestRes, scheduleRes] = await Promise.all([
    fetch('data/groups.json'),
    fetch('data/manifest.json'),
    fetch('data/schedule.json'),
    syncReady,
  ]);
  const groupsData = await groupsRes.json();
  const manifest = await manifestRes.json();
  const schedule = await scheduleRes.json();
  const group = (groupsData.groups || []).find((g) => g.slug === slug);
  if (!group) {
    titleEl.textContent = '找不到 Passage Group：' + slug;
    return;
  }

  titleEl.textContent = group.title || group.sentence;
  const nowParam = params.get('now');
  const nowMs = nowParam ? new Date(nowParam).getTime() : Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const chunks = group.chunks || [];
  if (typeof Progress.reconcileEnteredT1 === 'function') {
    Progress.reconcileEnteredT1(groupsData);
  }
  const getChunkState = (chunkId) => Progress.getChunk(slug, chunkId);

  function admittedSet() {
    return Schedule.admittedChunkIds(chunks, getChunkState, nowMs);
  }

  const sentenceIds = new Set(
    (group.sentences || [])
      .map((s) => (s && s.id != null ? s.id : null))
      .filter((id) => id != null && id !== '')
  );

  const groupQuizzes = (manifest.quizzes || []).filter((q) => {
    if (q.kind === 'passage') return q.sentence === group.sentence;
    if (q.kind === 'sentence') {
      if (!sentenceIds.has(q.sentence_id)) return false;
      if (q.group_slug && q.group_slug !== group.slug) return false;
      if (q.sentence && q.sentence !== group.sentence) return false;
      return true;
    }
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
    const passageState =
      kind === 'passage' ? Progress.getPassage(slug) : null;
    const sentenceUnitState =
      kind === 'sentence' ? Progress.getSentenceUnit(slug, meta.sentence_id) : null;
    return Schedule.dueStages({
      objective: meta.objective,
      kind,
      schedule,
      chunkState,
      passageState,
      sentenceUnitState,
      completedStages: prog.completedStages,
      now: nowMs,
      admitted,
      skipped: kind === 'chunk' ? Schedule.isSkipped(chunk) : false,
      scheduleStages: meta.schedule_stages || null,
      underChunkGate:
        kind === 'sentence'
          ? {
              sentence:
                (group.sentences || []).find((s) => s && s.id === meta.sentence_id) ||
                null,
              chunks,
              getChunkState,
            }
          : null,
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
    // L1 → L2 → L3 chunks, then Sentence units, then Passage.
    // Groups with no due Sentence quizzes keep the old chunk-then-passage order.
    due.sort((a, b) => {
      const rank = (kind) => (kind === 'sentence' ? 1 : kind === 'passage' ? 2 : 0);
      const ka = rank(a.meta.kind);
      const kb = rank(b.meta.kind);
      if (ka !== kb) return ka - kb;
      if (ka === 0) {
        const la = a.meta.level ?? 99;
        const lb = b.meta.level ?? 99;
        if (la !== lb) return la - lb;
        const ca = a.meta.chunk_id ?? 0;
        const cb = b.meta.chunk_id ?? 0;
        if (ca !== cb) return ca - cb;
      }
      if (ka === 1) {
        const sa = String(a.meta.sentence_id || '');
        const sb = String(b.meta.sentence_id || '');
        if (sa !== sb) return sa.localeCompare(sb);
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

  function passageHasDue() {
    return groupQuizzes.some(
      (m) => m.kind === 'passage' && dueForMeta(m).length
    );
  }

  function sentenceUnitHasDue(sentenceId) {
    return groupQuizzes.some(
      (m) =>
        m.kind === 'sentence' &&
        m.sentence_id === sentenceId &&
        dueForMeta(m).length
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
    (group.sentences || []).forEach((s) => {
      if (!s || s.id == null || s.id === '') return;
      if (!Schedule.sentenceKeepChunksLeftDense(s, chunks, getChunkState, nowMs)) {
        parts.push('sentence ' + s.id + ' 等底下 chunk 離開密集');
        return;
      }
      const st = Progress.getSentenceUnit(slug, s.id);
      if (Schedule.isSentenceUnitStageReady(st, nowMs)) return;
      const t = Schedule.sentenceUnitStageReadyAt(st);
      if (t != null) {
        const labels = Schedule.sentenceUnitStageLabels(schedule);
        const lab = labels[st.stageIndex] || '?';
        parts.push('sentence ' + s.id + ' ' + lab + ' @ ' + Schedule.formatHKT(t));
      }
    });
    const ss = Progress.getPassage(slug);
    if (!Schedule.isPassageStageReady(ss, nowMs)) {
      const t = Schedule.passageStageReadyAt(ss);
      if (t != null) {
        const labels = Schedule.passageStageLabels(schedule);
        const lab = labels[ss.stageIndex] || '?';
        parts.push('passage ' + lab + ' @ ' + Schedule.formatHKT(t));
      }
    }
    const gate = admissionHint();
    return (parts.length ? ' · 下次：' + parts.join('；') : '') + gate;
  }

  /**
   * Dev-only Q20–Q24 runner smoke. The quizzes live in data/fixtures and are
   * not in the manifest. This path never writes SRS, timing, or sync snapshots,
   * and it does not fast-forward empty sentence stages. Open
   * group.html?slug=yoyaku-shitenai&sentenceFixture=1
   */
  const fixtureMode = params.get('sentenceFixture') === '1';
  if (!fixtureMode) {
    Schedule.fastForwardVacuousSentenceUnits({
      schedule,
      quizzes: groupQuizzes,
      sentences: group.sentences,
      now: nowMs,
      getState: (id) => Progress.getSentenceUnit(slug, id),
      advance: (id) => Progress.advanceSentenceUnit(slug, id, nowIso),
      keepChunksLeftDense: (sentence) =>
        Schedule.sentenceKeepChunksLeftDense(sentence, chunks, getChunkState, nowMs),
    });
  }
  let queue = buildDueQueue();
  if (fixtureMode) {
    let payload = null;
    try {
      const res = await fetch('data/fixtures/sentence-q20-q24.json');
      if (res.ok) payload = await res.json();
    } catch (err) {
      payload = null;
    }
    const list = payload && Array.isArray(payload.quizzes) ? payload.quizzes : [];
    queue = list.map((quiz) => ({
      fixture: true,
      quiz: quiz,
      dueStages: ['fixture'],
      meta: {
        quiz_id: quiz.quiz_id,
        objective: quiz.objective,
        kind: quiz.kind || 'sentence',
        level: quiz.level != null ? quiz.level : null,
        sentence_id: quiz.sentence_id,
        file: null,
      },
    }));
  }
  const fixtureMissing = fixtureMode && queue.length === 0;
  /** @type {ReturnType<typeof Timing.createSession>|null} */
  let activeSession = null;
  let sessionSaved = false;

  function updateMeta(remaining) {
    if (fixtureMode) {
      metaEl.textContent = fixtureMissing
        ? '讀唔到 Q20–Q24 fixture（data/fixtures/sentence-q20-q24.json）。'
        : 'Fixture Q20–Q24（唔計入 SRS、用時、progress） · 剩餘 ' + remaining + ' 題';
      return;
    }
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
          : item.meta.kind === 'sentence'
            ? ' ' + (item.meta.sentence_id || 'sentence')
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
    const excluded = Timing.excludedQuizCount(saved);
    sessionBannerEl.innerHTML =
      '<div class="session-banner-title">今次練習用時 ' +
      Timing.formatDuration(Timing.practiceTotalMs(saved)) +
      '</div>' +
      '<div class="session-banner-meta">完成 ' +
      saved.quizCount +
      ' 題' +
      (excluded ? ' · ' + excluded + ' 題超過 2 分鐘，不計入用時' : '') +
      ' · 詳情睇 <a href="stats.html?session=' +
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
    if (item.fixture) return;
    Progress.markPassed(item.meta.quiz_id, item.dueStages, nowIso);

    if (item.meta.kind === 'chunk') {
      if (!chunkHasDue(item.meta.chunk_id)) {
        Progress.advanceChunk(
          slug,
          item.meta.chunk_id,
          nowIso,
          chunkMeta(item.meta.chunk_id)
        );
      }
    } else if (item.meta.kind === 'passage') {
      if (!passageHasDue()) {
        Progress.advancePassage(slug, nowIso);
      }
    } else if (item.meta.kind === 'sentence') {
      if (!sentenceUnitHasDue(item.meta.sentence_id)) {
        Progress.advanceSentenceUnit(slug, item.meta.sentence_id, nowIso);
      }
    }
  }

  async function nextQuiz() {
    doneEl.hidden = true;
    runnerEl.hidden = false;
    if (!queue.length) {
      runnerEl.hidden = true;
      doneEl.hidden = false;
      if (fixtureMode) {
        doneEl.textContent = 'Fixture 做完。呢幾題冇寫入 SRS、用時或者 progress。';
        updateMeta(0);
        return;
      }
      const saved = saveSessionIfNeeded('complete');
      const timeBit = saved
        ? ' · 用時 ' + Timing.formatDuration(Timing.practiceTotalMs(saved))
        : '';
      doneEl.textContent = '今次練習完成' + timeBit + nextUnlockHint();
      showSessionSummary(saved);
      updateMeta(0);
      return;
    }
    const item = queue[0];
    if (activeSession && !item.fixture) activeSession.startQuiz(item.meta);
    const quiz = item.quiz || await (await fetch(item.meta.file)).json();
    const chunk = item.meta.kind === 'chunk' ? chunkMeta(item.meta.chunk_id) : null;
    const sentenceRow =
      item.meta.kind === 'sentence'
        ? (group.sentences || []).find((s) => s && s.id === item.meta.sentence_id) || null
        : null;
    function leaveQuiz() {
      queue.shift();
      renderQueue();
      updateMeta(queue.length);
      nextQuiz();
    }
    QuizRunner.run(quiz, runnerEl, {
      context: {
        groupTitle: group.title || group.sentence || '',
        groupSlug: slug,
        kind: item.meta.kind,
        chunkId: item.meta.kind === 'chunk' ? item.meta.chunk_id : null,
        chunkText: chunk && chunk.text ? chunk.text : '',
        sentenceId: item.meta.kind === 'sentence' ? item.meta.sentence_id : null,
        sentenceText: sentenceRow && sentenceRow.text ? sentenceRow.text : '',
        sentenceL1: sentenceRow && sentenceRow.l1 ? sentenceRow.l1 : '',
        palaceImageUrl: group.palace_image_url || '',
      },
      onPass() {
        if (activeSession && !item.fixture) activeSession.endQuiz(item.meta);
        if (!item.fixture) afterPass(item);
        leaveQuiz();
      },
      onSkip() {
        if (activeSession && !item.fixture) activeSession.endQuiz(item.meta);
        leaveQuiz();
      },
    });
  }

  function abortPracticeStart() {
    activeSession = null;
    sessionSaved = false;
    const btn = document.getElementById('start-btn');
    if (btn) {
      btn.removeAttribute('data-practice-started');
      btn.hidden = false;
    }
    runnerEl.hidden = true;
    runnerEl.innerHTML = '';
    doneEl.hidden = true;
    updateMeta(queue.length);
  }

  // Cloud SRS that arrives after the queue was painted (the bootstrap sync
  // often finishes past Sync.ready()'s 8s cutoff) updates this list in place.
  // A reload used to land on the same visible button and swallow the click.
  window.addEventListener('sentence-group-sync', (ev) => {
    if (!window.Sync || typeof Sync.shouldRefreshPracticeQueue !== 'function') return;
    const btn = document.getElementById('start-btn');
    const detail = ev && ev.detail;
    if (
      !Sync.shouldRefreshPracticeQueue({
        progressChanged: !!(detail && detail.progressChanged),
        fixtureMode: fixtureMode,
        practiceStarted:
          !!activeSession || !!(btn && btn.getAttribute('data-practice-started') === '1'),
        startHidden: !!(btn && btn.hidden),
      })
    ) {
      return;
    }
    queue = buildDueQueue();
    updateMeta(queue.length);
    renderQueue();
  });

  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', () => {
    startBtn.setAttribute('data-practice-started', '1');
    startBtn.hidden = true;
    sessionSaved = false;
    try {
      if (!fixtureMode) {
        activeSession = Timing.createSession({
          groupSlug: slug,
          groupTitle: group.title || group.sentence || slug,
        });
      }
    } catch (err) {
      console.error(err);
      abortPracticeStart();
      return;
    }
    Promise.resolve()
      .then(() => nextQuiz())
      .catch((err) => {
        console.error(err);
        abortPracticeStart();
      });
  });
  startBtn.hidden = false;

  // Persist partial session if user leaves after completing ≥1 quiz
  function onLeave() {
    saveSessionIfNeeded('leave');
  }
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
})();
