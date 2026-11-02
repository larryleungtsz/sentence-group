/**
 * Unit tests for stats windows, quiz-sum, T1 events, and progress stamping.
 *   node js/stats-metrics.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var SM = require('./stats-metrics.js');

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

function hkt(iso) {
  return Date.parse(iso);
}

function session(slug, quizzes, extra) {
  var s = {
    id: slug + '-s',
    groupSlug: slug,
    groupTitle: extra && extra.groupTitle ? extra.groupTitle : slug,
    startedAt: (extra && extra.startedAt) || '2026-11-02T02:00:00.000Z',
    endedAt: '2026-11-02T03:00:00.000Z',
    totalMs: extra && extra.totalMs != null ? extra.totalMs : 9999999,
    quizzes: quizzes,
  };
  return s;
}

function quiz(duration, started, extra) {
  var q = {
    quizId: (extra && extra.quizId) || 'q-' + duration + '-' + started,
    kind: (extra && extra.kind) || 'chunk',
    chunkId: extra && Object.prototype.hasOwnProperty.call(extra, 'chunkId') ? extra.chunkId : 1,
    startedAt: started,
    endedAt: (extra && extra.endedAt) || started,
    durationMs: duration,
  };
  return q;
}

test('HKT day start matches Asia/Hong_Kong calendar date', function () {
  var fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  var morning = hkt('2026-11-02T00:30:00+08:00');
  var start = SM.hktDayStartMs(morning);
  assert.strictEqual(fmt.format(new Date(start)), '2026-11-02');
  assert.strictEqual(start, hkt('2026-11-02T00:00:00+08:00'));
  assert.strictEqual(fmt.format(new Date(start - 1)), '2026-11-01');
});

test('本週 is 7 HKT dates, not Mon–Sun and not 168h from now', function () {
  // Wednesday 2026-11-04 12:00 HKT. Calendar week would start Monday Nov 2.
  var now = hkt('2026-11-04T12:00:00+08:00');
  var w = SM.practiceWindows(now);
  assert.strictEqual(w.todayStart, hkt('2026-11-04T00:00:00+08:00'));
  assert.strictEqual(w.weekStart, hkt('2026-10-29T00:00:00+08:00'));
  assert.strictEqual(w.weekEnd, hkt('2026-11-05T00:00:00+08:00'));

  var sessions = [
    session('g', [
      quiz(1000, '2026-10-30T02:00:00.000Z'), // Oct 30 10:00 HKT — in rolling 7, not this Mon–Sun
      quiz(2000, '2026-10-28T02:00:00.000Z'), // Oct 28 10:00 HKT — outside rolling 7
    ]),
  ];
  var ov = SM.overview(sessions, now);
  assert.strictEqual(ov.weekMs, 1000);
  assert.strictEqual(ov.todayMs, 0);
  assert.strictEqual(ov.allMs, 3000);

  // Late evening: a pure 168h window would include Oct 26 23:30 HKT. Day boundaries do not.
  var late = hkt('2026-11-02T23:00:00+08:00');
  var lateOv = SM.overview(
    [
      session('g', [
        quiz(500, '2026-10-26T15:30:00.000Z'), // Oct 26 23:30 HKT
        quiz(700, '2026-10-26T16:10:00.000Z'), // Oct 27 00:10 HKT
      ]),
    ],
    late
  );
  assert.strictEqual(lateOv.weekMs, 700);
  assert.strictEqual(lateOv.allMs, 1200);
});

test('今日 uses HKT midnight, not the host timezone or the previous evening', function () {
  var now = hkt('2026-11-02T15:00:00+08:00');
  var ov = SM.overview(
    [
      session('g', [
        quiz(100, '2026-11-01T16:01:00.000Z'), // Nov 2 00:01 HKT
        quiz(200, '2026-11-01T15:59:00.000Z'), // Nov 1 23:59 HKT
      ]),
    ],
    now
  );
  assert.strictEqual(ov.todayMs, 100);
  assert.strictEqual(ov.weekMs, 300);
});

test('quiz-sum ignores session wall totalMs and anchors on startedAt', function () {
  var now = hkt('2026-11-02T18:00:00+08:00');
  var q = quiz(4000, '2026-11-01T15:00:00.000Z', {
    endedAt: '2026-11-01T16:30:00.000Z', // ended today HKT, started yesterday
  });
  var ov = SM.overview([session('g', [q], { totalMs: 800000 })], now);
  assert.strictEqual(ov.allMs, 4000);
  assert.strictEqual(ov.todayMs, 0);
  assert.strictEqual(ov.weekMs, 4000);
});

test('invalid durations are skipped; zero durations still count', function () {
  var now = hkt('2026-11-02T12:00:00+08:00');
  var ov = SM.overview(
    [
      session('g', [
        quiz(0, '2026-11-02T02:00:00.000Z'),
        quiz(-5, '2026-11-02T02:00:00.000Z'),
        { durationMs: 'nope', startedAt: '2026-11-02T02:00:00.000Z', kind: 'chunk', chunkId: 1 },
        quiz(1500, '2026-11-02T03:00:00.000Z'),
      ]),
    ],
    now
  );
  assert.strictEqual(ov.allMs, 1500);
  assert.strictEqual(ov.todayMs, 1500);
});

test('groups sort by quiz-sum desc and keep the latest title', function () {
  var rows = SM.groupRollup([
    session('b', [quiz(1000, '2026-11-01T00:00:00.000Z')], {
      groupTitle: 'Bee old',
      startedAt: '2026-11-01T00:00:00.000Z',
      totalMs: 50,
    }),
    session('a', [quiz(5000, '2026-11-02T00:00:00.000Z')], {
      groupTitle: 'Ayy',
      startedAt: '2026-11-02T00:00:00.000Z',
      totalMs: 9,
    }),
    session('b', [quiz(2500, '2026-11-03T00:00:00.000Z')], {
      groupTitle: 'Bee new',
      startedAt: '2026-11-03T00:00:00.000Z',
      totalMs: 9,
    }),
  ]);
  assert.deepStrictEqual(
    rows.map(function (r) {
      return r.groupSlug + ':' + r.totalMs + ':' + r.groupTitle;
    }),
    ['a:5000:Ayy', 'b:3500:Bee new']
  );
  assert.strictEqual(rows[0].quizCount, 1);
  assert.strictEqual(rows[1].quizCount, 2);
});

test('expand lists every group chunk, sentence row, and timing-only ids', function () {
  var group = {
    slug: 'ebi',
    sentence: '海老',
    chunks: [
      { id: 1, text: '濃厚' },
      { id: 2, text: '' },
      { id: 3, text: 'ちょっと' },
    ],
  };
  var sessions = [
    session('ebi', [
      quiz(5000, '2026-11-01T00:00:00.000Z', { chunkId: 3, quizId: 'c3' }),
      quiz(2000, '2026-11-01T00:01:00.000Z', { kind: 'sentence', chunkId: null, quizId: 's' }),
      quiz(1000, '2026-11-01T00:02:00.000Z', { chunkId: 9, quizId: 'orphan' }),
      quiz(100, '2026-11-01T00:03:00.000Z', { chunkId: 3, quizId: 'c3b' }),
    ]),
    session('other', [quiz(99999, '2026-11-01T00:00:00.000Z', { chunkId: 3 })]),
  ];
  var rows = SM.groupChunkRows(sessions, 'ebi', group);
  assert.deepStrictEqual(
    rows.map(function (r) {
      return r.key + '|' + r.label + '|' + r.labelFromText + '|' + r.totalMs;
    }),
    [
      'c3|ちょっと|true|5100',
      'sentence|句子題|false|2000',
      'c9|c9|false|1000',
      'c1|濃厚|true|0',
      'c2|c2|false|0',
    ]
  );
});

test('sentence row is omitted only when the group has no sentence and no sentence quizzes', function () {
  var rows = SM.groupChunkRows(
    [session('g', [quiz(10, '2026-11-01T00:00:00.000Z', { chunkId: 1 })])],
    'g',
    { slug: 'g', chunks: [{ id: 1, text: 'あ' }] }
  );
  assert.strictEqual(
    rows.some(function (r) {
      return r.kind === 'sentence';
    }),
    false
  );
});

test('學新詞 counts enteredT1At in today and last 7 HKT days, not current stage', function () {
  var now = hkt('2026-11-02T12:00:00+08:00');
  var progress = {
    chunks: {
      'ebi:1': { stageIndex: 8, enteredT1At: '2026-11-02T01:00:00.000Z' }, // today 09:00 HKT
      'ebi:2': { stageIndex: 3, enteredT1At: '2026-10-26T02:00:00.000Z' }, // Oct 26 10:00 HKT, outside 7
      'ebi:3': { stageIndex: 6, enteredT1At: '2026-10-30T02:00:00.000Z' }, // in week, not today
      'ebi:4': { stageIndex: 9 }, // past T1, no event — not counted
      'ebi:5': { stageIndex: 1, enteredT1At: '2026-11-02T02:00:00.000Z' }, // stamp still counts
    },
  };
  var groups = {
    groups: [
      {
        slug: 'ebi',
        chunks: [
          { id: 1, text: 'a' },
          { id: 2, text: 'b' },
          { id: 3, text: 'c' },
          { id: 4, text: 'd' },
          { id: 5, text: 'e' },
        ],
      },
    ],
  };
  var counted = SM.countEnteredT1(progress, groups, now);
  assert.strictEqual(counted.today, 2);
  assert.strictEqual(counted.week, 3);
});

test('skip, skipped, already_introduced, and shared_with_prior_group are excluded', function () {
  var now = hkt('2026-11-02T12:00:00+08:00');
  var at = '2026-11-02T01:00:00.000Z';
  var progress = {
    chunks: {
      'g:1': { stageIndex: 3, enteredT1At: at },
      'g:2': { stageIndex: 3, enteredT1At: at },
      'g:3': { stageIndex: 3, enteredT1At: at },
      'g:4': { stageIndex: 3, enteredT1At: at },
      'g:5': { stageIndex: 3, enteredT1At: at },
    },
  };
  var groups = {
    groups: [
      {
        slug: 'g',
        chunks: [
          { id: 1, text: 'learn' },
          { id: 2, skip: true, text: 'skip' },
          { id: 3, skipped: true, text: 'skipped' },
          { id: 4, already_introduced: true, text: 'old' },
          { id: 5, shared_with_prior_group: 'other', text: 'shared' },
        ],
      },
    ],
  };
  var counted = SM.countEnteredT1(progress, groups, now);
  assert.strictEqual(counted.today, 1);
  assert.strictEqual(counted.events.length, 1);
  assert.strictEqual(counted.events[0].key, 'g:1');
  assert.strictEqual(SM.chunkIsLearnExcluded({ skip: false, text: 'x' }), false);
  assert.strictEqual(SM.chunkIsLearnExcluded({ shared_with_prior_group: '' }), false);
});

test('groups.json skip and already_introduced keys are excluded', function () {
  var groups = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/groups.json'), 'utf8'));
  var set = SM.learnExcludedKeySet(groups);
  assert.strictEqual(set['aragoshi-mikanshu:1'], true);
  assert.strictEqual(set['gochumon-kakunin:1'], true);
  assert.strictEqual(set['gochumon-kakunin:2'], undefined);
});

test('resolveEnteredT1At stamps the crossing and does not invent past-T1 dates', function () {
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
      3,
      '2026-10-02T00:00:00.000Z',
      3
    ),
    '2026-10-02T00:00:00.000Z'
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 3, lastCompletedAt: '2026-10-02T00:00:00.000Z' },
      3,
      '2026-10-02T00:00:00.000Z',
      3
    ),
    '2026-10-02T00:00:00.000Z'
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 5, lastCompletedAt: '2026-11-01T00:00:00.000Z' },
      5,
      '2026-11-01T00:00:00.000Z',
      3
    ),
    null
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 3, lastCompletedAt: '2026-10-02T00:00:00.000Z' },
      4,
      '2026-10-04T00:00:00.000Z',
      3
    ),
    '2026-10-02T00:00:00.000Z'
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      {
        stageIndex: 3,
        lastCompletedAt: '2026-10-02T00:00:00.000Z',
        enteredT1At: '2026-09-15T00:00:00.000Z',
      },
      4,
      '2026-10-04T00:00:00.000Z',
      3
    ),
    '2026-09-15T00:00:00.000Z'
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 3, lastCompletedAt: '2026-10-02T00:00:00.000Z', enteredT1At: 'nope' },
      3,
      '2026-10-02T00:00:00.000Z',
      3
    ),
    '2026-10-02T00:00:00.000Z'
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 1, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
      2,
      '2026-10-02T00:00:00.000Z',
      3
    ),
    null
  );
  assert.strictEqual(
    SM.resolveEnteredT1At(
      { stageIndex: 4, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
      5,
      '2026-10-08T00:00:00.000Z',
      3
    ),
    null
  );
});

function installLocalStorage() {
  var store = Object.create(null);
  global.localStorage = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function (k, v) {
      store[k] = String(v);
    },
    removeItem: function (k) {
      delete store[k];
    },
  };
  return store;
}

installLocalStorage();
global.Schedule = {
  T1_STAGE_INDEX: 3,
  defaultChunkState: function () {
    return { lastCompletedAt: null, stageIndex: 0 };
  },
  defaultSentenceState: function () {
    return { lastCompletedAt: null, stageIndex: 0 };
  },
};
global.StatsMetrics = SM;
var Progress = require('./progress.js');

function writeProgress(chunks) {
  localStorage.setItem(
    'website-manager-progress-v2',
    JSON.stringify({ quizzes: {}, chunks: chunks, sentences: {} })
  );
}

function readChunks() {
  return JSON.parse(localStorage.getItem('website-manager-progress-v2')).chunks;
}

test('progress exclusion fallback matches when the metrics helper is absent', function () {
  var saved = global.StatsMetrics.chunkIsLearnExcluded;
  global.StatsMetrics.chunkIsLearnExcluded = null;
  try {
    assert.strictEqual(Progress.chunkIsLearnExcluded({ skip: true }), true);
    assert.strictEqual(Progress.chunkIsLearnExcluded({ skipped: true }), true);
    assert.strictEqual(Progress.chunkIsLearnExcluded({ already_introduced: true }), true);
    assert.strictEqual(Progress.chunkIsLearnExcluded({ shared_with_prior_group: 'x' }), true);
    assert.strictEqual(Progress.chunkIsLearnExcluded({ text: 'new' }), false);
    assert.strictEqual(Progress.chunkIsLearnExcluded(null), false);
  } finally {
    global.StatsMetrics.chunkIsLearnExcluded = saved;
  }
});

test('progress exclusion matches stats-metrics', function () {
  var samples = [
    null,
    {},
    { text: 'x' },
    { skip: true },
    { skip: false },
    { skipped: true },
    { already_introduced: true },
    { already_introduced: false },
    { shared_with_prior_group: 'gochumon' },
    { shared_with_prior_group: '' },
  ];
  samples.forEach(function (sample) {
    assert.strictEqual(
      Progress.chunkIsLearnExcluded(sample),
      SM.chunkIsLearnExcluded(sample)
    );
  });
});

test('advanceChunk records enteredT1At once on the crossing into T1', function () {
  writeProgress({
    'ebi:1': { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
  });
  var first = Progress.advanceChunk('ebi', 1, '2026-11-02T01:00:00.000Z', { id: 1, text: '新' });
  assert.strictEqual(first.stageIndex, 3);
  assert.strictEqual(first.enteredT1At, '2026-11-02T01:00:00.000Z');
  var second = Progress.advanceChunk('ebi', 1, '2026-11-04T01:00:00.000Z', { id: 1, text: '新' });
  assert.strictEqual(second.stageIndex, 4);
  assert.strictEqual(second.enteredT1At, '2026-11-02T01:00:00.000Z');
});

test('advanceChunk does not log skip or already_introduced', function () {
  writeProgress({
    'ebi:2': { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
    'ebi:3': { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' },
  });
  var skipped = Progress.advanceChunk('ebi', 2, '2026-11-02T01:00:00.000Z', { id: 2, skip: true });
  var introduced = Progress.advanceChunk('ebi', 3, '2026-11-02T01:00:00.000Z', {
    id: 3,
    already_introduced: true,
  });
  assert.strictEqual(skipped.stageIndex, 3);
  assert.strictEqual(introduced.stageIndex, 3);
  assert.ok(!readChunks()['ebi:2'].enteredT1At);
  assert.ok(!readChunks()['ebi:3'].enteredT1At);
});

test('advance off exact T1 uses the previous completion; past T1 does not invent', function () {
  writeProgress({
    'ebi:1': { stageIndex: 3, lastCompletedAt: '2026-10-02T00:00:00.000Z' },
    'ebi:9': { stageIndex: 5, lastCompletedAt: '2026-11-01T00:00:00.000Z' },
  });
  Progress.advanceChunk('ebi', 1, '2026-10-04T00:00:00.000Z', { id: 1, text: '新' });
  Progress.advanceChunk('ebi', 9, '2026-11-02T00:00:00.000Z', { id: 9, text: '舊' });
  assert.strictEqual(readChunks()['ebi:1'].enteredT1At, '2026-10-02T00:00:00.000Z');
  assert.strictEqual(readChunks()['ebi:1'].stageIndex, 4);
  assert.strictEqual(readChunks()['ebi:9'].stageIndex, 6);
  assert.ok(!readChunks()['ebi:9'].enteredT1At);
});

test('reconcile stamps exact T1 only, skips excluded and already-past chunks', function () {
  writeProgress({
    'ebi:1': { stageIndex: 3, lastCompletedAt: '2026-11-01T02:00:00.000Z' },
    'ebi:2': { stageIndex: 5, lastCompletedAt: '2026-11-01T03:00:00.000Z' },
    'ebi:3': { stageIndex: 3, lastCompletedAt: '2026-11-01T04:00:00.000Z' },
    'ebi:4': { stageIndex: 2, lastCompletedAt: '2026-11-01T01:00:00.000Z' },
    'ebi:5': {
      stageIndex: 3,
      lastCompletedAt: '2026-11-08T00:00:00.000Z',
      enteredT1At: '2026-10-01T00:00:00.000Z',
    },
  });
  var groups = {
    groups: [
      {
        slug: 'ebi',
        chunks: [
          { id: 1, text: 'new' },
          { id: 2, text: 'past' },
          { id: 3, text: 'skip', skip: true },
          { id: 4, text: 'dense' },
          { id: 5, text: 'kept' },
        ],
      },
    ],
  };
  assert.strictEqual(Progress.reconcileEnteredT1(groups), true);
  var chunks = readChunks();
  assert.strictEqual(chunks['ebi:1'].enteredT1At, '2026-11-01T02:00:00.000Z');
  assert.ok(!chunks['ebi:2'].enteredT1At);
  assert.ok(!chunks['ebi:3'].enteredT1At);
  assert.ok(!chunks['ebi:4'].enteredT1At);
  assert.strictEqual(chunks['ebi:5'].enteredT1At, '2026-10-01T00:00:00.000Z');
  assert.strictEqual(chunks['ebi:2'].stageIndex, 5);
  assert.strictEqual(Progress.reconcileEnteredT1(groups), false);
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all stats-metrics tests passed');
