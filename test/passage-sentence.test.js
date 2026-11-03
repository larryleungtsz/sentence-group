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

const SENTENCE_SCHEDULE = {
  sentence_listen_to_l1: ['T+1', 'T+6', 'T+11', 'T+16', 'T+21', 'T+26'],
  sentence_l1_palace_multi_tap: ['T+2', 'T+7', 'T+12', 'T+17', 'T+22', 'T+27'],
  sentence_shadowing_125: ['T+3', 'T+8', 'T+13', 'T+18', 'T+23', 'T+28'],
  sentence_shadowing_075: ['T+4', 'T+9', 'T+14', 'T+19', 'T+24', 'T+29'],
  sentence_discourse_mcq: ['T+5', 'T+10', 'T+15', 'T+20', 'T+25', 'T+30'],
};

test('shipped schedule keeps passage objectives and Q20–Q24 on the sentence layer', function () {
  assert.deepStrictEqual(Object.keys(schedule.passage_schedule).sort(), PASSAGE_OBJECTIVES.slice().sort());
  assert.deepStrictEqual(schedule.sentence_schedule, SENTENCE_SCHEDULE);
  PASSAGE_OBJECTIVES.forEach(function (key) {
    assert.ok(!schedule.sentence_schedule[key], key);
  });
  Object.keys(SENTENCE_SCHEDULE).forEach(function (key) {
    assert.ok(!schedule.passage_schedule[key], key);
    assert.strictEqual(
      manifest.quizzes.some(function (q) { return q.objective === key; }),
      false,
      key
    );
  });
  assert.deepStrictEqual(
    Schedule.passageScheduleTable(schedule),
    schedule.passage_schedule
  );
  assert.deepStrictEqual(Schedule.sentenceScheduleTable(schedule), SENTENCE_SCHEDULE);
  const labels = Schedule.sentenceUnitStageLabels(schedule);
  assert.strictEqual(labels[0], 'T+1');
  assert.strictEqual(labels[labels.length - 1], 'T+30');
  assert.strictEqual(labels.length, 30);
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
  }), ['T+1']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_l1_palace_multi_tap',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: later,
    completedStages: [],
    now: now,
  }), ['T+2']);
  assert.deepStrictEqual(Schedule.dueStages({
    objective: 'sentence_listen_to_l1',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: later,
    completedStages: [],
    now: now,
  }), []);
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

test('manifest passage kinds keep objectives; only the smoke quiz is kind sentence', function () {
  const passages = manifest.quizzes.filter((q) => q.kind === 'passage');
  const sentences = manifest.quizzes.filter((q) => q.kind === 'sentence');
  assert.strictEqual(passages.length, 704);
  passages.forEach((q) => {
    assert.ok(PASSAGE_OBJECTIVES.indexOf(q.objective) !== -1, q.quiz_id);
    assert.ok(q.chunk_id == null, q.quiz_id);
  });
  assert.strictEqual(sentences.length, 1);
  const smoke = sentences[0];
  assert.strictEqual(smoke.quiz_id, 'sentence-shell-smoke-yoyaku-shitenai-s1-v1');
  assert.strictEqual(smoke.objective, 'sentence_shell_smoke');
  assert.strictEqual(smoke.sentence_id, 's1');
  assert.strictEqual(smoke.group_slug, 'yoyaku-shitenai');
  const file = JSON.parse(fs.readFileSync(path.join(root, smoke.file), 'utf8'));
  assert.strictEqual(file.quiz_id, smoke.quiz_id);
  assert.strictEqual(file.sentence_id, 's1');
  assert.ok(!file.slides.some((slide) => slide.audio));
});

test('yoyaku-shitenai sentences[] obey chunk-boundary-wins; other groups stay flat', function () {
  const withSentences = groups.groups.filter((g) => Array.isArray(g.sentences) && g.sentences.length);
  assert.deepStrictEqual(withSentences.map((g) => g.slug), ['yoyaku-shitenai']);
  const group = withSentences[0];
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

test('smoke fixture is attached to yoyaku-shitenai and is not due; other groups have no sentence quizzes', function () {
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const fresh = { stageIndex: 0, lastCompletedAt: null };
  groups.groups.forEach((group) => {
    const ids = new Set((group.sentences || []).map((s) => s && s.id).filter((id) => id != null && id !== ''));
    const mine = manifest.quizzes.filter((q) => {
      if (q.kind === 'passage') return q.sentence === group.sentence;
      if (q.kind === 'sentence') {
        if (!ids.has(q.sentence_id)) return false;
        if (q.group_slug && q.group_slug !== group.slug) return false;
        if (q.sentence && q.sentence !== group.sentence) return false;
        return true;
      }
      return false;
    });
    const sentenceDue = mine.filter((q) => q.kind === 'sentence' && Schedule.dueStages({
      objective: q.objective,
      kind: q.kind,
      schedule: schedule,
      sentenceUnitState: fresh,
      completedStages: [],
      now: now,
      scheduleStages: q.schedule_stages || null,
    }).length);
    assert.strictEqual(sentenceDue.length, 0, group.slug);
    if (group.slug === 'yoyaku-shitenai') {
      assert.strictEqual(mine.filter((q) => q.kind === 'sentence').length, 1);
      const passageDue = mine.filter((q) => q.kind === 'passage' && Schedule.dueStages({
        objective: q.objective,
        kind: 'passage',
        schedule: schedule,
        passageState: fresh,
        completedStages: [],
        now: now,
        scheduleStages: q.schedule_stages || null,
      }).length);
      assert.ok(passageDue.length > 0);
    } else {
      assert.strictEqual(mine.filter((q) => q.kind === 'sentence').length, 0, group.slug);
    }
  });
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

if (failed.length) {
  console.error(failed.length + ' failed');
  process.exit(1);
}
console.log('all passage-sentence tests passed');
