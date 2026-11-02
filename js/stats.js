(async function () {
  const overviewEl = document.getElementById('stats-overview');
  const groupsEl = document.getElementById('stats-groups');
  const listEl = document.getElementById('session-list');
  const detailEl = document.getElementById('session-detail');
  const emptyEl = document.getElementById('stats-empty');
  const clearBtn = document.getElementById('clear-timing');
  const noteEl = document.getElementById('stats-metric-note');

  const params = new URLSearchParams(location.search);
  const focusId = params.get('session');
  const nowParam = params.get('now');
  const parsedNow = nowParam ? new Date(nowParam).getTime() : NaN;
  const nowMs = isNaN(parsedNow) ? Date.now() : parsedNow;

  let groupsData = { groups: [] };
  let groupsLoaded = false;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function groupIndex(data) {
    const map = new Map();
    ((data && data.groups) || []).forEach(function (group) {
      if (group && group.slug) map.set(group.slug, group);
    });
    return map;
  }

  function displayTitle(row, group) {
    if (group && (group.title || group.sentence)) return group.title || group.sentence;
    if (row.groupTitle) return row.groupTitle;
    return row.groupSlug || '（未命名）';
  }

  function chunkLabelHtml(row) {
    if (row.kind === 'sentence') return escapeHtml(row.label || '句子題');
    if (row.labelFromText) {
      return (
        escapeHtml(row.label) +
        ' <span class="muted">c' +
        escapeHtml(row.chunkId) +
        '</span>'
      );
    }
    return escapeHtml(row.label || (row.chunkId != null ? 'c' + row.chunkId : 'c?'));
  }

  function renderOverview(sessions, progress) {
    const ov = StatsMetrics.overview(sessions, nowMs);
    const learned = StatsMetrics.countEnteredT1(progress, groupsLoaded ? groupsData : { groups: [] }, nowMs);
    const chips = [
      { key: 'today', label: '今日', ms: ov.todayMs, count: learned.today },
      { key: 'week', label: '本週（近7日）', ms: ov.weekMs, count: learned.week },
      { key: 'all', label: '全部', ms: ov.allMs, count: null },
    ];
    overviewEl.innerHTML = chips
      .map(function (chip) {
        const sub =
          chip.count == null
            ? '<div class="stats-chip-sub">練習時間</div>'
            : '<div class="stats-chip-sub" data-field="learned">學新詞 ' + chip.count + '</div>';
        return (
          '<div class="stats-chip" data-window="' +
          chip.key +
          '" data-ms="' +
          chip.ms +
          '"' +
          (chip.count == null ? '' : ' data-learned="' + chip.count + '"') +
          '>' +
          '<div class="stats-chip-label">' +
          escapeHtml(chip.label) +
          '</div>' +
          '<div class="stats-chip-value" data-field="practice">' +
          escapeHtml(Timing.formatDuration(chip.ms)) +
          '</div>' +
          sub +
          '</div>'
        );
      })
      .join('');
  }

  function renderGroups(sessions) {
    const open = new Set(
      Array.from(groupsEl.querySelectorAll('details[open]')).map(function (el) {
        return el.dataset.slug || '';
      })
    );
    const rollup = StatsMetrics.groupRollup(sessions);
    const bySlug = groupIndex(groupsData);
    if (!rollup.length) {
      groupsEl.innerHTML = '<p class="muted">未有練習題目用時。</p>';
      return;
    }
    groupsEl.innerHTML = '';
    rollup.forEach(function (row) {
      const group = bySlug.get(row.groupSlug) || null;
      const details = document.createElement('details');
      details.className = 'stats-group';
      details.dataset.slug = row.groupSlug;
      details.dataset.ms = String(row.totalMs);
      if (open.has(row.groupSlug)) details.open = true;
      const chunks = StatsMetrics.groupChunkRows(sessions, row.groupSlug, group);
      let body = '';
      if (!chunks.length) {
        body = '<p class="muted stats-chunk-empty">無</p>';
      } else {
        body = chunks
          .map(function (chunk) {
            return (
              '<div class="stats-chunk-row" data-key="' +
              escapeHtml(chunk.key) +
              '" data-ms="' +
              chunk.totalMs +
              '">' +
              '<span class="stats-label">' +
              chunkLabelHtml(chunk) +
              '</span>' +
              '<span class="stats-chunk-meta"><span class="stats-val">' +
              escapeHtml(Timing.formatDuration(chunk.totalMs)) +
              '</span> <span class="muted">（' +
              chunk.quizCount +
              ' 題）</span></span>' +
              '</div>'
            );
          })
          .join('');
      }
      details.innerHTML =
        '<summary>' +
        '<span class="stats-group-title">' +
        escapeHtml(displayTitle(row, group)) +
        '</span>' +
        '<span class="stats-group-time">' +
        escapeHtml(Timing.formatDuration(row.totalMs)) +
        '</span>' +
        '</summary>' +
        '<div class="stats-chunks">' +
        body +
        '</div>';
      groupsEl.appendChild(details);
    });
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
      const href = new URLSearchParams();
      href.set('session', s.id);
      if (nowParam && !isNaN(parsedNow)) href.set('now', nowParam);
      a.href = 'stats.html?' + href.toString();
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

  function renderDetail(id, opts) {
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
    if (!opts || opts.scroll !== false) {
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderAll(opts) {
    const sessions = Timing.listSessions();
    const progress = Progress.loadAll();
    renderOverview(sessions, progress);
    renderGroups(sessions);
    renderList();
    if (focusId) renderDetail(focusId, opts);
  }

  try {
    const syncReady =
      window.Sync && typeof Sync.ready === 'function' ? Sync.ready() : Promise.resolve();
    const [res] = await Promise.all([fetch('data/groups.json'), syncReady]);
    if (res && res.ok) {
      groupsData = await res.json();
      groupsLoaded = true;
      if (Progress.reconcileEnteredT1) Progress.reconcileEnteredT1(groupsData);
    } else if (noteEl) {
      noteEl.textContent += ' 讀唔到 groups.json，學新詞可能未排除 skip。';
    }
  } catch (e) {
    if (noteEl) noteEl.textContent += ' 讀唔到 groups.json，學新詞可能未排除 skip。';
  }

  renderAll();

  window.addEventListener('sentence-group-sync', () => {
    if (groupsLoaded && Progress.reconcileEnteredT1) {
      Progress.reconcileEnteredT1(groupsData);
    }
    renderAll({ scroll: false });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (
        !confirm(
          '清除本機練習計時？（唔影響 SRS。雲端如果已經有備份，下次同步會合併返嚟，唔會用空白覆蓋雲端。）'
        )
      ) {
        return;
      }
      Timing.clearAll();
      location.href = 'stats.html';
    });
  }
})();
