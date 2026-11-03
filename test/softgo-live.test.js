/**
 * Live Soft GO Q20–Q24: manifest rows, sentences[], chunk-boundary-wins, Q24 L1.
 *   node test/softgo-live.test.js
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

installLocalStorage();
const Schedule = require(path.join(root, 'js/schedule.js'));
const Progress = require(path.join(root, 'js/progress.js'));

const schedule = JSON.parse(fs.readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(root, 'data/groups.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));

const SENTENCE_OBJECTIVES = [
  'sentence_listen_to_l1',
  'sentence_l1_palace_multi_tap',
  'sentence_shadowing_125',
  'sentence_shadowing_075',
  'sentence_discourse_mcq',
];
const KANA = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;
const DAY = 24 * 60 * 60 * 1000;

const EXPECTED_SENTENCES = {
  'aragoshi-mikanshu': 7,
  gochumon: 1,
  'gochumon-kakunin': 2,
  'pepsi-zero-size': 2,
  'amai-chashu': 1,
  'demo-bakuto': 1,
  'chashu-shittori': 1,
  'mitame-irotsuya': 1,
  'goraitei-arigatou': 1,
  yoyaku: 4,
  '2jikan-food75': 2,
  'oryouri-last-order': 4,
  'chumon-ii-desuka': 3,
  'yokattara-onomi': 4,
  'hamo-nanban': 3,
  'tsukete-itadaku': 3,
  'ioshio-ganen': 2,
  'ebi-sumiso': 2,
  'aka-konnyaku': 2,
  'kaikei-onegai': 7,
  'yoyaku-shitenai': 3,
  'orenji-jusu': 5,
};

function isSkip(chunk) {
  return !!(chunk && (chunk.skip === true || chunk.skipped === true));
}

function covers(text, start, chunkText, activeTexts) {
  let from = start;
  while (from <= text.length) {
    const j = text.indexOf(chunkText, from);
    if (j < 0) return -1;
    let bisect = false;
    for (const longer of activeTexts) {
      if (longer.length <= chunkText.length) continue;
      if (!longer.includes(chunkText)) continue;
      const minS = Math.max(0, j - (longer.length - chunkText.length));
      for (let s = minS; s <= j; s++) {
        if (!text.startsWith(longer, s)) continue;
        if (
          s <= j &&
          j + chunkText.length <= s + longer.length &&
          (s < j || j + chunkText.length < s + longer.length)
        ) {
          bisect = true;
        }
      }
    }
    if (!bisect) return j;
    from = j + 1;
  }
  return -1;
}

function groupBySlug(slug) {
  return groups.groups.find((g) => g.slug === slug);
}

test('every group has the Soft GO sentence count and chunk-boundary-wins holds', function () {
  assert.strictEqual(groups.groups.length, Object.keys(EXPECTED_SENTENCES).length);
  const passages = groups.groups.map((g) => g.sentence);
  assert.strictEqual(new Set(passages).size, passages.length);
  groups.groups.forEach((group) => {
    assert.strictEqual(group.sentences.length, EXPECTED_SENTENCES[group.slug], group.slug);
    assert.ok(group.sentences_note && group.sentences_note.indexOf('chunk-boundary-wins') !== -1, group.slug);
    const active = (group.chunks || []).filter((c) => !isSkip(c));
    const activeTexts = active.map((c) => c.text);
    const flat = [];
    group.sentences.forEach((sentence, i) => {
      assert.strictEqual(sentence.id, 's' + (i + 1), group.slug);
      assert.ok(sentence.text, group.slug + ' ' + sentence.id);
      assert.ok(Array.isArray(sentence.chunk_ids), sentence.id);
      if (sentence.l1 != null) assert.strictEqual(typeof sentence.l1, 'string');
      let pos = 0;
      sentence.chunk_ids.forEach((id) => {
        const chunk = active.find((c) => c.id === id);
        assert.ok(chunk, group.slug + ' missing active chunk ' + id);
        const j = covers(sentence.text, pos, chunk.text, activeTexts);
        assert.ok(j >= 0, group.slug + ' ' + sentence.id + ' bisect or missing ' + chunk.text);
        pos = j + chunk.text.length;
        flat.push(id);
      });
    });
    assert.deepStrictEqual(flat, active.map((c) => c.id), group.slug);
  });
});

test('yokattara-onomi keeps the passage space; Soft GO s1 does not', function () {
  const group = groupBySlug('yokattara-onomi');
  assert.ok(group.sentence.includes('方 、'));
  assert.ok(group.sentences[0].text.includes('方、'));
  assert.ok(!group.sentences[0].text.includes('方 、'));
  assert.ok(group.sentences[3].text.endsWith('。'));
  assert.ok(!group.sentence.endsWith('。'));
  assert.ok(group.sentences_note.indexOf('onomimono-otoshi') !== -1);
});

test('manifest sentence quizzes parse, match sentences[], and Q24 choices have no kana', function () {
  const sentences = manifest.quizzes.filter((q) => q.kind === 'sentence');
  assert.strictEqual(sentences.length, 273);
  const counts = {};
  const byGroup = {};
  sentences.forEach((row) => {
    assert.ok(SENTENCE_OBJECTIVES.indexOf(row.objective) !== -1, row.quiz_id);
    assert.strictEqual(row.shell, false, row.quiz_id);
    assert.strictEqual(row.level, null, row.quiz_id);
    assert.strictEqual(row.chunk_id, null, row.quiz_id);
    assert.strictEqual(row.file, 'data/quizzes/' + row.quiz_id + '.json');
    const group = groupBySlug(row.group_slug);
    assert.ok(group, row.quiz_id);
    assert.strictEqual(row.sentence, group.sentence, row.quiz_id);
    const unit = group.sentences.find((s) => s.id === row.sentence_id);
    assert.ok(unit, row.group_slug + ' ' + row.sentence_id);
    const quiz = JSON.parse(fs.readFileSync(path.join(root, row.file), 'utf8'));
    assert.strictEqual(quiz.quiz_id, row.quiz_id);
    assert.strictEqual(quiz.objective, row.objective);
    assert.strictEqual(quiz.kind, 'sentence');
    assert.strictEqual(quiz.sentence, unit.text, row.quiz_id);
    assert.strictEqual('s' + quiz.sentence_index, row.sentence_id);
    counts[row.objective] = (counts[row.objective] || 0) + 1;
    byGroup[row.group_slug] = byGroup[row.group_slug] || [];
    byGroup[row.group_slug].push(row);
    if (row.objective === 'sentence_discourse_mcq') {
      const selects = (quiz.slides || []).filter((s) => s.type === 'select_text');
      assert.strictEqual(selects.length, 1, row.quiz_id);
      const choices = [selects[0].correct].concat(selects[0].distractors || []);
      assert.ok(choices.length >= 2, row.quiz_id);
      choices.forEach((choice) => {
        assert.strictEqual(typeof choice, 'string', row.quiz_id);
        assert.ok(choice.length > 0, row.quiz_id);
        assert.ok(!KANA.test(choice), row.quiz_id + ' ' + choice);
      });
    }
  });
  assert.deepStrictEqual(counts, {
    sentence_listen_to_l1: 53,
    sentence_l1_palace_multi_tap: 53,
    sentence_shadowing_125: 53,
    sentence_shadowing_075: 53,
    sentence_discourse_mcq: 61,
  });
  groups.groups.forEach((group) => {
    const rows = byGroup[group.slug] || [];
    group.sentences.forEach((sentence) => {
      assert.ok(
        rows.some((row) => row.sentence_id === sentence.id),
        group.slug + ' ' + sentence.id
      );
    });
  });
  const yoyaku = byGroup.yoyaku;
  assert.strictEqual(yoyaku.length, 4);
  assert.ok(yoyaku.every((row) => row.objective === 'sentence_discourse_mcq'));
  assert.ok(!fs.existsSync(path.join(root, 'data/quizzes/sentence-shell-smoke-yoyaku-shitenai-s1-v1.json')));
});

test('fresh full-suite units due Q20; empty stages step once per day until Q24', function () {
  const now0 = Date.parse('2026-11-03T00:00:00.000Z');
  const fresh = { stageIndex: 0, lastCompletedAt: null };
  const orenji = groupBySlug('orenji-jusu');
  const orenjiQuizzes = manifest.quizzes.filter(
    (q) => q.kind === 'sentence' && q.group_slug === 'orenji-jusu' && q.sentence_id === 's1'
  );
  assert.strictEqual(
    Schedule.vacuousSentenceAdvanceCount({
      schedule: schedule,
      quizzes: orenjiQuizzes,
      sentenceId: 's1',
      state: fresh,
      now: now0,
    }),
    0
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_listen_to_l1',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: fresh,
      completedStages: [],
      now: now0,
    }),
    ['T+1']
  );
  Progress.resetAll();
  Schedule.fastForwardVacuousSentenceUnits({
    schedule: schedule,
    quizzes: manifest.quizzes.filter((q) => q.group_slug === 'orenji-jusu'),
    sentences: orenji.sentences,
    now: now0,
    getState: (id) => Progress.getSentenceUnit('orenji-jusu', id),
    advance: (id) => Progress.advanceSentenceUnit('orenji-jusu', id, new Date(now0).toISOString()),
  });
  assert.ok(!Progress.loadAll().sentenceUnits['orenji-jusu:s1']);

  Progress.resetAll();
  const annai = groupBySlug('yoyaku');
  const annaiQuizzes = manifest.quizzes.filter((q) => q.kind === 'sentence' && q.group_slug === 'yoyaku');
  assert.strictEqual(
    Schedule.vacuousSentenceAdvanceCount({
      schedule: schedule,
      quizzes: annaiQuizzes,
      sentenceId: 's1',
      state: fresh,
      now: now0,
    }),
    1
  );
  let now = now0;
  function tick() {
    Schedule.fastForwardVacuousSentenceUnits({
      schedule: schedule,
      quizzes: annaiQuizzes,
      sentences: annai.sentences,
      now: now,
      getState: (id) => Progress.getSentenceUnit('yoyaku', id),
      advance: (id) => Progress.advanceSentenceUnit('yoyaku', id, new Date(now).toISOString()),
    });
  }
  tick();
  assert.strictEqual(Progress.getSentenceUnit('yoyaku', 's1').stageIndex, 1);
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: Progress.getSentenceUnit('yoyaku', 's1'),
      completedStages: [],
      now: now,
    }),
    []
  );
  for (let i = 0; i < 3; i++) {
    now += DAY;
    tick();
  }
  assert.strictEqual(Progress.getSentenceUnit('yoyaku', 's1').stageIndex, 4);
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: Progress.getSentenceUnit('yoyaku', 's1'),
      completedStages: [],
      now: now,
    }),
    []
  );
  now += DAY;
  tick();
  const atQ24 = Progress.getSentenceUnit('yoyaku', 's1');
  assert.strictEqual(atQ24.stageIndex, 4);
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: atQ24,
      completedStages: [],
      now: now,
    }),
    ['T+5']
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_listen_to_l1',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: atQ24,
      completedStages: [],
      now: now,
    }),
    []
  );
});

test('practice page and homepage fast-forward empty sentence stages', function () {
  const groupJs = fs.readFileSync(path.join(root, 'js/group.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const fixtureAt = groupJs.indexOf('if (!fixtureMode)');
  assert.ok(fixtureAt !== -1);
  assert.ok(groupJs.slice(fixtureAt, fixtureAt + 500).indexOf('fastForwardVacuousSentenceUnits') !== -1);
  assert.ok(appJs.indexOf('fastForwardVacuousSentenceUnits') !== -1);
});

if (failed.length) {
  console.error(failed.length + ' failed');
  process.exit(1);
}
console.log('all softgo-live tests passed');
