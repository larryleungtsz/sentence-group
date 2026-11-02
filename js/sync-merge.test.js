/**
 * Unit tests for sync merge / import. No network.
 *   node js/sync-merge.test.js
 */
'use strict';

var assert = require('assert');
var SM = require('./sync-merge.js');

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

function session(id, quizzes, extra) {
  var s = {
    id: id,
    groupSlug: 'ebi',
    groupTitle: 'Ebi',
    startedAt: '2026-10-01T01:00:00.000Z',
    endedAt: '2026-10-01T01:10:00.000Z',
    totalMs: 600000,
    quizCount: (quizzes || []).length,
    reason: 'complete',
    quizzes: quizzes || [],
    chunks: [],
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      s[k] = extra[k];
    });
  }
  return s;
}

function quiz(id, duration, started) {
  return {
    quizId: id,
    objective: 'x',
    level: 1,
    kind: 'chunk',
    chunkId: 1,
    startedAt: started || '2026-10-01T01:01:00.000Z',
    endedAt: '2026-10-01T01:02:00.000Z',
    durationMs: duration,
  };
}

test('timing unions different session ids', function () {
  var merged = SM.mergeTiming(
    { sessions: [session('a', [quiz('q1', 1000)])] },
    { sessions: [session('b', [quiz('q2', 2000)])] }
  );
  assert.strictEqual(merged.sessions.length, 2);
  var ids = merged.sessions.map(function (s) {
    return s.id;
  }).sort();
  assert.deepStrictEqual(ids, ['a', 'b']);
});

test('timing dedupes by session id + quiz id and keeps longer duration', function () {
  var localQ = quiz('q1', 1000);
  var remoteQ = quiz('q1', 5000);
  remoteQ.endedAt = '2026-10-01T01:09:00.000Z';
  var extra = quiz('q2', 800);
  var merged = SM.mergeTiming(
    { sessions: [session('a', [localQ])] },
    { sessions: [session('a', [remoteQ, extra])] }
  );
  assert.strictEqual(merged.sessions.length, 1);
  assert.strictEqual(merged.sessions[0].quizzes.length, 2);
  var q1 = merged.sessions[0].quizzes.filter(function (q) {
    return q.quizId === 'q1';
  })[0];
  assert.strictEqual(q1.durationMs, 5000);
  assert.strictEqual(merged.sessions[0].quizCount, 2);
});

test('same quiz id in different sessions is kept in both', function () {
  var merged = SM.mergeTiming(
    { sessions: [session('a', [quiz('q1', 10)])] },
    { sessions: [session('b', [quiz('q1', 20)])] }
  );
  assert.strictEqual(merged.sessions.length, 2);
  merged.sessions.forEach(function (s) {
    assert.strictEqual(s.quizzes.length, 1);
    assert.strictEqual(s.quizzes[0].quizId, 'q1');
  });
});

test('empty timing does not wipe the other side', function () {
  var local = { sessions: [session('a', [quiz('q1', 10)])] };
  var fromEmptyRemote = SM.mergeTiming(local, { sessions: [] });
  var fromNullRemote = SM.mergeTiming(local, null);
  var fromEmptyLocal = SM.mergeTiming({ sessions: [] }, local);
  assert.strictEqual(fromEmptyRemote.sessions.length, 1);
  assert.strictEqual(fromNullRemote.sessions.length, 1);
  assert.strictEqual(fromEmptyLocal.sessions[0].id, 'a');
});

test('chunk totals are recomputed from merged quizzes, not summed', function () {
  var q = quiz('q1', 4000);
  var local = session('a', [q], {
    chunks: [{ key: 'c1', chunkId: 1, kind: 'chunk', label: 'chunk1', totalMs: 4000, quizCount: 1 }],
  });
  var remote = session('a', [q], {
    chunks: [{ key: 'c1', chunkId: 1, kind: 'chunk', label: 'chunk1', totalMs: 4000, quizCount: 1 }],
  });
  var merged = SM.mergeTiming({ sessions: [local] }, { sessions: [remote] });
  assert.strictEqual(merged.sessions[0].chunks.length, 1);
  assert.strictEqual(merged.sessions[0].chunks[0].totalMs, 4000);
  assert.strictEqual(merged.sessions[0].chunks[0].quizCount, 1);
});

test('session wall clock uses max totalMs and keeps newest 200', function () {
  var mergedOne = SM.mergeTiming(
    { sessions: [session('a', [quiz('q1', 1)], { totalMs: 1000 })] },
    { sessions: [session('a', [quiz('q1', 1)], { totalMs: 9000 })] }
  );
  assert.strictEqual(mergedOne.sessions[0].totalMs, 9000);

  var many = [];
  for (var n = 0; n < 205; n++) {
    var iso = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    many.push(session('s' + n, [], { startedAt: iso, endedAt: iso, totalMs: 1 }));
  }
  var capped = SM.mergeTiming({ sessions: many.slice(0, 100) }, { sessions: many.slice(50) });
  assert.strictEqual(capped.sessions.length, 200);
  assert.strictEqual(capped.sessions[0].id, 's204');
  assert.strictEqual(capped.sessions[199].id, 's5');
});

test('quiz stages union and later lastReviewedAt wins', function () {
  var merged = SM.mergeProgress(
    {
      quizzes: {
        q1: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' },
      },
      chunks: {},
      sentences: {},
    },
    {
      quizzes: {
        q1: { completedStages: ['T02'], lastReviewedAt: '2026-10-02T00:00:00.000Z' },
        q2: { completedStages: ['T01'], lastReviewedAt: '2026-10-03T00:00:00.000Z' },
      },
      chunks: {},
      sentences: {},
    }
  );
  assert.deepStrictEqual(merged.quizzes.q1.completedStages, ['T01', 'T02']);
  assert.strictEqual(merged.quizzes.q1.lastReviewedAt, '2026-10-02T00:00:00.000Z');
  assert.ok(merged.quizzes.q2);
});

test('empty quiz stages do not wipe stages', function () {
  var merged = SM.mergeProgress(
    {
      quizzes: { q1: { completedStages: ['T01', 'T02'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
      chunks: {},
      sentences: {},
    },
    {
      quizzes: { q1: { completedStages: [], lastReviewedAt: null } },
      chunks: {},
      sentences: {},
    }
  );
  assert.deepStrictEqual(merged.quizzes.q1.completedStages, ['T01', 'T02']);
});

test('empty progress document does not wipe local or remote', function () {
  var full = {
    quizzes: { q1: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
    chunks: { 'ebi:1': { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 2 } },
    sentences: { ebi: { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 1 } },
  };
  var empty = { quizzes: {}, chunks: {}, sentences: {} };
  var a = SM.mergeProgress(full, empty);
  var b = SM.mergeProgress(empty, full);
  var c = SM.mergeProgress(full, null);
  assert.strictEqual(a.chunks['ebi:1'].stageIndex, 2);
  assert.strictEqual(b.quizzes.q1.completedStages[0], 'T01');
  assert.strictEqual(c.sentences.ebi.stageIndex, 1);
});

test('partial remote progress does not drop local chunks', function () {
  var merged = SM.mergeProgress(
    {
      quizzes: { q1: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
      chunks: { 'ebi:1': { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 3 } },
      sentences: { ebi: { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 1 } },
    },
    {
      quizzes: { q2: { completedStages: ['T02'], lastReviewedAt: '2026-10-02T00:00:00.000Z' } },
    }
  );
  assert.ok(merged.quizzes.q1);
  assert.ok(merged.quizzes.q2);
  assert.strictEqual(merged.chunks['ebi:1'].stageIndex, 3);
  assert.strictEqual(merged.sentences.ebi.stageIndex, 1);
});

test('empty cursor does not wipe chunk progress', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 4 },
    { lastCompletedAt: null, stageIndex: 0 }
  );
  assert.strictEqual(merged.stageIndex, 4);
  assert.strictEqual(merged.lastCompletedAt, '2026-10-01T00:00:00.000Z');
});

test('both updatedAt: later timestamp wins even if stageIndex is lower', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 5, updatedAt: '2026-10-01T00:00:00.000Z' },
    { lastCompletedAt: '2026-10-03T00:00:00.000Z', stageIndex: 1, updatedAt: '2026-10-03T00:00:00.000Z' }
  );
  assert.strictEqual(merged.stageIndex, 1);
  assert.strictEqual(merged.updatedAt, '2026-10-03T00:00:00.000Z');
});

test('no updatedAt: higher stageIndex wins (phone seed)', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 2 },
    { lastCompletedAt: '2026-10-08T00:00:00.000Z', stageIndex: 6 }
  );
  assert.strictEqual(merged.stageIndex, 6);
  var tie = SM.mergeCursor(
    { lastCompletedAt: '2026-10-02T00:00:00.000Z', stageIndex: 4 },
    { lastCompletedAt: '2026-10-09T00:00:00.000Z', stageIndex: 4 }
  );
  assert.strictEqual(tie.stageIndex, 4);
  assert.strictEqual(tie.lastCompletedAt, '2026-10-09T00:00:00.000Z');
});

test('only one updatedAt does not let a lower stage wipe a higher phone seed', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 7 },
    { lastCompletedAt: '2026-10-02T00:00:00.000Z', stageIndex: 2, updatedAt: '2026-10-02T00:00:00.000Z' }
  );
  assert.strictEqual(merged.stageIndex, 7);
  assert.ok(!merged.updatedAt);
});

test('one updatedAt with the higher stage is kept', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 2 },
    { lastCompletedAt: '2026-10-04T00:00:00.000Z', stageIndex: 5, updatedAt: '2026-10-04T00:00:00.000Z' }
  );
  assert.strictEqual(merged.stageIndex, 5);
  assert.strictEqual(merged.updatedAt, '2026-10-04T00:00:00.000Z');
});

test('seed plan: push, pull, merge, none', function () {
  assert.strictEqual(SM.planDocumentSync(false, true), 'push');
  assert.strictEqual(SM.planDocumentSync(true, false), 'pull');
  assert.strictEqual(SM.planDocumentSync(false, false), 'merge');
  assert.strictEqual(SM.planDocumentSync(true, true), 'none');
  assert.strictEqual(SM.remoteWriteAllowed('push', false), true);
  assert.strictEqual(SM.remoteWriteAllowed('pull', false), false);
  assert.strictEqual(SM.remoteWriteAllowed('merge', false), true);
  assert.strictEqual(SM.remoteWriteAllowed('merge', true), false);
  assert.strictEqual(SM.remoteWriteAllowed('push', true), false);
  assert.strictEqual(SM.localWriteAllowed(false, true), false);
  assert.strictEqual(SM.localWriteAllowed(false, false), true);
  assert.strictEqual(SM.localWriteAllowed(true, true), true);
});

test('import bookmarklet string dump merges and does not wipe', function () {
  var dump = JSON.stringify({
    'website-manager-timing-v1': JSON.stringify({
      sessions: [session('phone', [quiz('pq', 50)])],
    }),
    'website-manager-progress-v2': JSON.stringify({
      quizzes: { pq: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
      chunks: { 'ebi:1': { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' } },
      sentences: {},
    }),
  });
  var parsed = SM.parseImport(dump);
  assert.strictEqual(parsed.hasTiming, true);
  assert.strictEqual(parsed.hasProgress, true);
  var localTiming = { sessions: [session('desk', [quiz('dq', 10)])] };
  var localProgress = {
    quizzes: { dq: { completedStages: ['T02'], lastReviewedAt: '2026-10-02T00:00:00.000Z' } },
    chunks: { 'ebi:2': { stageIndex: 1, lastCompletedAt: '2026-10-02T00:00:00.000Z' } },
    sentences: { ebi: { stageIndex: 1, lastCompletedAt: '2026-10-02T00:00:00.000Z' } },
  };
  var applied = SM.applyImport(localTiming, localProgress, parsed);
  var ids = applied.timing.sessions.map(function (s) { return s.id; }).sort();
  assert.deepStrictEqual(ids, ['desk', 'phone']);
  assert.ok(applied.progress.quizzes.pq);
  assert.ok(applied.progress.quizzes.dq);
  assert.strictEqual(applied.progress.chunks['ebi:1'].stageIndex, 2);
  assert.strictEqual(applied.progress.chunks['ebi:2'].stageIndex, 1);
  assert.strictEqual(applied.progress.sentences.ebi.stageIndex, 1);
});

test('import parsed export object and raw single documents', function () {
  var exported = SM.buildExportObject(
    { sessions: [session('a', [quiz('q1', 1)])] },
    { quizzes: { q1: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } }, chunks: {}, sentences: {} },
    '2026-10-05T00:00:00.000Z'
  );
  assert.strictEqual(exported.source, 'sentence-group');
  assert.ok(exported[SM.TIMING_KEY].sessions);
  assert.ok(exported[SM.PROGRESS_KEY].quizzes);
  var round = SM.parseImport(JSON.stringify(exported));
  assert.strictEqual(round.timing.sessions[0].id, 'a');

  var onlyTiming = SM.parseImport(JSON.stringify({ sessions: [session('z', [])] }));
  assert.strictEqual(onlyTiming.hasTiming, true);
  assert.strictEqual(onlyTiming.hasProgress, false);
  var kept = SM.applyImport(
    { sessions: [] },
    { quizzes: { keep: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } }, chunks: {}, sentences: {} },
    onlyTiming
  );
  assert.ok(kept.progress.quizzes.keep);

  var onlyProgress = SM.parseImport(JSON.stringify({
    quizzes: {},
    chunks: { 'ebi:9': { stageIndex: 1, lastCompletedAt: '2026-10-01T00:00:00.000Z' } },
    sentences: {},
  }));
  assert.strictEqual(onlyProgress.hasTiming, false);
  assert.strictEqual(onlyProgress.progress.chunks['ebi:9'].stageIndex, 1);
});

test('empty backup strings do not wipe on apply', function () {
  var parsed = SM.parseImport(JSON.stringify({
    'website-manager-timing-v1': '{"sessions":[]}',
    'website-manager-progress-v2': null,
  }));
  var applied = SM.applyImport(
    { sessions: [session('keep', [quiz('q', 1)])] },
    {
      quizzes: { q: { completedStages: ['T01'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
      chunks: {},
      sentences: {},
    },
    parsed
  );
  assert.strictEqual(applied.timing.sessions.length, 1);
  assert.strictEqual(applied.timing.sessions[0].id, 'keep');
  assert.ok(applied.progress.quizzes.q);
});

test('import rejects garbage and does not look like a partial wipe', function () {
  assert.throws(function () { SM.parseImport('hello'); });
  assert.throws(function () { SM.parseImport('{"foo":1}'); });
  assert.throws(function () { SM.parseImport(''); });
  assert.throws(function () {
    SM.parseImport(JSON.stringify({ 'website-manager-timing-v1': { nope: true } }));
  });
});

test('double-encoded string values unwrap', function () {
  var inner = JSON.stringify({ sessions: [session('d', [quiz('q', 3)])] });
  var parsed = SM.parseImport({
    'website-manager-timing-v1': JSON.stringify(inner),
  });
  assert.strictEqual(parsed.timing.sessions[0].id, 'd');
  assert.strictEqual(parsed.timing.sessions[0].quizzes[0].quizId, 'q');
});

test('enteredT1At unions by chunk key and empty does not wipe', function () {
  var merged = SM.mergeProgress(
    {
      quizzes: {},
      chunks: {
        'ebi:1': {
          lastCompletedAt: '2026-10-01T00:00:00.000Z',
          stageIndex: 4,
          enteredT1At: '2026-09-01T00:00:00.000Z',
        },
      },
      sentences: {},
    },
    {
      quizzes: {},
      chunks: {
        'ebi:2': {
          lastCompletedAt: '2026-10-02T00:00:00.000Z',
          stageIndex: 3,
          enteredT1At: '2026-10-02T00:00:00.000Z',
        },
        'ebi:1': {
          lastCompletedAt: '2026-10-03T00:00:00.000Z',
          stageIndex: 5,
          enteredT1At: '',
        },
      },
      sentences: {},
    }
  );
  assert.strictEqual(merged.chunks['ebi:1'].enteredT1At, '2026-09-01T00:00:00.000Z');
  assert.strictEqual(merged.chunks['ebi:2'].enteredT1At, '2026-10-02T00:00:00.000Z');
  assert.strictEqual(merged.chunks['ebi:1'].stageIndex, 5);
});

test('both enteredT1At values keep the earliest, even when stage LWW goes backwards', function () {
  var tie = SM.mergeCursor(
    {
      lastCompletedAt: '2026-10-01T00:00:00.000Z',
      stageIndex: 4,
      enteredT1At: '2026-09-01T00:00:00.000Z',
    },
    {
      lastCompletedAt: '2026-10-09T00:00:00.000Z',
      stageIndex: 4,
      enteredT1At: '2026-10-02T00:00:00.000Z',
    }
  );
  assert.strictEqual(tie.stageIndex, 4);
  assert.strictEqual(tie.lastCompletedAt, '2026-10-09T00:00:00.000Z');
  assert.strictEqual(tie.enteredT1At, '2026-09-01T00:00:00.000Z');

  var lww = SM.mergeCursor(
    {
      lastCompletedAt: '2026-10-01T00:00:00.000Z',
      stageIndex: 5,
      updatedAt: '2026-10-01T00:00:00.000Z',
      enteredT1At: '2026-09-01T00:00:00.000Z',
    },
    {
      lastCompletedAt: '2026-10-03T00:00:00.000Z',
      stageIndex: 1,
      updatedAt: '2026-10-03T00:00:00.000Z',
    }
  );
  assert.strictEqual(lww.stageIndex, 1);
  assert.strictEqual(lww.updatedAt, '2026-10-03T00:00:00.000Z');
  assert.strictEqual(lww.enteredT1At, '2026-09-01T00:00:00.000Z');
});

test('empty cursor and empty progress document do not drop enteredT1At', function () {
  var fromEmptyCursor = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 4, enteredT1At: '2026-09-15T00:00:00.000Z' },
    { lastCompletedAt: null, stageIndex: 0, enteredT1At: '' }
  );
  assert.strictEqual(fromEmptyCursor.stageIndex, 4);
  assert.strictEqual(fromEmptyCursor.enteredT1At, '2026-09-15T00:00:00.000Z');

  var full = {
    quizzes: {},
    chunks: {
      'ebi:1': {
        lastCompletedAt: '2026-10-01T00:00:00.000Z',
        stageIndex: 3,
        enteredT1At: '2026-10-01T00:00:00.000Z',
      },
    },
    sentences: {},
  };
  var kept = SM.mergeProgress(full, { quizzes: {}, chunks: {}, sentences: {} });
  assert.strictEqual(kept.chunks['ebi:1'].enteredT1At, '2026-10-01T00:00:00.000Z');

  var imported = SM.parseImport(JSON.stringify({
    quizzes: {},
    chunks: {
      'ebi:9': {
        stageIndex: 3,
        lastCompletedAt: '2026-10-04T00:00:00.000Z',
        enteredT1At: '2026-10-04T00:00:00.000Z',
      },
    },
    sentences: {},
  }));
  var applied = SM.applyImport(
    { sessions: [] },
    {
      quizzes: {},
      chunks: {
        'ebi:1': {
          stageIndex: 4,
          lastCompletedAt: '2026-10-01T00:00:00.000Z',
          enteredT1At: '2026-09-01T00:00:00.000Z',
        },
      },
      sentences: {},
    },
    imported
  );
  assert.strictEqual(applied.progress.chunks['ebi:1'].enteredT1At, '2026-09-01T00:00:00.000Z');
  assert.strictEqual(applied.progress.chunks['ebi:9'].enteredT1At, '2026-10-04T00:00:00.000Z');
});

test('invalid enteredT1At does not replace a real timestamp', function () {
  var merged = SM.mergeCursor(
    { lastCompletedAt: '2026-10-01T00:00:00.000Z', stageIndex: 4, enteredT1At: 'not-a-date' },
    { lastCompletedAt: '2026-10-02T00:00:00.000Z', stageIndex: 4, enteredT1At: '2026-10-02T00:00:00.000Z' }
  );
  assert.strictEqual(merged.enteredT1At, '2026-10-02T00:00:00.000Z');
});

test('export fallbacks: desktop downloads, iPhone shares then copy, textarea always last', function () {
  assert.deepStrictEqual(
    SM.planExportFallbacks({ ios: false, canDownload: true, canShare: true, canCopy: true }),
    ['download', 'textarea']
  );
  assert.deepStrictEqual(
    SM.planExportFallbacks({ ios: true, canShare: true, canCopy: true }),
    ['share', 'copy', 'textarea']
  );
  assert.deepStrictEqual(
    SM.planExportFallbacks({ ios: true, canShare: false, canCopy: true }),
    ['copy', 'textarea']
  );
  assert.deepStrictEqual(
    SM.planExportFallbacks({ ios: true, canShare: false, canCopy: false }),
    ['textarea']
  );
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all sync-merge tests passed');
