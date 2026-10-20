(async function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const titleEl = document.getElementById('group-title');
  const metaEl = document.getElementById('group-meta');
  const queueEl = document.getElementById('queue-list');
  const runnerEl = document.getElementById('runner');
  const doneEl = document.getElementById('done');

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
  const now = Date.now();
  // Allow ?now= ISO override for testing
  const nowParam = params.get('now');
  const nowMs = nowParam ? new Date(nowParam).getTime() : now;

  const chunkTimes = {};
  (group.chunks || []).forEach((c) => {
    chunkTimes[c.id] = Schedule.chunkStageTimes(c.chunk_added_at);
  });
  const sentenceTimes = Schedule.sentenceStageTimes(group.sentence_added_at);

  const groupQuizzes = (manifest.quizzes || []).filter((q) => {
    if (q.kind === 'sentence') return q.sentence === group.sentence;
    return (group.chunks || []).some((c) => c.id === q.chunk_id) && q.sentence === group.sentence;
  });

  function buildDueQueue() {
    const due = [];
    for (const meta of groupQuizzes) {
      const prog = Progress.get(meta.quiz_id);
      const kind = meta.kind;
      const stageTimes =
        kind === 'sentence' ? sentenceTimes : chunkTimes[meta.chunk_id];
      if (!stageTimes) continue;
      const stages = Schedule.dueStages({
        objective: meta.objective,
        kind,
        schedule,
        stageTimes,
        completedStages: prog.completedStages,
        now: nowMs,
      });
      if (stages.length) {
        due.push({ meta, dueStages: stages, stageTimes });
      }
    }
    // Sort: Level 1 → 2 → 3 → sentence; within level by chunk_id; then objective/quiz_id
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

  let queue = buildDueQueue();
  metaEl.textContent =
    '而家：' +
    Schedule.formatHKT(nowMs) +
    ' · 到期 ' +
    queue.length +
    ' 題' +
    (group.sentence_added_at_note ? ' · （加入時間為暫定）' : '');

  function renderQueue() {
    queueEl.innerHTML = '';
    queue.forEach((item, i) => {
      const li = el('li', null, (i + 1) + '. L' + (item.meta.level ?? 'S') + ' ' + item.meta.objective + ' [' + item.dueStages.join(',') + ']');
      queueEl.appendChild(li);
    });
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  renderQueue();

  async function nextQuiz() {
    doneEl.hidden = true;
    runnerEl.hidden = false;
    if (!queue.length) {
      runnerEl.hidden = true;
      doneEl.hidden = false;
      doneEl.textContent = '今次練習完成';
      return;
    }
    const item = queue[0];
    const quiz = await (await fetch(item.meta.file)).json();
    QuizRunner.run(quiz, runnerEl, {
      onPass() {
        const stages = item.dueStages;
        // Mark all currently due stages for this appearance as completed
        Progress.markPassed(item.meta.quiz_id, stages, new Date(nowMs).toISOString());
        queue.shift();
        renderQueue();
        metaEl.textContent =
          '而家：' + Schedule.formatHKT(nowMs) + ' · 剩餘 ' + queue.length + ' 題';
        nextQuiz();
      },
    });
  }

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-btn').hidden = true;
    nextQuiz();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('清除本地進度？')) {
      Progress.resetAll();
      location.reload();
    }
  });
})();
