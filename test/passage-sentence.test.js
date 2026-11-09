/**
 * Passage key migration (P2) and the empty Sentence shell (P3).
 *   node test/passage-sentence.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failed = [];

function test(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failed.push(name);
    console.error('FAIL ' + name);
    console.error(err && err.stack ? err.stack : err);
  }
}

function installLocalStorage() {
  const store = Object.create(null);
  global.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };
  return store;
}

const store = installLocalStorage();
const Schedule = require(path.join(root, 'js/schedule.js'));
const SyncMerge = require(path.join(root, 'js/sync-merge.js'));
const Progress = require(path.join(root, 'js/progress.js'));

const schedule = JSON.parse(fs.readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/groups.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));

const PASSAGE_OBJECTIVES = [
  'whole_sentence_listening',
  'sentence_segment_shadowing',
  'sequence_training',
];

function readProgress() {
  return JSON.parse(store[Progress.KEY]);
}

function chunkStyleThroughT30() {
  const labels = ['T01', 'T02', 'T03'];
  for (let i = 1; i <= 30; i++) labels.push('T' + i);
  return labels;
}

const SENTENCE_STAGES = chunkStyleThroughT30();
const SENTENCE_SCHEDULE = {
  sentence_listen_to_l1: SENTENCE_STAGES,
  sentence_l1_palace_multi_tap: SENTENCE_STAGES,
  sentence_shadowing_125: SENTENCE_STAGES,
  sentence_shadowing_075: SENTENCE_STAGES,
  sentence_discourse_mcq: SENTENCE_STAGES,
  sentence_example_sentences_listening: SENTENCE_STAGES,
};
const SENTENCE_OBJECTIVES_WITH_QUIZZES = [
  'sentence_listen_to_l1',
  'sentence_l1_palace_multi_tap',
  'sentence_shadowing_125',
  'sentence_shadowing_075',
  'sentence_discourse_mcq',
];

test('shipped schedule keeps passage objectives and Q20–Q25 on the sentence layer', function () {
  assert.deepStrictEqual(Object.keys(schedule.passage_schedule).sort(), PASSAGE_OBJECTIVES.slice().sort());
  assert.deepStrictEqual(schedule.sentence_schedule, SENTENCE_SCHEDULE);
  assert.deepStrictEqual(schedule.chunk_schedule.loci_description_tap, ['T01', 'T02', 'T03', 'T1', 'T3', 'T6', 'T9']);
  assert.deepStrictEqual(schedule.passage_schedule.whole_sentence_listening[0], 'T+3');
  assert.ok(schedule.notes.indexOf('under-chunk gate') !== -1);
  assert.ok(schedule.notes.indexOf('Sentence spacing matches chunk') !== -1);
  assert.ok(schedule.notes.indexOf('passage_schedule is unchanged') !== -1);
  assert.ok(schedule.notes.indexOf('left dense') !== -1);
  PASSAGE_OBJECTIVES.forEach(function (key) {
    assert.ok(!schedule.sentence_schedule[key], key);
  });
  Object.keys(SENTENCE_SCHEDULE).forEach(function (key) {
    assert.ok(!schedule.passage_schedule[key], key);
    assert.deepStrictEqual(schedule.sentence_schedule[key], SENTENCE_STAGES, key);
    const hasQuiz = manifest.quizzes.some(function (q) { return q.objective === key; });
    assert.strictEqual(hasQuiz, key !== 'sentence_example_sentences_listening', key);
  });
  assert.deepStrictEqual(
    Schedule.passageScheduleTable(schedule),
    schedule.passage_schedule
  );
  assert.deepStrictEqual(Schedule.sentenceScheduleTable(schedule), SENTENCE_SCHEDULE);
  const labels = Schedule.sentenceUnitStageLabels(schedule);
  assert.deepStrictEqual(labels, SENTENCE_STAGES);
  assert.deepStrictEqual(labels, Schedule.chunkStageLabels(30));
  assert.strictEqual(Schedule.chunkStageLabels().length, 22);
  assert.strictEqual(Schedule.chunkStageLabels()[21], 'T19');
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const fresh = { stageIndex: 0, lastCompletedAt: null };
  const later = { stageIndex: 1, lastCompletedAt: '2020-01-01T00:00:00.000Z' };
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
  }), ['T01']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_l1_palace_multi_tap',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: later,
    completedStages: [],
    now: now,
  }), ['T02']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_example_sentences_listening',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
  }), ['T01']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'passage',
    schedule: schedule,
    passageState: fresh,
    completedStages: [],
    now: now,
  }), []);
});

test('legacy sentence_schedule still drives passage dues and not the new sentence kind', function () {
  const legacy = {
    sentence_schedule: {
      whole_sentence_listening: ['T+3'],
      sentence_segment_shadowing: ['T+1'],
    },
  };
  assert.deepStrictEqual(Schedule.passageScheduleTable(legacy), legacy.sentence_schedule);
  assert.deepStrictEqual(Schedule.sentenceScheduleTable(legacy), {});
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const onlyListening = {
    sentence_schedule: { whole_sentence_listening: ['T+3'] },
  };
  const passageDue = Schedule.dueStages({
    objective: 'whole_sentence_listening',
    kind: 'passage',
    schedule: onlyListening,
    passageState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: now,
  });
  assert.deepStrictEqual(passageDue, ['T+3']);
  const sentenceDue = Schedule.dueStages({
    objective: 'whole_sentence_listening',
    kind: 'sentence',
    schedule: legacy,
    sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: now,
  });
  assert.deepStrictEqual(sentenceDue, []);
});

test('passage_schedule wins over a leftover sentence_schedule', function () {
  const mixed = {
    passage_schedule: { whole_sentence_listening: ['T+6'] },
    sentence_schedule: { whole_sentence_listening: ['T+3'], sentence_shell_smoke: ['T+1'] },
  };
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'whole_sentence_listening',
      kind: 'passage',
      schedule: mixed,
      passageState: { stageIndex: 0, lastCompletedAt: null },
      completedStages: [],
      now: now,
    }),
    ['T+6']
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_shell_smoke',
      kind: 'sentence',
      schedule: mixed,
      sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
      completedStages: [],
      now: now,
    }),
    ['T+1']
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'whole_sentence_listening',
      kind: 'sentence',
      schedule: mixed,
      sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
      completedStages: [],
      now: now,
    }),
    []
  );
});

test('live passage quizzes are due on kind passage and the smoke shell is not', function () {
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const listening = Schedule.dueStages({
    objective: 'whole_sentence_listening',
    kind: 'passage',
    schedule: schedule,
    passageState: { stageIndex: 2, lastCompletedAt: '2020-01-01T00:00:00.000Z' },
    completedStages: [],
    now: now,
  });
  assert.deepStrictEqual(listening, ['T+3']);
  const shadow = Schedule.dueStages({
    objective: 'sentence_segment_shadowing',
    kind: 'passage',
    schedule: schedule,
    passageState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: now,
  });
  assert.deepStrictEqual(shadow, ['T+1']);
  const chunk = Schedule.dueStages({
    objective: 'loci_description_tap',
    kind: 'chunk',
    schedule: schedule,
    chunkState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: now,
    admitted: true,
  });
  assert.deepStrictEqual(chunk, ['T01']);
  const smoke = Schedule.dueStages({
    objective: 'sentence_shell_smoke',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: now,
  });
  assert.deepStrictEqual(smoke, []);
});

test('manifest passage kinds keep objectives; sentence rows are live Soft GO', function () {
  const passages = manifest.quizzes.filter((q) => q.kind === 'passage');
  const sentences = manifest.quizzes.filter((q) => q.kind === 'sentence');
  assert.strictEqual(passages.length, 704);
  passages.forEach((q) => {
    assert.ok(PASSAGE_OBJECTIVES.indexOf(q.objective) !== -1, q.quiz_id);
    assert.ok(q.chunk_id == null, q.quiz_id);
  });
  assert.strictEqual(sentences.length, 285);
  assert.ok(!sentences.some((q) => q.quiz_id === 'sentence-shell-smoke-yoyaku-shitenai-s1-v1'));
  assert.ok(!sentences.some((q) => q.objective === 'sentence_shell_smoke'));
  const sentenceObjectives = SENTENCE_OBJECTIVES_WITH_QUIZZES;
  sentences.forEach((q) => {
    assert.ok(sentenceObjectives.indexOf(q.objective) !== -1, q.quiz_id);
    assert.strictEqual(q.shell, false, q.quiz_id);
    assert.strictEqual(q.level, null, q.quiz_id);
    assert.strictEqual(q.chunk_id, null, q.quiz_id);
    assert.ok(q.sentence_id, q.quiz_id);
    assert.ok(q.group_slug, q.quiz_id);
  });
  assert.ok(!fs.existsSync(path.join(root, 'data/quizzes/sentence-shell-smoke-yoyaku-shitenai-s1-v1.json')));
});

test('yoyaku-shitenai sentences[] still join the passage under chunk-boundary-wins', function () {
  const group = groups.groups.find((g) => g.slug === 'yoyaku-shitenai');
  assert.ok(group);
  assert.strictEqual(group.chunks.length, 7);
  const byId = new Map(group.chunks.map((c) => [c.id, c]));
  const seen = new Set();
  const glueRe = /^[\s、。？！，,!？?]*$/;
  group.sentences.forEach((sentence) => {
    assert.ok(sentence.id);
    assert.ok(Array.isArray(sentence.chunk_ids) && sentence.chunk_ids.length);
    let rest = sentence.text;
    sentence.chunk_ids.forEach((id) => {
      assert.ok(!seen.has(id), 'chunk ' + id + ' is in two sentences');
      seen.add(id);
      const chunk = byId.get(id);
      assert.ok(chunk, 'missing chunk ' + id);
      const idx = rest.indexOf(chunk.text);
      assert.ok(idx >= 0, 'chunk text missing from ' + sentence.id);
      assert.ok(glueRe.test(rest.slice(0, idx)), 'glue before ' + chunk.text);
      rest = rest.slice(idx + chunk.text.length);
    });
    assert.ok(glueRe.test(rest), 'trailing glue ' + rest);
  });
  assert.strictEqual(seen.size, group.chunks.length);
  assert.strictEqual(group.sentences.map((s) => s.text).join(''), group.sentence);
  const parts = [];
  let buf = '';
  for (const ch of group.sentence) {
    buf += ch;
    if (ch === '。' || ch === '？' || ch === '！') {
      parts.push(buf);
      buf = '';
    }
  }
  if (buf) parts.push(buf);
  assert.deepStrictEqual(parts, group.sentences.map((s) => s.text));
  assert.ok(group.sentences.every((s) => typeof s.l1 === 'string' && s.l1));
});

test('legacy progress.sentences migrates on load and advance keeps the mirror', function () {
  store[Progress.KEY] = JSON.stringify({
    quizzes: { 'whole-listen': { completedStages: ['T+3'], lastReviewedAt: '2026-10-01T00:00:00.000Z' } },
    chunks: { 'yoyaku-shitenai:1': { stageIndex: 2, lastCompletedAt: '2026-10-01T00:00:00.000Z' } },
    sentences: {
      'yoyaku-shitenai': { stageIndex: 4, lastCompletedAt: '2026-10-02T00:00:00.000Z' },
    },
  });
  const loaded = Progress.getPassage('yoyaku-shitenai');
  assert.strictEqual(loaded.stageIndex, 4);
  assert.strictEqual(Progress.getSentence('yoyaku-shitenai').stageIndex, 4);
  const saved = readProgress();
  assert.strictEqual(saved.passages['yoyaku-shitenai'].stageIndex, 4);
  assert.strictEqual(saved.sentences['yoyaku-shitenai'].stageIndex, 4);
  assert.strictEqual(saved.chunks['yoyaku-shitenai:1'].stageIndex, 2);
  const next = Progress.advancePassage('yoyaku-shitenai', '2026-11-03T00:00:00.000Z');
  assert.strictEqual(next.stageIndex, 5);
  const after = readProgress();
  assert.strictEqual(after.passages['yoyaku-shitenai'].stageIndex, 5);
  assert.strictEqual(after.sentences['yoyaku-shitenai'].stageIndex, 5);
  assert.strictEqual(after.chunks['yoyaku-shitenai:1'].stageIndex, 2);
  const unit = Progress.advanceSentenceUnit('yoyaku-shitenai', 's1', '2026-11-03T00:00:00.000Z');
  assert.strictEqual(unit.stageIndex, 1);
  const both = readProgress();
  assert.strictEqual(both.passages['yoyaku-shitenai'].stageIndex, 5);
  assert.strictEqual(both.sentenceUnits['yoyaku-shitenai:s1'].stageIndex, 1);
  assert.strictEqual(SyncMerge.normalizeProgress(both).passages['yoyaku-shitenai'].stageIndex, 5);
  const frozen = store[Progress.KEY];
  Progress.getPassage('yoyaku-shitenai');
  Progress.getSentenceUnit('yoyaku-shitenai', 's1');
  assert.strictEqual(store[Progress.KEY], frozen);
});

test('fresh units due Q20 where that quiz exists; Q24-only yoyaku is due at T01', function () {
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const fresh = { stageIndex: 0, lastCompletedAt: null };
  assert.ok(!manifest.quizzes.some((q) => q.quiz_id === 'sentence-shell-smoke-yoyaku-shitenai-s1-v1'));
  const pilot = groups.groups.find((g) => g.slug === 'yoyaku-shitenai');
  const pilotIds = new Set(pilot.sentences.map((s) => s.id));
  const pilotQuizzes = manifest.quizzes.filter((q) => {
    if (q.kind !== 'sentence') return false;
    if (!pilotIds.has(q.sentence_id)) return false;
    if (q.group_slug !== pilot.slug) return false;
    if (q.sentence !== pilot.sentence) return false;
    return true;
  });
  const pilotDue = pilotQuizzes.filter((q) => Schedule.dueStages({
    objective: q.objective,
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
  }).length);
  assert.strictEqual(pilotDue.length, pilotQuizzes.length);
  assert.strictEqual(pilotDue.length, 15);
  assert.deepStrictEqual(
    Array.from(new Set(pilotDue.map((q) => q.objective))).sort(),
    SENTENCE_OBJECTIVES_WITH_QUIZZES.slice().sort()
  );
  const passageDue = manifest.quizzes.filter((q) => q.kind === 'passage' && q.sentence === pilot.sentence && Schedule.dueStages({
    objective: q.objective,
    kind: 'passage',
    schedule: schedule,
    passageState: fresh,
    completedStages: [],
    now: now,
    scheduleStages: q.schedule_stages || null,
  }).length);
  assert.ok(passageDue.length > 0);
  const annai = groups.groups.find((g) => g.slug === 'yoyaku');
  const annaiQuizzes = manifest.quizzes.filter((q) => q.kind === 'sentence' && q.group_slug === 'yoyaku');
  assert.strictEqual(annaiQuizzes.length, 4);
  assert.ok(annaiQuizzes.every((q) => q.objective === 'sentence_discourse_mcq'));
  assert.ok(annaiQuizzes.every((q) => q.sentence === annai.sentence));
  const annaiDue = annaiQuizzes.filter((q) => Schedule.dueStages({
    objective: q.objective,
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
  }).length);
  assert.strictEqual(annaiDue.length, 4);
  assert.ok(annaiDue.every((q) => q.objective === 'sentence_discourse_mcq'));
});

test('a lower passages cursor does not wipe a further legacy sentences cursor', function () {
  store[Progress.KEY] = JSON.stringify({
    quizzes: {},
    chunks: {},
    passages: { ebi: { stageIndex: 1, lastCompletedAt: '2026-10-01T00:00:00.000Z' } },
    sentences: { ebi: { stageIndex: 6, lastCompletedAt: '2026-10-08T00:00:00.000Z' } },
  });
  assert.strictEqual(Progress.getPassage('ebi').stageIndex, 6);
  assert.strictEqual(readProgress().sentences.ebi.stageIndex, 6);
});

test('sentence spacing follows chunk waits; passage stays on 1 day', function () {
  const now = Date.parse('2026-11-10T04:30:00+08:00');
  assert.strictEqual(Schedule.chunkWaitAfterStage(0), Schedule.HOUR_MS);
  assert.strictEqual(Schedule.chunkWaitAfterStage(1), 3 * Schedule.HOUR_MS);
  assert.strictEqual(Schedule.chunkWaitAfterStage(2), Schedule.DAY_MS);
  assert.strictEqual(Schedule.chunkWaitAfterStage(3), 1.5 * Schedule.DAY_MS);
  assert.strictEqual(Schedule.chunkWaitAfterStage(4), 2.25 * Schedule.DAY_MS);
  assert.strictEqual(Schedule.chunkWaitAfterStage(5), 2.25 * 1.5 * Schedule.DAY_MS);
  function at(stageIndex, ageMs) {
    return {
      stageIndex: stageIndex,
      lastCompletedAt: new Date(now - ageMs).toISOString(),
    };
  }
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(1, 30 * 60 * 1000), now), false);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(1, Schedule.HOUR_MS), now), true);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(2, Schedule.HOUR_MS), now), false);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(2, 3 * Schedule.HOUR_MS), now), true);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(3, Schedule.HOUR_MS), now), false);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(3, Schedule.DAY_MS), now), true);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(4, Schedule.DAY_MS), now), false);
  assert.strictEqual(Schedule.isSentenceUnitStageReady(at(4, 1.5 * Schedule.DAY_MS), now), true);
  assert.strictEqual(Schedule.isPassageStageReady(at(1, Schedule.HOUR_MS), now), false);
  assert.strictEqual(Schedule.isPassageStageReady(at(1, Schedule.DAY_MS), now), true);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: at(1, 30 * 60 * 1000),
    completedStages: [],
    now: now,
  }), []);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: at(1, Schedule.HOUR_MS),
    completedStages: [],
    now: now,
  }), ['T02']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'whole_sentence_listening',
    kind: 'passage',
    schedule: schedule,
    passageState: at(1, Schedule.HOUR_MS),
    completedStages: [],
    now: now,
  }), []);
});

test('sentence layer stays closed while any Keep chunk is still in dense', function () {
  const now = Date.parse('2026-11-10T04:30:00+08:00');
  const fresh = { stageIndex: 0, lastCompletedAt: null };
  const chunks = [
    { id: 1, text: 'keep' },
    { id: 2, text: 'skip', skip: true },
    { id: 3, text: 'reuse', already_introduced: true },
  ];
  const sentence = { id: 's1', chunk_ids: [1, 2, 3] };
  const getFresh = function () { return fresh; };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(sentence, chunks, getFresh, now), false);
  assert.strictEqual(Schedule.chunkHasLeftDense(chunks[1], fresh, now), true);
  assert.strictEqual(Schedule.chunkHasLeftDense(chunks[2], fresh, now), true);
  assert.strictEqual(Schedule.chunkHasLeftDense({ id: 9, shared_with_prior_group: 'other' }, fresh, now), true);
  assert.strictEqual(
    Schedule.chunkHasLeftDense(chunks[0], { stageIndex: 2, lastCompletedAt: new Date(now).toISOString() }, now),
    false
  );
  assert.strictEqual(
    Schedule.chunkHasLeftDense(chunks[0], { stageIndex: 3, lastCompletedAt: new Date(now).toISOString() }, now),
    false
  );
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
    underChunksLeftDense: false,
  }), []);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_discourse_mcq',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: fresh,
    completedStages: [],
    now: now,
    underChunkGate: { sentence: sentence, chunks: chunks, getChunkState: getFresh },
  }), []);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'whole_sentence_listening',
    kind: 'passage',
    schedule: schedule,
    passageState: { stageIndex: 2, lastCompletedAt: '2020-01-01T00:00:00.000Z' },
    completedStages: [],
    now: now,
    underChunkGate: { sentence: sentence, chunks: chunks, getChunkState: getFresh },
  }), ['T+3']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'loci_description_tap',
    kind: 'chunk',
    schedule: schedule,
    chunkState: fresh,
    completedStages: [],
    now: now,
    admitted: true,
    underChunkGate: { sentence: sentence, chunks: chunks, getChunkState: getFresh },
  }), ['T01']);
  const bothKeep = { id: 's2', chunk_ids: [1, 4] };
  const mixed = chunks.concat([{ id: 4, text: 'other' }]);
  const oneLeft = function (id) {
    if (id === 1) return { stageIndex: 4, lastCompletedAt: null };
    return { stageIndex: 1, lastCompletedAt: null };
  };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(bothKeep, mixed, oneLeft, now), false);
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense({ id: 'empty', chunk_ids: [] }, chunks, getFresh, now), true);
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(null, chunks, getFresh, now), false);
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense({ id: 'missing', chunk_ids: [99] }, chunks, getFresh, now), false);
});

test('sentence layer admits after every Keep chunk has left dense', function () {
  const now = Date.parse('2026-11-10T04:30:00+08:00');
  const group = groups.groups.find((g) => g.slug === 'koshitsu-yoyaku');
  const s1 = group.sentences.find((s) => s.id === 's1');
  const s2 = group.sentences.find((s) => s.id === 's2');
  assert.deepStrictEqual(s1.chunk_ids, [1, 2, 3]);
  const fresh = function () { return { stageIndex: 0, lastCompletedAt: null }; };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(s1, group.chunks, fresh, now), false);
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(s2, group.chunks, fresh, now), true);
  const justFinishedDense = function (id) {
    if (id === 1) return { stageIndex: 3, lastCompletedAt: new Date(now).toISOString() };
    return fresh();
  };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(s1, group.chunks, justFinishedDense, now), false);
  const unlocked = function (id) {
    if (id === 1) {
      return { stageIndex: 3, lastCompletedAt: new Date(now - Schedule.DAY_MS).toISOString() };
    }
    return fresh();
  };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(s1, group.chunks, unlocked, now), true);
  const pastT1 = function (id) {
    if (id === 1) return { stageIndex: 4, lastCompletedAt: null };
    return fresh();
  };
  assert.strictEqual(Schedule.sentenceKeepChunksLeftDense(s1, group.chunks, pastT1, now), true);
  const unit = { stageIndex: 0, lastCompletedAt: null };
  ['sentence_listen_to_l1', 'sentence_l1_palace_multi_tap', 'sentence_shadowing_125', 'sentence_shadowing_075', 'sentence_discourse_mcq', 'sentence_example_sentences_listening'].forEach(function (objective) {
    assert.deepStrictEqual(Schedule.dueStages({
      objective: objective,
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: unit,
      completedStages: [],
      now: now,
      underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: fresh },
    }), [], objective);
    assert.deepStrictEqual(Schedule.dueStages({
      objective: objective,
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: unit,
      completedStages: [],
      now: now,
      underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: unlocked },
    }), ['T01'], objective);
  });
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_segment_shadowing',
    kind: 'passage',
    schedule: schedule,
    passageState: unit,
    completedStages: [],
    now: now,
    underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: fresh },
  }), ['T+1']);
  Progress.resetAll();
  const blockedSchedule = {
    passage_schedule: { whole_sentence_listening: ['T+1'] },
    sentence_schedule: { sentence_listen_to_l1: ['T30'] },
  };
  Schedule.fastForwardVacuousSentenceUnits({
    schedule: blockedSchedule,
    quizzes: [],
    sentences: [{ id: 's1', chunk_ids: [1] }],
    now: now,
    getState: function (id) { return Progress.getSentenceUnit('gate', id); },
    advance: function (id) { return Progress.advanceSentenceUnit('gate', id, new Date(now).toISOString()); },
    keepChunksLeftDense: function () { return false; },
  });
  assert.ok(!Progress.loadAll().sentenceUnits['gate:s1']);
  Schedule.fastForwardVacuousSentenceUnits({
    schedule: blockedSchedule,
    quizzes: [],
    sentences: [{ id: 's1', chunk_ids: [1] }],
    now: now,
    getState: function (id) { return Progress.getSentenceUnit('gate', id); },
    advance: function (id) { return Progress.advanceSentenceUnit('gate', id, new Date(now).toISOString()); },
    keepChunksLeftDense: function () { return true; },
  });
  assert.strictEqual(Progress.getSentenceUnit('gate', 's1').stageIndex, 1);
});

if (failed.length) {
  console.error(failed.length + ' failed');
  process.exit(1);
}
console.log('all passage-sentence tests passed');
