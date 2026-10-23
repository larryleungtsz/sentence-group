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
    const chunks = group.chunks || [];
    const getChunkState = (chunkId) =>
      Progress.getChunk(group.slug, chunkId);
    const admitted = Schedule.admittedChunkIds(chunks, getChunkState, nowMs);

    const quizzes = (manifest.quizzes || []).filter(
      (q) => q.sentence === group.sentence
    );
    let dueCount = 0;
    for (const meta of quizzes) {
      const prog = Progress.getQuiz(meta.quiz_id);
      const chunk =
        meta.kind === 'chunk'
          ? chunks.find((c) => c.id === meta.chunk_id) || null
          : null;
      const stages = Schedule.dueStages({
        objective: meta.objective,
        kind: meta.kind,
        schedule,
        chunkState:
          meta.kind === 'chunk'
            ? Progress.getChunk(group.slug, meta.chunk_id)
            : null,
        sentenceState:
          meta.kind === 'sentence'
            ? Progress.getSentence(group.slug)
            : null,
        completedStages: prog.completedStages,
        now: nowMs,
        admitted:
          meta.kind === 'chunk' ? admitted.has(meta.chunk_id) : true,
        skipped: meta.kind === 'chunk' ? Schedule.isSkipped(chunk) : false,
      });
      if (stages.length) dueCount++;
    }
    const readyChunks = chunks.filter((c) => c.quizzes_ready !== false).length;
    const a = document.createElement('a');
    a.className = 'group-card';
    a.href = 'group.html?slug=' + encodeURIComponent(group.slug);
    const dueMark =
      dueCount > 0
        ? '<span class="group-due-mark" title="有到期題目" aria-label="有到期題目">✅</span>'
        : '';
    a.innerHTML =
      '<div class="group-card-title">' +
      escapeHtml(group.title || group.sentence) +
      dueMark +
      '</div>' +
      '<div class="group-card-meta">到期 ' +
      dueCount +
      ' 題 · 已加入 ' +
      admitted.size +
      '/' +
      chunks.length +
      ' chunks（有題 ' +
      readyChunks +
      '）· 最多 1 個新 chunk 密集（已引入／skip 唔計）</div>';
    list.appendChild(a);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
