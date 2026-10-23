(async function () {
  const listEl = document.getElementById('session-list');
  const detailEl = document.getElementById('session-detail');
  const emptyEl = document.getElementById('stats-empty');
  const clearBtn = document.getElementById('clear-timing');

  const params = new URLSearchParams(location.search);
  const focusId = params.get('session');

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderList() {
    const sessions = Timing.listSessions();
    listEl.innerHTML = '';
    if (!sessions.length) {
      emptyEl.hidden = false;
      detailEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    sessions.forEach((s) => {
      const a = document.createElement('a');
      a.className = 'stats-card' + (s.id === focusId ? ' stats-card-active' : '');
      a.href = 'stats.html?session=' + encodeURIComponent(s.id);
      const startMs = Date.parse(s.startedAt);
      a.innerHTML =
        '<div class="stats-card-title">' +
        escapeHtml(s.groupTitle || s.groupSlug) +
        '</div>' +
        '<div class="stats-card-meta">' +
        Timing.formatHKT(startMs) +
        ' · ' +
        Timing.formatDuration(s.totalMs) +
        ' · ' +
        s.quizCount +
        ' 題' +
        (s.reason === 'leave' ? ' · 中途離開' : '') +
        '</div>';
      listEl.appendChild(a);
    });
  }

  function renderDetail(id) {
    const s = Timing.getSession(id);
    if (!s) {
      detailEl.hidden = true;
      return;
    }
    detailEl.hidden = false;
    const startMs = Date.parse(s.startedAt);
    const endMs = Date.parse(s.endedAt);
    let html =
      '<h2>' +
      escapeHtml(s.groupTitle || s.groupSlug) +
      '</h2>' +
      '<p class="muted">開始 ' +
      Timing.formatHKT(startMs) +
      ' · 結束 ' +
      Timing.formatHKT(endMs) +
      ' · 總用時 <strong>' +
      Timing.formatDuration(s.totalMs) +
      '</strong>' +
      (s.reason === 'leave' ? '（中途離開）' : '') +
      '</p>';

    html += '<h3>Chunk 用時</h3>';
    if (!s.chunks || !s.chunks.length) {
      html += '<p class="muted">無</p>';
    } else {
      html += '<ul class="stats-breakdown">';
      s.chunks.forEach((c) => {
        html +=
          '<li><span class="stats-label">' +
          escapeHtml(c.label) +
          '</span> <span class="stats-val">' +
          Timing.formatDuration(c.totalMs) +
          '</span> <span class="muted">（' +
          c.quizCount +
          ' 題）</span></li>';
      });
      html += '</ul>';
    }

    html += '<h3>每題用時</h3>';
    if (!s.quizzes || !s.quizzes.length) {
      html += '<p class="muted">無</p>';
    } else {
      html += '<ol class="stats-breakdown">';
      s.quizzes.forEach((q) => {
        const chunkBit =
          q.kind === 'chunk' ? ' c' + q.chunkId : q.kind === 'sentence' ? ' 句子' : '';
        html +=
          '<li><span class="stats-label">L' +
          (q.level != null ? q.level : 'S') +
          chunkBit +
          ' ' +
          escapeHtml(q.objective || q.quizId) +
          '</span> <span class="stats-val">' +
          Timing.formatDuration(q.durationMs) +
          '</span>' +
          '<div class="muted stats-sub">' +
          Timing.formatHKT(Date.parse(q.startedAt)) +
          ' → ' +
          Timing.formatHKT(Date.parse(q.endedAt)) +
          '</div></li>';
      });
      html += '</ol>';
    }
    detailEl.innerHTML = html;
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  renderList();
  if (focusId) renderDetail(focusId);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('清除全部練習計時記錄？（唔影響 SRS 進度）')) return;
      Timing.clearAll();
      location.href = 'stats.html';
    });
  }
})();
