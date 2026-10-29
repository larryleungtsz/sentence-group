/**
 * Quiz timing over 2 minutes is excluded from stored totals.
 * Run: node test/timing-invalid.test.js
 *
 * Rule: invalid when elapsed > 120000 ms. Exactly 120000 ms still counts.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
  const store = Object.create(null);
  let sets = 0;
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      sets += 1;
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };
  const clock = { t: 1_700_000_000_000 };
  const context = {
    localStorage,
    console,
    __clock: clock,
  };
  context.window = context;
  vm.createContext(context);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'timing.js'), 'utf8');
  vm.runInContext(src, context);
  vm.runInContext('Date.now = function () { return __clock.t; };', context);
  return {
    Timing: context.Timing,
    store,
    setNow(ms) {
      clock.t = ms;
    },
    now() {
      return clock.t;
    },
    advance(ms) {
      clock.t += ms;
    },
    setCount() {
      return sets;
    },
    resetSets() {
      sets = 0;
    },
  };
}

function quizMeta(overrides) {
  return Object.assign(
    {
      quiz_id: 'q1',
      objective: 'example_sentences_listening',
      level: 1,
      kind: 'chunk',
      chunk_id: 1,
    },
    overrides || {}
  );
}

function runQuiz(env, meta, elapsedMs) {
  const session = env._session;
  session.startQuiz(meta);
  env.advance(elapsedMs);
  return session.endQuiz(meta);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok  ' + name);
}

test('under 2 minutes records duration and keeps wall-clock session total', () => {
  const env = setup();
  const started = env.now();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  env._session = session;
  env.advance(1000);
  const record = runQuiz(env, quizMeta(), 30000);
  env.advance(500);
  const saved = session.finalize('complete');
  assert.strictEqual(record.timingValid, true);
  assert.strictEqual(record.durationMs, 30000);
  assert.strictEqual(saved.quizCount, 1);
  assert.strictEqual(saved.totalMs, env.now() - started);
  assert.strictEqual(saved.totalMs, 31500);
  assert.strictEqual(saved.chunks.length, 1);
  assert.strictEqual(saved.chunks[0].totalMs, 30000);
  assert.strictEqual(saved.chunks[0].quizCount, 1);
  assert.strictEqual(env.Timing.practiceTotalMs(saved), 31500);
  assert.strictEqual(env.Timing.excludedQuizCount(saved), 0);
  const shown = env.Timing.quizTimePresentation(saved.quizzes[0]);
  assert.strictEqual(shown.counted, true);
  assert.strictEqual(shown.durationText, '30 秒');
});

test('exactly 120000 ms still counts', () => {
  const env = setup();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  env._session = session;
  const record = runQuiz(env, quizMeta(), env.Timing.MAX_VALID_QUIZ_MS);
  const saved = session.finalize('complete');
  assert.strictEqual(env.Timing.MAX_VALID_QUIZ_MS, 120000);
  assert.strictEqual(record.timingValid, true);
  assert.strictEqual(record.durationMs, 120000);
  assert.strictEqual(saved.chunks[0].totalMs, 120000);
  assert.strictEqual(saved.chunks[0].quizCount, 1);
  assert.ok(saved.totalMs >= 120000);
  assert.strictEqual(env.Timing.excludedQuizCount(saved), 0);
  assert.strictEqual(env.Timing.quizTimePresentation(record).durationText, '2 分 0 秒');
});

test('over 2 minutes completes the record but drops the duration from totals', () => {
  const env = setup();
  const started = env.now();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  env._session = session;
  const elapsed = 120001;
  const record = runQuiz(env, quizMeta({ quiz_id: 'slow' }), elapsed);
  const saved = session.finalize('complete');
  assert.strictEqual(record.timingValid, false);
  assert.strictEqual(record.durationMs, null);
  assert.strictEqual(saved.quizCount, 1);
  assert.strictEqual(saved.quizzes.length, 1);
  assert.strictEqual(saved.totalMs, 0);
  assert.strictEqual(env.now() - started, elapsed);
  assert.strictEqual(saved.chunks.length, 0);
  assert.strictEqual(env.Timing.practiceTotalMs(saved), 0);
  assert.strictEqual(env.Timing.excludedQuizCount(saved), 1);
  const shown = env.Timing.quizTimePresentation(saved.quizzes[0]);
  assert.strictEqual(shown.counted, false);
  assert.strictEqual(shown.durationText, '不計時');
  assert.ok(!/秒|分/.test(shown.durationText));
  assert.strictEqual(shown.note, '超過 2 分鐘，未計入用時');
  const raw = env.store[env.Timing.KEY];
  assert.ok(!raw.includes(String(elapsed)), 'invalid elapsed ms must not be stored');
  assert.ok(!raw.includes('_excludedMs'));
});

test('mixed session keeps short quizzes and excludes the long one from chunk and session totals', () => {
  const env = setup();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  env._session = session;
  runQuiz(env, quizMeta({ quiz_id: 'a', chunk_id: 1 }), 10000);
  runQuiz(env, quizMeta({ quiz_id: 'b', chunk_id: 1 }), 180000);
  runQuiz(env, quizMeta({ quiz_id: 'c', chunk_id: 2 }), 20000);
  runQuiz(
    env,
    quizMeta({ quiz_id: 's', kind: 'sentence', chunk_id: null, level: null }),
    15000
  );
  const saved = session.finalize('leave');
  assert.strictEqual(saved.quizCount, 4);
  assert.strictEqual(saved.reason, 'leave');
  assert.strictEqual(saved.totalMs, 10000 + 20000 + 15000);
  assert.strictEqual(env.Timing.excludedQuizCount(saved), 1);
  const chunks = env.Timing.chunksForSession(saved);
  assert.strictEqual(
    JSON.stringify(
      Array.from(chunks).map((c) => ({
        key: c.key,
        totalMs: c.totalMs,
        quizCount: c.quizCount,
      }))
    ),
    JSON.stringify([
      { key: 'c1', totalMs: 10000, quizCount: 1 },
      { key: 'c2', totalMs: 20000, quizCount: 1 },
      { key: 'sentence', totalMs: 15000, quizCount: 1 },
    ])
  );
  const slow = saved.quizzes.find((q) => q.quizId === 'b');
  assert.strictEqual(slow.timingValid, false);
  assert.strictEqual(slow.durationMs, null);
  assert.strictEqual(env.Timing.quizTimePresentation(slow).durationText, '不計時');
  const fast = saved.quizzes.find((q) => q.quizId === 'a');
  assert.strictEqual(fast.durationMs, 10000);
  assert.strictEqual(env.Timing.quizTimePresentation(fast).counted, true);
});

test('legacy sessions over the cap are rewritten once and stay idempotent', () => {
  const env = setup();
  const legacy = {
    sessions: [
      {
        id: 'old',
        groupSlug: 'g',
        groupTitle: 'Old',
        startedAt: '2026-10-01T00:00:00.000Z',
        endedAt: '2026-10-01T00:03:20.000Z',
        totalMs: 200000,
        quizCount: 2,
        reason: 'complete',
        chunks: [
          { key: 'c1', chunkId: 1, kind: 'chunk', label: 'chunk1', totalMs: 170000, quizCount: 2 },
        ],
        quizzes: [
          {
            quizId: 'short',
            objective: 'example_sentences_listening',
            level: 1,
            kind: 'chunk',
            chunkId: 1,
            startedAt: '2026-10-01T00:00:00.000Z',
            endedAt: '2026-10-01T00:00:20.000Z',
            durationMs: 20000,
          },
          {
            quizId: 'long',
            objective: 'example_sentences_listening',
            level: 1,
            kind: 'chunk',
            chunkId: 1,
            startedAt: '2026-10-01T00:00:20.000Z',
            endedAt: '2026-10-01T00:03:20.000Z',
            durationMs: 180000,
          },
        ],
      },
    ],
  };
  env.store[env.Timing.KEY] = JSON.stringify(legacy);
  env.resetSets();
  const loaded = env.Timing.listSessions();
  assert.strictEqual(env.setCount(), 1);
  assert.strictEqual(loaded[0].totalMs, 20000);
  assert.strictEqual(env.Timing.practiceTotalMs(loaded[0]), 20000);
  assert.strictEqual(loaded[0].quizzes[0].durationMs, 20000);
  assert.strictEqual(loaded[0].quizzes[1].timingValid, false);
  assert.strictEqual(loaded[0].quizzes[1].durationMs, null);
  assert.strictEqual(loaded[0].quizCount, 2);
  const chunks = env.Timing.chunksForSession(loaded[0]);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].totalMs, 20000);
  assert.strictEqual(chunks[0].quizCount, 1);
  assert.strictEqual(env.Timing.quizTimePresentation(loaded[0].quizzes[1]).durationText, '不計時');
  const stored = env.store[env.Timing.KEY];
  assert.ok(!stored.includes('180000'));
  assert.ok(!stored.includes('170000'));
  env.resetSets();
  const again = env.Timing.listSessions();
  assert.strictEqual(env.setCount(), 0);
  assert.strictEqual(again[0].totalMs, 20000);
  assert.strictEqual(again[0].quizzes[1].durationMs, null);
});

test('legacy sessions already inside the cap are not rewritten', () => {
  const env = setup();
  const legacy = {
    sessions: [
      {
        id: 'fine',
        groupSlug: 'g',
        groupTitle: 'Fine',
        startedAt: '2026-10-01T00:00:00.000Z',
        endedAt: '2026-10-01T00:00:30.000Z',
        totalMs: 30000,
        quizCount: 1,
        reason: 'complete',
        chunks: [
          { key: 'c1', chunkId: 1, kind: 'chunk', label: 'chunk1', totalMs: 30000, quizCount: 1 },
        ],
        quizzes: [
          {
            quizId: 'short',
            kind: 'chunk',
            chunkId: 1,
            level: 1,
            objective: 'word_shadowing_025',
            durationMs: 30000,
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(legacy);
  env.store[env.Timing.KEY] = raw;
  env.resetSets();
  const loaded = env.Timing.listSessions();
  assert.strictEqual(env.setCount(), 0);
  assert.strictEqual(env.store[env.Timing.KEY], raw);
  assert.strictEqual(loaded[0].totalMs, 30000);
  assert.strictEqual(env.Timing.practiceTotalMs(loaded[0]), 30000);
  assert.strictEqual(env.Timing.chunksForSession(loaded[0])[0].totalMs, 30000);
});

test('abandoned in-progress quiz is not stored and an empty session is not saved', () => {
  const env = setup();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  session.startQuiz(quizMeta());
  env.advance(300000);
  assert.strictEqual(session.finalize('leave'), null);
  assert.strictEqual(env.Timing.listSessions().length, 0);
});

test('leaving during an open quiz does not store it; wall clock still includes that time', () => {
  const env = setup();
  const session = env.Timing.createSession({ groupSlug: 'g', groupTitle: 'G' });
  env._session = session;
  runQuiz(env, quizMeta({ quiz_id: 'done' }), 8000);
  session.startQuiz(quizMeta({ quiz_id: 'open' }));
  env.advance(400000);
  const saved = session.finalize('leave');
  assert.strictEqual(saved.quizCount, 1);
  assert.strictEqual(saved.quizzes[0].quizId, 'done');
  assert.strictEqual(saved.quizzes[0].durationMs, 8000);
  // Wall clock still includes the abandoned quiz; that matches the previous rule.
  assert.strictEqual(saved.totalMs, 8000 + 400000);
  assert.strictEqual(env.Timing.excludedQuizCount(saved), 0);
});

console.log(passed + ' passed');
