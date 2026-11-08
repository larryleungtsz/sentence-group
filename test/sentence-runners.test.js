/**
 * Q20–Q24 quiz runners.
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
    assert.deepStrictEqual(freshDue, planned[0] === 'T+1' ? ['T+1'] : [], quiz.objective);
  });
  assert.strictEqual(
    manifest.quizzes.filter(function (quiz) { return quiz.kind === 'sentence'; }).length,
    273
  );
}));

(async function () {
  for (let i = 0; i < tests.length; i++) await tests[i]();
  if (failed.length) {
    console.error(failed.length + ' failed');
    process.exit(1);
  }
  console.log('all sentence-runner tests passed');
})();
