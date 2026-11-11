/**
 * Q20–Q26 quiz runners, plus the live Q27 group_audio quiz.
 *   node test/sentence-runners.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failed = [];

function test(name, fn) {
  return function () {
    return Promise.resolve()
      .then(fn)
      .then(function () {
        console.log('ok  ' + name);
      })
      .catch(function (err) {
        failed.push(name);
        console.error('FAIL ' + name);
        console.error(err && err.stack ? err.stack : err);
      });
  };
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function createEl(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    parentNode: null,
    style: {},
    hidden: false,
    id: '',
    type: '',
    controls: false,
    preload: '',
    src: '',
    playbackRate: 1,
    currentTime: 0,
    alt: '',
    lang: '',
    value: '',
    title: '',
    allow: '',
    allowFullscreen: false,
    href: '',
    target: '',
    rel: '',
    classSet: new Set(),
    listeners: {},
    attributes: {},
    appendChild(child) {
      if (child == null) return child;
      child.parentNode = node;
      node.children.push(child);
      return child;
    },
    remove() {
      const parent = this.parentNode;
      if (!parent) return;
      const i = parent.children.indexOf(this);
      if (i >= 0) parent.children.splice(i, 1);
      this.parentNode = null;
    },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this.listeners[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    focus() {},
    select() {},
    setSelectionRange() {},
    play() {
      this.playing = true;
      return Promise.resolve();
    },
    pause() {
      this.playing = false;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
    },
    get isConnected() {
      return true;
    },
    click(evt) {
      (this.listeners.click || []).slice().forEach(function (fn) {
        fn(evt || { clientX: 0, clientY: 0 });
      });
    },
  };
  node.classList = {
    add(cls) { node.classSet.add(cls); },
    remove(cls) { node.classSet.delete(cls); },
    contains(cls) { return node.classSet.has(cls); },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return ''; },
    set(value) {
      if (value === '') node.children.length = 0;
    },
  });
  return node;
}

function installDom() {
  global.document = {
    createElement: createEl,
    createTextNode(text) {
      const node = createEl('#text');
      node.textContent = String(text);
      return node;
    },
    body: createEl('body'),
    execCommand() { return false; },
  };
}

function walk(node, acc) {
  acc.push(node);
  (node.children || []).forEach(function (child) { walk(child, acc); });
  return acc;
}

function texts(root) {
  return walk(root, []).map(function (node) { return node.textContent; }).filter(Boolean);
}

function buttons(root) {
  return walk(root, []).filter(function (node) { return node.tagName === 'BUTTON'; });
}

function buttonNamed(root, text) {
  return buttons(root).find(function (node) { return node.textContent === text; });
}

function audios(root) {
  return walk(root, []).filter(function (node) { return node.tagName === 'AUDIO'; });
}

function byClass(root, cls) {
  return walk(root, []).filter(function (node) {
    return String(node.className || '').split(/\s+/).indexOf(cls) !== -1;
  });
}

installDom();
const realSetTimeout = global.setTimeout;
global.setTimeout = function (fn, ms) {
  if (ms == null || ms < 1000) {
    fn();
    return 0;
  }
  return realSetTimeout(fn, ms);
};
const writes = [];
global.localStorage = {
  getItem() { return null; },
  setItem(key, value) { writes.push([key, value]); },
  removeItem() {},
};

const QuizRunner = require(path.join(root, 'js/quiz-runner.js'));
const Schedule = require(path.join(root, 'js/schedule.js'));

const fixture = readJson('data/fixtures/sentence-q20-q24.json');
const schedule = readJson('data/schedule.json');
const manifest = readJson('data/manifest.json');
const q18 = readJson('data/quizzes/sentence-segment-shadow-yoyaku-shitenai-1s-v1.json');
const q8 = readJson('data/quizzes/whole-listen-yoyaku-shitenai-v1.json');
const q4 = readJson('data/quizzes/shadow-025-kaikei-onegai-4-v1.json');
const cloze = readJson('data/quizzes/mother-cloze-usage-smoke-v1.json');
const loci = readJson('data/quizzes/loci-yoyaku-shitenai-1-v1.json');

function quizByObjective(objective, quizId) {
  return fixture.quizzes.find(function (quiz) {
    return quiz.objective === objective && (!quizId || quiz.quiz_id === quizId);
  });
}

function runQuiz(quiz, hooks) {
  const root = createEl('div');
  QuizRunner.run(quiz, root, hooks || {});
  return root;
}

const tests = [];

tests.push(test('Q22/Q23 stay whole-sentence; Q18 and the 0.75 clip quirk stay segment', function () {
  const clip = { rate: 0.75, start_sec: 0, end_sec: 4.1 };
  assert.strictEqual(QuizRunner.wholeSentenceShadowRate('sentence_shadowing_125'), 1.25);
  assert.strictEqual(QuizRunner.wholeSentenceShadowRate('sentence_shadowing_075'), 0.75);
  assert.strictEqual(QuizRunner.wholeSentenceShadowRate('sentence_segment_shadowing'), null);
  assert.strictEqual(
    QuizRunner.isSegmentShadow({ objective: 'sentence_shadowing_075' }, 'audio_shadow', clip),
    false
  );
  assert.strictEqual(
    QuizRunner.isSegmentShadow({ objective: 'sentence_shadowing_125' }, 'audio_shadow', clip),
    false
  );
  assert.strictEqual(
    QuizRunner.isSegmentShadow({ objective: 'sentence_segment_shadowing' }, 'audio_shadow', { rate: 1 }),
    true
  );
  assert.strictEqual(
    QuizRunner.isSegmentShadow({ objective: 'word_shadowing_025' }, 'audio_shadow', clip),
    true
  );
  assert.strictEqual(
    QuizRunner.isSegmentShadow(
      { objective: 'whole_sentence_listening' },
      'audio_listen',
      { rate: 1.5, rate_options: [1.5, 1, 0.5] }
    ),
    false
  );
  assert.strictEqual(
    QuizRunner.isSegmentShadow({ objective: 'tone_shadowing_05' }, 'audio_shadow', { rate: 0.5, start_sec: 1, end_sec: 2 }),
    false
  );
  const q22 = QuizRunner.shadowSlidePlan({ objective: 'sentence_shadowing_125' }, 'audio_shadow', clip);
  assert.strictEqual(q22.segmentShadow, false);
  assert.strictEqual(q22.rate, 1.25);
  assert.strictEqual(q22.rateOptions, null);
  assert.deepStrictEqual(q22.record, { enabled: true, persist: false, score: false });
  assert.strictEqual(q22.selfCheck, false);
  const q23 = QuizRunner.shadowSlidePlan({ objective: 'sentence_shadowing_075' }, 'audio_segment_shadow', clip);
  assert.strictEqual(q23.segmentShadow, false);
  assert.strictEqual(q23.rate, 0.75);
  assert.strictEqual(q23.record.persist, false);
  assert.strictEqual(q23.record.score, false);
  const segment = QuizRunner.shadowSlidePlan(q18, 'audio_shadow', q18.slides[0]);
  assert.strictEqual(segment.segmentShadow, true);
  assert.strictEqual(segment.rate, 0.75);
  assert.strictEqual(segment.record.enabled, false);
  assert.strictEqual(segment.selfCheck, true);
}));

tests.push(test('Q21 parses flat and nested hotspots and grades a set in any order', function () {
  const slide = quizByObjective('sentence_l1_palace_multi_tap', 'fixture-sentence-l1-palace-multi-tap-yoyaku-s1').slides[0];
  const parsed = QuizRunner.multiTapTargets(slide);
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.targets.map(function (t) { return t.id; }), ['c1', 'c2', 'c3']);
  assert.strictEqual(parsed.targets[1].hotspot.left, 13);
  const missing = QuizRunner.multiTapTargets({ hotspots: [], image: 'x' });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.reason, 'missing_hotspots');
  const dirty = QuizRunner.multiTapTargets({
    hotspots: [
      { id: 'bad', label: 'no rect' },
      { id: 'ok', left: 1, top: 2, width: 3, height: 4 },
      { id: 'ok', left: 9, top: 9, width: 1, height: 1 },
    ],
  });
  assert.deepStrictEqual(dirty.targets.map(function (t) { return t.id; }), ['ok']);
  const targets = parsed.targets;
  const point = { x: 45, y: 10 };
  const overlap = [
    { id: 'a', label: '', hotspot: { left: 0, top: 0, width: 50, height: 50 } },
    { id: 'b', label: '', hotspot: { left: 40, top: 0, width: 50, height: 50 } },
  ];
  assert.strictEqual(QuizRunner.gradeMultiTap(overlap, [], point).id, 'a');
  assert.strictEqual(QuizRunner.gradeMultiTap(overlap, ['a'], point).kind, 'hit');
  assert.strictEqual(QuizRunner.gradeMultiTap(overlap, ['a'], point).id, 'b');
  const collected = [];
  const first = QuizRunner.gradeMultiTap(targets, collected, { x: 56, y: 60 });
  assert.strictEqual(first.kind, 'hit');
  assert.strictEqual(first.id, 'c3');
  assert.strictEqual(first.done, false);
  assert.deepStrictEqual(collected, []);
  collected.push(first.id);
  assert.strictEqual(QuizRunner.gradeMultiTap(targets, collected, { x: 56, y: 60 }).kind, 'repeat');
  assert.strictEqual(QuizRunner.gradeMultiTap(targets, collected, { x: 1, y: 1 }).kind, 'miss');
  collected.push('c1');
  const last = QuizRunner.gradeMultiTap(targets, collected, { x: 17, y: 50 });
  assert.strictEqual(last.kind, 'hit');
  assert.strictEqual(last.id, 'c2');
  assert.strictEqual(last.done, true);
  assert.strictEqual(
    QuizRunner.multiTapImage({ palace_image_url: '' }, {}, { palaceImageUrl: 'https://example.test/palace.png' }),
    'https://example.test/palace.png'
  );
  assert.strictEqual(QuizRunner.multiTapImage({}, {}, {}), '');
}));

tests.push(test('generic select_text uses slide.instruction when present', function () {
  function selectQuiz(extra) {
    return {
      objective: 'generic_select_text',
      slides: [Object.assign({
        type: 'select_text',
        prompt: 'stem that stays off this page',
        correct: '對',
        distractors: ['錯'],
      }, extra)],
    };
  }

  const withNote = runQuiz(selectQuiz({ instruction: '【潑】爛地' }));
  assert.ok(texts(withNote).indexOf('【潑】爛地') !== -1);
  assert.ok(texts(withNote).indexOf('請選擇正確答案') === -1);
  assert.ok(texts(withNote).indexOf('stem that stays off this page') === -1);

  const missing = runQuiz(selectQuiz({}));
  assert.ok(texts(missing).indexOf('請選擇正確答案') !== -1);
  assert.ok(texts(missing).indexOf('stem that stays off this page') === -1);

  const blank = runQuiz(selectQuiz({ instruction: '   ' }));
  assert.ok(texts(blank).indexOf('請選擇正確答案') !== -1);

  const clozeRoot = runQuiz(cloze);
  assert.ok(texts(clozeRoot).indexOf('請選擇空白正確的母語句子') !== -1);
  assert.ok(texts(clozeRoot).indexOf('請選擇正確答案') === -1);

  const discourse = runQuiz(quizByObjective('sentence_discourse_mcq'));
  assert.ok(texts(discourse).indexOf('請揀最啱上文下理嘅母語句') !== -1);
  assert.ok(texts(discourse).indexOf('請選擇正確答案') === -1);

  const listen = runQuiz(quizByObjective('sentence_listen_to_l1'));
  assert.ok(texts(listen).indexOf('請聆聽句子，然後揀啱嘅翻譯') !== -1);
  assert.ok(texts(listen).indexOf('請選擇正確答案') === -1);
}));

tests.push(test('Q20 folds audio and L1 choices onto one graded slide', function () {
  const quiz = quizByObjective('sentence_listen_to_l1');
  const slides = QuizRunner.prepareSlides(quiz);
  assert.strictEqual(slides.length, 1);
  assert.strictEqual(slides[0].listen_l1, true);
  assert.strictEqual(slides[0].correct, '雖然沒有預約，兩位，有空位嗎？');
  assert.ok(String(slides[0].audio).indexOf('sentence-yoyaku-shitenai.mp3') !== -1);
  assert.strictEqual(slides[0].end_sec, 4.1);
  const frozen = JSON.stringify(quiz);
  let passed = 0;
  const root = runQuiz(quiz, { onPass: function () { passed += 1; } });
  assert.ok(texts(root).indexOf('請聆聽句子，然後揀啱嘅翻譯') !== -1);
  assert.ok(buttonNamed(root, '播放'));
  assert.strictEqual(audios(root)[0].controls, true);
  assert.ok(!buttonNamed(root, '重播'));
  assert.ok(!buttonNamed(root, '✓ 通過'));
  buttonNamed(root, '我去確認座位，請稍等。').click();
  assert.ok(texts(root).some(function (t) { return t.indexOf('錯：正確是') === 0; }));
  assert.strictEqual(passed, 0);
  buttonNamed(root, '雖然沒有預約，兩位，有空位嗎？').click();
  assert.strictEqual(passed, 1);
  assert.strictEqual(JSON.stringify(quiz), frozen);
  assert.strictEqual(writes.length, 0);
}));

tests.push(test('Q24 shows the discourse stem and grades the sentence choice', function () {
  const quiz = quizByObjective('sentence_discourse_mcq');
  let passed = 0;
  const root = runQuiz(quiz, { onPass: function () { passed += 1; } });
  assert.ok(texts(root).some(function (t) { return t.indexOf('邊句最啱接落去') !== -1; }));
  assert.ok(texts(root).indexOf('請揀最啱上文下理嘅母語句') !== -1);
  buttonNamed(root, '就這樣麻煩你了。').click();
  assert.strictEqual(passed, 0);
  buttonNamed(root, '我去確認座位，請稍等。').click();
  assert.strictEqual(passed, 1);
}));

tests.push(test('Q21 multi-tap keeps correct hits, rejects a miss, then completes', function () {
  const quiz = quizByObjective('sentence_l1_palace_multi_tap', 'fixture-sentence-l1-palace-multi-tap-yoyaku-s1');
  let passed = 0;
  const root = runQuiz(quiz, { onPass: function () { passed += 1; } });
  assert.ok(texts(root).indexOf('雖然沒有預約，兩位，有空位嗎？') !== -1);
  assert.ok(texts(root).indexOf('已點 0/3') !== -1);
  const img = walk(root, []).find(function (node) { return node.tagName === 'IMG'; });
  img.click({ clientX: 1, clientY: 1 });
  assert.ok(texts(root).some(function (t) { return t.indexOf('呢個位置唔係呢句') === 0; }));
  assert.strictEqual(byClass(root, 'hotspot-selected').length, 0);
  img.click({ clientX: 56, clientY: 60 });
  assert.ok(texts(root).indexOf('已點 1/3') !== -1);
  assert.strictEqual(byClass(root, 'hotspot-selected').length, 1);
  img.click({ clientX: 56, clientY: 60 });
  assert.ok(texts(root).indexOf('呢度已經點過') !== -1);
  assert.strictEqual(passed, 0);
  img.click({ clientX: 28, clientY: 50 });
  img.click({ clientX: 17, clientY: 50 });
  assert.strictEqual(passed, 1);
  assert.strictEqual(writes.length, 0);
}));

tests.push(test('Q21 with no hotspot map skips without a pass', function () {
  const quiz = quizByObjective('sentence_l1_palace_multi_tap', 'fixture-sentence-l1-palace-missing-yoyaku-s1');
  let passed = 0;
  let skipped = 0;
  const root = runQuiz(quiz, {
    onPass: function () { passed += 1; },
    onSkip: function () { skipped += 1; },
  });
  assert.ok(texts(root).indexOf('未有呢句嘅熱區，跳過呢題。') !== -1);
  buttonNamed(root, '跳過').click();
  assert.strictEqual(skipped, 1);
  assert.strictEqual(passed, 0);
  const noImage = {
    objective: 'sentence_l1_palace_multi_tap',
    slides: [{ type: 'multi_tap', hotspots: [{ id: 'a', left: 0, top: 0, width: 10, height: 10 }] }],
  };
  const bare = runQuiz(noImage, {
    context: {},
    onPass: function () { passed += 1; },
    onSkip: function () { skipped += 1; },
  });
  assert.ok(texts(bare).indexOf('未有宮殿圖，跳過呢題。') !== -1);
}));

tests.push(test('Q22 and Q23 play the whole sentence, record ephemerally, and do not self-check', async function () {
  const q22 = quizByObjective('sentence_shadowing_125');
  const frozen = JSON.stringify(q22);
  const root = runQuiz(q22);
  assert.ok(texts(root).indexOf('請跟讀成句（1.25×）。') !== -1);
  assert.ok(texts(root).indexOf('予約してないんですけど、2名って、空いてますか？') !== -1);
  assert.ok(buttonNamed(root, '播放'));
  assert.ok(!buttonNamed(root, '重播'));
  assert.ok(!buttonNamed(root, '✓ 通過'));
  assert.ok(!buttonNamed(root, '✗ 再試'));
  assert.ok(buttonNamed(root, '開始錄音'));
  assert.ok(buttonNamed(root, '完成跟讀'));
  const model = audios(root)[0];
  assert.strictEqual(model.controls, true);
  assert.strictEqual(model.playbackRate, 1.25);
  assert.ok(texts(root).some(function (t) { return t.indexOf('唔會儲存') !== -1 && t.indexOf('唔會評分') !== -1; }));

  const revoked = [];
  global.URL.createObjectURL = function (blob) {
    assert.ok(blob instanceof Blob);
    return 'blob:ephemeral-take';
  };
  global.URL.revokeObjectURL = function (url) { revoked.push(url); };
  function FakeRecorder(stream, opts) {
    this.stream = stream;
    this.opts = opts;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
  }
  FakeRecorder.isTypeSupported = function () { return true; };
  FakeRecorder.prototype.start = function () { this.state = 'recording'; };
  FakeRecorder.prototype.stop = function () {
    this.state = 'inactive';
    if (this.ondataavailable) this.ondataavailable({ data: new Blob(['take']) });
    if (this.onstop) this.onstop();
  };
  global.MediaRecorder = FakeRecorder;
  global.navigator.mediaDevices = {
    getUserMedia: function () {
      return Promise.resolve({ getTracks: function () { return [{ stop: function () {} }]; } });
    },
  };
  buttonNamed(root, '開始錄音').click();
  await new Promise(function (resolve) { setImmediate(resolve); });
  assert.strictEqual(buttonNamed(root, '停止錄音').textContent, '停止錄音');
  buttonNamed(root, '停止錄音').click();
  const takes = audios(root);
  assert.strictEqual(takes[takes.length - 1].src, 'blob:ephemeral-take');
  assert.ok(texts(root).indexOf('重聽自己') !== -1);
  assert.strictEqual(JSON.stringify(q22), frozen);
  assert.strictEqual(writes.length, 0);
  let passed = 0;
  const doneRoot = runQuiz(q22, { onPass: function () { passed += 1; } });
  const beforeRevoke = revoked.length;
  buttonNamed(doneRoot, '開始錄音').click();
  await new Promise(function (resolve) { setImmediate(resolve); });
  buttonNamed(doneRoot, '停止錄音').click();
  buttonNamed(doneRoot, '完成跟讀').click();
  assert.strictEqual(passed, 1);
  assert.ok(revoked.length > beforeRevoke);

  const q23 = quizByObjective('sentence_shadowing_075');
  const slow = runQuiz(q23);
  assert.strictEqual(audios(slow)[0].playbackRate, 0.75);
  assert.strictEqual(audios(slow)[0].controls, true);
  assert.ok(buttonNamed(slow, '播放'));
  assert.ok(!buttonNamed(slow, '重播'));
  assert.ok(!buttonNamed(slow, '✓ 通過'));
  assert.strictEqual(JSON.stringify(q23), JSON.stringify(quizByObjective('sentence_shadowing_075')));
}));

tests.push(test('Q18 segment shadow, Q8 listening, Q4 word shadow, Q19 cloze, and single tap stay put', function () {
  const segment = runQuiz(q18);
  assert.ok(buttonNamed(segment, '重播'));
  assert.ok(!buttonNamed(segment, '播放'));
  assert.ok(!buttonNamed(segment, '開始錄音'));
  assert.ok(buttonNamed(segment, '✓ 通過'));
  assert.strictEqual(audios(segment)[0].controls, false);
  assert.strictEqual(audios(segment)[0].playbackRate, 0.75);

  const listen = runQuiz(q8);
  assert.ok(buttonNamed(listen, '播放'));
  assert.ok(buttonNamed(listen, '1.5×'));
  assert.ok(buttonNamed(listen, '✓ 通過'));
  assert.ok(!buttonNamed(listen, '開始錄音'));
  assert.strictEqual(audios(listen)[0].controls, true);

  const word = runQuiz(q4);
  assert.ok(buttonNamed(word, '播放'));
  assert.ok(!buttonNamed(word, '重播'));
  assert.ok(!buttonNamed(word, '開始錄音'));
  assert.ok(buttonNamed(word, '✓ 通過'));
  assert.strictEqual(audios(word)[0].playbackRate, 0.25);
  assert.strictEqual(audios(word)[0].controls, true);

  const clozeRoot = runQuiz(cloze);
  assert.ok(texts(clozeRoot).indexOf('請選擇空白正確的母語句子') !== -1);
  assert.ok(texts(clozeRoot).indexOf('請聆聽句子，然後揀啱嘅翻譯') === -1);
  assert.ok(texts(clozeRoot).indexOf('ご予約いただいてますか') !== -1);

  const tap = runQuiz(loci);
  buttonNamed(tap, '下一題').click();
  const img = walk(tap, []).find(function (node) { return node.tagName === 'IMG'; });
  let passed = 0;
  const tapRoot = runQuiz(loci, { onPass: function () { passed += 1; } });
  buttonNamed(tapRoot, '下一題').click();
  const img2 = walk(tapRoot, []).find(function (node) { return node.tagName === 'IMG'; });
  img2.click({ clientX: 1, clientY: 1 });
  assert.ok(texts(tapRoot).indexOf('位置不對') !== -1);
  img2.click({ clientX: 28, clientY: 50 });
  assert.strictEqual(passed, 1);
  assert.ok(img);
}));

tests.push(test('fixture quiz ids stay outside the manifest; live Q20–Q24 objectives are in it', function () {
  const ids = new Set(manifest.quizzes.map(function (quiz) { return quiz.quiz_id; }));
  fixture.quizzes.forEach(function (quiz) {
    assert.strictEqual(ids.has(quiz.quiz_id), false, quiz.quiz_id);
    assert.ok(
      manifest.quizzes.some(function (row) { return row.objective === quiz.objective && row.kind === 'sentence'; }),
      quiz.objective
    );
  });
  assert.ok(fs.readFileSync(path.join(root, 'js/group.js'), 'utf8').indexOf('sentenceFixture') !== -1);
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const labels = Schedule.sentenceUnitStageLabels(schedule);
  const seen = new Set();
  fixture.quizzes.forEach(function (quiz) {
    if (seen.has(quiz.objective)) return;
    seen.add(quiz.objective);
    const planned = schedule.sentence_schedule[quiz.objective];
    assert.ok(planned && planned.length, quiz.objective);
    const stageIndex = labels.indexOf(planned[0]);
    assert.ok(stageIndex >= 0, quiz.objective);
    const dueAtItsStage = Schedule.dueStages({
      objective: quiz.objective,
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: {
        stageIndex: stageIndex,
        lastCompletedAt: stageIndex === 0 ? null : '2020-01-01T00:00:00.000Z',
      },
      completedStages: [],
      now: now,
    });
    assert.deepStrictEqual(dueAtItsStage, [planned[0]], quiz.objective);
    const freshDue = Schedule.dueStages({
      objective: quiz.objective,
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
      completedStages: [],
      now: now,
    });
    assert.strictEqual(labels[0], 'T01');
    assert.deepStrictEqual(freshDue, planned[0] === labels[0] ? [labels[0]] : [], quiz.objective);
  });
  assert.strictEqual(
    manifest.quizzes.filter(function (quiz) { return quiz.kind === 'sentence'; }).length,
    297
  );
}));

tests.push(test('gochumon Q25 trial listens at 1.3× with the example gloss', function () {
  const quiz = readJson('data/quizzes/sentence-example-listen-gochumon-v1.json');
  const root = runQuiz(quiz);
  assert.ok(buttonNamed(root, '播放'));
  assert.ok(buttonNamed(root, '✓ 通過'));
  assert.ok(buttonNamed(root, '✗ 再試'));
  assert.ok(!buttonNamed(root, '開始錄音'));
  assert.strictEqual(audios(root).length, 1);
  assert.strictEqual(audios(root)[0].playbackRate, 1.3);
  assert.strictEqual(audios(root)[0].controls, true);
  assert.strictEqual(audios(root)[0].src, quiz.slides[0].audio);
  const shown = texts(root).join('\n');
  assert.ok(shown.indexOf('請聆聽例句。') !== -1);
  assert.ok(shown.indexOf('我攞餐牌畀你；點餐決定好就出聲叫我。') !== -1);
  assert.strictEqual(QuizRunner.isSegmentShadow(quiz, 'audio_listen', { rate: 1.3 }), false);
  const plan = QuizRunner.shadowSlidePlan(quiz, 'audio_listen', { rate: 1.3 });
  assert.strictEqual(plan.segmentShadow, false);
  assert.strictEqual(plan.record.enabled, false);
  assert.strictEqual(plan.rate, 1.3);
}));

tests.push(test('Q21 correct_ids ignore extra palace hotspots and allow_change undoes a hit', function () {
  const quiz = {
    quiz_id: 'fixture-correct-ids',
    objective: 'sentence_l1_palace_multi_tap',
    kind: 'sentence',
    l1: '您的點餐決定好了的話。',
    feedback: { on_wrong: 'show_correct_boxes' },
    slides: [{
      type: 'multi_tap',
      instruction: '點齊同呢句相關嘅全部位置（無序；可改）。',
      image: 'https://example.test/palace.png',
      allow_change: true,
      hotspots: [
        { id: 1, left: 0, top: 0, width: 20, height: 20 },
        { id: 2, left: 50, top: 50, width: 20, height: 20 },
        { id: 3, left: 80, top: 0, width: 15, height: 15 },
      ],
      correct_ids: [1, 3],
    }],
  };
  let passed = 0;
  const root = runQuiz(quiz, { onPass: function () { passed += 1; } });
  const img = walk(root, []).find(function (node) { return node.tagName === 'IMG'; });
  assert.ok(texts(root).indexOf('已點 0/2') !== -1);
  img.click({ clientX: 55, clientY: 55 });
  assert.ok(texts(root).some(function (t) { return t.indexOf('呢個位置唔係呢句') === 0; }));
  assert.strictEqual(byClass(root, 'hotspot-hint').length, 2);
  assert.strictEqual(passed, 0);
  img.click({ clientX: 5, clientY: 5 });
  assert.ok(texts(root).indexOf('已點 1/2') !== -1);
  img.click({ clientX: 5, clientY: 5 });
  assert.ok(texts(root).indexOf('已點 0/2') !== -1);
  assert.ok(texts(root).indexOf('呢度已經點過') === -1);
  img.click({ clientX: 5, clientY: 5 });
  img.click({ clientX: 85, clientY: 5 });
  assert.strictEqual(passed, 1);
}));

tests.push(test('Q26 multi-select shows only missed-correct and selected-distractor explanations', function () {
  const quiz = readJson('data/quizzes/sentence-usage-feature-gochumon-s1-v2.json');
  assert.strictEqual(quiz.objective, 'sentence_usage_feature_judgment');
  assert.strictEqual(quiz.feedback.on_wrong, 'show_only_missed_correct_and_selected_distractor');
  assert.strictEqual(quiz.feedback.on_tick, 'pass');
  assert.strictEqual(quiz.feedback.on_cross, 'retry');
  quiz.slides.forEach(function (slide) {
    assert.strictEqual(slide.type, 'select_text');
    assert.strictEqual(slide.multi_select, true);
    assert.strictEqual(slide.require_all_correct, true);
    assert.ok(Array.isArray(slide.correct) && slide.correct.length > 1);
  });
  let passed = 0;
  const root = runQuiz(quiz, { onPass: function () { passed += 1; } });
  assert.ok(buttonNamed(root, '確認'));
  assert.ok(!buttonNamed(root, '✓ 通過'));
  assert.ok(texts(root).some(function (t) { return t.indexOf('說話者必須係店員') !== -1; }));
  buttonNamed(root, '餐廳店員 → 客人（睇餐牌）。').click();
  buttonNamed(root, '確認').click();
  const wrong = texts(root).join('\n');
  assert.ok(wrong.indexOf('未揀「咖啡店店員 → 客人。」說話者係店員，符合。') !== -1);
  assert.ok(wrong.indexOf('未揀「居酒屋店員 → 客人。」說話者係店員，符合。') !== -1);
  assert.ok(wrong.indexOf('完全符合') === -1);
  assert.ok(wrong.indexOf('角色相反') === -1);
  assert.ok(wrong.indexOf('語域唔啱') === -1);
  assert.ok(wrong.indexOf('未全對。正確：') === -1);
  assert.strictEqual(passed, 0);
  buttonNamed(root, '客人對店員講。').click();
  buttonNamed(root, '確認').click();
  const withDistractor = texts(root).join('\n');
  assert.ok(withDistractor.indexOf('錯揀「客人對店員講。」角色相反，客人唔會用呢句。') !== -1);
  assert.ok(withDistractor.indexOf('完全符合') === -1);
  assert.ok(withDistractor.indexOf('語域唔啱') === -1);
  assert.ok(withDistractor.indexOf('說話者係客人，唔會用服務業套話。') === -1);
  buttonNamed(root, '客人對店員講。').click();
  buttonNamed(root, '咖啡店店員 → 客人。').click();
  buttonNamed(root, '居酒屋店員 → 客人。').click();
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 0);
  assert.ok(texts(root).some(function (t) { return t.indexOf('聽話者必須係仲未落單嘅客人') !== -1; }));
  assert.ok(texts(root).join('\n').indexOf('角色相反') === -1);
}));

tests.push(test('type multi_select still lists every correct answer on a miss', function () {
  const quiz = {
    quiz_id: 'fixture-multi-select-dump',
    objective: 'pronunciation_sounding_select',
    slides: [{
      type: 'multi_select',
      instruction: '請全選正確項',
      correct: ['A', 'B'],
      distractors: ['C'],
    }],
  };
  const root = runQuiz(quiz);
  buttonNamed(root, 'C').click();
  buttonNamed(root, '確認').click();
  assert.ok(texts(root).some(function (t) { return t.indexOf('未全對。正確：') === 0; }));
}));

function groupTile(root, id) {
  return walk(root, []).find(function (node) {
    return node.getAttribute && node.getAttribute('data-item-id') === id;
  });
}

function childButton(tile, cls) {
  return walk(tile, []).find(function (node) {
    return node.tagName === 'BUTTON' && String(node.className || '').split(/\s+/).indexOf(cls) !== -1;
  });
}

function placeGroupItem(root, id, boxId) {
  const tile = groupTile(root, id);
  assert.ok(tile, id);
  const select = childButton(tile, 'group-select');
  if (select.textContent !== '已揀') select.click();
  assert.strictEqual(childButton(groupTile(root, id), 'group-select').textContent, '已揀');
  const box = byClass(root, 'group-box').find(function (node) {
    return node.getAttribute('data-box-id') === boxId;
  });
  assert.ok(box, boxId);
  box.click();
  assert.strictEqual(groupTile(root, id).parentNode.getAttribute('data-box-id'), boxId);
}

tests.push(test('Q27 group_audio grades by correct_box and returns only misplaced', function () {
  const items = [
    { id: 't1', correct_box: 'correct' },
    { id: 't2', correct_box: 'correct' },
    { id: 'p1', correct_box: 'wrong' },
  ];
  const partial = QuizRunner.gradeGroupAudio(items, { t1: 'correct', t2: null, p1: null });
  assert.strictEqual(partial.allPlaced, false);
  assert.strictEqual(partial.ok, false);
  assert.deepStrictEqual(partial.unplacedIds, ['t2', 'p1']);
  assert.deepStrictEqual(partial.correctIds, ['t1']);

  const mixed = { t1: 'correct', t2: 'wrong', p1: 'correct' };
  const graded = QuizRunner.gradeGroupAudio(items, mixed);
  assert.strictEqual(graded.allPlaced, true);
  assert.strictEqual(graded.ok, false);
  assert.deepStrictEqual(graded.correctIds, ['t1']);
  assert.deepStrictEqual(graded.misplacedIds, ['t2', 'p1']);
  const kept = QuizRunner.placementAfterReturnMisplaced(mixed, graded);
  assert.strictEqual(kept.t1, 'correct');
  assert.strictEqual(kept.t2, null);
  assert.strictEqual(kept.p1, null);

  const good = { t1: 'correct', t2: 'correct', p1: 'wrong' };
  assert.strictEqual(QuizRunner.gradeGroupAudio(items, good).ok, true);
  // accepts is not an input. A box id that is not correct_box is misplaced.
  assert.deepStrictEqual(
    QuizRunner.gradeGroupAudio([{ id: 't1', correct_box: 'correct' }], { t1: 'wrong' }).misplacedIds,
    ['t1']
  );
}));

tests.push(test('Q27 group_audio require_all_placed, return_only_misplaced, and retry', function () {
  const quiz = readJson('tools/q27-sentence-minimal-pair-gochumon-okimari-1-v1.json');
  assert.strictEqual(quiz.quiz_id, 'sentence-minimal-pair-gochumon-okimari-1-v1');
  assert.strictEqual(quiz.slides.length, 1);
  assert.strictEqual(quiz.slides[0].type, 'group_audio');
  assert.strictEqual(quiz.slides[0].rate, 1);
  assert.strictEqual(quiz.slides[0].require_all_placed, true);
  assert.strictEqual(quiz.slides[0].shuffle, true);
  assert.strictEqual(quiz.feedback.on_wrong, 'return_only_misplaced');
  assert.strictEqual(quiz.feedback.on_cross, 'retry');
  assert.ok(quiz.feedback.explanation == null);
  assert.strictEqual(quiz.slides[0].boxes[0].label, '您的點餐決定好了的話。');
  assert.deepStrictEqual(quiz.slides[0].boxes[0].accepts, ['t1', 't2']);
  assert.strictEqual(quiz.slides[0].boxes[1].label, '錯');
  assert.deepStrictEqual(quiz.slides[0].boxes[1].accepts, ['p1', 'p2', 'p3', 'p4']);
  quiz.slides[0].items.forEach(function (item) {
    assert.strictEqual(item.start_sec, undefined);
    assert.strictEqual(item.end_sec, undefined);
    assert.ok(item.text == null);
    assert.ok(item.l1 == null);
    assert.ok(String(item.audio).indexOf('https://raw.githubusercontent.com/') === 0);
  });

  let passed = 0;
  let failed = 0;
  const beforeWrites = writes.length;
  const root = runQuiz(quiz, {
    onPass: function () { passed += 1; },
    onFail: function () { failed += 1; },
  });
  const shown = texts(root).join('\n');
  const bodyText = texts(byClass(root, 'quiz-body')[0]).join('\n');
  assert.ok(shown.indexOf('未支援嘅題型：group_audio') === -1);
  assert.ok(shown.indexOf(quiz.slides[0].instruction) !== -1);
  assert.ok(bodyText.indexOf('您的點餐決定好了的話。') !== -1);
  assert.ok(bodyText.indexOf('錯') !== -1);
  assert.ok(bodyText.indexOf('ご注文') === -1);
  assert.ok(shown.indexOf('已放 0/6') !== -1);
  ['t1', 't2', 'p1', 'p2', 'p3', 'p4'].forEach(function (id) {
    assert.strictEqual(texts(root).indexOf(id), -1, id);
    var tileText = texts(groupTile(root, id)).join('\n');
    assert.ok(tileText.indexOf('ご注文') === -1, id);
    assert.ok(tileText.indexOf('您的點餐') === -1, id);
    assert.ok(tileText.indexOf('播放') !== -1, id);
    assert.ok(tileText.indexOf('揀') !== -1, id);
  });
  const clips = audios(root);
  assert.strictEqual(clips.length, 6);
  const srcs = clips.map(function (node) { return node.src; }).sort();
  const expected = quiz.slides[0].items.map(function (item) { return item.audio; }).sort();
  assert.deepStrictEqual(srcs, expected);
  clips.forEach(function (clip) {
    assert.strictEqual(clip.playbackRate, 1);
    assert.strictEqual(clip.controls, false);
  });
  const t1 = groupTile(root, 't1');
  const t1Audio = walk(t1, []).find(function (node) { return node.tagName === 'AUDIO'; });
  t1Audio.currentTime = 4;
  childButton(t1, 'group-play').click();
  assert.strictEqual(t1Audio.playing, true);
  assert.strictEqual(t1Audio.playbackRate, 1);
  assert.strictEqual(t1Audio.currentTime, 4);
  assert.ok(!t1Audio.listeners.timeupdate || t1Audio.listeners.timeupdate.length === 0);
  assert.strictEqual(childButton(t1, 'group-select').textContent, '揀');
  const t2Audio = walk(groupTile(root, 't2'), []).find(function (node) { return node.tagName === 'AUDIO'; });
  childButton(groupTile(root, 't2'), 'group-play').click();
  assert.strictEqual(t1Audio.playing, false);
  assert.strictEqual(t2Audio.playing, true);

  const submit = buttonNamed(root, '確認');
  assert.strictEqual(submit.disabled, true);
  submit.click();
  assert.strictEqual(passed, 0);
  assert.strictEqual(failed, 0);
  assert.ok(texts(root).indexOf('請放晒所有音檔先確認') !== -1);
  assert.ok(texts(root).indexOf('正確！') === -1);

  placeGroupItem(root, 't1', 'wrong');
  placeGroupItem(root, 't2', 'correct');
  placeGroupItem(root, 'p1', 'correct');
  placeGroupItem(root, 'p2', 'wrong');
  placeGroupItem(root, 'p3', 'wrong');
  placeGroupItem(root, 'p4', 'wrong');
  assert.strictEqual(buttonNamed(root, '確認').disabled, false);
  assert.ok(texts(root).indexOf('已放 6/6') !== -1);
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 0);
  assert.strictEqual(failed, 1);
  assert.ok(texts(root).indexOf(quiz.slides[0].instruction) !== -1);
  assert.ok(texts(root).indexOf('有 4 個啱，再試一次') !== -1);
  assert.strictEqual(texts(root).indexOf('再試一次'), -1);
  assert.ok(texts(root).indexOf('正確！') === -1);
  assert.ok(texts(byClass(root, 'quiz-body')[0]).join('\n').indexOf('ご注文') === -1);
  assert.strictEqual(groupTile(root, 't2').parentNode.getAttribute('data-box-id'), 'correct');
  assert.strictEqual(groupTile(root, 'p2').parentNode.getAttribute('data-box-id'), 'wrong');
  assert.strictEqual(groupTile(root, 'p3').parentNode.getAttribute('data-box-id'), 'wrong');
  assert.strictEqual(groupTile(root, 'p4').parentNode.getAttribute('data-box-id'), 'wrong');
  assert.ok(String(groupTile(root, 't1').parentNode.className).indexOf('group-pool') !== -1);
  assert.ok(String(groupTile(root, 'p1').parentNode.className).indexOf('group-pool') !== -1);
  assert.strictEqual(buttonNamed(root, '確認').disabled, true);
  assert.ok(texts(root).indexOf('已放 4/6') !== -1);

  placeGroupItem(root, 't1', 'correct');
  placeGroupItem(root, 'p1', 'wrong');
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 1);
  assert.strictEqual(failed, 1);
  assert.ok(texts(root).indexOf('正確！') !== -1);
  assert.strictEqual(writes.length, beforeWrites);
}));

tests.push(test('Q27 group_audio shuffles unless shuffle is false, and can move back to the pool', function () {
  function fixture(shuffleItems) {
    return {
      quiz_id: 'fixture-group-audio',
      objective: 'sentence_minimal_pair_grouping',
      feedback: { on_wrong: 'return_only_misplaced', on_cross: 'retry' },
      slides: [{
        type: 'group_audio',
        instruction: '分組',
        rate: 1,
        require_all_placed: true,
        shuffle: shuffleItems,
        boxes: [
          { id: 'correct', label: '啱', accepts: ['a'] },
          { id: 'wrong', label: '錯', accepts: ['b', 'c'] },
        ],
        items: [
          { id: 'a', audio: 'https://example.test/a.mp3', correct_box: 'correct' },
          { id: 'b', audio: 'https://example.test/b.mp3', correct_box: 'wrong' },
          { id: 'c', audio: 'https://example.test/c.mp3', correct_box: 'wrong' },
        ],
      }],
    };
  }

  function poolIds(root) {
    return byClass(root, 'group-pool')[0].children.map(function (node) {
      return node.getAttribute('data-item-id');
    });
  }

  const ordered = runQuiz(fixture(false));
  assert.deepStrictEqual(poolIds(ordered), ['a', 'b', 'c']);
  placeGroupItem(ordered, 'a', 'wrong');
  placeGroupItem(ordered, 'a', 'correct');
  assert.strictEqual(groupTile(ordered, 'a').parentNode.getAttribute('data-box-id'), 'correct');
  childButton(groupTile(ordered, 'a'), 'group-select').click();
  byClass(ordered, 'group-pool-wrap')[0].click();
  assert.ok(String(groupTile(ordered, 'a').parentNode.className).indexOf('group-pool') !== -1);
  assert.strictEqual(buttonNamed(ordered, '確認').disabled, true);

  const random = Math.random;
  Math.random = function () { return 0; };
  try {
    const shuffled = runQuiz(fixture(true));
    assert.deepStrictEqual(poolIds(shuffled), ['b', 'c', 'a']);
  } finally {
    Math.random = random;
  }
}));

tests.push(test('Q27 group_audio without require_all_placed still retries a partial submit', function () {
  let passed = 0;
  let failed = 0;
  const root = runQuiz({
    quiz_id: 'fixture-group-audio-partial',
    objective: 'sentence_minimal_pair_grouping',
    feedback: { on_wrong: 'return_only_misplaced', on_cross: 'retry' },
    slides: [
      {
        type: 'group_audio',
        instruction: '分組',
        rate: 1.25,
        require_all_placed: false,
        shuffle: false,
        boxes: [
          { id: 'correct', label: '啱', accepts: ['a'] },
          { id: 'wrong', label: '錯', accepts: ['b'] },
        ],
        items: [
          { id: 'a', audio: 'https://example.test/a.mp3', correct_box: 'correct' },
          { id: 'b', audio: 'https://example.test/b.mp3', correct_box: 'wrong' },
        ],
      },
      { type: 'prompt', text: '第二題' },
    ],
  }, {
    onPass: function () { passed += 1; },
    onFail: function () { failed += 1; },
  });
  assert.strictEqual(audios(root)[0].playbackRate, 1.25);
  assert.strictEqual(buttonNamed(root, '確認').disabled, false);
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 0);
  assert.strictEqual(failed, 1);
  assert.ok(texts(root).indexOf('第二題') === -1);
  assert.ok(texts(root).indexOf('有 0 個啱，再試一次') !== -1);
  placeGroupItem(root, 'a', 'correct');
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 0);
  assert.strictEqual(failed, 2);
  assert.ok(texts(root).indexOf('第二題') === -1);
  assert.ok(texts(root).indexOf('有 1 個啱，再試一次') !== -1);
  assert.strictEqual(groupTile(root, 'a').parentNode.getAttribute('data-box-id'), 'correct');
  assert.ok(String(groupTile(root, 'b').parentNode.className).indexOf('group-pool') !== -1);
  placeGroupItem(root, 'b', 'wrong');
  buttonNamed(root, '確認').click();
  assert.strictEqual(passed, 0);
  assert.ok(texts(root).indexOf('第二題') !== -1);
  buttonNamed(root, '下一題').click();
  assert.strictEqual(passed, 1);
}));

tests.push(test('unknown slide types still skip, and Q27 is on the live queue', function () {
  const view = runQuiz({ objective: 'nope', slides: [{ type: 'not_a_slide' }] });
  assert.ok(texts(view).indexOf('未支援嘅題型：not_a_slide') !== -1);
  assert.ok(buttonNamed(view, '跳過'));
  const quizId = 'sentence-minimal-pair-gochumon-okimari-1-v1';
  const livePath = path.join(root, 'data/quizzes', quizId + '.json');
  const trialPath = path.join(root, 'tools/q27-' + quizId + '.json');
  assert.ok(fs.readFileSync(livePath).equals(fs.readFileSync(trialPath)));
  const row = manifest.quizzes.find(function (quiz) { return quiz.quiz_id === quizId; });
  assert.deepStrictEqual(row, {
    quiz_id: quizId,
    file: 'data/quizzes/' + quizId + '.json',
    objective: 'sentence_minimal_pair_grouping',
    level: null,
    kind: 'sentence',
    chunk_id: null,
    sentence_id: 's1',
    group_slug: 'gochumon',
    sentence: 'ご注文お決まりになりましたらお呼びください',
    shell: false,
  });
  assert.strictEqual(
    manifest.quizzes.filter(function (quiz) {
      return quiz.objective === 'sentence_minimal_pair_grouping';
    }).length,
    1
  );
  assert.deepStrictEqual(
    schedule.sentence_schedule.sentence_minimal_pair_grouping,
    schedule.sentence_schedule.sentence_usage_feature_judgment
  );
  const freshDue = Schedule.dueStages({
    objective: 'sentence_minimal_pair_grouping',
    kind: 'sentence',
    schedule: schedule,
    sentenceUnitState: { stageIndex: 0, lastCompletedAt: null },
    completedStages: [],
    now: Date.parse('2026-11-11T00:00:00.000Z'),
  });
  assert.deepStrictEqual(freshDue, ['T01']);
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'data/schedule.json'), 'utf8').indexOf(quizId),
    -1
  );
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'data/groups.json'), 'utf8').indexOf(quizId),
    -1
  );
  const page = fs.readFileSync(path.join(root, 'tools/try-group-audio-q27-20261111.html'), 'utf8');
  assert.ok(page.indexOf('../js/quiz-runner.js') !== -1);
  assert.ok(page.indexOf('../css/app.css') !== -1);
  assert.ok(page.indexOf('q27-sentence-minimal-pair-gochumon-okimari-1-v1.json') !== -1);
  assert.ok(page.indexOf('試用頁，唔係正式練習') !== -1);
  assert.ok(page.indexOf('src="../js/progress.js') === -1);
  assert.ok(page.indexOf('src="../js/group.js') === -1);
  assert.ok(page.indexOf('src="../js/timing.js') === -1);
  assert.ok(page.indexOf('src="../js/sync.js') === -1);
  assert.ok(page.indexOf('manifest.json') === -1);
  assert.ok(page.indexOf('schedule.json') === -1);
  assert.ok(page.indexOf('website-manager-progress-v2') !== -1);
  assert.ok(page.indexOf('trial blocked live progress write') !== -1);
}));

(async function () {
  for (let i = 0; i < tests.length; i++) await tests[i]();
  if (failed.length) {
    console.error(failed.length + ' failed');
    process.exit(1);
  }
  console.log('all sentence-runner tests passed');
})();
