/**
 * Cloud sync UI + Supabase transport.
 *
 * Swap backends by replacing the "Supabase transport" section only.
 * Merge rules live in js/sync-merge.js (no network).
 *
 * localStorage stays the cache and the offline source. If Supabase is not
 * configured, this file only mounts export / import and does not call the network.
 *
 * Seed, per document (timing and progress independently):
 *   cloud empty, local has data → upload local (phone backup is the seed)
 *   local empty, cloud has data → pull
 *   both have data → merge, save local, push merged
 *   never write an empty payload over a non-empty side
 *
 * Offline: a dirty flag is kept in website-manager-sync-queue-v1 and retried
 * on online / tab focus / a 30s timer / the manual button.
 */
(function (global) {
  'use strict';

  var SM = global.SyncMerge;
  var QUEUE_KEY = 'website-manager-sync-queue-v1';
  var META_KEY = 'website-manager-sync-meta-v1';
  var OWNER_ID = 'larry';
  var SUPABASE_SRC =
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.js';

  if (!SM) {
    global.Sync = {
      ready: function () {
        return Promise.resolve();
      },
      onLocalWrite: function () {},
    };
    return;
  }

  var client = null;
  var readyPromise = null;
  var initialDone = false;
  var chain = Promise.resolve();
  var debounceTimer = null;
  var suppressWrites = 0;
  var lastExportText = '';
  var state = {
    phase: 'unconfigured',
    message: '雲端同步未設定。本機練習、匯出同匯入照常用。',
    email: '',
    lastSyncAt: null,
  };

  function readConfig() {
    var cfg = global.SYNC_CONFIG || {};
    var url = String(cfg.supabaseUrl || '')
      .trim()
      .replace(/\/+$/, '');
    var key = String(cfg.supabaseAnonKey || '').trim();
    var emails = Array.isArray(cfg.allowedEmails) ? cfg.allowedEmails : [];
    return {
      url: url,
      key: key,
      emails: emails
        .map(function (e) {
          return String(e || '')
            .trim()
            .toLowerCase();
        })
        .filter(Boolean),
    };
  }

  function jwtPayload(key) {
    try {
      var part = String(key || '').split('.')[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4 === 0 ? '' : '===='.slice(b64.length % 4);
      return JSON.parse(atob(b64 + pad));
    } catch (e) {
      return null;
    }
  }

  function configProblem(cfg) {
    if (!cfg.url && !cfg.key) return 'missing';
    if (!cfg.url || !cfg.key) return 'incomplete';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url)) return 'bad-url';
    var payload = jwtPayload(cfg.key);
    if (!payload) return 'bad-key';
    if (payload.role === 'service_role') return 'service-role';
    if (payload.role !== 'anon') return 'bad-key';
    if (!cfg.emails.length) return 'no-allowlist';
    return '';
  }

  function problemMessage(problem) {
    if (problem === 'missing' || problem === 'incomplete' || problem === 'bad-url' || problem === 'bad-key') {
      return '雲端同步未設定。本機練習、匯出同匯入照常用。填好 js/sync-config.js 嘅 Supabase URL 同 anon key 先會連接。';
    }
    if (problem === 'service-role') {
      return 'sync-config 入面係 service role key，已停用。請改貼 anon public key。service role 同 Google client secret 都唔可以放喺網頁。';
    }
    if (problem === 'no-allowlist') {
      return 'Supabase URL 已填，但 allowedEmails 未有 Google 帳戶，所以未連接。請喺 js/sync-config.js 加上你嘅 Gmail，並且喺 SQL sync_allowlist 插入同一個 email。';
    }
    return '雲端同步未設定。本機練習照常。';
  }

  function readQueue() {
    try {
      var raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return { dirty: false, queuedAt: null };
      return { dirty: !!raw.dirty, queuedAt: raw.queuedAt || null };
    } catch (e) {
      return { dirty: false, queuedAt: null };
    }
  }

  function writeQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function markDirty() {
    writeQueue({ dirty: true, queuedAt: new Date().toISOString() });
  }

  function readMeta() {
    try {
      var raw = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return { lastSyncAt: null };
      return { lastSyncAt: raw.lastSyncAt || null };
    } catch (e) {
      return { lastSyncAt: null };
    }
  }

  function writeMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    suppressWrites++;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } finally {
      suppressWrites--;
    }
  }

  function stable(value) {
    return JSON.stringify(sortValue(value));
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value)
        .sort()
        .forEach(function (k) {
          out[k] = sortValue(value[k]);
        });
      return out;
    }
    return value;
  }

  function isPlain(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }

  function coercePayload(payload) {
    var cur = payload;
    var guard = 0;
    while (typeof cur === 'string' && guard < 3) {
      cur = JSON.parse(cur);
      guard++;
    }
    return cur;
  }

  function formatWhen(iso) {
    if (!iso) return '';
    var ms = Date.parse(iso);
    if (isNaN(ms)) return '';
    if (global.Timing && typeof global.Timing.formatHKT === 'function') {
      return global.Timing.formatHKT(ms);
    }
    if (global.Schedule && typeof global.Schedule.formatHKT === 'function') {
      return global.Schedule.formatHKT(ms);
    }
    return (
      new Date(ms).toLocaleString('zh-HK', {
        timeZone: 'Asia/Hong_Kong',
        hour12: false,
      }) + ' HKT'
    );
  }

  function setPhase(phase, message) {
    state.phase = phase;
    state.message = message || '';
    updateView();
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
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
    return 'sentence-group-backup-' + Date.now() + '.json';
  }

  function buildExportText() {
    var obj = SM.buildExportObject(
      readJson(SM.TIMING_KEY),
      readJson(SM.PROGRESS_KEY)
    );
    return JSON.stringify(obj, null, 2);
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2500);
  }

  function sayExport(text) {
    var el = document.getElementById('sync-export-msg');
    if (el) el.textContent = text;
  }

  function sayImport(text, bad) {
    var el = document.getElementById('sync-import-msg');
    if (!el) return;
    el.textContent = text;
    el.className = bad ? 'sync-msg sync-status-bad' : 'sync-msg';
  }

  function showExportBox(text) {
    lastExportText = text;
    var box = document.getElementById('sync-export-box');
    var ta = document.getElementById('sync-export-text');
    var shareBtn = document.getElementById('sync-share');
    if (box) box.hidden = false;
    if (shareBtn) shareBtn.hidden = !navigator.share;
    if (ta) {
      ta.value = text;
      try {
        ta.focus();
        ta.setSelectionRange(0, text.length);
      } catch (e) {}
    }
  }

  function onExport() {
    var text;
    try {
      text = buildExportText();
    } catch (e) {
      sayExport('匯出失敗：' + (e && e.message ? e.message : String(e)));
      return;
    }
    showExportBox(text);
    var copyP =
      navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(text)
        : Promise.reject(new Error('no clipboard'));
    if (isIOS()) {
      copyP.then(
        function () {
          sayExport(
            '已複製兩個 key。iPhone 下載經常冇反應；可以再撳「分享」。長按文字框可以再選一次。'
          );
        },
        function () {
          sayExport(
            '請撳「複製」，或者長按下面文字框全選再複製。iPhone Safari 經常擋自動下載。'
          );
        }
      );
    } else {
      try {
        downloadText(backupName(), text);
      } catch (e) {}
      copyP.then(
        function () {
          sayExport('已下載，亦已複製。兩個 key 喺同一份 JSON。');
        },
        function () {
          sayExport('已嘗試下載。如果冇檔案，撳「複製」或者長按文字框。');
        }
      );
    }
  }

  function onCopy() {
    var ta = document.getElementById('sync-export-text');
    var text = ta && ta.value ? ta.value : lastExportText;
    if (!text) {
      sayExport('未有備份。先撳「匯出 JSON」。');
      return;
    }
    var done = function (ok) {
      sayExport(ok ? '已複製到剪貼簿。' : '複製被擋住。請長按文字框全選，再揀複製。');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          done(true);
        },
        function () {
          done(false);
        }
      );
      return;
    }
    try {
      if (ta) {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
      }
      done(document.execCommand('copy'));
    } catch (e) {
      done(false);
    }
  }

  function onShare() {
    var ta = document.getElementById('sync-export-text');
    var text = ta && ta.value ? ta.value : lastExportText;
    if (!text || !navigator.share) {
      sayExport('呢個瀏覽器冇分享功能。請用「複製」。');
      return;
    }
    var filename = backupName();
    var file = new File([text], filename, { type: 'application/json' });
    var shareFiles =
      navigator.canShare &&
      navigator.canShare({ files: [file] });
    var pending = shareFiles
      ? navigator.share({ files: [file], title: filename })
      : navigator.share({ title: filename, text: text });
    pending.then(
      function () {
        sayExport('已開分享。');
      },
      function (err) {
        if (err && err.name === 'AbortError') return;
        sayExport('分享失敗。請撳「複製」或者長按文字框。');
      }
    );
  }

  function onDownload() {
    var ta = document.getElementById('sync-export-text');
    var text = ta && ta.value ? ta.value : lastExportText;
    if (!text) return;
    try {
      downloadText(backupName(), text);
      sayExport(
        isIOS()
          ? '已再試下載。如果冇檔案，用「複製」或「分享」。'
          : '已再下載。'
      );
    } catch (e) {
      sayExport('下載失敗。請用「複製」。');
    }
  }

  function summarizeImport(beforeT, beforeP, afterT, afterP, imported) {
    var bits = [];
    if (imported.hasTiming) {
      bits.push(
        '計時 sessions ' +
          beforeT.sessions.length +
          ' + 備份 ' +
          imported.timing.sessions.length +
          ' → ' +
          afterT.sessions.length
      );
    }
    if (imported.hasProgress) {
      var b = SM.countProgress(beforeP);
      var inc = SM.countProgress(imported.progress);
      var a = SM.countProgress(afterP);
      bits.push(
        'SRS quizzes ' +
          b.quizzes +
          '+' +
          inc.quizzes +
          '→' +
          a.quizzes +
          '，chunks ' +
          b.chunks +
          '+' +
          inc.chunks +
          '→' +
          a.chunks
      );
    }
    bits.push('空白唔會覆蓋已有記錄。');
    return '已合併。' + bits.join('。');
  }

  function dispatchSync(timingChanged, progressChanged) {
    try {
      global.dispatchEvent(
        new CustomEvent('sentence-group-sync', {
          detail: {
            timingChanged: !!timingChanged,
            progressChanged: !!progressChanged,
          },
        })
      );
    } catch (e) {}
  }

  function maybeReload(progressChanged) {
    if (!initialDone || !progressChanged) return;
    if (document.getElementById('sync-import')) return;
    var start = document.getElementById('start-btn');
    if (start) {
      if (!start.hidden) global.location.reload();
      return;
    }
    if (document.getElementById('group-list')) global.location.reload();
  }

  function runImportFromText(text) {
    var parsed;
    try {
      parsed = SM.parseImport(text);
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (e instanceof SyntaxError) msg = '呢段唔係有效 JSON。';
      sayImport(msg, true);
      return;
    }
    var beforeT = SM.normalizeTiming(readJson(SM.TIMING_KEY));
    var beforeP = SM.normalizeProgress(readJson(SM.PROGRESS_KEY));
    var applied = SM.applyImport(beforeT, beforeP, parsed);
    if (
      parsed.hasTiming &&
      !SM.localWriteAllowed(SM.isTimingEmpty(beforeT), SM.isTimingEmpty(applied.timing))
    ) {
      sayImport('拒絕用空白覆蓋本機計時。', true);
      return;
    }
    if (
      parsed.hasProgress &&
      !SM.localWriteAllowed(
        SM.isProgressEmpty(beforeP),
        SM.isProgressEmpty(applied.progress)
      )
    ) {
      sayImport('拒絕用空白覆蓋本機 SRS。', true);
      return;
    }
    if (parsed.hasTiming) writeJson(SM.TIMING_KEY, applied.timing);
    if (parsed.hasProgress) writeJson(SM.PROGRESS_KEY, applied.progress);
    markDirty();
    sayImport(summarizeImport(beforeT, beforeP, applied.timing, applied.progress, parsed), false);
    dispatchSync(parsed.hasTiming, parsed.hasProgress);
    if (state.email) syncNow();
    else if (!configProblem(readConfig())) {
      sayImport(
        document.getElementById('sync-import-msg').textContent +
          ' 登入後會再上傳。',
        false
      );
    }
  }

  function loadSupabase() {
    if (global.supabase && typeof global.supabase.createClient === 'function') {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-supabase-js="1"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', function () {
          reject(new Error('載入 Supabase 程式庫失敗'));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = SUPABASE_SRC;
      s.async = true;
      s.setAttribute('data-supabase-js', '1');
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('載入 Supabase 程式庫失敗（離線？）'));
      };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    var cfg = readConfig();
    return loadSupabase().then(function () {
      if (!global.supabase || typeof global.supabase.createClient !== 'function') {
        throw new Error('Supabase 程式庫未就緒');
      }
      client = global.supabase.createClient(cfg.url, cfg.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return client;
    });
  }

  function userEmail(user) {
    if (!user) return '';
    var email = user.email || (user.user_metadata && user.user_metadata.email) || '';
    return String(email).trim().toLowerCase();
  }

  function ensureMapping(sb, user) {
    var email = userEmail(user);
    var cfg = readConfig();
    if (!email || cfg.emails.indexOf(email) === -1) {
      var denied = new Error('呢個 Google 帳戶唔喺允許清單。');
      denied.code = 'allowlist';
      return Promise.reject(denied);
    }
    return sb
      .from('user_mapping')
      .upsert(
        { auth_user_id: user.id, owner_id: OWNER_ID, email: email },
        { onConflict: 'auth_user_id' }
      )
      .then(function (res) {
        if (res.error) {
          var err = new Error(
            '登入被拒（檢查 SQL allowlist 同 RLS）：' + res.error.message
          );
          err.code = 'rls';
          throw err;
        }
        return email;
      });
  }

  /**
   * Supabase transport. Replace this function to swap backends.
   * Returns { changedLocal: boolean }.
   */
  function syncDocument(sb, docKey, normalize, isEmpty, merge) {
    function once(attempt) {
      var local = normalize(readJson(docKey));
      return sb
        .from('sync_snapshots')
        .select('payload, revision, updated_at')
        .eq('owner_id', OWNER_ID)
        .eq('doc_key', docKey)
        .maybeSingle()
        .then(function (fetched) {
          if (fetched.error) throw fetched.error;
          var row = fetched.data;
          var remote = null;
          if (row) {
            var coerced;
            try {
              coerced = coercePayload(row.payload);
            } catch (e) {
              throw new Error('雲端 ' + docKey + ' 唔係有效 JSON，已停止，未覆蓋。');
            }
            if (!isPlain(coerced)) {
              throw new Error('雲端 ' + docKey + ' 格式唔啱，已停止，未覆蓋。');
            }
            remote = normalize(coerced);
          }
          var localAfter = normalize(readJson(docKey));
          if (stable(localAfter) !== stable(local)) local = localAfter;

          var localEmpty = isEmpty(local);
          var remoteEmpty = !remote || isEmpty(remote);
          var plan = SM.planDocumentSync(localEmpty, remoteEmpty);
          var merged = local;
          if (plan === 'pull') merged = remote;
          else if (plan === 'merge') merged = merge(local, remote);

          if (!SM.localWriteAllowed(isEmpty(local), isEmpty(merged))) {
            throw new Error('拒絕用空白覆蓋本機 ' + docKey);
          }
          var changedLocal = stable(merged) !== stable(local);
          if (changedLocal) writeJson(docKey, merged);

          if (!SM.remoteWriteAllowed(plan, isEmpty(merged))) {
            return { changedLocal: changedLocal };
          }
          if (remote && stable(remote) === stable(merged)) {
            return { changedLocal: changedLocal };
          }

          var nowIso = new Date().toISOString();
          if (!row) {
            return sb
              .from('sync_snapshots')
              .insert({
                owner_id: OWNER_ID,
                doc_key: docKey,
                payload: merged,
                revision: 1,
                updated_at: nowIso,
              })
              .then(function (ins) {
                if (!ins.error) return { changedLocal: changedLocal };
                if (String(ins.error.code) === '23505' && attempt < 1) return once(attempt + 1);
                throw ins.error;
              });
          }

          var nextRev = (Number(row.revision) || 1) + 1;
          return sb
            .from('sync_snapshots')
            .update({
              payload: merged,
              revision: nextRev,
              updated_at: nowIso,
            })
            .eq('owner_id', OWNER_ID)
            .eq('doc_key', docKey)
            .eq('revision', row.revision)
            .select('revision')
            .then(function (upd) {
              if (upd.error) throw upd.error;
              if (upd.data && upd.data.length) return { changedLocal: changedLocal };
              if (attempt < 1) return once(attempt + 1);
              throw new Error('雲端剛被另一部機更新，合併未寫入，會再試。');
            });
        });
    }
    return once(0);
  }

function rejectAfter(promise, ms, message) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error(message || '同步超時'));
    }, ms);
    promise.then(
      function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function syncOnce() {
  if (configProblem(readConfig())) return Promise.resolve();
  if (navigator.onLine === false) {
    markDirty();
    setPhase('offline', '而家離線。本機記錄會保留，有網再同步。');
    return Promise.resolve();
  }
  var queuedAt = readQueue().queuedAt;
  setPhase('syncing', '同步中…');
  var work = getClient()
      .then(function (sb) {
        return sb.auth.getSession().then(function (sessionRes) {
          if (sessionRes.error) throw sessionRes.error;
          var session = sessionRes.data && sessionRes.data.session;
          if (!session || !session.user) {
            state.email = '';
            setPhase('signed-out', '未登入。本機練習照常。匯出／匯入唔使登入。');
            return null;
          }
          return ensureMapping(sb, session.user).then(function (email) {
            state.email = email;
            return sb;
          });
        });
      })
      .then(function (sb) {
        if (!sb) return;
        return syncDocument(
          sb,
          SM.TIMING_KEY,
          SM.normalizeTiming,
          SM.isTimingEmpty,
          SM.mergeTiming
        ).then(function (timingRes) {
          return syncDocument(
            sb,
            SM.PROGRESS_KEY,
            SM.normalizeProgress,
            SM.isProgressEmpty,
            SM.mergeProgress
          ).then(function (progressRes) {
            var q = readQueue();
            if (q.queuedAt === queuedAt) writeQueue({ dirty: false, queuedAt: q.queuedAt });
            var nowIso = new Date().toISOString();
            state.lastSyncAt = nowIso;
            writeMeta({ lastSyncAt: nowIso });
            var when = formatWhen(nowIso);
            setPhase('synced', '已同步' + (when ? ' · ' + when : '') + '。');
            dispatchSync(timingRes.changedLocal, progressRes.changedLocal);
            maybeReload(progressRes.changedLocal);
            if (readQueue().dirty) scheduleSync();
          });
        });
      });
  return rejectAfter(work, 12000, '同步超時').catch(function (err) {
    handleSyncError(err);
  });
  }

  function handleSyncError(err) {
    var msg = err && err.message ? err.message : String(err || '同步失敗');
    if (err && err.code === 'allowlist') {
      state.email = '';
      getClient()
        .then(function (sb) {
          return sb.auth.signOut();
        })
        .then(
          function () {
            setPhase('error', msg);
          },
          function () {
            setPhase('error', msg);
          }
        );
      return;
    }
    markDirty();
    var offline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      /Failed to fetch|NetworkError|載入 Supabase|offline|超時/i.test(msg);
    if (offline) {
      setPhase('offline', '而家離線或載入唔到 Supabase。本機記錄保留，有網再試。');
      return;
    }
    setPhase('error', msg);
  }

  function syncNow() {
    var run = chain.then(
      function () {
        return syncOnce();
      },
      function () {
        return syncOnce();
      }
    );
    chain = run.then(
      function () {},
      function () {}
    );
    return run;
  }

  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      if (!state.email) return;
      syncNow();
    }, 1500);
  }

  function onLocalWrite(kind) {
    if (suppressWrites > 0) return;
    if (kind !== 'timing' && kind !== 'progress') return;
    markDirty();
    if (!state.email) return;
    if (configProblem(readConfig())) return;
    scheduleSync();
  }

  function onSignIn() {
    var problem = configProblem(readConfig());
    if (problem) {
      setPhase('unconfigured', problemMessage(problem));
      return;
    }
    setPhase('syncing', '前往 Google 登入…');
    getClient()
      .then(function (sb) {
        var redirect = global.location.origin + global.location.pathname + global.location.search;
        return sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirect,
            queryParams: { prompt: 'select_account' },
          },
        });
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
      })
      .catch(function (err) {
        handleSyncError(err);
      });
  }

  function onSignOut() {
    getClient()
      .then(function (sb) {
        return sb.auth.signOut();
      })
      .then(function () {
        state.email = '';
        setPhase('signed-out', '已登出。本機記錄仍然喺度，冇刪除。');
      })
      .catch(function (err) {
        setPhase('error', err && err.message ? err.message : String(err));
      });
  }

  function bind(full) {
    var signInBtn = document.getElementById('sync-signin');
    var signOutBtn = document.getElementById('sync-signout');
    var nowBtn = document.getElementById('sync-now');
    if (signInBtn) signInBtn.addEventListener('click', onSignIn);
    if (signOutBtn) signOutBtn.addEventListener('click', onSignOut);
    if (nowBtn) {
      nowBtn.addEventListener('click', function () {
        if (!state.email) {
          setPhase('signed-out', '請先用 Google 登入，再撳同步。');
          return;
        }
        markDirty();
        syncNow();
      });
    }
    if (!full) return;
    var exportBtn = document.getElementById('sync-export');
    var copyBtn = document.getElementById('sync-copy');
    var shareBtn = document.getElementById('sync-share');
    var downloadBtn = document.getElementById('sync-download');
    var importBtn = document.getElementById('sync-import');
    var fileInput = document.getElementById('sync-file');
    var importArea = document.getElementById('sync-import-text');
    if (exportBtn) exportBtn.addEventListener('click', onExport);
    if (copyBtn) copyBtn.addEventListener('click', onCopy);
    if (shareBtn) shareBtn.addEventListener('click', onShare);
    if (downloadBtn) downloadBtn.addEventListener('click', onDownload);
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          if (importArea) importArea.value = String(reader.result || '');
          sayImport('已讀取「' + file.name + '」。撳「合併匯入」先會寫入。', false);
        };
        reader.onerror = function () {
          sayImport('讀取檔案失敗。', true);
        };
        reader.readAsText(file);
      });
    }
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        var text = importArea ? importArea.value : '';
        if (!String(text || '').trim()) {
          sayImport('請貼上備份，或者揀一個 JSON 檔。', true);
          return;
        }
        runImportFromText(text);
      });
    }
  }

  function updateView() {
    var statusEl = document.getElementById('sync-status');
    var accountEl = document.getElementById('sync-account');
    var signInBtn = document.getElementById('sync-signin');
    var signOutBtn = document.getElementById('sync-signout');
    var nowBtn = document.getElementById('sync-now');
    if (statusEl) {
      var extra = '';
      if (state.phase === 'synced' && state.lastSyncAt && state.message.indexOf('已同步') === 0) {
        extra = '';
      } else if (state.lastSyncAt && state.phase !== 'syncing') {
        extra = ' 上次同步 ' + formatWhen(state.lastSyncAt) + '。';
      }
      statusEl.textContent = (state.message || '') + extra;
      statusEl.className =
        'sync-status ' +
        (state.phase === 'synced'
          ? 'sync-status-ok'
          : state.phase === 'error'
            ? 'sync-status-bad'
            : state.phase === 'offline' || state.phase === 'unconfigured'
              ? 'sync-status-warn'
              : '');
    }
    if (accountEl) {
      accountEl.textContent = state.email
        ? '已登入 ' + state.email + ' · 資料主人 ' + OWNER_ID
        : '';
    }
    var problem = configProblem(readConfig());
    var canAuth = !problem;
    if (signInBtn) signInBtn.hidden = !canAuth || !!state.email;
    if (signOutBtn) signOutBtn.hidden = !state.email;
    if (nowBtn) nowBtn.hidden = !state.email;
  }

  function mount() {
    var el = document.getElementById('sync-panel');
    if (!el || el.getAttribute('data-mounted') === '1') return;
    el.setAttribute('data-mounted', '1');
    var full = el.getAttribute('data-sync-variant') !== 'compact';
    el.className = 'sync-panel ' + (full ? 'sync-panel-full' : 'sync-panel-compact');
    el.innerHTML = full ? fullHtml() : compactHtml();
    bind(full);
    updateView();
  }

  function fullHtml() {
    return (
      '<h2>備份同雲端同步</h2>' +
      '<p id="sync-status" class="sync-status" role="status"></p>' +
      '<p id="sync-account" class="muted sync-account"></p>' +
      '<p class="muted sync-lead">一份 JSON 同時有 <code>website-manager-timing-v1</code> 同 <code>website-manager-progress-v2</code>。匯入係合併：計時按 session id + quiz id 去重；SRS 按每題／每 chunk 時間戳。雲端空就上傳本機；本機空就拉雲端；兩邊都有就合併。空白唔會覆蓋。</p>' +
      '<div class="sync-actions">' +
      '<button type="button" class="btn btn-primary" id="sync-export">匯出 JSON</button>' +
      '<button type="button" class="btn" id="sync-signin">用 Google 登入</button>' +
      '<button type="button" class="btn" id="sync-signout" hidden>登出</button>' +
      '<button type="button" class="btn" id="sync-now" hidden>而家同步</button>' +
      '</div>' +
      '<div id="sync-export-box" class="sync-export-box" hidden>' +
      '<p id="sync-export-msg" class="sync-msg">iPhone 如果冇下載，撳複製或者長按文字框全選。</p>' +
      '<div class="sync-actions">' +
      '<button type="button" class="btn btn-primary" id="sync-copy">複製 JSON</button>' +
      '<button type="button" class="btn" id="sync-share" hidden>分享</button>' +
      '<button type="button" class="btn btn-ghost" id="sync-download">下載</button>' +
      '</div>' +
      '<textarea id="sync-export-text" class="sync-text" spellcheck="false" autocomplete="off"></textarea>' +
      '</div>' +
      '<div class="sync-import">' +
      '<h3>匯入 JSON（合併）</h3>' +
      '<p class="muted">貼上手機備份，或者揀檔。接受字串或已解析嘅兩個 key，亦接受單獨一份 timing／progress。唔會用空白覆蓋本機。</p>' +
      '<label class="btn" for="sync-file">揀備份檔案</label>' +
      '<input id="sync-file" class="sync-file" type="file" accept="application/json,.json,text/plain,.txt" />' +
      '<textarea id="sync-import-text" class="sync-text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="貼上備份 JSON…"></textarea>' +
      '<button type="button" class="btn btn-primary" id="sync-import">合併匯入</button>' +
      '<p id="sync-import-msg" class="sync-msg"></p>' +
      '</div>'
    );
  }

  function compactHtml() {
    return (
      '<p id="sync-status" class="sync-status" role="status"></p>' +
      '<p id="sync-account" class="muted sync-account"></p>' +
      '<div class="sync-actions">' +
      '<button type="button" class="btn" id="sync-signin">用 Google 登入</button>' +
      '<button type="button" class="btn" id="sync-signout" hidden>登出</button>' +
      '<button type="button" class="btn" id="sync-now" hidden>而家同步</button>' +
      '<a class="btn btn-ghost" href="stats.html">備份／匯入 JSON</a>' +
      '</div>'
    );
  }

  function mountWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  function bootstrap() {
    state.lastSyncAt = readMeta().lastSyncAt;
    mountWhenReady();
    var problem = configProblem(readConfig());
    if (problem) {
      setPhase('unconfigured', problemMessage(problem));
      return Promise.resolve();
    }
    if (navigator.onLine === false) {
      setPhase('offline', '而家離線。練習用本機記錄，有網再同步。');
      return Promise.resolve();
    }
    // Don't block practice if the network hangs. The attempt keeps running.
    return rejectAfter(syncNow(), 8000, '同步超時').catch(function () {
      markDirty();
      setPhase('offline', '同步超時。先用本機記錄，之後會再試。');
    });
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = bootstrap().then(
        function () {
          initialDone = true;
        },
        function () {
          initialDone = true;
        }
      );
    }
    return readyPromise;
  }

  global.addEventListener('online', function () {
    if (readQueue().dirty && state.email) syncNow();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && readQueue().dirty && state.email) {
      scheduleSync();
    }
  });
  global.setInterval(function () {
    if (readQueue().dirty && state.email && navigator.onLine !== false) syncNow();
  }, 30000);

  global.Sync = {
    ready: ready,
    onLocalWrite: onLocalWrite,
    syncNow: syncNow,
    OWNER_ID: OWNER_ID,
  };

  ready();
})(typeof window !== 'undefined' ? window : globalThis);
