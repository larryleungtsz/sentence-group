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
  'sentence_example_sentences_listening',
];
const KANA = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;

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
  'koshitsu-yoyaku': 6,
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
    if (group.slug === 'koshitsu-yoyaku') {
      // Practice order is append-not-insert, so chunk 17 sits early in chunks[]
      // and in spoken sentence s5. Every Keep chunk is still used once.
      assert.deepStrictEqual(flat, [1, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, 17, 19]);
      assert.deepStrictEqual(
        flat.slice().sort((a, b) => a - b),
        active.map((c) => c.id).slice().sort((a, b) => a - b)
      );
    } else {
      assert.deepStrictEqual(flat, active.map((c) => c.id), group.slug);
    }
  });
});

test('koshitsu-yoyaku has Soft GO Q22/Q23 sentences; chunks 1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, and 19 are due at T01', function () {
  const group = groupBySlug('koshitsu-yoyaku');
  assert.ok(group);
  assert.strictEqual(group.sentence_quizzes_ready, true);
  assert.strictEqual(group.sentences.length, 6);
  assert.deepStrictEqual(
    group.sentences.map((sentence) => sentence.text),
    [
      'えっと、個室って、まだ空いてますかね？',
      '個室は、もう空かないですねー。',
      'わかりました。じゃあ、テーブル席でお願いします。',
      'はい、お席ご案内可能ですよ。',
      '2時間半飲み放題付きプランでお願いします。',
      'かしこまりました。',
    ]
  );
  assert.deepStrictEqual(
    group.sentences.map((sentence) => sentence.chunk_ids),
    [[1, 2, 3], [5, 6, 7], [8, 10], [14], [15, 16, 17], [19]]
  );
  assert.strictEqual(group.sentences.map((sentence) => sentence.text).join(''), group.sentence);
  assert.ok(group.sentences_note.indexOf('chunk-boundary-wins') !== -1);
  assert.ok(group.sentences_note.indexOf('Q22') !== -1);
  assert.ok(group.sentence_added_at_note.indexOf('Q22') !== -1);
  assert.ok(group.sentence_added_at_note.indexOf('Q23') !== -1);
  assert.deepStrictEqual(group.chunks.map((c) => c.id), [1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, 19]);
  assert.ok(group.chunk_order_note.indexOf('Append-not-insert') !== -1);
  assert.ok(group.chunk_order_note.indexOf('[1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, 19]') !== -1);
  assert.ok(group.chunk_order_note.indexOf('DENSE-wait') === -1);
  assert.ok(group.chunk_order_note.indexOf('admits 1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, and 19 at T01') !== -1);
  assert.strictEqual(group.chunks[0].id, 1);
  assert.strictEqual(group.chunks[0].text, 'えっと');
  assert.strictEqual(group.chunks[0].quizzes_ready, true);
  assert.notStrictEqual(group.chunks[0].skip, true);
  assert.notStrictEqual(group.chunks[0].already_introduced, true);
  assert.strictEqual(group.chunks[1].id, 17);
  assert.strictEqual(group.chunks[1].text, 'プランで');
  assert.strictEqual(group.chunks[1].quizzes_ready, true);
  assert.strictEqual(group.chunks[1].already_introduced, true);
  assert.notStrictEqual(group.chunks[1].skip, true);
  assert.strictEqual(group.chunks[2].id, 2);
  assert.strictEqual(group.chunks[2].text, '個室って');
  assert.strictEqual(group.chunks[2].quizzes_ready, true);
  assert.notStrictEqual(group.chunks[2].skip, true);
  assert.strictEqual(group.chunks[2].already_introduced, true);
  assert.ok(group.chunks[2].already_introduced_note.indexOf('2026-11-09') !== -1);
  assert.strictEqual(group.chunks[3].id, 3);
  assert.strictEqual(group.chunks[3].text, 'まだ');
  assert.strictEqual(group.chunks[3].quizzes_ready, true);
  assert.notStrictEqual(group.chunks[3].skip, true);
  assert.notStrictEqual(group.chunks[3].skipped, true);
  assert.strictEqual(group.chunks[3].already_introduced, true);
  assert.ok(group.chunks[3].already_introduced_note.indexOf('2026-11-09') !== -1);
  assert.ok(group.chunks[3].already_introduced_note.indexOf('sounding-koshitsu-yoyaku-3-v1') !== -1);
  assert.ok(!Object.prototype.hasOwnProperty.call(group.chunks[3], 'shared_with_prior_group'));
  assert.strictEqual(group.chunks[4].id, 5);
  assert.strictEqual(group.chunks[4].text, '個室は');
  assert.strictEqual(group.chunks[4].quizzes_ready, true);
  assert.notStrictEqual(group.chunks[4].skip, true);
  assert.notStrictEqual(group.chunks[4].skipped, true);
  assert.strictEqual(group.chunks[4].already_introduced, true);
  assert.ok(group.chunks[4].already_introduced_note.indexOf('2026-11-09') !== -1);
  assert.ok(group.chunks[4].already_introduced_note.indexOf('sounding-koshitsu-yoyaku-5-v1') !== -1);
  assert.ok(!Object.prototype.hasOwnProperty.call(group.chunks[4], 'shared_with_prior_group'));
  assert.strictEqual(group.chunks[5].id, 6);
  assert.strictEqual(group.chunks[5].text, 'もう');
  assert.strictEqual(group.chunks[5].quizzes_ready, true);
  assert.notStrictEqual(group.chunks[5].skip, true);
  assert.notStrictEqual(group.chunks[5].skipped, true);
  assert.strictEqual(group.chunks[5].already_introduced, true);
  assert.ok(group.chunks[5].already_introduced_note.indexOf('2026-11-09') !== -1);
  assert.ok(group.chunks[5].already_introduced_note.indexOf('sounding-koshitsu-yoyaku-6-v1') !== -1);
  assert.ok(!Object.prototype.hasOwnProperty.call(group.chunks[5], 'shared_with_prior_group'));
  const expected = [
    {
      quiz_id: 'sounding-koshitsu-yoyaku-1-v1',
      chunk_id: 1,
      audio: 'data/audio/clips/koshitsu-yoyaku-1.wav',
    },
    {
      quiz_id: 'sounding-koshitsu-yoyaku-17-v1',
      chunk_id: 17,
      audio: 'data/audio/clips/koshitsu-yoyaku-17.wav',
    },
  ];
  expected.forEach(function (item) {
    const row = manifest.quizzes.find((q) => q.quiz_id === item.quiz_id);
    assert.ok(row, item.quiz_id);
    assert.strictEqual(row.file, 'data/quizzes/' + item.quiz_id + '.json');
    assert.strictEqual(row.objective, 'pronunciation_sounding_select');
    assert.strictEqual(row.kind, 'chunk');
    assert.strictEqual(row.level, 1);
    assert.strictEqual(row.chunk_id, item.chunk_id);
    assert.strictEqual(row.sentence, group.sentence);
    const quiz = JSON.parse(fs.readFileSync(path.join(root, row.file), 'utf8'));
    assert.strictEqual(quiz.quiz_id, row.quiz_id);
    assert.strictEqual(quiz.sentence, group.sentence);
    assert.strictEqual(quiz.chunk.id, item.chunk_id);
    assert.strictEqual(quiz.chunk.text, group.chunks.find((c) => c.id === item.chunk_id).text);
    const audio = quiz.slides.find((slide) => slide.type === 'audio_chunk');
    assert.ok(audio, item.quiz_id);
    assert.strictEqual(audio.audio, item.audio);
    assert.strictEqual(audio.instruction, '請聽這個詞。');
    assert.strictEqual(audio.rate, 1.0);
    assert.ok(audio.start_sec == null, item.quiz_id);
    assert.ok(audio.end_sec == null, item.quiz_id);
    assert.ok(fs.existsSync(path.join(root, item.audio)), item.audio);
  });
  const quiz17 = JSON.parse(
    fs.readFileSync(path.join(root, 'data/quizzes/sounding-koshitsu-yoyaku-17-v1.json'), 'utf8')
  );
  assert.ok(quiz17.slides[2].instruction.includes('【潑】爛地\u3000選出'));
  const now = Date.parse('2026-11-09T01:43:00+08:00');
  const admitted = Schedule.admittedChunkIds(
    group.chunks,
    function () { return Schedule.defaultChunkState(); },
    now
  );
  assert.deepStrictEqual(Array.from(admitted), [1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, 19]);
  const chunk2QuizId = 'sounding-koshitsu-yoyaku-2-v1';
  const chunk2Rows = manifest.quizzes.filter((q) => q.quiz_id === chunk2QuizId);
  assert.strictEqual(chunk2Rows.length, 1);
  const chunk2Row = chunk2Rows[0];
  assert.strictEqual(chunk2Row.file, 'data/quizzes/' + chunk2QuizId + '.json');
  assert.strictEqual(chunk2Row.objective, 'pronunciation_sounding_select');
  assert.strictEqual(chunk2Row.kind, 'chunk');
  assert.strictEqual(chunk2Row.level, 1);
  assert.strictEqual(chunk2Row.chunk_id, 2);
  assert.strictEqual(chunk2Row.sentence, group.sentence);
  assert.ok(!Object.prototype.hasOwnProperty.call(chunk2Row, 'schedule_stages'));
  const quiz2 = JSON.parse(fs.readFileSync(path.join(root, chunk2Row.file), 'utf8'));
  assert.strictEqual(quiz2.quiz_id, chunk2QuizId);
  assert.strictEqual(quiz2.sentence, group.sentence);
  assert.strictEqual(quiz2.chunk.id, 2);
  assert.strictEqual(quiz2.chunk.text, '個室って');
  const audio2 = quiz2.slides.find((slide) => slide.type === 'audio_chunk');
  assert.ok(audio2);
  assert.strictEqual(audio2.audio, 'data/audio/clips/koshitsu-yoyaku-2.wav');
  assert.strictEqual(audio2.rate, 1.0);
  assert.ok(!Object.prototype.hasOwnProperty.call(audio2, 'start_sec'));
  assert.ok(!Object.prototype.hasOwnProperty.call(audio2, 'end_sec'));
  const wav2 = fs.readFileSync(path.join(root, audio2.audio));
  assert.strictEqual(wav2.length, 96216);
  assert.strictEqual(
    require('crypto').createHash('sha256').update(wav2).digest('hex'),
    '72aa2e37082743391edcecad74527f9c73817f4ee4961aeb71592b4b9c8450e7'
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: chunk2Row.objective,
      kind: chunk2Row.kind,
      schedule: schedule,
      chunkState: Schedule.defaultChunkState(),
      completedStages: [],
      now: now,
      admitted: admitted.has(2),
      skipped: false,
    }),
    ['T01']
  );
  expected.forEach(function (item) {
    const row = manifest.quizzes.find((q) => q.quiz_id === item.quiz_id);
    assert.deepStrictEqual(
      Schedule.dueStages({
        objective: row.objective,
        kind: row.kind,
        schedule: schedule,
        chunkState: Schedule.defaultChunkState(),
        completedStages: [],
        now: now,
        admitted: admitted.has(row.chunk_id),
        skipped: false,
      }),
      ['T01']
    );
  });
  const chunk3QuizId = 'sounding-koshitsu-yoyaku-3-v1';
  const chunk3Rows = manifest.quizzes.filter((q) => q.quiz_id === chunk3QuizId);
  assert.strictEqual(chunk3Rows.length, 1);
  const chunk3Row = chunk3Rows[0];
  assert.strictEqual(chunk3Row.file, 'data/quizzes/' + chunk3QuizId + '.json');
  assert.strictEqual(chunk3Row.objective, 'pronunciation_sounding_select');
  assert.strictEqual(chunk3Row.kind, 'chunk');
  assert.strictEqual(chunk3Row.level, 1);
  assert.strictEqual(chunk3Row.chunk_id, 3);
  assert.strictEqual(chunk3Row.sentence, group.sentence);
  assert.ok(!Object.prototype.hasOwnProperty.call(chunk3Row, 'schedule_stages'));
  const quiz3 = JSON.parse(fs.readFileSync(path.join(root, chunk3Row.file), 'utf8'));
  assert.strictEqual(quiz3.quiz_id, chunk3QuizId);
  assert.strictEqual(quiz3.sentence, group.sentence);
  assert.strictEqual(quiz3.chunk.id, 3);
  assert.strictEqual(quiz3.chunk.text, 'まだ');
  const audio3 = quiz3.slides.find((slide) => slide.type === 'audio_chunk');
  assert.ok(audio3);
  assert.strictEqual(audio3.audio, 'data/audio/clips/koshitsu-yoyaku-3.wav');
  assert.strictEqual(audio3.rate, 1.0);
  assert.ok(!Object.prototype.hasOwnProperty.call(audio3, 'start_sec'));
  assert.ok(!Object.prototype.hasOwnProperty.call(audio3, 'end_sec'));
  const wav3 = fs.readFileSync(path.join(root, audio3.audio));
  assert.strictEqual(wav3.length, 34918);
  assert.strictEqual(
    require('crypto').createHash('sha256').update(wav3).digest('hex'),
    '5183e0736e6eded2d9de2f2911aa437eb0e032b94451aea5ba09ccf212046eff'
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: chunk3Row.objective,
      kind: chunk3Row.kind,
      schedule: schedule,
      chunkState: Schedule.defaultChunkState(),
      completedStages: [],
      now: now,
      admitted: admitted.has(3),
      skipped: false,
    }),
    ['T01']
  );
  const chunk5QuizId = 'sounding-koshitsu-yoyaku-5-v1';
  const chunk5Rows = manifest.quizzes.filter((q) => q.quiz_id === chunk5QuizId);
  assert.strictEqual(chunk5Rows.length, 1);
  const chunk5Row = chunk5Rows[0];
  assert.strictEqual(chunk5Row.file, 'data/quizzes/' + chunk5QuizId + '.json');
  assert.strictEqual(chunk5Row.objective, 'pronunciation_sounding_select');
  assert.strictEqual(chunk5Row.kind, 'chunk');
  assert.strictEqual(chunk5Row.level, 1);
  assert.strictEqual(chunk5Row.chunk_id, 5);
  assert.strictEqual(chunk5Row.sentence, group.sentence);
  assert.ok(!Object.prototype.hasOwnProperty.call(chunk5Row, 'schedule_stages'));
  const quiz5 = JSON.parse(fs.readFileSync(path.join(root, chunk5Row.file), 'utf8'));
  assert.strictEqual(quiz5.quiz_id, chunk5QuizId);
  assert.strictEqual(quiz5.sentence, group.sentence);
  assert.strictEqual(quiz5.chunk.id, 5);
  assert.strictEqual(quiz5.chunk.text, '個室は');
  const audio5 = quiz5.slides.find((slide) => slide.type === 'audio_chunk');
  assert.ok(audio5);
  assert.strictEqual(audio5.audio, 'data/audio/clips/koshitsu-yoyaku-5.wav');
  assert.strictEqual(audio5.rate, 1.0);
  assert.ok(!Object.prototype.hasOwnProperty.call(audio5, 'start_sec'));
  assert.ok(!Object.prototype.hasOwnProperty.call(audio5, 'end_sec'));
  const wav5 = fs.readFileSync(path.join(root, audio5.audio));
  assert.strictEqual(wav5.length, 86956);
  assert.strictEqual(
    require('crypto').createHash('sha256').update(wav5).digest('hex'),
    '7765a0e89f2554eb2afb7c35e6cb72567b43f5c8b2fad05985979f86833583d8'
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: chunk5Row.objective,
      kind: chunk5Row.kind,
      schedule: schedule,
      chunkState: Schedule.defaultChunkState(),
      completedStages: [],
      now: now,
      admitted: admitted.has(5),
      skipped: false,
    }),
    ['T01']
  );
  const chunk6QuizId = 'sounding-koshitsu-yoyaku-6-v1';
  const chunk6Rows = manifest.quizzes.filter((q) => q.quiz_id === chunk6QuizId);
  assert.strictEqual(chunk6Rows.length, 1);
  const chunk6Row = chunk6Rows[0];
  assert.strictEqual(chunk6Row.file, 'data/quizzes/' + chunk6QuizId + '.json');
  assert.strictEqual(chunk6Row.objective, 'pronunciation_sounding_select');
  assert.strictEqual(chunk6Row.kind, 'chunk');
  assert.strictEqual(chunk6Row.level, 1);
  assert.strictEqual(chunk6Row.chunk_id, 6);
  assert.strictEqual(chunk6Row.sentence, group.sentence);
  assert.ok(!Object.prototype.hasOwnProperty.call(chunk6Row, 'schedule_stages'));
  const quiz6 = JSON.parse(fs.readFileSync(path.join(root, chunk6Row.file), 'utf8'));
  assert.strictEqual(quiz6.quiz_id, chunk6QuizId);
  assert.strictEqual(quiz6.sentence, group.sentence);
  assert.strictEqual(quiz6.chunk.id, 6);
  assert.strictEqual(quiz6.chunk.text, 'もう');
  assert.strictEqual(quiz6.slides[0].type, 'audio_chunk');
  assert.strictEqual(quiz6.slides[0].audio, 'data/audio/clips/koshitsu-yoyaku-6.wav');
  assert.strictEqual(quiz6.slides[0].instruction, '請聽這個詞。');
  assert.strictEqual(quiz6.slides[0].rate, 1.0);
  assert.ok(!Object.prototype.hasOwnProperty.call(quiz6.slides[0], 'start_sec'));
  assert.ok(!Object.prototype.hasOwnProperty.call(quiz6.slides[0], 'end_sec'));
  const wav6 = fs.readFileSync(path.join(root, quiz6.slides[0].audio));
  assert.strictEqual(wav6.length, 23892);
  assert.strictEqual(
    require('crypto').createHash('sha256').update(wav6).digest('hex'),
    'e9cc92c139773d4207891ffbe7ef86498b374a6413329641ca7ce0e59ad6c85a'
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: chunk6Row.objective,
      kind: chunk6Row.kind,
      schedule: schedule,
      chunkState: Schedule.defaultChunkState(),
      completedStages: [],
      now: now,
      admitted: admitted.has(6),
      skipped: false,
    }),
    ['T01']
  );
  const batch7 = [
    {
      id: 7,
      text: '空かないですねー',
      bytes: 86514,
      sha256: 'c70eb588e5f27994bf11b9c431d1461d54ec71a5ffc465da81540298d7dcf8af',
      sounding: '壓家奶desk泥',
    },
    {
      id: 8,
      text: 'わかりました',
      bytes: 74166,
      sha256: '71b591b03e0a69a4301f0d484002c4ae76466babf08a2fc9660a4aa23b4321eb',
      sounding: '挖car梨master',
    },
    {
      id: 10,
      text: 'テーブル席で',
      bytes: 52998,
      sha256: '618a55fcf743341651d4b5261129cda4c53ed8d0885b7a49724c31d92c7796e6',
      sounding: 'Telblue路錫Key爹',
    },
    {
      id: 14,
      text: 'ご案内可能ですよ',
      bytes: 108564,
      sha256: '359a5052d027bc2696e2e55bd9e79e3564c504f90136848843a2bc2deee84d8a',
      sounding: '哥按奶can蘿deskYo',
    },
    {
      id: 15,
      text: '2時間半',
      bytes: 70198,
      sha256: '3b8efcc73d28dccd0843f0e85deb33f5e18c78927b871a5af978a664ad430389',
      sounding: 'Kneel芝CANHand',
    },
    {
      id: 16,
      text: '飲み放題付き',
      bytes: 91806,
      sha256: 'aed5c4f7c4705bd077ee9e244da565ab1a2a6b6fefad57dda571879d2c290323',
      sounding: '攞米河DIe豬機',
    },
    {
      id: 19,
      text: 'かしこまりました',
      bytes: 82986,
      sha256: 'cd206f882420ac279cf6174de01ffca8ba01266679aa5e374d9be7f880507647',
      sounding: 'Class哥瑪莉MASTER',
    },
  ];
  batch7.forEach(function (item) {
    const chunk = group.chunks.find((c) => c.id === item.id);
    assert.ok(chunk, 'chunk ' + item.id);
    assert.strictEqual(chunk.text, item.text);
    assert.strictEqual(chunk.quizzes_ready, true);
    assert.notStrictEqual(chunk.skip, true);
    assert.notStrictEqual(chunk.skipped, true);
    assert.strictEqual(chunk.already_introduced, true);
    assert.ok(chunk.already_introduced_note.indexOf('2026-11-09') !== -1);
    assert.ok(chunk.already_introduced_note.indexOf('sounding-koshitsu-yoyaku-' + item.id + '-v1') !== -1);
    assert.ok(!Object.prototype.hasOwnProperty.call(chunk, 'shared_with_prior_group'));
    assert.strictEqual(admitted.has(item.id), true);
    const quizId = 'sounding-koshitsu-yoyaku-' + item.id + '-v1';
    const rows = manifest.quizzes.filter((q) => q.quiz_id === quizId);
    assert.strictEqual(rows.length, 1, quizId);
    const row = rows[0];
    assert.strictEqual(row.file, 'data/quizzes/' + quizId + '.json');
    assert.strictEqual(row.objective, 'pronunciation_sounding_select');
    assert.strictEqual(row.kind, 'chunk');
    assert.strictEqual(row.level, 1);
    assert.strictEqual(row.chunk_id, item.id);
    assert.strictEqual(row.sentence, group.sentence);
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'schedule_stages'));
    const quiz = JSON.parse(fs.readFileSync(path.join(root, row.file), 'utf8'));
    assert.strictEqual(quiz.quiz_id, quizId);
    assert.strictEqual(quiz.sentence, group.sentence);
    assert.strictEqual(quiz.chunk.id, item.id);
    assert.strictEqual(quiz.chunk.text, item.text);
    const audio = quiz.slides[0];
    assert.strictEqual(audio.type, 'audio_chunk');
    assert.strictEqual(audio.audio, 'data/audio/clips/koshitsu-yoyaku-' + item.id + '.wav');
    assert.strictEqual(audio.instruction, '請聽這個詞。');
    assert.strictEqual(audio.rate, 1.0);
    assert.ok(!Object.prototype.hasOwnProperty.call(audio, 'start_sec'));
    assert.ok(!Object.prototype.hasOwnProperty.call(audio, 'end_sec'));
    const image = quiz.slides[quiz.slides.length - 1];
    assert.strictEqual(image.type, 'select_image');
    assert.ok(image.instruction.indexOf('【' + item.sounding + '】') !== -1, quizId);
    if (item.id === 16) {
      assert.strictEqual(item.sounding.codePointAt(0), 0x651e);
    }
    const wav = fs.readFileSync(path.join(root, audio.audio));
    assert.strictEqual(wav.length, item.bytes, audio.audio);
    assert.strictEqual(
      require('crypto').createHash('sha256').update(wav).digest('hex'),
      item.sha256,
      audio.audio
    );
    assert.deepStrictEqual(
      Schedule.dueStages({
        objective: row.objective,
        kind: row.kind,
        schedule: schedule,
        chunkState: Schedule.defaultChunkState(),
        completedStages: [],
        now: now,
        admitted: admitted.has(item.id),
        skipped: false,
      }),
      ['T01']
    );
  });
});

test('Q22 and Q23 slides are audio_shadow and plan whole-sentence recording', function () {
  const QuizRunner = require(path.join(root, 'js/quiz-runner.js'));
  const quizDir = path.join(root, 'data/quizzes');
  const files = fs.readdirSync(quizDir).filter((file) => /^sentence-shadowing-(125|075)-.+-v1\.json$/.test(file));
  assert.strictEqual(files.length, 118);
  const koshitsuWindows = {
    1: [0.05, 4.07],
    2: [4.07, 7.07],
    3: [7.07, 11.08],
    4: [11.08, 13.89],
    5: [13.89, 17.49],
    6: [17.49, 18.7],
  };
  const passageAudio = 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/main/audio/sentence-koshitsu-yoyaku.mp3';
  files.forEach((file) => {
    const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, file), 'utf8'));
    const expectRate = quiz.objective === 'sentence_shadowing_125' ? 1.25 : 0.75;
    assert.ok(
      quiz.objective === 'sentence_shadowing_125' || quiz.objective === 'sentence_shadowing_075',
      quiz.quiz_id
    );
    assert.strictEqual(quiz.kind, 'sentence', quiz.quiz_id);
    assert.strictEqual(quiz.slides.length, 1, quiz.quiz_id);
    const slide = quiz.slides[0];
    assert.strictEqual(slide.type, 'audio_shadow', quiz.quiz_id);
    assert.strictEqual(slide.rate, expectRate, quiz.quiz_id);
    assert.strictEqual(typeof slide.start_sec, 'number', quiz.quiz_id);
    assert.strictEqual(typeof slide.end_sec, 'number', quiz.quiz_id);
    assert.ok(slide.end_sec > slide.start_sec, quiz.quiz_id);
    assert.strictEqual(typeof slide.audio, 'string', quiz.quiz_id);
    assert.ok(slide.audio.indexOf('http') === 0, quiz.quiz_id);
    assert.ok(!Object.prototype.hasOwnProperty.call(slide, 'self_check'), quiz.quiz_id);
    assert.ok(!Object.prototype.hasOwnProperty.call(slide, 'sentence_window_hint'), quiz.quiz_id);
    assert.ok(slide.instruction.indexOf(expectRate + '×') !== -1, quiz.quiz_id);
    const clip = { rate: slide.rate, start_sec: slide.start_sec, end_sec: slide.end_sec };
    assert.strictEqual(QuizRunner.isSegmentShadow(quiz, slide.type, clip), false, quiz.quiz_id);
    const plan = QuizRunner.shadowSlidePlan(quiz, slide.type, clip);
    assert.strictEqual(plan.segmentShadow, false, quiz.quiz_id);
    assert.strictEqual(plan.rate, expectRate, quiz.quiz_id);
    assert.strictEqual(plan.rateOptions, null, quiz.quiz_id);
    assert.deepStrictEqual(plan.record, { enabled: true, persist: false, score: false }, quiz.quiz_id);
    assert.strictEqual(plan.selfCheck, false, quiz.quiz_id);
    assert.strictEqual(quiz.feedback.on_complete, 'pass', quiz.quiz_id);
    const rows = manifest.quizzes.filter((row) => row.quiz_id === quiz.quiz_id);
    assert.strictEqual(rows.length, 1, quiz.quiz_id);
    assert.strictEqual(rows[0].objective, quiz.objective, quiz.quiz_id);
    assert.strictEqual(rows[0].kind, 'sentence', quiz.quiz_id);
    assert.strictEqual(rows[0].shell, false, quiz.quiz_id);
    if (quiz.quiz_id.indexOf('koshitsu-yoyaku') !== -1) {
      const window = koshitsuWindows[quiz.sentence_index];
      assert.deepStrictEqual([slide.start_sec, slide.end_sec], window, quiz.quiz_id);
      assert.strictEqual(slide.audio, passageAudio, quiz.quiz_id);
      assert.strictEqual(rows[0].group_slug, 'koshitsu-yoyaku', quiz.quiz_id);
      assert.strictEqual(rows[0].sentence_id, 's' + quiz.sentence_index, quiz.quiz_id);
    }
  });
  const koshitsuIds = [];
  for (let i = 1; i <= 6; i++) {
    koshitsuIds.push('sentence-shadowing-125-koshitsu-yoyaku-' + i + '-v1');
    koshitsuIds.push('sentence-shadowing-075-koshitsu-yoyaku-' + i + '-v1');
  }
  koshitsuIds.forEach((quizId) => {
    assert.ok(files.indexOf(quizId + '.json') !== -1, quizId);
  });
  assert.ok(!fs.readFileSync(path.join(quizDir, 'mother-lang-goraitei-arigatou-3-v1.json'), 'utf8').includes('record_shadow'));
  assert.ok(fs.readFileSync(path.join(quizDir, 'mother-lang-goraitei-arigatou-3-v1.json'), 'utf8').includes('record_pronounce'));
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
  assert.strictEqual(sentences.length, 286);
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
    if (quiz.sentence_index != null) {
      assert.strictEqual('s' + quiz.sentence_index, row.sentence_id);
    } else {
      assert.strictEqual(row.quiz_id, 'sentence-example-listen-gochumon-v1');
      assert.strictEqual(row.group_slug, 'gochumon');
      assert.strictEqual(row.sentence_id, 's1');
    }
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
    sentence_shadowing_125: 59,
    sentence_shadowing_075: 59,
    sentence_discourse_mcq: 61,
    sentence_example_sentences_listening: 1,
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

test('fresh full-suite and Q24-only units are due at T01; empty stages still step on the chunk wait', function () {
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
    ['T01']
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
    0
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: fresh,
      completedStages: [],
      now: now0,
    }),
    ['T01']
  );
  const q25 = manifest.quizzes.filter((q) => q.objective === 'sentence_example_sentences_listening');
  assert.strictEqual(q25.length, 1);
  assert.strictEqual(q25[0].quiz_id, 'sentence-example-listen-gochumon-v1');
  assert.strictEqual(q25[0].group_slug, 'gochumon');
  assert.strictEqual(q25[0].sentence_id, 's1');
  assert.ok(!annaiQuizzes.some((q) => q.objective === 'sentence_example_sentences_listening'));
  const hour = 60 * 60 * 1000;
  const afterT01 = { stageIndex: 1, lastCompletedAt: new Date(now0).toISOString() };
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: afterT01,
      completedStages: [],
      now: now0 + hour - 1,
    }),
    []
  );
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: afterT01,
      completedStages: [],
      now: now0 + hour,
    }),
    ['T02']
  );
  const onlyLater = {
    passage_schedule: schedule.passage_schedule,
    sentence_schedule: { sentence_discourse_mcq: ['T1'] },
  };
  assert.strictEqual(
    Schedule.vacuousSentenceAdvanceCount({
      schedule: onlyLater,
      quizzes: annaiQuizzes,
      sentenceId: 's1',
      state: fresh,
      now: now0,
    }),
    1
  );
  Schedule.fastForwardVacuousSentenceUnits({
    schedule: onlyLater,
    quizzes: annaiQuizzes,
    sentences: annai.sentences,
    now: now0,
    getState: (id) => Progress.getSentenceUnit('yoyaku', id),
    advance: (id) => Progress.advanceSentenceUnit('yoyaku', id, new Date(now0).toISOString()),
  });
  assert.strictEqual(Progress.getSentenceUnit('yoyaku', 's1').stageIndex, 1);
  assert.deepStrictEqual(
    Schedule.dueStages({
      objective: 'sentence_discourse_mcq',
      kind: 'sentence',
      schedule: onlyLater,
      sentenceUnitState: Progress.getSentenceUnit('yoyaku', 's1'),
      completedStages: [],
      now: now0,
    }),
    []
  );
});

test('gochumon s1 Q25 is due at T01 only after its Keep chunks leave dense', function () {
  const now = Date.parse('2026-11-10T04:30:00+08:00');
  const group = groupBySlug('gochumon');
  const s1 = group.sentences.find((s) => s.id === 's1');
  assert.deepStrictEqual(s1.chunk_ids, [1, 2, 3, 4, 5]);
  assert.strictEqual(s1.text, 'ご注文お決まりになりましたらお呼びください');
  const row = manifest.quizzes.find((q) => q.quiz_id === 'sentence-example-listen-gochumon-v1');
  assert.ok(row);
  assert.strictEqual(row.kind, 'sentence');
  assert.strictEqual(row.objective, 'sentence_example_sentences_listening');
  assert.strictEqual(row.group_slug, 'gochumon');
  assert.strictEqual(row.sentence_id, 's1');
  assert.strictEqual(row.sentence, group.sentence);
  assert.strictEqual(row.shell, false);
  assert.strictEqual(row.level, null);
  assert.strictEqual(row.chunk_id, null);
  const others = manifest.quizzes.filter(
    (q) => q.objective === 'sentence_example_sentences_listening' && q.quiz_id !== row.quiz_id
  );
  assert.strictEqual(others.length, 0);
  const unit = { stageIndex: 0, lastCompletedAt: null };
  const fresh = function () { return { stageIndex: 0, lastCompletedAt: null }; };
  assert.deepStrictEqual(Schedule.dueStages({
    objective: row.objective,
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: unit,
    completedStages: [],
    now: now,
    underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: fresh },
  }), []);
  const almost = function (id) {
    if (id === 5) return { stageIndex: 0, lastCompletedAt: null };
    return { stageIndex: 4, lastCompletedAt: null };
  };
  assert.deepStrictEqual(Schedule.dueStages({
    objective: row.objective,
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: unit,
    completedStages: [],
    now: now,
    underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: almost },
  }), []);
  const left = function () { return { stageIndex: 4, lastCompletedAt: null }; };
  assert.deepStrictEqual(Schedule.dueStages({
    objective: row.objective,
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: unit,
    completedStages: [],
    now: now,
    underChunkGate: { sentence: s1, chunks: group.chunks, getChunkState: left },
  }), ['T01']);
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
