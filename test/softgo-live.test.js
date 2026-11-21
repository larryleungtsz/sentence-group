/**
 * Live Soft GO Q20–Q24, the Q2 gloss ship, the Q3 meaning-object ship,
 * the official new-design Q4/Q7 ship, and the official Q5 story_select_image ship.
 *   node test/softgo-live.test.js
 */
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
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
  'sentence_usage_feature_judgment',
  'sentence_minimal_pair_grouping',
];
const KANA = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;

const EXPECTED_SENTENCES = {
  'aragoshi-mikanshu': 7,
  gochumon: 2,
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
  'kodomo-omoide': 0,
  teikuauto: 0,
  rayu: 0,
  roji: 0,
  'konna-basho': 0,
  'kanban-menu': 0,
  'kanki-maa-maa': 0,
  odenwa: 0,
  'kyou-no-6jihan': 0,
  ichio: 0,
  'sore-wa': 0,
  oseki: 0,
  'niwatori-atama': 0,
  'kaori-ga-ari': 0,
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

const FORBIDDEN_SHADOW_IDS = [
  'shadow-025-teikuauto-9-v1',
  'shadow-025-sore-wa-7-v1',
  'shadow-05-teikuauto-9-v1',
  'shadow-05-sore-wa-7-v1',
  'shadow-025-mitame-irotsuya-3-v1',
  'shadow-025-goraitei-arigatou-2-v1',
  'shadow-05-mitame-irotsuya-3-v1',
  'shadow-05-goraitei-arigatou-2-v1',
  'shadow-025-roji-6-v1',
  'shadow-025-koshitsu-yoyaku-19-v1',
  'shadow-05-roji-6-v1',
  'shadow-05-koshitsu-yoyaku-19-v1',
];

const FORBIDDEN_STORY_IDS = [
  'story-meccha-mitame-3-v1',
  'story-gochumon-kakunin-1-v1',
  'story-koshitsu-yoyaku-19-v1',
  'story-roji-6-v1',
];

function isShadowQuizPath(file) {
  return /^data\/quizzes\/shadow-025-.*\.json$/.test(file) || /^data\/quizzes\/shadow-05-.*\.json$/.test(file);
}

function isStoryQuizPath(file) {
  return /^data\/quizzes\/story-.*\.json$/.test(file);
}

function assertAllowedStoryChange(file, status, knownAtBase) {
  assert.ok(isStoryQuizPath(file), file);
  const quizId = path.basename(file, '.json');
  assert.ok(FORBIDDEN_STORY_IDS.indexOf(quizId) === -1, file);
  assert.ok(quizId.indexOf('story-koshitu-') !== 0, file);
  assert.ok(!/^story-aka-konnyaku-\d+-v1$/.test(quizId), file);
  assert.ok(!/^story-ebi-sumiso-\d+-v1$/.test(quizId), file);
  if (knownAtBase.has(file)) assert.strictEqual(status, 'M', file);
  else assert.strictEqual(status, 'A', file);
}

function isWholeListenQuizPath(file) {
  return /^data\/quizzes\/whole-listen-.*\.json$/.test(file);
}

function isSoundingQuizPath(file) {
  return /^data\/quizzes\/sounding-.*\.json$/.test(file);
}

function assertAllowedSoundingChange(file, status, knownAtBase) {
  assert.ok(isSoundingQuizPath(file), file);
  const quizId = path.basename(file, '.json');
  assert.notStrictEqual(quizId, 'sounding-mitame-irotsuya-3-v1', file);
  if (knownAtBase.has(file)) assert.strictEqual(status, 'M', file);
  else assert.strictEqual(status, 'A', file);
  const quiz = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.strictEqual(quiz.quiz_id, quizId, file);
  assert.strictEqual(quiz.objective, 'pronunciation_sounding_select', file);
  assert.strictEqual(quiz.slides[0].type, 'audio_listen', file);
  assert.strictEqual(quiz.slides[0].instruction, '請聆聽。', file);
  assert.strictEqual(quiz.slides[0].self_check, false, file);
}

/**
 * Working-tree Q8 file with the authorized delta removed must byte-match baseSha.
 * Delta is only: drop rate_options, set self_check false, add "rate": 2.
 * quiz_id, sentence, audio URL, instruction, and feedback stay in the bytes.
 */
function assertWholeListenRewrite(file, status, baseSha) {
  assert.strictEqual(status, 'M', file);
  assert.ok(isWholeListenQuizPath(file), file);
  const before = execFileSync('git', ['show', baseSha + ':' + file], { cwd: root });
  const afterText = fs.readFileSync(path.join(root, file), 'utf8');
  const block = before.toString('utf8').match(
    /      "rate_options": \[\n(?:        [0-9.]+,?\n)+      \],\n      "self_check": true\n/
  );
  assert.ok(block, file + ' pinned rate_options');
  const needle = '      "rate": 2,\n      "self_check": false\n';
  const at = afterText.indexOf(needle);
  assert.ok(at !== -1, file);
  assert.strictEqual(afterText.indexOf(needle, at + needle.length), -1, file);
  const restored = afterText.slice(0, at) + block[0] + afterText.slice(at + needle.length);
  assert.ok(Buffer.from(restored).equals(before), file);
}

function stripQ8RunnerDelta(text) {
  function once(source, needle, replacement, label) {
    const at = source.indexOf(needle);
    assert.ok(at !== -1, label);
    assert.strictEqual(source.indexOf(needle, at + needle.length), -1, label);
    return source.slice(0, at) + replacement + source.slice(at + needle.length);
  }
  const q8fns = text.indexOf('  /**\n   * Q8 passage whole listening. One 「播放」 restarts at 0s and plays the\n');
  const audioCheck = text.indexOf('  /**\n   * Audio ✓/✗.\n');
  assert.ok(q8fns !== -1 && audioCheck > q8fns, 'q8 helpers');
  text = text.slice(0, q8fns) + text.slice(audioCheck);
  text = once(
    text,
    '    const speaker = !!opts.speaker;\n    // Q8: one 播放, no native scrubber, no speed picker. Other callers omit this.\n    const wholeListen = !!opts.whole_listen;\n',
    '    const speaker = !!opts.speaker;\n',
    'q8 wholeListen flag'
  );
  text = once(
    text,
    '    // Segment shadowing and Q8: custom button only (no native scrub).\n    audio.controls = !segmentShadow && !speaker && !wholeListen;\n',
    '    // Segment shadowing: custom 重播 only (no native scrub).\n    audio.controls = !segmentShadow && !speaker;\n',
    'q8 controls'
  );
  text = once(
    text,
    '      const start = wholeListen ? 0 : (opts.start_sec != null ? opts.start_sec : 0);\n      if (wholeListen || opts.start_sec != null || segmentShadow) audio.currentTime = start;\n',
    '      const start = opts.start_sec != null ? opts.start_sec : 0;\n      if (opts.start_sec != null || segmentShadow) audio.currentTime = start;\n',
    'q8 restart'
  );
  text = once(
    text,
    '      if (!wholeListen && opts.end_sec != null) {\n',
    '      if (opts.end_sec != null) {\n',
    'q8 clip'
  );
  text = once(
    text,
    '    // No speed picker for Q18 (fixed 0.75×), Q8 (fixed 2.0×), or speaker tiles.\n    if (!segmentShadow && !speaker && !wholeListen && opts.rate_options) {\n',
    '    // No speed picker for sentence_segment_shadowing (fixed 0.75×) or speaker tiles.\n    if (!segmentShadow && !speaker && opts.rate_options) {\n',
    'q8 rates'
  );
  text = once(
    text,
    [
      '          audioOpts.rate_options = null;',
      '        } else if (isWholeSentenceListening(quiz)) {',
      '          // Q8: whole file from 0s at 2.0×. Clip windows and speed buttons stay off.',
      '          audioOpts.whole_listen = true;',
      '          audioOpts.segment_shadow = false;',
      '          audioOpts.rate = wholeSentenceListenRate(audioOpts);',
      '          audioOpts.rate_options = null;',
      '          audioOpts.start_sec = null;',
      '          audioOpts.end_sec = null;',
      '        }',
    ].join('\n'),
    [
      '          audioOpts.rate_options = null;',
      '        }',
    ].join('\n'),
    'q8 plan'
  );
  text = once(
    text,
    [
      '          return;',
      '        }',
      '        // Q8 passes with 「繼續」. The button is on the slide immediately;',
      '        // playback does not have to finish. No ✓/✗ bar.',
      '        if (isWholeSentenceListening(quiz) && audioOpts.whole_listen) {',
      "          const cont = el('button', 'btn btn-primary', '繼續');",
      "          cont.type = 'button';",
      '          cont.addEventListener(\'click\', () => {',
      '            idx++;',
      '            renderSlide();',
      '          });',
      '          body.appendChild(cont);',
      '          return;',
      '        }',
      '        // Q4/Q7 are already returned above.',
    ].join('\n'),
    [
      '          return;',
      '        }',
      '        // Q4/Q7 are already returned above.',
    ].join('\n'),
    'q8 continue'
  );
  text = once(
    text,
    [
      '    wholeSentenceShadowRate: wholeSentenceShadowRate,',
      '    isWholeSentenceListening: isWholeSentenceListening,',
      '    wholeSentenceListenRate: wholeSentenceListenRate,',
      '    multiTapTargets: multiTapTargets,',
    ].join('\n'),
    [
      '    wholeSentenceShadowRate: wholeSentenceShadowRate,',
      '    multiTapTargets: multiTapTargets,',
    ].join('\n'),
    'q8 exports'
  );
  return text;
}


function stripQ6RunnerDelta(text) {
  function once(source, needle, replacement, label) {
    const at = source.indexOf(needle);
    assert.ok(at !== -1, label);
    assert.strictEqual(source.indexOf(needle, at + needle.length), -1, label);
    return source.slice(0, at) + replacement + source.slice(at + needle.length);
  }
  text = once(
    text,
    '   * Q9 opening only. Later youglish slides keep 「下一題」.\n   * Q6 opening is audioListenAdvanceLabel, not this predicate.\n',
    '   * Q9 opening only. Later slides, and every other objective, keep 「下一題」.\n',
    'q6 comment'
  );
  const advance = text.indexOf('  /**\n   * Advance label when an audio slide has no');
  const q18 = text.indexOf('  /**\n   * Q18 segment chrome');
  assert.ok(advance !== -1 && q18 > advance, 'q6 label fn');
  text = text.slice(0, advance) + text.slice(q18);
  const grade = text.indexOf('  /**\n   * order_text is correct when chosen indexes equal correct_order.\n');
  const makeAudio = text.indexOf('  function makeAudio(src, opts) {\n');
  assert.ok(grade !== -1 && makeAudio > grade, 'order_text grade');
  text = text.slice(0, grade) + [
    '  function prepareSlides(quiz) {',
    '    if (!quiz) return [];',
    "    if (quiz.objective === 'mother_cloze_usage') return clozeSlides(quiz);",
    "    if (quiz.objective === 'sentence_listen_to_l1') return listenToL1Slides(quiz);",
    '    return quiz.slides || [];',
    '  }',
    '',
    '',
  ].join('\n') + text.slice(makeAudio);
  const mount = text.indexOf('    /**\n     * order_text: put every option into correct_order');
  const render = text.indexOf('    function renderSlide() {\n');
  assert.ok(mount !== -1 && render > mount, 'order_text mount');
  text = text.slice(0, mount) + text.slice(render);
  text = once(
    text,
    '          // Q6 opening 「記住咗」. Q9 opening 「繼續」. Otherwise 「下一題」.\n          // slide.button is not read.\n          const nextLabel = audioListenAdvanceLabel(quiz, slide, type, idx);\n',
    "          const nextLabel = youglishOpeningContinue(quiz, slide, type, idx) ? '繼續' : '下一題';\n",
    'q6 label call'
  );
  text = once(
    text,
    [
      "      if (type === 'order_text') {",
      '        var orderCount = Array.isArray(slide.options) ? slide.options.length : 0;',
      '        if (orderCount <= 1) {',
      '          idx++;',
      '          renderSlide();',
      '          return;',
      '        }',
      '        mountOrderText(slide);',
      '        return;',
      '      }',
      '',
      '',
    ].join('\n'),
    '',
    'order_text branch'
  );
  text = once(
    text,
    [
      '    hotspotRect: hotspotRect,',
      '    audioListenAdvanceLabel: audioListenAdvanceLabel,',
      '    gradeOrderText: gradeOrderText,',
      '    orderTextSlideShown: orderTextSlideShown,',
      '',
    ].join('\n'),
    '    hotspotRect: hotspotRect,\n',
    'q6 exports'
  );
  return text;
}


function assertRunnerIsQ4PinPlusQ6AndQ8Delta(runnerHead) {
  let text = fs.readFileSync(path.join(root, 'js/quiz-runner.js'), 'utf8');
  text = stripQ8RunnerDelta(text);
  text = stripQ6RunnerDelta(text);
  const pinnedRunner = execFileSync('git', ['show', runnerHead + ':js/quiz-runner.js'], {
    cwd: root,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.ok(Buffer.from(text).equals(pinnedRunner), 'runner drifted from ' + runnerHead + ' beyond the Q6 and Q8 deltas');
  assert.strictEqual('記住咗'.charCodeAt(2), 0x5497);
}


function surfaceSince(sha) {
  return execFileSync(
    'git',
    ['diff', '--name-only', sha, '--', 'data/schedule.json', 'data/groups.json', 'js', 'css', 'index.html', 'group.html', 'stats.html', 'export.html'],
    { cwd: root, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .sort();
}

test('every group has the Soft GO sentence count and chunk-boundary-wins holds', function () {
  assert.strictEqual(groups.groups.length, Object.keys(EXPECTED_SENTENCES).length);
  const passages = groups.groups.map((g) => g.sentence);
  assert.strictEqual(new Set(passages).size, passages.length);
  groups.groups.forEach((group) => {
    assert.strictEqual(group.sentences.length, EXPECTED_SENTENCES[group.slug], group.slug);
    if (group.sentences.length === 0) {
      assert.strictEqual(group.sentence_quizzes_ready, false, group.slug);
      return;
    }
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
      audio: 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/131f65042daec5ddc382a2004645f9be78c4fffd/audio/chunk-etto.mp3',
      correct: 'Air拖',
      wav: 'data/audio/clips/koshitsu-yoyaku-1.wav',
    },
    {
      quiz_id: 'sounding-koshitsu-yoyaku-17-v1',
      chunk_id: 17,
      audio: 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/4bc4cf9c58f31df39548b5b584c66c11145a3578/audio/chunk-purande.mp3',
      correct: '潑爛地',
      wav: 'data/audio/clips/koshitsu-yoyaku-17.wav',
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
    const audio = quiz.slides[0];
    assert.strictEqual(audio.type, 'audio_listen', item.quiz_id);
    assert.strictEqual(audio.audio, item.audio, item.quiz_id);
    assert.strictEqual(audio.instruction, '請聆聽。', item.quiz_id);
    assert.strictEqual(audio.self_check, false, item.quiz_id);
    assert.strictEqual(audio.rate, 1, item.quiz_id);
    assert.strictEqual(quiz.slides[1].type, 'select_text', item.quiz_id);
    assert.strictEqual(quiz.slides[1].correct, item.correct, item.quiz_id);
    assert.ok(fs.existsSync(path.join(root, item.wav)), item.wav);
  });
  const quiz17 = JSON.parse(
    fs.readFileSync(path.join(root, 'data/quizzes/sounding-koshitsu-yoyaku-17-v1.json'), 'utf8')
  );
  assert.strictEqual(quiz17.slides[1].correct, '潑爛地');
  assert.strictEqual(quiz17.slides[2].type, 'order_text');
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
  const audio2 = quiz2.slides[0];
  assert.strictEqual(audio2.type, 'audio_listen');
  assert.strictEqual(audio2.instruction, '請聆聽。');
  assert.strictEqual(audio2.self_check, false);
  assert.strictEqual(audio2.rate, 1);
  assert.strictEqual(audio2.audio, 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/03207c8ba3aaf48c0dc161abdc69d9c595a8fae0/audio/chunk-koshitsutte.mp3');
  assert.strictEqual(quiz2.slides[1].correct, '哥舌豬Dead');
  const wav2 = fs.readFileSync(path.join(root, 'data/audio/clips/koshitsu-yoyaku-2.wav'));
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
  const audio3 = quiz3.slides[0];
  assert.strictEqual(audio3.type, 'audio_listen');
  assert.strictEqual(audio3.instruction, '請聆聽。');
  assert.strictEqual(audio3.self_check, false);
  assert.strictEqual(audio3.rate, 1);
  assert.strictEqual(audio3.audio, 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/03207c8ba3aaf48c0dc161abdc69d9c595a8fae0/audio/chunk-mada.mp3');
  assert.strictEqual(quiz3.slides[1].correct, '馬打');
  const wav3 = fs.readFileSync(path.join(root, 'data/audio/clips/koshitsu-yoyaku-3.wav'));
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
  const audio5 = quiz5.slides[0];
  assert.strictEqual(audio5.type, 'audio_listen');
  assert.strictEqual(audio5.instruction, '請聆聽。');
  assert.strictEqual(audio5.self_check, false);
  assert.strictEqual(audio5.rate, 1);
  assert.strictEqual(audio5.audio, 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/03207c8ba3aaf48c0dc161abdc69d9c595a8fae0/audio/chunk-koshitsuha.mp3');
  assert.strictEqual(quiz5.slides[1].correct, '哥sit豬蛙');
  const wav5 = fs.readFileSync(path.join(root, 'data/audio/clips/koshitsu-yoyaku-5.wav'));
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
  assert.strictEqual(quiz6.slides[0].type, 'audio_listen');
  assert.strictEqual(quiz6.slides[0].audio, 'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/03207c8ba3aaf48c0dc161abdc69d9c595a8fae0/audio/chunk-mou.mp3');
  assert.strictEqual(quiz6.slides[0].instruction, '請聆聽。');
  assert.strictEqual(quiz6.slides[0].self_check, false);
  assert.strictEqual(quiz6.slides[0].rate, 1);
  assert.strictEqual(quiz6.slides.length, 2);
  assert.strictEqual(quiz6.slides[1].correct, '摸');
  const wav6 = fs.readFileSync(path.join(root, 'data/audio/clips/koshitsu-yoyaku-6.wav'));
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
    assert.strictEqual(audio.type, 'audio_listen');
    assert.strictEqual(audio.instruction, '請聆聽。');
    assert.strictEqual(audio.self_check, false);
    assert.strictEqual(audio.rate, 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(audio, 'start_sec'));
    assert.ok(!Object.prototype.hasOwnProperty.call(audio, 'end_sec'));
    const choice = quiz.slides.find((slide) => slide.type === 'select_text');
    assert.strictEqual(choice.correct, item.sounding, quizId);
    if (item.id === 16) {
      assert.strictEqual(item.sounding.codePointAt(0), 0x651e);
    }
    const wav = fs.readFileSync(path.join(root, 'data/audio/clips/koshitsu-yoyaku-' + item.id + '.wav'));
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
  let files = fs.readdirSync(quizDir).filter((file) => /^sentence-shadowing-(125|075)-.+-v1\.json$/.test(file));
  const retiredUncutShadow = new Set([
    'sentence-shadowing-125-gochumon-okimari-1-v1.json',
    'sentence-shadowing-075-gochumon-okimari-1-v1.json',
  ]);
  assert.strictEqual(files.length, 120);
  retiredUncutShadow.forEach((file) => {
    assert.ok(files.indexOf(file) !== -1, file);
    const retiredQuiz = JSON.parse(fs.readFileSync(path.join(quizDir, file), 'utf8'));
    assert.strictEqual(
      manifest.quizzes.filter((row) => row.quiz_id === retiredQuiz.quiz_id).length,
      0,
      retiredQuiz.quiz_id
    );
  });
  files = files.filter((file) => !retiredUncutShadow.has(file));
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
  assert.strictEqual(sentences.length, 297);
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
      assert.ok(
        row.objective === 'sentence_example_sentences_listening' ||
          row.objective === 'sentence_usage_feature_judgment',
        row.quiz_id
      );
      assert.strictEqual(row.group_slug, 'gochumon', row.quiz_id);
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
    sentence_listen_to_l1: 54,
    sentence_l1_palace_multi_tap: 54,
    sentence_shadowing_125: 60,
    sentence_shadowing_075: 60,
    sentence_discourse_mcq: 64,
    sentence_example_sentences_listening: 2,
    sentence_usage_feature_judgment: 2,
    sentence_minimal_pair_grouping: 1,
  });
  groups.groups.forEach((group) => {
    if (group.sentence_quizzes_ready === false) return;
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
  assert.strictEqual(q25.length, 2);
  assert.ok(q25.every((row) => row.group_slug === 'gochumon'));
  assert.deepStrictEqual(q25.map((row) => row.sentence_id).sort(), ['s1', 's2']);
  assert.ok(!annaiQuizzes.some((q) => q.objective === 'sentence_example_sentences_listening'));
  assert.ok(!annaiQuizzes.some((q) => q.objective === 'sentence_usage_feature_judgment'));
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

test('gochumon split sentences open Q25 and Q26 only after their own Keep chunks leave dense', function () {
  const now = Date.parse('2026-11-10T04:30:00+08:00');
  const group = groupBySlug('gochumon');
  const s1 = group.sentences.find((s) => s.id === 's1');
  const s2 = group.sentences.find((s) => s.id === 's2');
  assert.deepStrictEqual(s1.chunk_ids, [1, 2, 3]);
  assert.strictEqual(s1.text, 'ご注文お決まりになりましたら');
  assert.strictEqual(s1.l1, '您的點餐決定好了的話。');
  assert.deepStrictEqual(s2.chunk_ids, [4, 5]);
  assert.strictEqual(s2.text, 'お呼びください');
  assert.strictEqual(s2.l1, '請叫我。');
  assert.strictEqual(group.sentence, 'ご注文お決まりになりましたらお呼びください');
  assert.strictEqual(group.title, group.sentence);
  assert.deepStrictEqual(group.chunks.map((c) => c.id), [1, 2, 3, 4, 5]);
  const retired = [
    'sentence-listen-to-l1-gochumon-okimari-1-v1',
    'sentence-l1-palace-multi-tap-gochumon-okimari-1-v1',
    'sentence-shadowing-125-gochumon-okimari-1-v1',
    'sentence-shadowing-075-gochumon-okimari-1-v1',
    'sentence-discourse-mcq-gochumon-okimari-1-prev-v1',
    'sentence-example-listen-gochumon-v1',
  ];
  retired.forEach((id) => {
    assert.ok(fs.existsSync(path.join(root, 'data/quizzes', id + '.json')), id);
    assert.ok(!manifest.quizzes.some((q) => q.quiz_id === id), id);
  });
  const kakunin = groupBySlug('gochumon-kakunin');
  assert.strictEqual(kakunin.sentences[0].text, 'ご注文確認させていただきます。');
  assert.deepStrictEqual(kakunin.sentences[1].chunk_ids, [4, 5]);
  assert.ok(manifest.quizzes.some((q) => q.quiz_id === 'sentence-listen-to-l1-gochumon-kakunin-1-v1'));
  assert.ok(manifest.quizzes.some((q) => q.quiz_id === 'sequence-gochumon-okimari-narimashitara-oyobi-kudasai-v1'));
  const row = manifest.quizzes.find((q) => q.quiz_id === 'sentence-example-listen-gochumon-okimari-v1');
  const q26 = manifest.quizzes.find((q) => q.quiz_id === 'sentence-usage-feature-gochumon-s1-v2');
  const s2q26 = manifest.quizzes.find((q) => q.quiz_id === 'sentence-usage-feature-oyobi-kudasai-v1');
  assert.strictEqual(row.kind, 'sentence');
  assert.strictEqual(row.objective, 'sentence_example_sentences_listening');
  assert.strictEqual(row.group_slug, 'gochumon');
  assert.strictEqual(row.sentence_id, 's1');
  assert.strictEqual(row.sentence, group.sentence);
  assert.strictEqual(row.shell, false);
  assert.strictEqual(row.level, null);
  assert.strictEqual(row.chunk_id, null);
  assert.strictEqual(q26.sentence_id, 's1');
  assert.strictEqual(q26.objective, 'sentence_usage_feature_judgment');
  assert.strictEqual(s2q26.sentence_id, 's2');
  assert.strictEqual(s2q26.group_slug, 'gochumon');
  const unit = { stageIndex: 0, lastCompletedAt: null };
  const fresh = function () { return { stageIndex: 0, lastCompletedAt: null }; };
  function due(objective, sentence, getChunkState) {
    return Schedule.dueStages({
      objective: objective,
      kind: 'sentence',
      schedule: schedule,
      sentenceUnitState: unit,
      completedStages: [],
      now: now,
      underChunkGate: { sentence: sentence, chunks: group.chunks, getChunkState: getChunkState },
    });
  }
  const s1Left = function (id) {
    if (id === 1 || id === 2 || id === 3) return { stageIndex: 4, lastCompletedAt: null };
    return fresh();
  };
  const q27 = manifest.quizzes.find((q) => q.quiz_id === 'sentence-minimal-pair-gochumon-okimari-1-v1');
  assert.strictEqual(q27.objective, 'sentence_minimal_pair_grouping');
  assert.strictEqual(q27.kind, 'sentence');
  assert.strictEqual(q27.group_slug, 'gochumon');
  assert.strictEqual(q27.sentence_id, 's1');
  assert.strictEqual(q27.sentence, group.sentence);
  assert.strictEqual(q27.shell, false);
  assert.strictEqual(q27.level, null);
  assert.strictEqual(q27.chunk_id, null);
  const q27Body = JSON.parse(fs.readFileSync(path.join(root, q27.file), 'utf8'));
  assert.strictEqual(q27Body.quiz_id, q27.quiz_id);
  assert.strictEqual(q27Body.sentence, s1.text);
  assert.strictEqual(q27Body.sentence_index, 1);
  assert.ok(!manifest.quizzes.some((q) => q.objective === 'sentence_minimal_pair_grouping' && (q.sentence_id !== 's1' || q.group_slug !== 'gochumon')));
  ['sentence_example_sentences_listening', 'sentence_usage_feature_judgment', 'sentence_minimal_pair_grouping', 'sentence_listen_to_l1'].forEach(function (objective) {
    assert.deepStrictEqual(due(objective, s1, fresh), [], objective);
    assert.deepStrictEqual(due(objective, s1, s1Left), ['T01'], objective);
    assert.deepStrictEqual(due(objective, s2, s1Left), [], objective + ' s2');
  });
  const almost = function (id) {
    if (id === 3) return { stageIndex: 0, lastCompletedAt: null };
    return { stageIndex: 4, lastCompletedAt: null };
  };
  assert.deepStrictEqual(due(row.objective, s1, almost), []);
  const left = function () { return { stageIndex: 4, lastCompletedAt: null }; };
  assert.deepStrictEqual(due(q26.objective, s2, left), ['T01']);
  assert.deepStrictEqual(due('sentence_listen_to_l1', s2, left), ['T01']);
});

test('20261111 once-reset page clears only gochumon sentence-layer keys', function () {
  const html = fs.readFileSync(path.join(root, 'tools/once-reset-gochumon-sentence-20261111.html'), 'utf8');
  const previous = fs.readFileSync(path.join(root, 'tools/once-reset-gochumon-sentence-20261110.html'), 'utf8');
  assert.ok(previous.indexOf('sentence-usage-feature-oyobi') === -1);
  assert.ok(previous.indexOf('sentence-minimal-pair-gochumon') === -1);
  assert.ok(html.indexOf("var UNIT_PREFIX = 'gochumon:'") !== -1);
  assert.ok(html.indexOf("var SENTENCE_KEY = 'gochumon'") !== -1);
  assert.ok(html.indexOf("var OWNER_ID = 'larry'") !== -1);
  assert.ok(html.indexOf("var DOC_KEY = 'website-manager-progress-v2'") !== -1);
  assert.ok(html.indexOf('sync_snapshots') !== -1);
  assert.ok(html.indexOf('group.html?slug=gochumon') !== -1);
  const block = html.slice(html.indexOf('var QUIZ_PREFIXES'), html.indexOf('];', html.indexOf('var QUIZ_PREFIXES')));
  const prefixes = block.match(/'([^']+)'/g).map(function (s) { return s.slice(1, -1); });
  assert.deepStrictEqual(prefixes, [
    'sentence-listen-to-l1-gochumon',
    'sentence-l1-palace-multi-tap-gochumon',
    'sentence-shadowing-125-gochumon',
    'sentence-shadowing-075-gochumon',
    'sentence-discourse-mcq-gochumon',
    'sentence-example-listen-gochumon',
    'sentence-usage-feature-gochumon',
    'sentence-usage-feature-oyobi',
    'sentence-minimal-pair-gochumon',
  ]);
  function isGochumonSentenceQuiz(id) {
    if (typeof id !== 'string') return false;
    if (id.indexOf('gochumon-kakunin') !== -1) return false;
    return prefixes.some(function (prefix) { return id.indexOf(prefix) === 0; });
  }
  assert.strictEqual(isGochumonSentenceQuiz('sentence-example-listen-gochumon-v1'), true);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-usage-feature-oyobi-kudasai-v1'), true);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-usage-feature-gochumon-s1-v2'), true);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-minimal-pair-gochumon-okimari-1-v1'), true);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-minimal-pair-gochumon-kakunin-1-v1'), false);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-listen-to-l1-gochumon-kakunin-1-v1'), false);
  assert.strictEqual(isGochumonSentenceQuiz('example-listen-gochumon-1-v2'), false);
  assert.strictEqual(isGochumonSentenceQuiz('sentence-segment-shadow-gochumon-d1-v1'), false);
  assert.strictEqual('gochumon-kakunin:s1'.indexOf('gochumon:'), -1);
  assert.strictEqual('gochumon:s1'.indexOf('gochumon:'), 0);
  assert.strictEqual('gochumon:s2'.indexOf('gochumon:'), 0);
});

test('existing live Q2 files stay byte-identical to main parent 77f4aefe', function () {
  const parent = '77f4aefe2c3d750eb6483743eb43bfd4330bcbae';
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', parent, 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((file) => /\/gloss-palace-.*\.json$/.test(file));
  assert.strictEqual(listed.length, 156);
  listed.forEach((file) => {
    const before = execFileSync('git', ['show', parent + ':' + file], { cwd: root });
    const after = fs.readFileSync(path.join(root, file));
    assert.ok(before.equals(after), file);
  });
  const quizStatus = execFileSync('git', ['diff', '--name-status', parent, '--', 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const allowedNew = /^data\/quizzes\/gloss-palace-(ichio|kanban-menu|kanki-maa-maa|kaori-ga-ari|kodomo-omoide|konna-basho|koshitsu-yoyaku|kyou-no-6jihan|niwatori-atama|odenwa|oseki|rayu|roji|sore-wa|teikuauto)-\d+-v1\.json$/;
  // Q3 rewrites meaning-object files in place and adds unpublished Keep files.
  // Q4/Q7 rewrite the live shadow files and add unpublished Keep files.
  // Q5 rewrites live story_select_image files and adds unpublished Keep files.
  // Gloss-palace bytes above stay pinned to this parent. Other quiz types still cannot change.
  const q3Base = '2e2dcbe25ccc06b985ff3e2eeb9ab788c50a265e';
  const parentQuizPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', parent, 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const shadowAtParent = new Set(parentQuizPaths.filter((file) => isShadowQuizPath(file)));
  const storyAtParent = new Set(parentQuizPaths.filter((file) => isStoryQuizPath(file)));
  const soundingAtParent = new Set(parentQuizPaths.filter((file) => isSoundingQuizPath(file)));
  const meaningAtQ3Base = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', q3Base, 'data/quizzes'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((file) => /\/meaning-object-.*\.json$/.test(file))
  );
  assert.strictEqual(meaningAtQ3Base.size, 156);
  const forbiddenMeaning = new Set([
    'data/quizzes/meaning-object-mitame-irotsuya-3-v1.json',
    'data/quizzes/meaning-object-roji-6-v1.json',
    'data/quizzes/meaning-object-koshitsu-yoyaku-19-v1.json',
  ]);
  (quizStatus ? quizStatus.split('\n') : []).forEach((line) => {
    const tab = line.indexOf('\t');
    const status = line.slice(0, tab);
    const file = line.slice(tab + 1);
    if (allowedNew.test(file)) {
      assert.strictEqual(status, 'A', line);
      return;
    }
    if (isShadowQuizPath(file)) {
      assert.ok(FORBIDDEN_SHADOW_IDS.indexOf(path.basename(file, '.json')) === -1, file);
      if (shadowAtParent.has(file)) assert.strictEqual(status, 'M', line);
      else assert.strictEqual(status, 'A', line);
      return;
    }
    if (isStoryQuizPath(file)) {
      assertAllowedStoryChange(file, status, storyAtParent);
      return;
    }
    if (isWholeListenQuizPath(file)) {
      assertWholeListenRewrite(file, status, parent);
      return;
    }
    if (isSoundingQuizPath(file)) {
      assertAllowedSoundingChange(file, status, soundingAtParent);
      return;
    }
    assert.ok(/^data\/quizzes\/meaning-object-.*\.json$/.test(file), 'unexpected quiz file change: ' + line);
    assert.ok(!forbiddenMeaning.has(file), file);
    if (meaningAtQ3Base.has(file)) assert.strictEqual(status, 'M', line);
    else assert.strictEqual(status, 'A', line);
  });
  // groups.json differs from this parent because PR #49's official skip is already on main.
  // This ship adds the Q4/Q7 runner and the group.html cache bump only.
  assert.deepStrictEqual(surfaceSince(parent), ['data/groups.json', 'group.html', 'js/quiz-runner.js']);
});

test('unpublished Keep Q2 quizzes hang on the manifest with Gloss prompts and live chunk ids', function () {
  const suffix = '。請點選與這個詞相關的物件同區域。';
  const slugs = [
    'ichio',
    'kanban-menu',
    'kanki-maa-maa',
    'kaori-ga-ari',
    'kodomo-omoide',
    'konna-basho',
    'koshitsu-yoyaku',
    'kyou-no-6jihan',
    'niwatori-atama',
    'odenwa',
    'oseki',
    'rayu',
    'roji',
    'sore-wa',
    'teikuauto',
  ];
  const expectedCounts = {
    ichio: 7,
    'kanban-menu': 11,
    'kanki-maa-maa': 8,
    'kaori-ga-ari': 9,
    'kodomo-omoide': 9,
    'konna-basho': 7,
    'koshitsu-yoyaku': 13,
    'kyou-no-6jihan': 5,
    'niwatori-atama': 11,
    odenwa: 4,
    oseki: 5,
    rayu: 6,
    roji: 10,
    // 電話番号 and 美味しい are official skip:true on main (PR #49), so they are outside this Keep walk.
    'sore-wa': 9,
    teikuauto: 8,
  };
  const gaps = [];
  const absent = [
    'gloss-palace-goraikou-2-v1',
    'gloss-palace-koshitsu-yoyaku-4-v1',
    'gloss-palace-koshitsu-yoyaku-9-v1',
    'gloss-palace-koshitsu-yoyaku-11-v1',
    'gloss-palace-koshitsu-yoyaku-12-v1',
    'gloss-palace-koshitsu-yoyaku-13-v1',
  ];
  const skipTexts = ['めっちゃ', 'ありがとうございます', 'お願いします', '空いてますかね'];
  const liveKoshitsu = [1, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16, 17, 19];

  function isGap(slug, chunkId) {
    return gaps.some((gap) => gap.slug === slug && gap.chunk_id === chunkId);
  }

  const rows = manifest.quizzes.filter((quiz) => {
    return slugs.some((slug) => quiz.quiz_id.indexOf('gloss-palace-' + slug + '-') === 0);
  });
  assert.strictEqual(rows.length, 124);
  const counts = {};
  const seenHotspots = {};
  slugs.forEach((slug) => {
    const group = groupBySlug(slug);
    const keep = (group.chunks || []).filter((chunk) => !isSkip(chunk));
    keep.forEach((chunk) => {
      const quizId = 'gloss-palace-' + slug + '-' + chunk.id + '-v1';
      const row = rows.find((quiz) => quiz.quiz_id === quizId);
      if (isGap(slug, chunk.id)) {
        assert.ok(!row, quizId);
        assert.ok(!fs.existsSync(path.join(root, 'data/quizzes', quizId + '.json')), quizId);
        return;
      }
      assert.ok(row, quizId);
      assert.strictEqual(row.objective, 'gloss_to_palace_tap', quizId);
      assert.strictEqual(row.level, 2, quizId);
      assert.strictEqual(row.kind, 'chunk', quizId);
      assert.strictEqual(row.chunk_id, chunk.id, quizId);
      assert.strictEqual(row.sentence, group.sentence, quizId);
      assert.strictEqual(row.file, 'data/quizzes/' + quizId + '.json', quizId);
      const quiz = JSON.parse(fs.readFileSync(path.join(root, row.file), 'utf8'));
      assert.strictEqual(quiz.quiz_id, quizId);
      assert.strictEqual(quiz.objective, 'gloss_to_palace_tap');
      assert.strictEqual(quiz.level, 2);
      assert.strictEqual(quiz.variant, 1);
      assert.strictEqual(quiz.sentence, group.sentence);
      assert.deepStrictEqual(quiz.chunk, { id: chunk.id, text: chunk.text });
      assert.strictEqual(quiz.feedback.on_wrong, 'show_correct_box');
      assert.strictEqual(quiz.slides[0].type, 'prompt');
      assert.ok(quiz.slides[0].text.endsWith(suffix), quizId);
      assert.ok(quiz.slides[0].text.length > suffix.length, quizId);
      assert.ok(skipTexts.indexOf(quiz.chunk.text) === -1, quizId);
      assert.strictEqual(quiz.slides[1].type, 'tap');
      assert.strictEqual(
        quiz.slides[1].image,
        'https://raw.githubusercontent.com/larryleungtsz/flashcard-app/main/images/palace-' + slug + '.png',
        quizId
      );
      assert.strictEqual(quiz.slides[1].hotspot.unit, 'percent', quizId);
      ['left', 'top', 'width', 'height'].forEach((key) => {
        assert.strictEqual(typeof quiz.slides[1].hotspot[key], 'number', quizId + ' ' + key);
      });
      assert.ok(quiz.slides[1].hotspot.width > 0 && quiz.slides[1].hotspot.height > 0, quizId);
      const q1 = manifest.quizzes.find((item) => {
        return item.objective === 'loci_description_tap' && item.sentence === group.sentence && item.chunk_id === chunk.id;
      });
      assert.ok(q1, 'live Q1 for ' + quizId);
      const q1Body = JSON.parse(fs.readFileSync(path.join(root, q1.file), 'utf8'));
      assert.deepStrictEqual(quiz.slides[1].hotspot, q1Body.slides[1].hotspot, quizId);
      assert.strictEqual(quiz.slides[1].image, q1Body.slides[1].image, quizId);
      const box = JSON.stringify(quiz.slides[1].hotspot);
      seenHotspots[slug] = seenHotspots[slug] || {};
      assert.ok(!seenHotspots[slug][box], quizId + ' shares an Area with another Keep chunk');
      seenHotspots[slug][box] = quizId;
      counts[slug] = (counts[slug] || 0) + 1;
    });
  });
  assert.deepStrictEqual(counts, expectedCounts);
  const koshitsuIds = rows
    .filter((row) => row.quiz_id.indexOf('gloss-palace-koshitsu-yoyaku-') === 0)
    .map((row) => row.chunk_id)
    .sort((a, b) => a - b);
  assert.deepStrictEqual(koshitsuIds, liveKoshitsu);
  absent.forEach((quizId) => {
    assert.ok(!manifest.quizzes.some((quiz) => quiz.quiz_id === quizId), quizId);
    assert.ok(!fs.existsSync(path.join(root, 'data/quizzes', quizId + '.json')), quizId);
  });
  assert.ok(!fs.existsSync(path.join(root, 'data/quizzes/gloss-palace-goraikou-2-v1.json')));
  const example = rows.find((row) => row.quiz_id === 'gloss-palace-ichio-1-v1');
  const exampleQuiz = JSON.parse(fs.readFileSync(path.join(root, example.file), 'utf8'));
  assert.strictEqual(exampleQuiz.slides[0].text, '姑且。請點選與這個詞相關的物件同區域。');
  const table = JSON.parse(fs.readFileSync(path.join(root, 'data/quizzes/gloss-palace-koshitsu-yoyaku-10-v1.json'), 'utf8'));
  assert.strictEqual(table.chunk.id, 10);
  assert.strictEqual(table.chunk.text, 'テーブル席で');
  assert.strictEqual(table.quiz_id, 'gloss-palace-koshitsu-yoyaku-10-v1');
  const aru = JSON.parse(fs.readFileSync(path.join(root, 'data/quizzes/gloss-palace-roji-6-v1.json'), 'utf8'));
  assert.strictEqual(aru.quiz_id, 'gloss-palace-roji-6-v1');
  assert.strictEqual(aru.chunk.text, 'ある');
  assert.strictEqual(aru.slides[0].text, '有。請點選與這個詞相關的物件同區域。');
  const kashiko = JSON.parse(fs.readFileSync(path.join(root, 'data/quizzes/gloss-palace-koshitsu-yoyaku-19-v1.json'), 'utf8'));
  assert.strictEqual(kashiko.quiz_id, 'gloss-palace-koshitsu-yoyaku-19-v1');
  assert.strictEqual(kashiko.chunk.text, 'かしこまりました');
  assert.strictEqual(kashiko.slides[0].text, '明白了／遵命。請點選與這個詞相關的物件同區域。');
});

test('official Q3 files are 2-step and 278 hangs cover live Keep except two Soft Skips', function () {
  const base = '2e2dcbe25ccc06b985ff3e2eeb9ab788c50a265e';
  const shaImage = /^https:\/\/raw\.githubusercontent\.com\/larryleungtsz\/flashcard-app\/[0-9a-f]{40}\/images\/[^/]*combined[^/]*\.(?:jpg|jpeg|png)$/i;
  const quizDir = path.join(root, 'data/quizzes');
  const files = fs.readdirSync(quizDir).filter((file) => /^meaning-object-.*\.json$/.test(file)).sort();
  assert.strictEqual(files.length, 276);
  const atBase = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'data/quizzes'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((file) => /\/meaning-object-.*\.json$/.test(file))
  );
  assert.strictEqual(atBase.size, 156);
  const added = files.filter((file) => !atBase.has('data/quizzes/' + file));
  assert.strictEqual(added.length, 120);
  atBase.forEach((file) => {
    assert.ok(files.indexOf(path.basename(file)) !== -1, 'dropped ' + file);
  });
  const forbidden = [
    'meaning-object-mitame-irotsuya-3-v1',
    'meaning-object-roji-6-v1',
    'meaning-object-koshitsu-yoyaku-19-v1',
  ];
  forbidden.forEach((quizId) => {
    assert.ok(files.indexOf(quizId + '.json') === -1, quizId);
    assert.ok(!fs.existsSync(path.join(quizDir, quizId + '.json')), quizId);
    assert.ok(!manifest.quizzes.some((row) => row.quiz_id === quizId), quizId);
  });

  const diff = execFileSync('git', ['diff', '--name-status', base, '--', 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const q3BaseQuizPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const shadowAtQ3Base = new Set(q3BaseQuizPaths.filter((file) => isShadowQuizPath(file)));
  const storyAtQ3Base = new Set(q3BaseQuizPaths.filter((file) => isStoryQuizPath(file)));
  const soundingAtQ3Base = new Set(q3BaseQuizPaths.filter((file) => isSoundingQuizPath(file)));
  const changed = new Map();
  (diff ? diff.split('\n') : []).forEach((line) => {
    const tab = line.indexOf('\t');
    const status = line.slice(0, tab);
    const file = line.slice(tab + 1);
    if (isShadowQuizPath(file)) {
      assert.ok(FORBIDDEN_SHADOW_IDS.indexOf(path.basename(file, '.json')) === -1, file);
      if (shadowAtQ3Base.has(file)) assert.strictEqual(status, 'M', line);
      else assert.strictEqual(status, 'A', line);
      return;
    }
    if (isStoryQuizPath(file)) {
      assertAllowedStoryChange(file, status, storyAtQ3Base);
      return;
    }
    if (isWholeListenQuizPath(file)) {
      assertWholeListenRewrite(file, status, base);
      return;
    }
    if (isSoundingQuizPath(file)) {
      assertAllowedSoundingChange(file, status, soundingAtQ3Base);
      return;
    }
    assert.ok(/^data\/quizzes\/meaning-object-.*\.json$/.test(file), 'unexpected quiz file change: ' + line);
    assert.ok(forbidden.indexOf(path.basename(file, '.json')) === -1, file);
    if (atBase.has(file)) assert.strictEqual(status, 'M', line);
    else assert.strictEqual(status, 'A', line);
    changed.set(file, status);
  });
  atBase.forEach((file) => assert.strictEqual(changed.get(file), 'M', 'not rewritten ' + file));
  added.forEach((file) => {
    const rel = 'data/quizzes/' + file;
    if (changed.has(rel)) assert.strictEqual(changed.get(rel), 'A', rel);
  });

  const expectedCounts = {
    example_sentences_listening: 154,
    loci_description_tap: 280,
    meaning_object_select_and_tap: 278,
    pronunciation_sounding_select: 277,
    story_select_image: 278,
    tone_shadowing_05: 278,
    word_shadowing_025: 278,
    writing_shadowing: 155,
    youglish_listen: 152,
    gloss_to_palace_tap: 280,
    target_to_mnemonic_image: 156,
    mother_language_pronounce: 155,
    mother_to_target_language: 156,
    mother_cloze_usage: 1,
    sentence_segment_shadowing: 660,
    sequence_training: 22,
    whole_sentence_listening: 22,
    sentence_listen_to_l1: 54,
    sentence_l1_palace_multi_tap: 54,
    sentence_shadowing_125: 60,
    sentence_shadowing_075: 60,
    sentence_discourse_mcq: 64,
    sentence_example_sentences_listening: 2,
    sentence_usage_feature_judgment: 2,
    sentence_minimal_pair_grouping: 1,
  };
  const counts = {};
  manifest.quizzes.forEach((row) => {
    counts[row.objective] = (counts[row.objective] || 0) + 1;
  });
  assert.deepStrictEqual(counts, expectedCounts);
  assert.strictEqual(manifest.quizzes.length, 3879);
  assert.deepStrictEqual(surfaceSince(base), ['data/groups.json', 'group.html', 'js/quiz-runner.js']);

  const q3 = manifest.quizzes.filter((row) => row.objective === 'meaning_object_select_and_tap');
  assert.strictEqual(q3.length, 278);
  const ids = new Set(q3.map((row) => row.quiz_id));
  assert.strictEqual(ids.size, 276);
  const groupBySentence = new Map(groups.groups.map((group) => [group.sentence, group]));
  const bodies = new Map();
  files.forEach((file) => {
    const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, file), 'utf8'));
    bodies.set(quiz.quiz_id, quiz);
    assert.strictEqual(quiz.quiz_id, file.replace(/\.json$/, ''), file);
    assert.strictEqual(quiz.objective, 'meaning_object_select_and_tap', quiz.quiz_id);
    assert.strictEqual(quiz.level, 1, quiz.quiz_id);
    assert.strictEqual(quiz.variant, 1, quiz.quiz_id);
    assert.deepStrictEqual((quiz.slides || []).map((slide) => slide.type), ['prompt', 'tap'], quiz.quiz_id);
    assert.ok(!quiz.slides.some((slide) => slide.type === 'select_image'), quiz.quiz_id);
    assert.strictEqual(typeof quiz.slides[0].text, 'string', quiz.quiz_id);
    assert.ok(quiz.slides[0].text.length > 0, quiz.quiz_id);
    assert.ok(shaImage.test(quiz.slides[1].image), quiz.quiz_id + ' ' + quiz.slides[1].image);
    assert.ok(!/\/main\//.test(quiz.slides[1].image), quiz.quiz_id);
    assert.ok(!/palace/i.test(quiz.slides[1].image), quiz.quiz_id);
    const hotspot = quiz.slides[1].hotspot;
    assert.strictEqual(hotspot.unit, 'percent', quiz.quiz_id);
    ['left', 'top', 'width', 'height'].forEach((key) => {
      assert.strictEqual(typeof hotspot[key], 'number', quiz.quiz_id + ' ' + key);
    });
    assert.ok(hotspot.width > 0 && hotspot.height > 0, quiz.quiz_id);
    assert.strictEqual(quiz.feedback.on_wrong, 'show_correct_box', quiz.quiz_id);
    const group = groupBySentence.get(quiz.sentence);
    assert.ok(group, quiz.quiz_id);
    const chunk = (group.chunks || []).find((item) => item.id === quiz.chunk.id);
    assert.ok(chunk, quiz.quiz_id);
    assert.strictEqual(chunk.text, quiz.chunk.text, quiz.quiz_id);
    assert.notStrictEqual(chunk.skip, true, quiz.quiz_id);
    assert.notStrictEqual(chunk.skipped, true, quiz.quiz_id);
    const primary = q3.filter((row) => {
      return row.quiz_id === quiz.quiz_id && row.sentence === quiz.sentence && row.chunk_id === quiz.chunk.id;
    });
    assert.strictEqual(primary.length, 1, quiz.quiz_id);
    assert.strictEqual(primary[0].file, 'data/quizzes/' + quiz.quiz_id + '.json', quiz.quiz_id);
    assert.strictEqual(primary[0].level, 1, quiz.quiz_id);
    assert.strictEqual(primary[0].kind, 'chunk', quiz.quiz_id);
    assert.ok(ids.has(quiz.quiz_id), quiz.quiz_id);
  });
  ids.forEach((quizId) => assert.ok(bodies.has(quizId), 'hang without file ' + quizId));

  function hungChunk(quizId, text, chunkId) {
    const quiz = bodies.get(quizId);
    assert.strictEqual(quiz.chunk.text, text, quizId);
    assert.strictEqual(quiz.chunk.id, chunkId, quizId);
    const row = q3.find((item) => item.quiz_id === quizId && item.sentence === quiz.sentence);
    assert.ok(row, quizId);
    assert.strictEqual(row.chunk_id, chunkId, quizId);
  }
  hungChunk('meaning-object-oryouri-last-order-9-v1', 'レジの方まで', 11);
  hungChunk('meaning-object-yokattara-onomi-8-v1', 'お通しです', 10);
  hungChunk('meaning-object-aragoshi-mikanshu-8-v1', 'こちら', 13);

  [
    ['よかったら', ['meaning-object-yokattara-onomi-1-v1', 'meaning-object-goraitei-arigatou-3-v1']],
    ['めっちゃ', ['meaning-object-tsukete-itadaku-8-v1', 'meaning-object-chashu-shittori-2-v1']],
    ['ご注文', ['meaning-object-gochumon-1-v1', 'meaning-object-gochumon-kakunin-1-v1']],
    ['ちょっと', ['meaning-object-amai-chashu-6-v1', 'meaning-object-chashu-shittori-6-v1']],
  ].forEach((pair) => {
    const text = pair[0];
    const quizIds = pair[1];
    const sentences = new Set();
    quizIds.forEach((quizId) => {
      const quiz = bodies.get(quizId);
      assert.strictEqual(quiz.chunk.text, text, quizId);
      sentences.add(quiz.sentence);
      const row = q3.find((item) => {
        return item.quiz_id === quizId && item.sentence === quiz.sentence && item.chunk_id === quiz.chunk.id;
      });
      assert.ok(row, quizId);
    });
    assert.strictEqual(sentences.size, 2, text);
  });

  const phone = bodies.get('meaning-object-sore-wa-5-v1');
  assert.strictEqual(phone.chunk.text, 'お電話番号');
  assert.strictEqual(phone.chunk.id, 5);

  function assertNoQ3(slug, chunkId, text) {
    const group = groupBySlug(slug);
    const chunk = group.chunks.find((item) => item.id === chunkId);
    assert.strictEqual(chunk.text, text, slug);
    assert.strictEqual(chunk.skip, true, slug);
    const hung = q3.filter((row) => row.sentence === group.sentence && row.chunk_id === chunkId);
    assert.strictEqual(hung.length, 0, slug + ' ' + text);
    bodies.forEach((quiz) => {
      assert.ok(!(quiz.sentence === group.sentence && quiz.chunk.id === chunkId), quiz.quiz_id);
    });
  }
  assertNoQ3('sore-wa', 7, '電話番号');
  assertNoQ3('teikuauto', 9, '美味しい');

  const roji = groupBySlug('roji');
  const rojiRows = q3.filter((row) => row.sentence === roji.sentence && row.chunk_id === 6);
  assert.deepStrictEqual(rojiRows.map((row) => row.quiz_id), ['meaning-object-chashu-shittori-8-v1']);
  const aru = bodies.get('meaning-object-chashu-shittori-8-v1');
  assert.strictEqual(aru.sentence, groupBySlug('chashu-shittori').sentence);
  assert.strictEqual(aru.chunk.id, 8);
  assert.strictEqual(aru.chunk.text, 'ある');
  assert.notStrictEqual(aru.sentence, roji.sentence);
  const chashuHang = q3.find((row) => row.quiz_id === aru.quiz_id && row.sentence === aru.sentence);
  assert.strictEqual(chashuHang.chunk_id, 8);

  const koshitsu = groupBySlug('koshitsu-yoyaku');
  const kashikoRows = q3.filter((row) => row.sentence === koshitsu.sentence && row.chunk_id === 19);
  assert.deepStrictEqual(kashikoRows.map((row) => row.quiz_id), ['meaning-object-kaikei-onegai-1-v1']);
  const kashiko = bodies.get('meaning-object-kaikei-onegai-1-v1');
  assert.strictEqual(kashiko.sentence, groupBySlug('kaikei-onegai').sentence);
  assert.strictEqual(kashiko.chunk.id, 1);
  assert.strictEqual(kashiko.chunk.text, 'かしこまりました');
  assert.notStrictEqual(kashiko.sentence, koshitsu.sentence);

  const mitame = groupBySlug('mitame-irotsuya');
  const skippedMeccha = mitame.chunks.find((chunk) => chunk.text === 'めっちゃ');
  assert.strictEqual(skippedMeccha.skip, true);
  assert.strictEqual(
    q3.filter((row) => row.sentence === mitame.sentence && row.chunk_id === skippedMeccha.id).length,
    0
  );

  const soft = new Set(['sore-wa:7', 'teikuauto:9']);
  let covered = 0;
  groups.groups.forEach((group) => {
    (group.chunks || []).forEach((chunk) => {
      const n = q3.filter((row) => row.sentence === group.sentence && row.chunk_id === chunk.id).length;
      if (isSkip(chunk)) {
        assert.strictEqual(n, 0, group.slug + ' skip ' + chunk.id);
        return;
      }
      const key = group.slug + ':' + chunk.id;
      if (soft.has(key)) {
        assert.strictEqual(n, 0, key);
        return;
      }
      assert.strictEqual(n, 1, key + ' ' + chunk.text);
      covered += 1;
    });
  });
  assert.strictEqual(covered, 278);
});

test('Q3 runner plays the prompt then the Combined-image tap', function () {
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
      src: '',
      alt: '',
      value: '',
      listeners: {},
      attributes: {},
      appendChild(child) {
        child.parentNode = node;
        node.children.push(child);
        return child;
      },
      remove() {
        const parent = this.parentNode;
        if (!parent) return;
        const at = parent.children.indexOf(this);
        if (at >= 0) parent.children.splice(at, 1);
        this.parentNode = null;
      },
      addEventListener(type, fn) {
        (this.listeners[type] || (this.listeners[type] = [])).push(fn);
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
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
      },
    };
    Object.defineProperty(node, 'innerHTML', {
      get() { return ''; },
      set(value) {
        if (value === '') node.children.length = 0;
      },
    });
    return node;
  }
  function walk(node, acc) {
    acc.push(node);
    (node.children || []).forEach((child) => walk(child, acc));
    return acc;
  }
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
  const QuizRunner = require(path.join(root, 'js/quiz-runner.js'));
  const quiz = JSON.parse(fs.readFileSync(path.join(root, 'data/quizzes/meaning-object-chashu-shittori-8-v1.json'), 'utf8'));
  assert.deepStrictEqual(QuizRunner.prepareSlides(quiz).map((slide) => slide.type), ['prompt', 'tap']);
  const host = createEl('div');
  const palace = 'https://example.invalid/palace-chashu-shittori.png';
  let passed = 0;
  QuizRunner.run(quiz, host, {
    context: { palaceImageUrl: palace },
    onPass() { passed += 1; },
  });
  const nodes = () => walk(host, []);
  assert.ok(nodes().some((node) => node.textContent === quiz.slides[0].text));
  assert.ok(!nodes().some((node) => node.className === 'img-grid' || node.className === 'img-choice'));
  const next = nodes().find((node) => node.tagName === 'BUTTON' && node.textContent === '下一題');
  assert.ok(next);
  next.listeners.click.forEach((fn) => fn());
  const img = nodes().find((node) => node.tagName === 'IMG' && node.className === 'tap-img');
  assert.ok(img);
  assert.strictEqual(img.src, quiz.slides[1].image);
  assert.ok(img.src.indexOf(palace) === -1);
  assert.ok(!nodes().some((node) => String(node.src || '').indexOf('palace') !== -1));
  img.listeners.click.forEach((fn) => fn({ clientX: 0, clientY: 0 }));
  const hint = nodes().find((node) => node.className === 'hotspot-hint');
  assert.ok(hint);
  const hotspot = quiz.slides[1].hotspot;
  assert.strictEqual(hint.style.left, hotspot.left + '%');
  assert.strictEqual(hint.style.top, hotspot.top + '%');
  assert.strictEqual(hint.style.width, hotspot.width + '%');
  assert.strictEqual(hint.style.height, hotspot.height + '%');
  assert.ok(nodes().some((node) => node.textContent === '位置不對'));
  const realSetTimeout = global.setTimeout;
  global.setTimeout = function (fn) {
    fn();
    return 0;
  };
  try {
    const centerX = hotspot.left + hotspot.width / 2;
    const centerY = hotspot.top + hotspot.height / 2;
    img.listeners.click.forEach((fn) => fn({ clientX: centerX, clientY: centerY }));
  } finally {
    global.setTimeout = realSetTimeout;
  }
  assert.strictEqual(passed, 1);
  assert.ok(nodes().some((node) => node.textContent === '正確！'));
});

test('practice page and homepage fast-forward empty sentence stages', function () {
  const groupJs = fs.readFileSync(path.join(root, 'js/group.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const fixtureAt = groupJs.indexOf('if (!fixtureMode)');
  assert.ok(fixtureAt !== -1);
  assert.ok(groupJs.slice(fixtureAt, fixtureAt + 500).indexOf('fastForwardVacuousSentenceUnits') !== -1);
  assert.ok(appJs.indexOf('fastForwardVacuousSentenceUnits') !== -1);
});

test('official Q4 and Q7 are new-design audio_shadow with 278 hangs and the shared Keep rows', function () {
  const start = 'd59be14aae478ed354a99071110a8a4c97e103d9';
  const runnerHead = '86aeeb0a6529db30c70034a25df07c6a904b2513';
  const chunkAudio = /^https:\/\/raw\.githubusercontent\.com\/larryleungtsz\/flashcard-app\/[0-9a-f]{40}\/audio\/chunk-[^/]+\.mp3$/;
  const quizDir = path.join(root, 'data/quizzes');
  const q4Files = fs.readdirSync(quizDir).filter((file) => /^shadow-025-.*\.json$/.test(file)).sort();
  const q7Files = fs.readdirSync(quizDir).filter((file) => /^shadow-05-.*\.json$/.test(file)).sort();
  assert.strictEqual(q4Files.length, 276);
  assert.strictEqual(q7Files.length, 276);
  FORBIDDEN_SHADOW_IDS.forEach((quizId) => {
    assert.ok(q4Files.indexOf(quizId + '.json') === -1, quizId);
    assert.ok(q7Files.indexOf(quizId + '.json') === -1, quizId);
    assert.ok(!fs.existsSync(path.join(quizDir, quizId + '.json')), quizId);
    assert.ok(!manifest.quizzes.some((row) => row.quiz_id === quizId), quizId);
  });

  const atStart = execFileSync('git', ['ls-tree', '-r', '--name-only', start, 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const q4AtStart = atStart.filter((file) => /\/shadow-025-.*\.json$/.test(file));
  const q7AtStart = atStart.filter((file) => /\/shadow-05-.*\.json$/.test(file));
  const storyAtStart = new Set(atStart.filter((file) => isStoryQuizPath(file)));
  const soundingAtStart = new Set(atStart.filter((file) => isSoundingQuizPath(file)));
  assert.strictEqual(q4AtStart.length, 156);
  assert.strictEqual(q7AtStart.length, 156);
  const diff = execFileSync('git', ['diff', '--name-status', start, '--', 'data/quizzes'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
  const changed = new Map();
  (diff ? diff.split('\n') : []).forEach((line) => {
    const tab = line.indexOf('\t');
    const status = line.slice(0, tab);
    const file = line.slice(tab + 1);
    if (isStoryQuizPath(file)) {
      assertAllowedStoryChange(file, status, storyAtStart);
      return;
    }
    if (isWholeListenQuizPath(file)) {
      assertWholeListenRewrite(file, status, start);
      return;
    }
    if (isSoundingQuizPath(file)) {
      assertAllowedSoundingChange(file, status, soundingAtStart);
      return;
    }
    assert.ok(isShadowQuizPath(file), 'unexpected quiz file change: ' + line);
    assert.ok(FORBIDDEN_SHADOW_IDS.indexOf(path.basename(file, '.json')) === -1, file);
    changed.set(file, status);
  });
  q4AtStart.concat(q7AtStart).forEach((file) => {
    assert.strictEqual(changed.get(file), 'M', 'not rewritten ' + file);
  });
  q4Files.concat(q7Files).forEach((file) => {
    const rel = 'data/quizzes/' + file;
    if (q4AtStart.indexOf(rel) === -1 && q7AtStart.indexOf(rel) === -1) {
      assert.strictEqual(changed.get(rel), 'A', rel);
    }
  });
  assert.strictEqual(changed.size, 552);

  const manifestStat = execFileSync('git', ['diff', '--numstat', start, '--', 'data/manifest.json'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().split('\t');
  assert.strictEqual(manifestStat[1], '0');
  const manifestDiff = execFileSync('git', ['diff', '-U0', start, '--', 'data/manifest.json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  manifestDiff.split('\n').forEach((line) => {
    if (line.indexOf('+      "quiz_id": ') !== 0) return;
    const quizId = line.slice(line.indexOf('"quiz_id": ') + 11).replace(/",$/, '').replace(/^"/, '');
    assert.ok(/^shadow-025-/.test(quizId) || /^shadow-05-/.test(quizId) || /^story-/.test(quizId) || /^sounding-/.test(quizId), line);
  });
  assert.strictEqual(manifest.generated_at, '2026-11-11T23:38:07+08:00');
  assert.strictEqual(
    execFileSync('git', ['diff', '--name-only', start, '--', 'data/schedule.json', 'data/groups.json'], {
      cwd: root,
      encoding: 'utf8',
    }),
    ''
  );
  assertRunnerIsQ4PinPlusQ6AndQ8Delta(runnerHead);
  const htmlBefore = execFileSync('git', ['show', start + ':group.html'], { cwd: root, encoding: 'utf8' });
  const htmlAfter = fs.readFileSync(path.join(root, 'group.html'), 'utf8');
  assert.strictEqual(
    htmlBefore.replace('js/quiz-runner.js?v=20261111q27', 'js/quiz-runner.js?v=20261122q6q8'),
    htmlAfter
  );
  assert.ok(htmlAfter.indexOf('js/quiz-runner.js?v=20261122q6q8') !== -1);
  assert.ok(htmlAfter.indexOf('js/quiz-runner.js?v=20261121q4q7') === -1);
  assert.ok(htmlAfter.indexOf('js/quiz-runner.js?v=20261111q27') === -1);
  assert.ok(htmlAfter.indexOf('css/app.css?v=20261111q27') !== -1);

  function rows(objective) {
    return manifest.quizzes.filter((row) => row.objective === objective);
  }
  const q4 = rows('word_shadowing_025');
  const q7 = rows('tone_shadowing_05');
  assert.strictEqual(q4.length, 278);
  assert.strictEqual(new Set(q4.map((row) => row.quiz_id)).size, 276);
  assert.strictEqual(q7.length, 278);
  assert.strictEqual(new Set(q7.map((row) => row.quiz_id)).size, 276);
  assert.strictEqual(rows('loci_description_tap').length, 280);
  assert.strictEqual(rows('gloss_to_palace_tap').length, 280);
  assert.strictEqual(rows('meaning_object_select_and_tap').length, 278);
  assert.strictEqual(rows('story_select_image').length, 278);
  assert.strictEqual(manifest.quizzes.length, 3879);

  const specs = [
    { files: q4Files, objective: 'word_shadowing_025', rate: 0.25, instruction: '請聽 0.25× 詞塊示範，然後開始錄音跟讀。', hangs: q4 },
    { files: q7Files, objective: 'tone_shadowing_05', rate: 0.5, instruction: '請聽 0.5× 詞塊示範，然後開始錄音跟讀。', hangs: q7 },
  ];
  const bodies = new Map();
  specs.forEach((spec) => {
    spec.files.forEach((file) => {
      const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, file), 'utf8'));
      bodies.set(quiz.quiz_id, quiz);
      assert.strictEqual(quiz.quiz_id, file.replace(/\.json$/, ''), file);
      assert.strictEqual(quiz.objective, spec.objective, quiz.quiz_id);
      assert.strictEqual(quiz.level, 1, quiz.quiz_id);
      assert.strictEqual(quiz.variant, 1, quiz.quiz_id);
      assert.deepStrictEqual((quiz.slides || []).map((slide) => slide.type), ['audio_shadow'], quiz.quiz_id);
      const slide = quiz.slides[0];
      assert.strictEqual(slide.instruction, spec.instruction, quiz.quiz_id);
      assert.strictEqual(slide.rate, spec.rate, quiz.quiz_id);
      assert.ok(chunkAudio.test(slide.audio), quiz.quiz_id + ' ' + slide.audio);
      assert.ok(!/\/main\//.test(slide.audio), quiz.quiz_id);
      assert.ok(!Object.prototype.hasOwnProperty.call(slide, 'self_check'), quiz.quiz_id);
      assert.ok(!Object.prototype.hasOwnProperty.call(slide, 'start_sec'), quiz.quiz_id);
      assert.ok(!Object.prototype.hasOwnProperty.call(slide, 'end_sec'), quiz.quiz_id);
      assert.deepStrictEqual(quiz.feedback, { on_complete: 'pass' }, quiz.quiz_id);
      assert.notStrictEqual(quiz.chunk.text, '空いてますかね', quiz.quiz_id);
      const group = groups.groups.find((item) => item.sentence === quiz.sentence);
      assert.ok(group, quiz.quiz_id);
      const chunk = (group.chunks || []).find((item) => item.id === quiz.chunk.id);
      assert.ok(chunk, quiz.quiz_id);
      assert.strictEqual(chunk.text, quiz.chunk.text, quiz.quiz_id);
      assert.notStrictEqual(chunk.skip, true, quiz.quiz_id);
      assert.notStrictEqual(chunk.skipped, true, quiz.quiz_id);
      const primary = spec.hangs.filter((row) => {
        return row.quiz_id === quiz.quiz_id && row.sentence === quiz.sentence && row.chunk_id === quiz.chunk.id;
      });
      assert.strictEqual(primary.length, 1, quiz.quiz_id);
      assert.strictEqual(primary[0].file, 'data/quizzes/' + quiz.quiz_id + '.json', quiz.quiz_id);
      assert.strictEqual(primary[0].objective, spec.objective, quiz.quiz_id);
      assert.strictEqual(primary[0].level, 1, quiz.quiz_id);
      assert.strictEqual(primary[0].kind, 'chunk', quiz.quiz_id);
    });
  });

  function hungChunk(quizId, text, chunkId) {
    const quiz = bodies.get(quizId);
    assert.strictEqual(quiz.chunk.text, text, quizId);
    assert.strictEqual(quiz.chunk.id, chunkId, quizId);
    const trailing = Number(quizId.match(/-(\d+)-v1/)[1]);
    assert.notStrictEqual(trailing, chunkId, quizId);
  }
  hungChunk('shadow-025-oryouri-last-order-9-v1', 'レジの方まで', 11);
  hungChunk('shadow-05-oryouri-last-order-9-v1', '伝票となりますので', 10);
  hungChunk('shadow-025-yokattara-onomi-8-v1', 'お通しです', 10);
  hungChunk('shadow-05-yokattara-onomi-8-v1', 'お通しです', 10);
  hungChunk('shadow-025-aragoshi-mikanshu-8-v1', 'こちら', 13);
  hungChunk('shadow-05-aragoshi-mikanshu-8-v1', 'こちら', 13);

  [
    ['よかったら', ['yokattara-onomi-1-v1', 'goraitei-arigatou-3-v1']],
    ['めっちゃ', ['tsukete-itadaku-8-v1', 'chashu-shittori-2-v1']],
    ['ご注文', ['gochumon-1-v1', 'gochumon-kakunin-1-v1']],
    ['ちょっと', ['amai-chashu-6-v1', 'chashu-shittori-6-v1']],
  ].forEach((pair) => {
    const text = pair[0];
    pair[1].forEach((suffix) => {
      ['025', '05'].forEach((rate) => {
        const quizId = 'shadow-' + rate + '-' + suffix;
        const quiz = bodies.get(quizId);
        assert.strictEqual(quiz.chunk.text, text, quizId);
        const hangs = rate === '025' ? q4 : q7;
        const row = hangs.find((item) => {
          return item.quiz_id === quizId && item.sentence === quiz.sentence && item.chunk_id === quiz.chunk.id;
        });
        assert.ok(row, quizId);
      });
    });
  });
  ['025', '05'].forEach((rate) => {
    const phone = bodies.get('shadow-' + rate + '-sore-wa-5-v1');
    assert.strictEqual(phone.chunk.text, 'お電話番号');
    assert.strictEqual(phone.chunk.id, 5);
  });

  function sharedHang(objective, quizId, slug, chunkId, text) {
    const group = groupBySlug(slug);
    const chunk = group.chunks.find((item) => item.id === chunkId);
    assert.strictEqual(chunk.text, text, slug);
    assert.notStrictEqual(chunk.skip, true, slug);
    const hangs = rows(objective).filter((row) => row.sentence === group.sentence && row.chunk_id === chunkId);
    assert.deepStrictEqual(hangs, [{
      quiz_id: quizId,
      file: 'data/quizzes/' + quizId + '.json',
      objective: objective,
      level: 1,
      kind: 'chunk',
      sentence: group.sentence,
      chunk_id: chunkId,
    }]);
    const quiz = bodies.get(quizId);
    assert.notStrictEqual(quiz.sentence, group.sentence, quizId);
    assert.notStrictEqual(quiz.chunk.id, chunkId, quizId);
    assert.strictEqual(quiz.chunk.text, text, quizId);
  }
  sharedHang('word_shadowing_025', 'shadow-025-chashu-shittori-8-v1', 'roji', 6, 'ある');
  sharedHang('tone_shadowing_05', 'shadow-05-chashu-shittori-8-v1', 'roji', 6, 'ある');
  sharedHang('word_shadowing_025', 'shadow-025-kaikei-onegai-1-v1', 'koshitsu-yoyaku', 19, 'かしこまりました');
  sharedHang('tone_shadowing_05', 'shadow-05-kaikei-onegai-1-v1', 'koshitsu-yoyaku', 19, 'かしこまりました');

  let covered = 0;
  groups.groups.forEach((group) => {
    (group.chunks || []).forEach((chunk) => {
      ['word_shadowing_025', 'tone_shadowing_05'].forEach((objective) => {
        const n = rows(objective).filter((row) => row.sentence === group.sentence && row.chunk_id === chunk.id).length;
        if (isSkip(chunk)) {
          assert.strictEqual(n, 0, group.slug + ' skip ' + chunk.id + ' ' + chunk.text);
          return;
        }
        assert.strictEqual(n, 1, group.slug + ':' + chunk.id + ' ' + chunk.text + ' ' + objective);
        if (objective === 'word_shadowing_025') covered += 1;
      });
    });
  });
  assert.strictEqual(covered, 278);
  assert.strictEqual(groupBySlug('sore-wa').chunks.find((chunk) => chunk.id === 7).text, '電話番号');
  assert.strictEqual(groupBySlug('teikuauto').chunks.find((chunk) => chunk.id === 9).text, '美味しい');
  assert.strictEqual(groupBySlug('sore-wa').chunks.find((chunk) => chunk.id === 7).skip, true);
  assert.strictEqual(groupBySlug('teikuauto').chunks.find((chunk) => chunk.id === 9).skip, true);
});

test('official Q5 story_select_image is 275 files and 278 hangs with three shared Keep rows', function () {
  const base = '95db0e27d623edac29b7c489bc9250a52a745aa8';
  const shaImage = /^https:\/\/raw\.githubusercontent\.com\/larryleungtsz\/flashcard-app\/[0-9a-f]{40}\/images\/[^/]*combined[^/]*\.(?:jpg|jpeg|png)$/i;
  const quizDir = path.join(root, 'data/quizzes');
  const files = fs.readdirSync(quizDir).filter((file) => /^story-.*\.json$/.test(file)).sort();
  assert.strictEqual(files.length, 275);
  FORBIDDEN_STORY_IDS.forEach((quizId) => {
    assert.ok(files.indexOf(quizId + '.json') === -1, quizId);
    assert.ok(!fs.existsSync(path.join(quizDir, quizId + '.json')), quizId);
    assert.ok(!manifest.quizzes.some((row) => row.quiz_id === quizId), quizId);
  });
  const typo = fs.readdirSync(quizDir).filter((file) => /^story-koshitu-/.test(file));
  assert.deepStrictEqual(typo, []);
  files.forEach((file) => {
    assert.ok(!/^story-aka-konnyaku-\d+-v1\.json$/.test(file), file);
    assert.ok(!/^story-ebi-sumiso-\d+-v1\.json$/.test(file), file);
  });

  const q5 = manifest.quizzes.filter((row) => row.objective === 'story_select_image');
  assert.strictEqual(q5.length, 278);
  const ids = new Set(q5.map((row) => row.quiz_id));
  assert.strictEqual(ids.size, 275);
  assert.strictEqual(manifest.quizzes.length, 3879);
  assert.strictEqual(manifest.generated_at, '2026-11-11T23:38:07+08:00');

  function rows(objective) {
    return manifest.quizzes.filter((row) => row.objective === objective);
  }
  assert.strictEqual(rows('loci_description_tap').length, 280);
  assert.strictEqual(rows('gloss_to_palace_tap').length, 280);
  assert.strictEqual(rows('meaning_object_select_and_tap').length, 278);
  assert.strictEqual(rows('word_shadowing_025').length, 278);
  assert.strictEqual(rows('tone_shadowing_05').length, 278);
  assert.strictEqual(rows('writing_shadowing').length, 155);

  const crypto = require('crypto');
  const groupsHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'data/groups.json'))).digest('hex');
  assert.strictEqual(groupsHash, 'a5baa57fdf3a00934649962d592a444a88cf17d142b07125092d3afdbeb9def2');
  assert.strictEqual(
    execFileSync('git', ['hash-object', 'data/schedule.json'], { cwd: root, encoding: 'utf8' }).trim(),
    'e68b55cc12d3bd5c805ed3aa0aa251f74bfaf8bc'
  );
  // groups.json and schedule.json stay at the Q5 base.
  // group.html changes only the quiz-runner cache query. CSS query stays.
  // js/quiz-runner.js is only the authorized Q6 and Q8 deltas on the same PR #48 blob.
  assert.strictEqual(
    execFileSync('git', ['diff', '--name-only', base, '--', 'data/groups.json', 'data/schedule.json'], {
      cwd: root,
      encoding: 'utf8',
    }),
    ''
  );
  const q5HtmlBefore = execFileSync('git', ['show', base + ':group.html'], { cwd: root, encoding: 'utf8' });
  const q5HtmlAfter = fs.readFileSync(path.join(root, 'group.html'), 'utf8');
  assert.strictEqual(
    q5HtmlBefore.replace('js/quiz-runner.js?v=20261121q4q7', 'js/quiz-runner.js?v=20261122q6q8'),
    q5HtmlAfter
  );
  assertRunnerIsQ4PinPlusQ6AndQ8Delta('86aeeb0a6529db30c70034a25df07c6a904b2513');

  const groupBySentence = new Map(groups.groups.map((group) => [group.sentence, group]));
  const bodies = new Map();
  let trailingMismatch = 0;
  files.forEach((file) => {
    const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, file), 'utf8'));
    bodies.set(quiz.quiz_id, quiz);
    assert.strictEqual(quiz.quiz_id, file.replace(/\.json$/, ''), file);
    assert.strictEqual(quiz.objective, 'story_select_image', quiz.quiz_id);
    assert.strictEqual(quiz.level, 1, quiz.quiz_id);
    assert.strictEqual(quiz.variant, 1, quiz.quiz_id);
    assert.deepStrictEqual((quiz.slides || []).map((slide) => slide.type), ['prompt', 'select_image'], quiz.quiz_id);
    assert.strictEqual(typeof quiz.slides[0].text, 'string', quiz.quiz_id);
    assert.ok(quiz.slides[0].text.length > 0, quiz.quiz_id);
    const slide = quiz.slides[1];
    assert.ok(Array.isArray(slide.distractors) && slide.distractors.length > 0, quiz.quiz_id);
    [slide.correct].concat(slide.distractors).forEach((url) => {
      assert.ok(shaImage.test(url), quiz.quiz_id + ' ' + url);
      assert.ok(!/\/main\//.test(url), quiz.quiz_id);
    });
    assert.strictEqual(quiz.feedback.on_wrong, 'show_correct', quiz.quiz_id);
    const group = groupBySentence.get(quiz.sentence);
    assert.ok(group, quiz.quiz_id);
    const chunk = (group.chunks || []).find((item) => item.id === quiz.chunk.id);
    assert.ok(chunk, quiz.quiz_id);
    assert.strictEqual(chunk.text, quiz.chunk.text, quiz.quiz_id);
    assert.notStrictEqual(chunk.skip, true, quiz.quiz_id);
    assert.notStrictEqual(chunk.skipped, true, quiz.quiz_id);
    const primary = q5.filter((row) => {
      return row.quiz_id === quiz.quiz_id && row.sentence === quiz.sentence && row.chunk_id === quiz.chunk.id;
    });
    assert.strictEqual(primary.length, 1, quiz.quiz_id);
    assert.strictEqual(primary[0].file, 'data/quizzes/' + quiz.quiz_id + '.json', quiz.quiz_id);
    assert.strictEqual(primary[0].objective, 'story_select_image', quiz.quiz_id);
    assert.strictEqual(primary[0].level, 1, quiz.quiz_id);
    assert.strictEqual(primary[0].kind, 'chunk', quiz.quiz_id);
    const trailing = quiz.quiz_id.match(/-(\d+)-v\d+(?:-r20261101)?$/);
    assert.ok(trailing, quiz.quiz_id);
    if (Number(trailing[1]) !== quiz.chunk.id) trailingMismatch += 1;
    assert.strictEqual(primary[0].chunk_id, quiz.chunk.id, quiz.quiz_id);
  });
  assert.strictEqual(trailingMismatch, 40);
  ids.forEach((quizId) => assert.ok(bodies.has(quizId), 'hang without file ' + quizId));

  [
    ['ちょっと', ['story-chotto-6-v1', 'story-chotto-chashu-6-v1']],
    ['めっちゃ', ['story-meccha-2-v1', 'story-meccha-tsukete-itadaku-8-v1']],
    ['よかったら', ['story-yokattara-3-v1', 'story-yokattara-1-v1']],
  ].forEach((pair) => {
    const text = pair[0];
    const sentences = new Set();
    pair[1].forEach((quizId) => {
      const quiz = bodies.get(quizId);
      assert.ok(quiz, quizId);
      assert.strictEqual(quiz.chunk.text, text, quizId);
      sentences.add(quiz.sentence);
      const row = q5.find((item) => {
        return item.quiz_id === quizId && item.sentence === quiz.sentence && item.chunk_id === quiz.chunk.id;
      });
      assert.ok(row, quizId);
    });
    assert.strictEqual(sentences.size, 2, text);
  });

  const phone = bodies.get('story-sore-wa-5-v1');
  const sore = groupBySlug('sore-wa');
  assert.strictEqual(phone.chunk.text, 'お電話番号');
  assert.strictEqual(phone.chunk.id, 5);
  assert.strictEqual(phone.sentence, sore.sentence);
  assert.deepStrictEqual(q5.filter((row) => row.quiz_id === 'story-sore-wa-5-v1'), [{
    quiz_id: 'story-sore-wa-5-v1',
    file: 'data/quizzes/story-sore-wa-5-v1.json',
    objective: 'story_select_image',
    level: 1,
    kind: 'chunk',
    sentence: sore.sentence,
    chunk_id: 5,
  }]);

  function assertNoQ5(slug, chunkId, text) {
    const group = groupBySlug(slug);
    const chunk = group.chunks.find((item) => item.id === chunkId);
    assert.strictEqual(chunk.text, text, slug);
    assert.strictEqual(chunk.skip, true, slug);
    assert.strictEqual(
      q5.filter((row) => row.sentence === group.sentence && row.chunk_id === chunkId).length,
      0,
      slug + ' ' + text
    );
    bodies.forEach((quiz) => {
      assert.ok(!(quiz.sentence === group.sentence && quiz.chunk.id === chunkId), quiz.quiz_id);
      assert.notStrictEqual(quiz.chunk.text, text, quiz.quiz_id);
    });
  }
  assertNoQ5('sore-wa', 7, '電話番号');
  assertNoQ5('teikuauto', 9, '美味しい');
  assertNoQ5('yokattara-onomi', 8, 'お願いします');
  assertNoQ5('goraitei-arigatou', 2, 'ありがとうございます');
  assert.ok(!groups.groups.some((group) => (group.chunks || []).some((chunk) => chunk.text === '空いてますかね')));
  bodies.forEach((quiz) => assert.notStrictEqual(quiz.chunk.text, '空いてますかね', quiz.quiz_id));
  assert.strictEqual(bodies.get('story-yoyaku-shitenai-3-v1').chunk.text, '空いてますか');

  function sharedHang(quizId, slug, chunkId, text) {
    const group = groupBySlug(slug);
    const chunk = group.chunks.find((item) => item.id === chunkId);
    assert.strictEqual(chunk.text, text, slug);
    assert.notStrictEqual(chunk.skip, true, slug);
    const hangs = q5.filter((row) => row.sentence === group.sentence && row.chunk_id === chunkId);
    assert.deepStrictEqual(hangs, [{
      quiz_id: quizId,
      file: 'data/quizzes/' + quizId + '.json',
      objective: 'story_select_image',
      level: 1,
      kind: 'chunk',
      sentence: group.sentence,
      chunk_id: chunkId,
    }]);
    const quiz = bodies.get(quizId);
    assert.strictEqual(quiz.chunk.text, text, quizId);
    assert.notStrictEqual(quiz.sentence, group.sentence, quizId);
    if (slug !== 'gochumon-kakunin') assert.notStrictEqual(quiz.chunk.id, chunkId, quizId);
  }
  sharedHang('story-gochumon-1-v1', 'gochumon-kakunin', 1, 'ご注文');
  sharedHang('story-kaikei-onegai-1-v1', 'koshitsu-yoyaku', 19, 'かしこまりました');
  sharedHang('story-aru-8-v1', 'roji', 6, 'ある');

  const gochu = bodies.get('story-gochumon-1-v1');
  assert.strictEqual(gochu.sentence, groupBySlug('gochumon').sentence);
  assert.strictEqual(gochu.chunk.id, 1);
  assert.strictEqual(gochu.chunk.text, 'ご注文');
  const kaikei = bodies.get('story-kaikei-onegai-1-v1');
  assert.strictEqual(kaikei.sentence, groupBySlug('kaikei-onegai').sentence);
  assert.strictEqual(kaikei.chunk.id, 1);
  assert.strictEqual(kaikei.chunk.text, 'かしこまりました');
  const aru = bodies.get('story-aru-8-v1');
  assert.strictEqual(aru.sentence, groupBySlug('chashu-shittori').sentence);
  assert.strictEqual(aru.chunk.id, 8);
  assert.strictEqual(aru.chunk.text, 'ある');

  [1, 17, 2, 3, 5, 6, 7, 8, 10, 14, 15, 16].forEach((id) => {
    const quizId = 'story-koshitsu-yoyaku-' + id + '-v1';
    const quiz = bodies.get(quizId);
    assert.ok(quiz, quizId);
    const group = groupBySlug('koshitsu-yoyaku');
    const row = q5.find((item) => item.quiz_id === quizId && item.sentence === group.sentence);
    assert.ok(row, quizId);
    assert.strictEqual(row.chunk_id, quiz.chunk.id, quizId);
  });

  let covered = 0;
  groups.groups.forEach((group) => {
    (group.chunks || []).forEach((chunk) => {
      const n = q5.filter((row) => row.sentence === group.sentence && row.chunk_id === chunk.id).length;
      if (isSkip(chunk)) {
        assert.strictEqual(n, 0, group.slug + ' skip ' + chunk.id + ' ' + chunk.text);
        return;
      }
      assert.strictEqual(n, 1, group.slug + ':' + chunk.id + ' ' + chunk.text);
      covered += 1;
    });
  });
  assert.strictEqual(covered, 278);
});

test('official Q6 ship is 291 new-design files and 108 appended hangs', function () {
  const crypto = require('crypto');
  const quizDir = path.join(root, 'data/quizzes');
  const files = fs.readdirSync(quizDir).filter((file) => /^sounding-.*\.json$/.test(file)).sort();
  assert.strictEqual(files.length, 291);
  assert.ok(files.indexOf('sounding-mitame-irotsuya-3-v1.json') === -1);
  const digest = crypto.createHash('sha256');
  files.forEach((file) => {
    digest.update(file);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(quizDir, file)));
    digest.update('\0');
  });
  assert.strictEqual(digest.digest('hex'), '16e7e8fa4638648d4c275ccb240776c92a2384691eab254bdd2a8219e554b00b');

  const baseSha = 'c973862646028214903efcdf98077731f8966c90';
  const baseManifest = JSON.parse(execFileSync('git', ['show', baseSha + ':data/manifest.json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }));
  assert.strictEqual(baseManifest.quizzes.length, 3771);
  assert.strictEqual(manifest.generated_at, baseManifest.generated_at);
  assert.strictEqual(manifest.generated_at, '2026-11-11T23:38:07+08:00');
  assert.strictEqual(manifest.quizzes.length, 3879);
  assert.deepStrictEqual(manifest.quizzes.slice(0, 3771), baseManifest.quizzes);
  assert.strictEqual(manifest.quizzes[3770].quiz_id, 'story-aru-8-v1');
  const added = manifest.quizzes.slice(3771);
  assert.strictEqual(added.length, 108);
  const skipSlots = new Set();
  groups.groups.forEach((group) => {
    (group.chunks || []).forEach((chunk) => {
      if (chunk.skip === true) skipSlots.add(group.sentence + '\0' + chunk.id);
    });
  });
  added.forEach((row) => {
    assert.strictEqual(row.objective, 'pronunciation_sounding_select', row.quiz_id);
    assert.strictEqual(row.level, 1, row.quiz_id);
    assert.strictEqual(row.kind, 'chunk', row.quiz_id);
    assert.strictEqual(row.file, 'data/quizzes/' + row.quiz_id + '.json', row.quiz_id);
    assert.ok(files.indexOf(row.quiz_id + '.json') !== -1, row.quiz_id);
    assert.ok(!skipSlots.has(row.sentence + '\0' + row.chunk_id), row.quiz_id);
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'markdown_fixed'), row.quiz_id);
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'notion_url'), row.quiz_id);
  });
  const unhung = [
    'sounding-ioshio-ganen-1-v1',
    'sounding-ioshio-ganen-2-v1',
    'sounding-ioshio-ganen-3-v1',
    'sounding-ioshio-ganen-4-v1',
  ];
  for (let i = 1; i <= 10; i++) unhung.push('sounding-tsukete-itadaku-' + i + '-v1');
  assert.strictEqual(unhung.length, 14);
  const hungIds = new Set(manifest.quizzes.map((row) => row.quiz_id));
  unhung.forEach((quizId) => {
    assert.ok(files.indexOf(quizId + '.json') !== -1, quizId);
    assert.ok(!hungIds.has(quizId), quizId);
    assert.ok(hungIds.has(quizId.replace('-v1', '-v2')), quizId);
  });
  [
    'sounding-aragoshi-mikanshu-1-v1',
    'sounding-aragoshi-mikanshu-4-v1',
    'sounding-aragoshi-mikanshu-5-v1',
    'sounding-aragoshi-mikanshu-7-v1',
    'sounding-chumon-ii-desuka-1-v1',
    'sounding-chumon-ii-desuka-3-v1',
    'sounding-chumon-ii-desuka-6-v1',
    'sounding-hamo-nanban-4-v1',
    'sounding-oryouri-last-order-9-v1',
    'sounding-yokattara-onomi-6-v1',
    'sounding-yokattara-onomi-8-v1',
  ].forEach((quizId) => {
    assert.ok(hungIds.has(quizId), quizId);
    assert.ok(!added.some((row) => row.quiz_id === quizId), quizId);
  });
  assert.strictEqual(groupBySlug('sore-wa').chunks.find((chunk) => chunk.id === 7).skip, true);
  assert.strictEqual(groupBySlug('teikuauto').chunks.find((chunk) => chunk.id === 9).skip, true);
  assert.ok(!hungIds.has('sounding-sore-wa-7-v1'));
  assert.ok(!hungIds.has('sounding-teikuauto-9-v1'));
  assert.ok(!hungIds.has('sounding-roji-6-v1'));
  assert.ok(!fs.existsSync(path.join(quizDir, 'sounding-mitame-irotsuya-3-v1.json')));
  assert.strictEqual(
    manifest.quizzes.filter((row) => row.objective === 'pronunciation_sounding_select').length,
    277
  );
  ['data/groups.json', 'data/schedule.json', 'css/app.css'].forEach((file) => {
    const before = execFileSync('git', ['show', baseSha + ':' + file], { cwd: root });
    const after = fs.readFileSync(path.join(root, file));
    assert.ok(before.equals(after), file);
  });
  const runner = fs.readFileSync(path.join(root, 'js/quiz-runner.js'), 'utf8');
  const remembered = '記住咗';
  assert.strictEqual(remembered.charCodeAt(2), 0x5497);
  assert.ok(runner.indexOf(remembered) !== -1);
  assert.ok(runner.indexOf("quiz.objective === 'whole_sentence_listening'") !== -1);
  assert.ok(runner.indexOf("el('button', 'btn btn-primary', '繼續')") !== -1);
});

if (failed.length) {
  console.error(failed.length + ' failed');
  process.exit(1);
}
console.log('all softgo-live tests passed');
