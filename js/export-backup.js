/**
 * Phone seed backup only. No Supabase, no Google.
 * Same origin as the practice site so it can read localStorage.
 * Merge rules live in js/sync-merge.js.
 */
(function () {
  'use strict';

  var SM = window.SyncMerge;
  var statusEl = document.getElementById('backup-status');
  var importEl = document.getElementById('backup-import');
  var importMsg = document.getElementById('backup-import-msg');
  var sheet = document.getElementById('backup-sheet');
  var sheetMsg = document.getElementById('backup-sheet-msg');
  var sheetText = document.getElementById('backup-sheet-text');
  var lastText = '';

  function say(el, text, bad) {
    if (!el) return;
    el.textContent = text;
    el.className = bad ? 'backup-msg backup-bad' : 'backup-msg';
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return (
      /iPad|iPhone|iPod|CriOS|FxiOS/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function readRaw(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }

  function backupName() {
    try {
      var s = new Date().toLocaleString('sv-SE', {
        timeZone: 'Asia/Hong_Kong',
        hour12: false,
      });
      var compact = s.replace(/\D/g, '').slice(0, 12);
      if (compact) return 'sentence-group-backup-' + compact + '.json';
    } catch (e) {}
    return 'sentence-group-backup.json';
  }

  function buildText() {
    if (!SM) throw new Error('合併程式未載入');
    return JSON.stringify(
      SM.buildExportObject(readRaw(SM.TIMING_KEY), readRaw(SM.PROGRESS_KEY)),
      null,
      2
    );
  }

  function refreshCounts() {
    if (!SM) {
      say(statusEl, '頁面檔案未齊，匯出未就緒。', true);
      return;
    }
    var timing = SM.normalizeTiming(readRaw(SM.TIMING_KEY));
    var progress = SM.countProgress(readRaw(SM.PROGRESS_KEY));
    say(
      statusEl,
      '本機而家有計時 ' +
        timing.sessions.length +
        ' 個 session，SRS ' +
        progress.quizzes +
        ' 題、' +
        progress.chunks +
        ' 個 chunk、' +
        progress.passages +
        ' 段。唔使登入。'
    );
  }

  function selectAll() {
    if (!sheetText) return;
    sheetText.focus();
    try {
      sheetText.setSelectionRange(0, sheetText.value.length);
    } catch (e) {}
  }

  function openSheet(text) {
    lastText = text;
    if (sheetText) sheetText.value = text;
    if (sheet) sheet.hidden = false;
    selectAll();
  }

  function currentText() {
    if (sheetText && sheetText.value) return sheetText.value;
    if (lastText) return lastText;
    return buildText();
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2500);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return false;
        }
      );
    }
    selectAll();
    try {
      return Promise.resolve(document.execCommand('copy'));
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function shareText(text) {
    if (typeof navigator.share !== 'function') {
      return Promise.reject(new Error('no share'));
    }
    var filename = backupName();
    var file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: filename });
    }
    return navigator.share({ title: filename, text: text });
  }

  function longPressHint(prefix) {
    say(
      sheetMsg,
      (prefix ? prefix + ' ' : '') +
        '長按下面文字，揀「全選」，再複製。兩個 key 都喺入面：website-manager-timing-v1 同 website-manager-progress-v2。'
    );
  }

  function runSteps(text, steps, i) {
    if (i >= steps.length || steps[i] === 'textarea') {
      longPressHint('');
      return;
    }
    var step = steps[i];
    if (step === 'download') {
      try {
        downloadText(backupName(), text);
        say(sheetMsg, '已嘗試下載。如果冇檔案，撳分享或複製，或者長按文字全選。');
      } catch (e) {
        runSteps(text, steps, i + 1);
      }
      return;
    }
    if (step === 'share') {
      shareText(text).then(
        function () {
          say(sheetMsg, '已開分享。文字留喺全螢幕，可以再複製。');
        },
        function (err) {
          if (err && err.name === 'AbortError') {
            longPressHint('分享已取消。');
            return;
          }
          runSteps(text, steps, i + 1);
        }
      );
      return;
    }
    if (step === 'copy') {
      copyText(text).then(function (ok) {
        if (ok) say(sheetMsg, '已複製兩個 key。亦可以長按文字再選一次。');
        else longPressHint('複製被擋住。');
      });
    }
  }

  function onExport() {
    var text;
    try {
      text = buildText();
    } catch (e) {
      say(statusEl, '匯出失敗：' + (e && e.message ? e.message : String(e)), true);
      return;
    }
    openSheet(text);
    var plan = SM.planExportFallbacks({
      ios: isIOS(),
      canShare: typeof navigator.share === 'function',
      canCopy: !!(navigator.clipboard && navigator.clipboard.writeText),
      canDownload: true,
    });
    runSteps(text, plan, 0);
  }

  function onCopy() {
    var text;
    try {
      text = currentText();
    } catch (e) {
      say(sheetMsg, '複製失敗。', true);
      return;
    }
    openSheet(text);
    copyText(text).then(function (ok) {
      if (ok) say(sheetMsg, '已複製到剪貼簿。');
      else longPressHint('複製被擋住。');
    });
  }

  function onShare() {
    var text;
    try {
      text = currentText();
    } catch (e) {
      say(sheetMsg, '分享失敗。', true);
      return;
    }
    openSheet(text);
    if (typeof navigator.share !== 'function') {
      longPressHint('呢個瀏覽器冇分享。');
      return;
    }
    shareText(text).then(
      function () {
        say(sheetMsg, '已開分享。');
      },
      function (err) {
        if (err && err.name === 'AbortError') return;
        longPressHint('分享失敗。');
      }
    );
  }

  function onDownload() {
    var text;
    try {
      text = currentText();
    } catch (e) {
      say(sheetMsg, '下載失敗。', true);
      return;
    }
    openSheet(text);
    try {
      downloadText(backupName(), text);
      say(
        sheetMsg,
        isIOS()
          ? '已再試下載。iPhone 經常冇檔案，請用複製或長按全選。'
          : '已再下載。'
      );
    } catch (e) {
      longPressHint('下載失敗。');
    }
  }

  function applyPasted(text) {
    var parsed;
    try {
      parsed = SM.parseImport(text);
    } catch (e) {
      var msg = e instanceof SyntaxError ? '呢段唔係有效 JSON。' : e.message || String(e);
      say(importMsg, msg, true);
      return;
    }
    var beforeT = SM.normalizeTiming(readRaw(SM.TIMING_KEY));
    var beforeP = SM.normalizeProgress(readRaw(SM.PROGRESS_KEY));
    var applied = SM.applyImport(beforeT, beforeP, parsed);
    if (
      parsed.hasTiming &&
      !SM.localWriteAllowed(SM.isTimingEmpty(beforeT), SM.isTimingEmpty(applied.timing))
    ) {
      say(importMsg, '拒絕用空白覆蓋本機計時。', true);
      return;
    }
    if (
      parsed.hasProgress &&
      !SM.localWriteAllowed(SM.isProgressEmpty(beforeP), SM.isProgressEmpty(applied.progress))
    ) {
      say(importMsg, '拒絕用空白覆蓋本機 SRS。', true);
      return;
    }
    if (parsed.hasTiming) localStorage.setItem(SM.TIMING_KEY, JSON.stringify(applied.timing));
    if (parsed.hasProgress) localStorage.setItem(SM.PROGRESS_KEY, JSON.stringify(applied.progress));
    var bits = ['已合併。空白唔會覆蓋已有記錄'];
    if (parsed.hasTiming) {
      bits.push(
        '計時 sessions ' +
          beforeT.sessions.length +
          ' + 備份 ' +
          parsed.timing.sessions.length +
          ' → ' +
          applied.timing.sessions.length
      );
    }
    if (parsed.hasProgress) {
      var b = SM.countProgress(beforeP);
      var inc = SM.countProgress(parsed.progress);
      var a = SM.countProgress(applied.progress);
      bits.push(
        'SRS quizzes ' + b.quizzes + '+' + inc.quizzes + '→' + a.quizzes +
          '，chunks ' + b.chunks + '+' + inc.chunks + '→' + a.chunks
      );
    }
    say(importMsg, bits.join('。'));
    refreshCounts();
  }

  document.getElementById('backup-export').addEventListener('click', onExport);
  document.getElementById('backup-copy').addEventListener('click', onCopy);
  document.getElementById('backup-share').addEventListener('click', onShare);
  document.getElementById('backup-download').addEventListener('click', onDownload);
  document.getElementById('backup-select').addEventListener('click', selectAll);
  document.getElementById('backup-close').addEventListener('click', function () {
    if (sheet) sheet.hidden = true;
  });
  document.getElementById('backup-import-btn').addEventListener('click', function () {
    var text = importEl ? importEl.value : '';
    if (!String(text || '').trim()) {
      say(importMsg, '請貼上備份，或者揀一個 JSON 檔。', true);
      return;
    }
    applyPasted(text);
  });
  document.getElementById('backup-file').addEventListener('change', function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (importEl) importEl.value = String(reader.result || '');
      say(importMsg, '已讀取「' + file.name + '」。撳「合併匯入」先會寫入。');
    };
    reader.onerror = function () {
      say(importMsg, '讀取檔案失敗。', true);
    };
    reader.readAsText(file);
  });

  if (typeof navigator.share !== 'function') {
    var shareBtn = document.getElementById('backup-share');
    var sheetShare = document.getElementById('backup-sheet-share');
    if (shareBtn) shareBtn.hidden = true;
    if (sheetShare) sheetShare.hidden = true;
  }
  refreshCounts();
})();
