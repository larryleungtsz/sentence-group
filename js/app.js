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
  const nowMs = Date.now();

  for (const group of groupsData.groups || []) {
    const chunkTimes = {};
    (group.chunks || []).forEach((c) => {
      chunkTimes[c.id] = Schedule.chunkStageTimes(c.chunk_added_at);
    });
    const sentenceTimes = Schedule.sentenceStageTimes(group.sentence_added_at);
    const quizzes = (manifest.quizzes || []).filter(
      (q) => q.sentence === group.sentence
    );
    let dueCount = 0;
    for (const meta of quizzes) {
      const prog = Progress.get(meta.quiz_id);
      const stageTimes =
        meta.kind === 'sentence' ? sentenceTimes : chunkTimes[meta.chunk_id];
      if (!stageTimes) continue;
      const stages = Schedule.dueStages({
        objective: meta.objective,
        kind: meta.kind,
        schedule,
        stageTimes,
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
      ' chunks</div>';
    list.appendChild(a);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
