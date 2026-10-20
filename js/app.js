(async function () {
  const list = document.getElementById('group-list');
  const [groupsRes, manifestRes, scheduleRes] = await Promise.all([
    fetch('data/groups.json'),
    fetch('data/manifest.json'),
    fetch('data/schedule.json'),
  ]);
  const groupsData = await groupsRes.json();
  const manifest = await manifestRes.json();
  const schedule = await scheduleRes.json();
  const params = new URLSearchParams(location.search);
  const nowParam = params.get('now');
  const nowMs = nowParam ? new Date(nowParam).getTime() : Date.now();

  for (const group of groupsData.groups || []) {
    const quizzes = (manifest.quizzes || []).filter(
      (q) => q.sentence === group.sentence
    );
    let dueCount = 0;
    for (const meta of quizzes) {
      const prog = Progress.getQuiz(meta.quiz_id);
      const stages = Schedule.dueStages({
        objective: meta.objective,
        kind: meta.kind,
        schedule,
        chunkState:
          meta.kind === 'chunk'
            ? Progress.getChunk(group.slug, meta.chunk_id)
            : null,
        sentenceState:
          meta.kind === 'sentence' ? Progress.getSentence(group.slug) : null,
        completedStages: prog.completedStages,
        now: nowMs,
      });
      if (stages.length) dueCount++;
    }
    const a = document.createElement('a');
    a.className = 'group-card';
    a.href = 'group.html?slug=' + encodeURIComponent(group.slug);
    a.innerHTML =
      '<div class="group-card-title">' +
      escapeHtml(group.title || group.sentence) +
      '</div>' +
      '<div class="group-card-meta">到期 ' +
      dueCount +
      ' 題 · ' +
      (group.chunks || []).length +
      ' chunks · 完成後間隔</div>';
    list.appendChild(a);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
