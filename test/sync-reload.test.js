/**
 * Practice page must not reload when a late bootstrap sync writes SRS.
 *   node test/sync-reload.test.js
 *
 * Sync.ready() races syncNow() with an 8s timeout and then sets initialDone.
 * The same attempt keeps running. When it later changes progress, the old
 * maybeReload() called location.reload() whenever 「開始練習」 was still
 * visible, so the click never stuck. Guests skip cloud sync.
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
require(path.join(root, 'js/sync-merge.js'));
var Sync = require(path.join(root, 'js/sync.js'));

var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + name);
    console.error(err && err.stack ? err.stack : err);
  }
}

var latePractice = {
  initialDone: true,
  progressChanged: true,
  hasImport: false,
  hasStart: true,
  hasGroupList: false,
};

test('late bootstrap sync does not reload a Passage group page', function () {
  assert.strictEqual(Sync.decidePageReload(latePractice), false);
});

test('a visible start button blocks reload even if the home list is also present', function () {
  assert.strictEqual(
    Sync.decidePageReload({
      initialDone: true,
      progressChanged: true,
      hasImport: false,
      hasStart: true,
      hasGroupList: true,
    }),
    false
  );
});

test('home still reloads after the first sync when SRS changed', function () {
  assert.strictEqual(
    Sync.decidePageReload({
      initialDone: true,
      progressChanged: true,
      hasImport: false,
      hasStart: false,
      hasGroupList: true,
    }),
    true
  );
});

test('reload stays off before initial sync, when nothing changed, and on the backup page', function () {
  assert.strictEqual(
    Sync.decidePageReload({
      initialDone: false,
      progressChanged: true,
      hasImport: false,
      hasStart: false,
      hasGroupList: true,
    }),
    false
  );
  assert.strictEqual(
    Sync.decidePageReload({
      initialDone: true,
      progressChanged: false,
      hasImport: false,
      hasStart: false,
      hasGroupList: true,
    }),
    false
  );
  assert.strictEqual(
    Sync.decidePageReload({
      initialDone: true,
      progressChanged: true,
      hasImport: true,
      hasStart: false,
      hasGroupList: false,
    }),
    false
  );
  assert.strictEqual(Sync.decidePageReload(null), false);
});

test('idle practice queue refreshes in place; a started session does not', function () {
  assert.strictEqual(
    Sync.shouldRefreshPracticeQueue({
      progressChanged: true,
      fixtureMode: false,
      practiceStarted: false,
      startHidden: false,
    }),
    true
  );
  assert.strictEqual(
    Sync.shouldRefreshPracticeQueue({
      progressChanged: true,
      fixtureMode: false,
      practiceStarted: true,
      startHidden: true,
    }),
    false
  );
  assert.strictEqual(
    Sync.shouldRefreshPracticeQueue({
      progressChanged: true,
      fixtureMode: false,
      practiceStarted: false,
      startHidden: true,
    }),
    false
  );
  assert.strictEqual(
    Sync.shouldRefreshPracticeQueue({
      progressChanged: true,
      fixtureMode: true,
      practiceStarted: false,
      startHidden: false,
    }),
    false
  );
  assert.strictEqual(
    Sync.shouldRefreshPracticeQueue({
      progressChanged: false,
      fixtureMode: false,
      practiceStarted: false,
      startHidden: false,
    }),
    false
  );
});

test('group page does not show 開始練習 until the click handler is attached', function () {
  var html = fs.readFileSync(path.join(root, 'group.html'), 'utf8');
  assert.ok(
    /id="start-btn"[^>]*hidden/.test(html),
    'start button must be hidden in HTML so taps during Sync.ready() are not lost'
  );
  var js = fs.readFileSync(path.join(root, 'js/group.js'), 'utf8');
  var listenAt = js.indexOf("startBtn.addEventListener('click'");
  var showAt = js.lastIndexOf('startBtn.hidden = false');
  assert.ok(listenAt > 0 && showAt > listenAt);
  assert.ok(js.indexOf('abortPracticeStart') > 0);
  var syncSrc = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
  assert.ok(!/!start\.hidden\)\s*global\.location\.reload/.test(syncSrc));
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all sync-reload tests passed');
