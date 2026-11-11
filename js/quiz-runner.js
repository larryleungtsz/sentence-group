/** Render quiz slides and grade answers. */
(function (global) {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Friendly 題型 names. Unknown keys fall back to the objective key itself. */
  var OBJECTIVE_LABELS = {
    example_sentences_listening: '例句聆聽',
    gloss_to_palace_tap: '解釋對應宮殿',
    loci_description_tap: '地點描述點選',
    meaning_object_select_and_tap: '意思物件選擇並點選',
    // Q19 Cloze: one slide (chunk + blanked L1 cards). Soft GO content still later.
    mother_cloze_usage: '母語填空用法',
    mother_language_pronounce: '母語發音',
    mother_to_target_language: '母語譯目標語',
    pronunciation_sounding_select: '發音諧音選擇',
    sentence_discourse_mcq: '句子語境選擇',
    sentence_l1_palace_multi_tap: '母語對應宮殿',
    sentence_listen_to_l1: '聽句選翻譯',
    sentence_minimal_pair_grouping: '句子近義分組',
    sentence_usage_feature_judgment: '用法特徵判斷',
    sentence_segment_shadowing: '整段分段跟讀',
    sentence_shadowing_075: '句子跟讀 0.75×',
    sentence_shadowing_125: '句子跟讀 1.25×',
    sequence_training: '段落順序訓練',
    story_select_image: '故事選圖',
    target_to_mnemonic_image: '目標語記憶圖',
    tone_shadowing_05: '語調跟讀 0.5×',
    whole_sentence_listening: '整段聆聽',
    sentence_shell_smoke: '句子層空殼',
    word_shadowing_025: '單字跟讀 0.25×',
    writing_shadowing: '書寫跟讀',
    youglish_listen: 'YouGlish 聆聽',
  };

  function hasReportValue(v) {
    return v != null && v !== '';
  }

  function objectiveDisplay(quiz) {
    var key = quiz && quiz.objective ? String(quiz.objective) : '';
    var named = quiz && (quiz.objective_name || quiz.objective_label || quiz.objective_title);
    if (named != null && String(named).trim()) named = String(named).trim();
    else named = OBJECTIVE_LABELS[key] || '';
    if (named && key && named !== key) return named + '（' + key + '）';
    return named || key || '—';
  }

  function groupDisplay(quiz, ctx) {
    ctx = ctx || {};
    var title = ctx.groupTitle ? String(ctx.groupTitle) : '';
    var slug = ctx.groupSlug ? String(ctx.groupSlug) : '';
    if (!title && !slug && quiz && quiz.sentence) title = String(quiz.sentence);
    if (title && slug) return title + '（' + slug + '）';
    return title || slug || '—';
  }

  function chunkDisplay(quiz, ctx) {
    ctx = ctx || {};
    var kind = ctx.kind || '';
    var chunk = quiz && quiz.chunk && typeof quiz.chunk === 'object' ? quiz.chunk : null;
    var id = chunk && chunk.id != null ? chunk.id : (ctx.chunkId != null ? ctx.chunkId : null);
    var text = '';
    if (chunk && chunk.text) text = String(chunk.text);
    else if (ctx.chunkText) text = String(ctx.chunkText);
    if (kind === 'passage') return '整段 / n/a';
    if (kind === 'sentence') {
      var sentenceText = ctx.sentenceText ? String(ctx.sentenceText) : '';
      var sid = ctx.sentenceId != null && ctx.sentenceId !== '' ? ctx.sentenceId : null;
      if (sentenceText && sid != null) return sentenceText + '（' + sid + '）';
      if (sentenceText) return sentenceText;
      if (sid != null) return '句子 ' + sid;
      return '句子 / n/a';
    }
    if (kind !== 'chunk' && id == null && !text) return '整段 / n/a';
    if (text && id != null) return text + '（id ' + id + '）';
    if (text) return text;
    if (id != null) return 'id ' + id;
    return 'n/a';
  }

  /**
   * Identifying lines for the report panel and clipboard.
   * @param {object} quiz
   * @param {{ groupTitle?: string, groupSlug?: string, kind?: string, chunkId?: *, chunkText?: string }} [ctx]
   * @returns {{ label: string, value: string }[]}
   */
  function reportLines(quiz, ctx) {
    quiz = quiz || {};
    var lines = [
      { label: '題型', value: objectiveDisplay(quiz) },
      { label: 'Passage Group', value: groupDisplay(quiz, ctx) },
      { label: 'Chunk', value: chunkDisplay(quiz, ctx) },
    ];
    if (hasReportValue(quiz.level)) lines.push({ label: 'Level', value: String(quiz.level) });
    if (hasReportValue(quiz.variant)) lines.push({ label: 'Variant', value: String(quiz.variant) });
    if (hasReportValue(quiz.stage)) lines.push({ label: 'Stage', value: String(quiz.stage) });
    if (hasReportValue(quiz.day)) lines.push({ label: 'Day', value: String(quiz.day) });
    lines.push({ label: 'Quiz ID', value: quiz.quiz_id ? String(quiz.quiz_id) : '—' });
    return lines;
  }

  function formatReport(quiz, ctx) {
    return reportLines(quiz, ctx).map(function (row) {
      return row.label + ': ' + row.value;
    }).join('\n');
  }

  function copyPlainText(text) {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }, function () {
        return copyViaTextarea(text);
      });
    }
    return Promise.resolve(copyViaTextarea(text));
  }

  function copyViaTextarea(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* older browsers */ }
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }

  /** 「回報問題」 — collapsed until tapped; one Copy writes the plain-text block. */
  function mountReport(quiz, hooks) {
    var ctx = (hooks && hooks.context) || {};
    var text = formatReport(quiz, ctx);
    var wrap = el('div', 'report-problem');
    var toggle = el('button', 'btn btn-ghost report-toggle', '回報問題');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'report-panel');

    var panel = el('div', 'report-panel');
    panel.id = 'report-panel';
    panel.hidden = true;

    var block = el('pre', 'report-text', text);
    var side = el('div', 'report-side');
    var copyBtn = el('button', 'btn report-copy', '複製');
    copyBtn.type = 'button';
    var note = el('span', 'report-note', '');
    note.setAttribute('aria-live', 'polite');
    side.appendChild(copyBtn);
    side.appendChild(note);
    panel.appendChild(block);
    panel.appendChild(side);

    toggle.addEventListener('click', function () {
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var noteTimer = null;
    copyBtn.addEventListener('click', function () {
      var payload = formatReport(quiz, ctx);
      copyPlainText(payload).then(function (ok) {
        note.textContent = ok ? '已複製' : '複製失敗';
        note.className = ok ? 'report-note ok' : 'report-note bad';
        copyBtn.textContent = ok ? '已複製' : '複製';
        if (noteTimer) clearTimeout(noteTimer);
        noteTimer = setTimeout(function () {
          note.textContent = '';
          note.className = 'report-note';
          copyBtn.textContent = '複製';
        }, 1600);
      });
    });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    return wrap;
  }


  /**
   * Q19 Cloze is one slide: the chunk and the blanked L1 cards share it.
   * A leftover prompt slide is folded in and not shown as its own step.
   */
  function clozeSlides(quiz) {
    var raw = quiz.slides || [];
    var select = null;
    var promptText = '';
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s) continue;
      if (!select && s.type === 'select_text') select = s;
      if (!promptText && s.type === 'prompt' && s.text) promptText = String(s.text);
    }
    if (!select) return raw;
    var chunkText = select.prompt || (quiz.chunk && quiz.chunk.text) || promptText || '';
    return [{
      type: 'select_text',
      prompt: chunkText ? String(chunkText) : '',
      correct: select.correct,
      distractors: select.distractors || [],
    }];
  }

  /** Highlight ____ (or fullwidth ＿＿) inside a Cloze card. Grading still uses the full string. */
  function appendClozeLabel(node, text) {
    var src = String(text);
    var re = /(_{2,}|＿{2,})/g;
    var last = 0;
    var m;
    var any = false;
    while ((m = re.exec(src))) {
      any = true;
      if (m.index > last) node.appendChild(document.createTextNode(src.slice(last, m.index)));
      node.appendChild(el('span', 'cloze-blank', m[1]));
      last = m.index + m[1].length;
    }
    if (!any) {
      node.textContent = src;
      return;
    }
    if (last < src.length) node.appendChild(document.createTextNode(src.slice(last)));
  }

  /** Strip markdown-link / raw audio URL junk accidentally baked into text choices. */
  function cleanChoiceText(s) {
    if (typeof s !== 'string') return s;
    if (s.indexOf('](') === -1 && s.indexOf('http') === -1 && s.indexOf('raw.githubusercontent') === -1) {
      return s;
    }
    // LABEL](https://...) TRAIL  or  LABEL](<https://...) TRAIL
    var m = s.match(/^(.*?)\]\(?<?https?:\/\//i);
    if (!m) {
      // strip bare long raw.githubusercontent URLs
      return s.replace(/https?:\/\/raw\.githubusercontent\.com\S+/gi, '').replace(/\s+/g, ' ').trim() || s;
    }
    var label = m[1].trim();
    var after = s.slice(m[0].length);
    try {
      after = decodeURIComponent(after.replace(/\+/g, ' '));
    } catch (e) { /* keep raw */ }
    var trail = '';
    var endM = after.match(/\)>?\s*([^\]]+?)\s*$/);
    if (endM) {
      trail = endM[1].replace(/^>+/, '').trim();
    }
    trail = trail.replace(/^["'\[\]]+|["'\[\]]+$/g, '').replace(/^\)\s*/, '').trim();
    // drop leftover ") ≈" artifact → "≈"
    if (/^\)\s*≈/.test(trail)) trail = trail.replace(/^\)\s*/, '');
    if (!trail) return label;
    if (trail.indexOf(label) === 0) return trail;
    return (label + ' ' + trail).replace(/\)\s+\)\s*≈/g, ') ≈').replace(/([^\s)])\s+\)\s*≈/g, '$1 ≈').trim();
  }


  function hitTest(imgEl, evt, hotspot) {
    const rect = imgEl.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 100;
    const y = ((evt.clientY - rect.top) / rect.height) * 100;
    const l = hotspot.left, t = hotspot.top, w = hotspot.width, h = hotspot.height;
    return x >= l && x <= l + w && y >= t && y <= t + h;
  }

  /**
   * Whole-sentence shadowing (Q22 / Q23). These stay off the Q18 segment UI
   * even when the sentence is a start/end window at 0.75×.
   */
  var WHOLE_SENTENCE_SHADOW_RATES = {
    sentence_shadowing_125: 1.25,
    sentence_shadowing_075: 0.75,
  };

  function wholeSentenceShadowRate(objective) {
    if (!objective || !Object.prototype.hasOwnProperty.call(WHOLE_SENTENCE_SHADOW_RATES, objective)) {
      return null;
    }
    return WHOLE_SENTENCE_SHADOW_RATES[objective];
  }

  /**
   * Q18 segment chrome (hidden scrubber, 「重播」, forced 0.75×).
   * Passage quizzes keep the old rule, including `rate === 0.75 && hasClip`.
   * Q20–Q24 never enter that branch.
   */
  function isSegmentShadow(quiz, type, audioOpts) {
    audioOpts = audioOpts || {};
    var objective = quiz && quiz.objective;
    if (wholeSentenceShadowRate(objective) != null) return false;
    if (
      objective === 'sentence_listen_to_l1' ||
      objective === 'sentence_l1_palace_multi_tap' ||
      objective === 'sentence_discourse_mcq'
    ) {
      return false;
    }
    var hasClip = audioOpts.start_sec != null || audioOpts.end_sec != null;
    return (
      objective === 'sentence_segment_shadowing' ||
      type === 'audio_segment_shadow' ||
      (Number(audioOpts.rate) === 0.75 && hasClip)
    );
  }

  /**
   * Playback plan for an audio slide.
   * Q22/Q23: fixed whole-sentence rate, ephemeral recorder, no self-check score.
   * The recording plan is `{ enabled, persist: false, score: false }` — the
   * Blob stays in the slide closure and is never written to progress, timing,
   * or sync snapshots.
   */
  function shadowSlidePlan(quiz, type, audioOpts) {
    var fixed = wholeSentenceShadowRate(quiz && quiz.objective);
    if (fixed != null) {
      return {
        segmentShadow: false,
        rate: fixed,
        rateOptions: null,
        record: { enabled: true, persist: false, score: false },
        selfCheck: false,
      };
    }
    var segment = isSegmentShadow(quiz, type, audioOpts || {});
    return {
      segmentShadow: segment,
      rate: segment ? 0.75 : audioOpts && audioOpts.rate,
      rateOptions: segment ? null : audioOpts && audioOpts.rate_options,
      record: { enabled: false, persist: false, score: false },
      selfCheck: true,
    };
  }

  function resolveAudio(slide) {
    slide = slide || {};
    var audioSrc = slide.audio;
    var audioOpts = {
      start_sec: slide.start_sec,
      end_sec: slide.end_sec,
      rate: slide.rate,
      rate_options: slide.rate_options,
    };
    if (audioSrc && typeof audioSrc === 'object') {
      audioOpts = {
        start_sec: audioSrc.start_sec != null ? audioSrc.start_sec : audioOpts.start_sec,
        end_sec: audioSrc.end_sec != null ? audioSrc.end_sec : audioOpts.end_sec,
        rate: audioSrc.rate != null ? audioSrc.rate : audioOpts.rate,
        rate_options: audioOpts.rate_options,
      };
      audioSrc = audioSrc.url || audioSrc.src || '';
    }
    return { src: audioSrc || '', opts: audioOpts };
  }

  function pointInHotspot(point, hotspot) {
    if (!point || !hotspot) return false;
    return (
      point.x >= hotspot.left &&
      point.x <= hotspot.left + hotspot.width &&
      point.y >= hotspot.top &&
      point.y <= hotspot.top + hotspot.height
    );
  }

  /** Flat `{left,top,width,height}` or sequence-style `{ hotspot: {...} }`. */
  function hotspotRect(item) {
    if (!item || typeof item !== 'object') return null;
    var hs = item.hotspot && typeof item.hotspot === 'object' ? item.hotspot : item;
    var left = Number(hs.left);
    var top = Number(hs.top);
    var width = Number(hs.width);
    var height = Number(hs.height);
    if (![left, top, width, height].every(function (n) { return Number.isFinite(n); })) return null;
    if (width <= 0 || height <= 0) return null;
    return { left: left, top: top, width: width, height: height };
  }

  /**
   * Q21 targets. Accepts `hotspots`, `targets`, or sequence-shaped `sequence`.
   * A lone `hotspot` counts as a one-item set. Invalid rects are dropped.
   * Empty / all-invalid → `{ ok: false, reason: 'missing_hotspots' }`.
   */
  function multiTapTargets(slide) {
    var list = slide && (slide.hotspots || slide.targets || slide.sequence);
    if (!Array.isArray(list) || !list.length) {
      if (slide && slide.hotspot) {
        list = [{ hotspot: slide.hotspot, id: slide.id, label: slide.label || slide.text || '' }];
      } else {
        return { ok: false, reason: 'missing_hotspots', targets: [] };
      }
    }
    var targets = [];
    var seen = new Set();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var rect = hotspotRect(item);
      if (!rect) continue;
      var id = item && item.id != null && item.id !== '' ? String(item.id) : String(i);
      if (seen.has(id)) continue;
      seen.add(id);
      var label = '';
      if (item && (item.label || item.text)) label = String(item.label || item.text);
      targets.push({ id: id, label: label, hotspot: rect });
    }
    if (!targets.length) return { ok: false, reason: 'missing_hotspots', targets: [] };
    // correct_ids is the set to collect. Extra hotspots on the same palace
    // stay on the image and grade as misses. Absent correct_ids keeps every
    // valid hotspot (fixtures and older slides).
    if (slide && Array.isArray(slide.correct_ids)) {
      var wanted = new Set(slide.correct_ids.map(function (id) { return String(id); }));
      if (!wanted.size) return { ok: false, reason: 'missing_hotspots', targets: [] };
      targets = targets.filter(function (t) { return wanted.has(t.id); });
      if (targets.length !== wanted.size) {
        return { ok: false, reason: 'missing_hotspots', targets: [] };
      }
    }
    return { ok: true, reason: '', targets: targets };
  }

  function multiTapImage(slide, quiz, context) {
    context = context || {};
    var image = slide && (slide.image || slide.palace_image_url);
    if (!image && quiz) image = quiz.palace_image_url || quiz.image;
    if (!image) image = context.palaceImageUrl || '';
    return image ? String(image) : '';
  }

  /**
   * Order-independent collect-all. Overlaps prefer a hotspot not yet collected.
   * @returns {{ kind: 'hit'|'repeat'|'miss', id?: string, label?: string, done: boolean }}
   */
  function gradeMultiTap(targets, collectedIds, point) {
    var collected = new Set((collectedIds || []).map(function (id) { return String(id); }));
    var hit = null;
    var repeat = null;
    var list = targets || [];
    for (var i = 0; i < list.length; i++) {
      var target = list[i];
      if (!pointInHotspot(point, target.hotspot)) continue;
      if (collected.has(target.id)) {
        if (!repeat) repeat = target;
      } else if (!hit) {
        hit = target;
      }
    }
    if (hit) {
      return {
        kind: 'hit',
        id: hit.id,
        label: hit.label,
        done: collected.size + 1 >= list.length,
      };
    }
    if (repeat) return { kind: 'repeat', id: repeat.id, label: repeat.label, done: false };
    return { kind: 'miss', done: false };
  }

  /**
   * Q27 group_audio. An item is correct only when its current box id equals
   * item.correct_box. `accepts` is not consulted. Unplaced items are not correct.
   * @returns {{ placedIds: string[], correctIds: string[], misplacedIds: string[], unplacedIds: string[], allPlaced: boolean, ok: boolean }}
   */
  function gradeGroupAudio(items, placement) {
    var list = Array.isArray(items) ? items : [];
    var map = placement && typeof placement === 'object' ? placement : {};
    var placedIds = [];
    var correctIds = [];
    var misplacedIds = [];
    var unplacedIds = [];
    list.forEach(function (item) {
      if (!item || item.id == null || item.id === '') return;
      var id = String(item.id);
      var box = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
      if (box == null || box === '') {
        unplacedIds.push(id);
        return;
      }
      placedIds.push(id);
      var want = item.correct_box == null ? '' : String(item.correct_box);
      if (String(box) === want) correctIds.push(id);
      else misplacedIds.push(id);
    });
    var counted = unplacedIds.length + placedIds.length;
    return {
      placedIds: placedIds,
      correctIds: correctIds,
      misplacedIds: misplacedIds,
      unplacedIds: unplacedIds,
      allPlaced: counted > 0 && unplacedIds.length === 0,
      ok: counted > 0 && unplacedIds.length === 0 && misplacedIds.length === 0,
    };
  }

  /** on_wrong return_only_misplaced: correct boxes stay, misplaced keys become null. */
  function placementAfterReturnMisplaced(placement, grade) {
    var next = {};
    var src = placement && typeof placement === 'object' ? placement : {};
    Object.keys(src).forEach(function (id) {
      next[id] = src[id];
    });
    var misplaced = grade && grade.misplacedIds ? grade.misplacedIds : [];
    misplaced.forEach(function (id) {
      next[id] = null;
    });
    return next;
  }

  /** Q20: keep the sentence audio on the same slide as the L1 choices. */
  function listenToL1Slides(quiz) {
    var raw = quiz.slides || [];
    var audioSlide = null;
    var select = null;
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s) continue;
      if (
        !audioSlide &&
        (s.type === 'audio_listen' || s.type === 'audio_shadow' || s.type === 'audio_chunk' || s.type === 'audio_check')
      ) {
        audioSlide = s;
      }
      if (!select && s.type === 'select_text') select = s;
    }
    if (!select && audioSlide && (audioSlide.correct != null || audioSlide.distractors)) {
      select = audioSlide;
    }
    if (!select) return raw;
    var audio = audioSlide && audioSlide !== select ? audioSlide.audio : (select.audio || (audioSlide && audioSlide.audio));
    var start = null;
    var end = null;
    var rate = null;
    if (audioSlide) {
      if (audioSlide.start_sec != null) start = audioSlide.start_sec;
      if (audioSlide.end_sec != null) end = audioSlide.end_sec;
      if (audioSlide.rate != null) rate = audioSlide.rate;
    }
    if (select.start_sec != null && start == null) start = select.start_sec;
    if (select.end_sec != null && end == null) end = select.end_sec;
    if (select.rate != null && rate == null) rate = select.rate;
    if (!audio && select.audio) audio = select.audio;
    return [{
      type: 'select_text',
      listen_l1: true,
      prompt: select.prompt || '',
      correct: select.correct,
      distractors: select.distractors || [],
      audio: audio || null,
      start_sec: start,
      end_sec: end,
      rate: rate,
      instruction: select.instruction || '請聆聽句子，然後揀啱嘅翻譯',
    }];
  }

  function prepareSlides(quiz) {
    if (!quiz) return [];
    if (quiz.objective === 'mother_cloze_usage') return clozeSlides(quiz);
    if (quiz.objective === 'sentence_listen_to_l1') return listenToL1Slides(quiz);
    return quiz.slides || [];
  }

  function makeAudio(src, opts) {
    opts = opts || {};
    const segmentShadow = !!opts.segment_shadow;
    // speaker: compact play control for group_audio tiles. Full-file URL at
    // opts.rate, no native scrubber and no speed picker. Default callers unchanged.
    const speaker = !!opts.speaker;
    const wrap = el('div', 'audio-wrap');
    const audio = document.createElement('audio');
    // Segment shadowing: custom 重播 only (no native scrub).
    audio.controls = !segmentShadow && !speaker;
    audio.preload = 'auto';
    audio.src = src;
    if (speaker) audio.setAttribute('aria-hidden', 'true');
    const fixedRate = segmentShadow ? 0.75 : opts.rate;
    if (fixedRate != null) audio.playbackRate = fixedRate;
    wrap.appendChild(audio);

    const btns = el('div', 'audio-btns');
    const play = el('button', speaker ? 'btn group-play' : 'btn', segmentShadow ? '重播' : '播放');
    play.type = 'button';
    if (speaker) play.setAttribute('aria-label', '播放音檔');
    let clipListener = null;
    play.addEventListener('click', () => {
      if (clipListener) {
        audio.removeEventListener('timeupdate', clipListener);
        clipListener = null;
      }
      const start = opts.start_sec != null ? opts.start_sec : 0;
      if (opts.start_sec != null || segmentShadow) audio.currentTime = start;
      const useRate = segmentShadow ? 0.75 : opts.rate;
      if (useRate != null) audio.playbackRate = useRate;
      audio.play();
      if (opts.end_sec != null) {
        clipListener = () => {
          if (audio.currentTime >= opts.end_sec) {
            audio.pause();
            if (clipListener) {
              audio.removeEventListener('timeupdate', clipListener);
              clipListener = null;
            }
          }
        };
        audio.addEventListener('timeupdate', clipListener);
      }
    });
    btns.appendChild(play);

    // No speed picker for sentence_segment_shadowing (fixed 0.75×) or speaker tiles.
    if (!segmentShadow && !speaker && opts.rate_options) {
      opts.rate_options.forEach((r) => {
        const b = el('button', 'btn btn-ghost', r + '×');
        b.type = 'button';
        b.addEventListener('click', () => {
          audio.playbackRate = r;
          if (opts.start_sec != null) audio.currentTime = opts.start_sec;
          audio.play();
        });
        btns.appendChild(b);
      });
    }
    wrap.appendChild(btns);
    return wrap;
  }

  function selfCheckBar(onPass, onRetry) {
    const bar = el('div', 'self-check');
    const ok = el('button', 'btn btn-ok', '✓ 通過');
    const no = el('button', 'btn btn-no', '✗ 再試');
    ok.type = 'button';
    no.type = 'button';
    ok.addEventListener('click', onPass);
    no.addEventListener('click', onRetry);
    bar.appendChild(ok);
    bar.appendChild(no);
    return bar;
  }

  /**
   * @param {object} quiz
   * @param {HTMLElement} root
   * @param {{ onPass: Function, onFail?: Function, context?: object }} hooks
   */
  /**
   * In-session shadow take. The Blob and object URL never leave this closure:
   * nothing is written to progress, timing, or sync snapshots, and the take is
   * not scored.
   */
  function mountEphemeralRecorder(parent) {
    var rec = null;
    var chunks = [];
    var objectUrl = null;
    var stream = null;
    var disposed = false;
    var status = el('p', 'record-status', '錄音只留喺呢次練習，唔會儲存，亦唔會評分。');
    var btn = el('button', 'btn', '開始錄音');
    btn.type = 'button';
    var playback = el('div', 'record-playback');

    function revoke() {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (e) { /* already gone */ }
        objectUrl = null;
      }
    }

    function stopTracks() {
      if (!stream) return;
      try {
        stream.getTracks().forEach(function (track) { track.stop(); });
      } catch (e) { /* ignore */ }
      stream = null;
    }

    function unsupported(msg) {
      status.textContent = msg;
      btn.textContent = '開始錄音';
    }

    btn.addEventListener('click', function () {
      if (disposed) return;
      if (rec && rec.state === 'recording') {
        try { rec.stop(); } catch (e) { unsupported('停唔到錄音。可以照跟讀，然後完成。'); }
        return;
      }
      var devices = navigator.mediaDevices;
      if (!devices || typeof devices.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
        unsupported('呢個瀏覽器未支援錄音。可以照跟讀，然後完成。');
        return;
      }
      devices.getUserMedia({ audio: true }).then(function (nextStream) {
        if (disposed) {
          try { nextStream.getTracks().forEach(function (track) { track.stop(); }); } catch (e) { /* ignore */ }
          return;
        }
        stopTracks();
        stream = nextStream;
        chunks = [];
        revoke();
        playback.innerHTML = '';
        var mime = '';
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
        rec = mime ? new MediaRecorder(nextStream, { mimeType: mime }) : new MediaRecorder(nextStream);
        rec.ondataavailable = function (event) {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        rec.onstop = function () {
          var mimeType = rec && rec.mimeType ? rec.mimeType : 'audio/webm';
          var take = chunks.slice();
          chunks = [];
          stopTracks();
          if (disposed) return;
          var blob = new Blob(take, { type: mimeType });
          revoke();
          objectUrl = URL.createObjectURL(blob);
          var audio = document.createElement('audio');
          audio.controls = true;
          audio.src = objectUrl;
          playback.appendChild(el('p', 'hint', '重聽自己'));
          playback.appendChild(audio);
          status.textContent = '可以重聽自己。錄音唔會儲存，亦唔會評分。';
          btn.textContent = '再錄一次';
        };
        rec.start();
        btn.textContent = '停止錄音';
        status.textContent = '錄音中…';
      }, function () {
        if (!disposed) unsupported('未開到咪。可以照跟讀，然後完成。');
      });
    });

    var box = el('div', 'record-box');
    box.appendChild(status);
    box.appendChild(btn);
    box.appendChild(playback);
    parent.appendChild(box);

    return function dispose() {
      disposed = true;
      chunks = [];
      if (rec && rec.state === 'recording') {
        rec.ondataavailable = null;
        var stopped = rec;
        rec = null;
        stopped.onstop = function () { stopTracks(); };
        try { stopped.stop(); } catch (e) { stopTracks(); }
      } else {
        stopTracks();
      }
      revoke();
      playback.innerHTML = '';
    };
  }

  function run(quiz, root, hooks) {
    hooks = hooks || {};
    root.innerHTML = '';
    const slides = prepareSlides(quiz);
    let idx = 0;
    let disposeRecorder = null;
    const status = el('div', 'quiz-status');
    const body = el('div', 'quiz-body');
    const feedback = el('div', 'quiz-feedback');
    root.appendChild(status);
    root.appendChild(body);
    root.appendChild(feedback);
    root.appendChild(mountReport(quiz, hooks));

    function setStatus() {
      status.textContent =
        (quiz.objective || '') +
        (quiz.level != null ? ' · Level ' + quiz.level : '') +
        ' · 步驟 ' +
        (idx + 1) +
        '/' +
        slides.length;
    }

    function finishPass() {
      feedback.textContent = '正確！';
      feedback.className = 'quiz-feedback ok';
      setTimeout(() => hooks.onPass && hooks.onPass(quiz), 400);
    }

    function showFail(msg) {
      feedback.textContent = msg || '再試一次';
      feedback.className = 'quiz-feedback bad';
      const fb = quiz.feedback || {};
      if (fb.on_wrong === 'show_correct' || fb.on_wrong === 'show_correct_box' || fb.on_wrong === 'show_correct_sequence') {
        // stay on slide; user can retry
      }
      if (hooks.onFail) hooks.onFail(quiz);
    }

    function releaseRecorder() {
      if (!disposeRecorder) return;
      var dispose = disposeRecorder;
      disposeRecorder = null;
      dispose();
    }

    /** Missing sentence-layer data must not mark the quiz passed. */
    function mountSoftSkip(message) {
      body.appendChild(el('p', 'instruction', message));
      const skip = el('button', 'btn', '跳過');
      skip.type = 'button';
      skip.addEventListener('click', () => {
        if (idx < slides.length - 1) {
          idx++;
          renderSlide();
          return;
        }
        if (hooks.onSkip) hooks.onSkip(quiz);
        else {
          idx++;
          renderSlide();
        }
      });
      body.appendChild(skip);
    }

    function clearFeedback() {
      feedback.className = 'quiz-feedback';
      feedback.textContent = '';
      while (feedback.children && feedback.children.length) feedback.children[0].remove();
    }

    function choiceEntries(list) {
      return (list || []).map(function (raw) {
        return { raw: raw, text: cleanChoiceText(raw) };
      });
    }

    function explanationFor(slide, entry) {
      var map = slide && slide.explanations;
      if (!map || typeof map !== 'object') return '';
      if (map[entry.text] != null && map[entry.text] !== '') return String(map[entry.text]);
      if (entry.raw != null && map[entry.raw] != null && map[entry.raw] !== '') return String(map[entry.raw]);
      return '';
    }

    /**
     * Q26 select_text + multi_select. require_all_correct means the selected
     * set must equal correct[] (same grade as type multi_select). on_tick
     * pass advances. on_cross retry stays on the slide. on_wrong
     * show_only_missed_correct_and_selected_distractor lists explanations
     * for missed correct choices and selected distractors only.
     */
    function showMissedFeatureFeedback(slide, selected, correctEntries, distractorEntries) {
      clearFeedback();
      feedback.className = 'quiz-feedback bad';
      var lines = [];
      correctEntries.forEach(function (entry) {
        if (selected.has(entry.text)) return;
        var why = explanationFor(slide, entry);
        lines.push(why ? '未揀「' + entry.text + '」' + why : '未揀「' + entry.text + '」');
      });
      var correctTexts = new Set(correctEntries.map(function (entry) { return entry.text; }));
      distractorEntries.forEach(function (entry) {
        if (!selected.has(entry.text) || correctTexts.has(entry.text)) return;
        var why = explanationFor(slide, entry);
        lines.push(why ? '錯揀「' + entry.text + '」' + why : '錯揀「' + entry.text + '」');
      });
      if (!lines.length) lines.push('再試一次');
      lines.forEach(function (line) {
        feedback.appendChild(el('p', 'hint', line));
      });
      if (hooks.onFail) hooks.onFail(quiz);
    }

    function mountSelectMulti(slide) {
      var correctEntries = choiceEntries(slide.correct);
      if (!correctEntries.length) {
        mountSoftSkip('呢題未有選項，跳過。');
        return;
      }
      var instruction =
        typeof slide.instruction === 'string' && slide.instruction.trim()
          ? slide.instruction.trim()
          : '請揀晒啱嘅';
      body.appendChild(el('p', 'instruction', instruction));
      var correctSet = new Set(correctEntries.map(function (entry) { return entry.text; }));
      var distractorEntries = choiceEntries(slide.distractors);
      var pool = correctEntries.concat(distractorEntries);
      var ordered = slide.shuffle === false ? pool : shuffle(pool);
      var selected = new Set();
      var list = el('div', 'choices');
      ordered.forEach(function (entry) {
        var b = el('button', 'btn choice', entry.text);
        b.type = 'button';
        b.addEventListener('click', function () {
          if (selected.has(entry.text)) {
            selected.delete(entry.text);
            b.classList.remove('selected');
          } else {
            selected.add(entry.text);
            b.classList.add('selected');
          }
        });
        list.appendChild(b);
      });
      body.appendChild(list);
      var submit = el('button', 'btn btn-primary', '確認');
      submit.type = 'button';
      submit.addEventListener('click', function () {
        var exact =
          selected.size === correctSet.size &&
          Array.from(selected).every(function (item) { return correctSet.has(item); });
        if (exact) {
          idx++;
          renderSlide();
          return;
        }
        var fb = quiz.feedback || {};
        if (fb.on_wrong === 'show_only_missed_correct_and_selected_distractor') {
          showMissedFeatureFeedback(slide, selected, correctEntries, distractorEntries);
          return;
        }
        showFail('未全對。正確：' + Array.from(correctSet).join(' / '));
      });
      body.appendChild(submit);
    }

    /**
     * Q27 group_audio. Stem is slide.instruction. Items are audio-only tiles
     * (no Japanese, no L1). Tap 播放 to hear the full file at slide.rate
     * (default 1, no passage window). Tap 揀, then tap a box — or tap 未分類
     * to send it back. require_all_placed blocks 確認 until every item is in
     * a box. on_wrong return_only_misplaced puts only misplaced items back in
     * the pool. on_cross retry stays on this slide and does not complete.
     */
    function mountGroupAudio(slide) {
      function hasClass(node, cls) {
        if (!node) return false;
        if (node.classList && node.classList.contains && node.classList.contains(cls)) return true;
        return String(node.className || '').split(/\s+/).indexOf(cls) !== -1;
      }

      function eventHitsItem(evt) {
        var node = evt && evt.target;
        while (node) {
          if (hasClass(node, 'group-item') || hasClass(node, 'group-play') || hasClass(node, 'group-select')) {
            return true;
          }
          node = node.parentNode;
        }
        return false;
      }

      // HTMLCollection has no forEach in some browsers. Index loops work for
      // both a live collection and the array used by the node tests.
      function eachChild(node, fn) {
        var list = node && node.children;
        if (!list || typeof list.length !== 'number') return;
        for (var i = 0; i < list.length; i++) fn(list[i]);
      }

      function firstTag(node, tag) {
        var found = null;
        (function walk(n) {
          if (found || !n) return;
          if (n.tagName === tag) {
            found = n;
            return;
          }
          eachChild(n, walk);
        })(node);
        return found;
      }

      var rate = slide.rate != null ? slide.rate : 1;
      var requireAll = slide.require_all_placed === true;
      var items = [];
      (slide.items || []).forEach(function (raw) {
        if (!raw || raw.id == null || raw.id === '') return;
        items.push({
          id: String(raw.id),
          audio: raw.audio || '',
          correct_box: raw.correct_box == null ? '' : String(raw.correct_box),
        });
      });
      var boxes = [];
      (slide.boxes || []).forEach(function (raw) {
        if (!raw || raw.id == null || raw.id === '') return;
        boxes.push({
          id: String(raw.id),
          label: raw.label != null ? String(raw.label) : String(raw.id),
        });
      });
      var ordered = slide.shuffle === false ? items.slice() : shuffle(items);
      var placement = {};
      items.forEach(function (item) { placement[item.id] = null; });
      var selectedId = null;
      var tileById = {};
      var selectById = {};
      var audioById = {};
      var boxItemsEl = {};
      var boxWrap = {};
      var emptyNote = {};

      var instruction =
        typeof slide.instruction === 'string' && slide.instruction.trim()
          ? slide.instruction.trim()
          : '聽每一句，放入對應嘅格';
      body.appendChild(el('p', 'instruction', instruction));
      body.appendChild(el('p', 'hint group-hint', '播放 → 揀 → 撳箱。要放返就撳「未分類」。'));
      var progress = el('p', 'group-progress', '');
      progress.setAttribute('aria-live', 'polite');
      body.appendChild(progress);

      var poolWrap = el('div', 'group-pool-wrap');
      poolWrap.setAttribute('data-drop', 'pool');
      poolWrap.setAttribute('tabindex', '0');
      var poolLabel = el('p', 'group-pool-label', '未分類');
      var poolEl = el('div', 'group-pool');
      poolWrap.appendChild(poolLabel);
      poolWrap.appendChild(poolEl);
      body.appendChild(poolWrap);

      var boxRow = el('div', 'group-boxes');
      boxes.forEach(function (box) {
        var wrap = el('div', 'group-box');
        wrap.setAttribute('data-box-id', box.id);
        wrap.setAttribute('tabindex', '0');
        var label = el('p', 'group-box-label', box.label);
        var itemsEl = el('div', 'group-box-items');
        itemsEl.setAttribute('data-box-id', box.id);
        var empty = el('p', 'group-empty', '撳此放入');
        itemsEl.appendChild(empty);
        wrap.appendChild(label);
        wrap.appendChild(itemsEl);
        wrap.addEventListener('click', function (evt) {
          if (eventHitsItem(evt)) return;
          placeSelected(box.id);
        });
        wrap.addEventListener('keydown', function (evt) {
          if (!evt || evt.target !== wrap) return;
          if (evt.key !== 'Enter' && evt.key !== ' ') return;
          if (evt.preventDefault) evt.preventDefault();
          placeSelected(box.id);
        });
        boxRow.appendChild(wrap);
        boxWrap[box.id] = wrap;
        boxItemsEl[box.id] = itemsEl;
        emptyNote[box.id] = empty;
      });
      body.appendChild(boxRow);

      ordered.forEach(function (item) {
        var resolved = resolveAudio({ audio: item.audio, rate: rate });
        var audioOpts = { rate: resolved.opts.rate, speaker: true };
        var player = makeAudio(resolved.src, audioOpts);
        var audio = firstTag(player, 'AUDIO');
        var playBtn = firstTag(player, 'BUTTON');
        audioById[item.id] = audio;
        if (playBtn) {
          playBtn.addEventListener('click', function (evt) {
            if (evt && evt.stopPropagation) evt.stopPropagation();
            Object.keys(audioById).forEach(function (otherId) {
              if (otherId === item.id) return;
              var other = audioById[otherId];
              if (other && other.pause) other.pause();
            });
          });
        }
        var selectBtn = el('button', 'btn group-select', '揀');
        selectBtn.type = 'button';
        selectBtn.setAttribute('aria-label', '選取音檔');
        selectBtn.setAttribute('aria-pressed', 'false');
        selectBtn.addEventListener('click', function (evt) {
          if (evt && evt.stopPropagation) evt.stopPropagation();
          selectedId = selectedId === item.id ? null : item.id;
          paintSelection();
        });
        var tile = el('div', 'group-item');
        tile.setAttribute('data-item-id', item.id);
        tile.appendChild(player);
        tile.appendChild(selectBtn);
        tileById[item.id] = tile;
        selectById[item.id] = selectBtn;
        poolEl.appendChild(tile);
      });

      poolWrap.addEventListener('click', function (evt) {
        if (eventHitsItem(evt)) return;
        placeSelected(null);
      });
      poolWrap.addEventListener('keydown', function (evt) {
        if (!evt || evt.target !== poolWrap) return;
        if (evt.key !== 'Enter' && evt.key !== ' ') return;
        if (evt.preventDefault) evt.preventDefault();
        placeSelected(null);
      });

      var note = el('p', 'group-note', '');
      note.setAttribute('aria-live', 'polite');
      var submit = el('button', 'btn btn-primary group-submit', '確認');
      submit.type = 'button';
      submit.addEventListener('click', onSubmit);
      body.appendChild(note);
      body.appendChild(submit);
      paintSelection();
      syncEmpty();
      syncSubmit();

      function paintSelection() {
        items.forEach(function (item) {
          var on = item.id === selectedId;
          var tile = tileById[item.id];
          tile.className = on ? 'group-item selected' : 'group-item';
          if (tile.classList) {
            if (on) tile.classList.add('selected');
            else tile.classList.remove('selected');
          }
          var btn = selectById[item.id];
          btn.textContent = on ? '已揀' : '揀';
          btn.className = on ? 'btn group-select selected' : 'btn group-select';
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        boxes.forEach(function (box) {
          boxWrap[box.id].className = selectedId ? 'group-box armed' : 'group-box';
        });
        poolWrap.className = selectedId ? 'group-pool-wrap armed' : 'group-pool-wrap';
      }

      function syncEmpty() {
        boxes.forEach(function (box) {
          var count = 0;
          eachChild(boxItemsEl[box.id], function (child) {
            if (hasClass(child, 'group-item')) count += 1;
          });
          emptyNote[box.id].hidden = count > 0;
        });
      }

      function syncSubmit() {
        var grade = gradeGroupAudio(items, placement);
        var blocked = requireAll && !grade.allPlaced;
        submit.disabled = blocked;
        submit.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        progress.textContent = '已放 ' + grade.placedIds.length + '/' + items.length;
      }

      function clearGroupNote() {
        note.textContent = '';
        note.className = 'group-note';
      }

      function moveItem(id, boxId) {
        if (!id || !tileById[id]) return;
        if (boxId != null && !boxItemsEl[boxId]) return;
        var same = boxId == null ? placement[id] == null : placement[id] === boxId;
        if (!same) {
          placement[id] = boxId;
          var tile = tileById[id];
          if (tile.remove) tile.remove();
          (boxId == null ? poolEl : boxItemsEl[boxId]).appendChild(tile);
        }
        selectedId = null;
        paintSelection();
        syncEmpty();
        syncSubmit();
        clearGroupNote();
        clearFeedback();
      }

      function placeSelected(boxId) {
        if (!selectedId) return;
        moveItem(selectedId, boxId);
      }

      function onSubmit() {
        var grade = gradeGroupAudio(items, placement);
        if (requireAll && !grade.allPlaced) {
          note.textContent = '請放晒所有音檔先確認';
          note.className = 'group-note';
          clearFeedback();
          return;
        }
        if (grade.ok) {
          idx++;
          renderSlide();
          return;
        }
        var fb = quiz.feedback || {};
        if (fb.on_wrong === 'return_only_misplaced') {
          var next = placementAfterReturnMisplaced(placement, grade);
          items.forEach(function (item) {
            var now = next[item.id] == null || next[item.id] === '' ? null : next[item.id];
            if ((placement[item.id] == null && now == null) || placement[item.id] === now) return;
            placement[item.id] = now;
            var tile = tileById[item.id];
            if (!tile) return;
            if (tile.remove) tile.remove();
            (now == null ? poolEl : boxItemsEl[now]).appendChild(tile);
          });
        }
        selectedId = null;
        paintSelection();
        syncEmpty();
        syncSubmit();
        note.textContent = '有 ' + grade.correctIds.length + ' 個啱，再試一次';
        note.className = 'group-note bad';
        // on_cross retry: stay on this slide. A wrong submit is not a pass.
        // The note above 確認 is the only copy; showFail would repeat it below the button.
        clearFeedback();
        if (hooks.onFail) hooks.onFail(quiz);
      }
    }

    function renderSlide() {
      releaseRecorder();
      clearFeedback();
      body.innerHTML = '';
      if (idx >= slides.length) {
        finishPass();
        return;
      }
      setStatus();
      const slide = slides[idx];
      const type = slide.type;

      if (type === 'prompt') {
        body.appendChild(el('p', 'prompt', slide.text || ''));
        // 故事選圖 step 1 is still this quiz (story → image). Later advances stay 「下一題」.
        const advanceLabel =
          quiz.objective === 'story_select_image' && idx === 0 ? '下一步' : '下一題';
        const next = el('button', 'btn btn-primary', advanceLabel);
        next.type = 'button';
        next.addEventListener('click', () => {
          idx++;
          renderSlide();
        });
        body.appendChild(next);
        return;
      }

      if (type === 'select_text') {
        if (slide.multi_select === true) {
          mountSelectMulti(slide);
          return;
        }
        // Q19 Cloze: chunk and blanked L1 cards on this same slide. Grade is still exact card match.
        const cloze = quiz.objective === 'mother_cloze_usage';
        const listenL1 = !cloze && (quiz.objective === 'sentence_listen_to_l1' || slide.listen_l1);
        const discourse = !cloze && quiz.objective === 'sentence_discourse_mcq';
        if ((listenL1 || discourse) && (slide.correct == null || slide.correct === '')) {
          mountSoftSkip(discourse ? '呢題未有語境選項，跳過。' : '呢題未有翻譯選項，跳過。');
          return;
        }
        const host = cloze ? el('div', 'cloze-slide') : body;
        if (cloze) {
          const chunkText = slide.prompt || (quiz.chunk && quiz.chunk.text) || '';
          if (chunkText) host.appendChild(el('p', 'prompt cloze-prompt', chunkText));
        }
        if (discourse) {
          const stem = slide.prompt || slide.context || slide.stem || '';
          if (stem) host.appendChild(el('p', 'prompt', stem));
        }
        const slideInstruction =
          typeof slide.instruction === 'string' ? slide.instruction.trim() : '';
        const instruction = cloze
          ? '請選擇空白正確的母語句子'
          : listenL1
            ? (slide.instruction || '請聆聽句子，然後揀啱嘅翻譯')
            : discourse
              ? '請揀最啱上文下理嘅母語句'
              : (slideInstruction || '請選擇正確答案');
        host.appendChild(
          el(
            'p',
            cloze ? 'instruction cloze-instruction' : 'instruction',
            instruction
          )
        );
        if (listenL1) {
          const resolved = resolveAudio(slide);
          if (resolved.src) {
            host.appendChild(makeAudio(resolved.src, {
              start_sec: resolved.opts.start_sec,
              end_sec: resolved.opts.end_sec,
              rate: resolved.opts.rate,
              segment_shadow: false,
            }));
          } else {
            host.appendChild(el('p', 'hint', '未有句子音檔，仍然可以揀翻譯。'));
          }
          if (slide.prompt && slide.prompt !== slide.correct) {
            host.appendChild(el('p', 'prompt', slide.prompt));
          }
        }
        const correct = cleanChoiceText(slide.correct);
        const opts = shuffle([correct].concat((slide.distractors || []).map(cleanChoiceText)));
        const list = el('div', cloze ? 'choices cloze-choices' : 'choices');
        opts.forEach((opt) => {
          const b = el('button', cloze ? 'btn choice cloze-choice' : 'btn choice');
          b.type = 'button';
          if (cloze) appendClozeLabel(b, opt);
          else b.textContent = opt;
          b.addEventListener('click', () => {
            if (opt === correct) {
              idx++;
              renderSlide();
            } else {
              showFail('錯：正確是「' + correct + '」');
            }
          });
          list.appendChild(b);
        });
        host.appendChild(list);
        if (cloze) body.appendChild(host);
        return;
      }

      if (type === 'multi_select') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請全選正確項'));
        const correctList = (slide.correct || []).map(cleanChoiceText);
        const correctSet = new Set(correctList);
        const opts = shuffle(correctList.concat((slide.distractors || []).map(cleanChoiceText)));
        const selected = new Set();
        const list = el('div', 'choices');
        opts.forEach((opt) => {
          const b = el('button', 'btn choice', opt);
          b.type = 'button';
          b.addEventListener('click', () => {
            if (selected.has(opt)) {
              selected.delete(opt);
              b.classList.remove('selected');
            } else {
              selected.add(opt);
              b.classList.add('selected');
            }
          });
          list.appendChild(b);
        });
        body.appendChild(list);
        const submit = el('button', 'btn btn-primary', '確認');
        submit.type = 'button';
        submit.addEventListener('click', () => {
          const ok =
            selected.size === correctSet.size &&
            Array.from(selected).every((x) => correctSet.has(x));
          if (ok) {
            idx++;
            renderSlide();
          } else {
            showFail('未全對。正確：' + Array.from(correctSet).join(' / '));
          }
        });
        body.appendChild(submit);
        return;
      }

      if (type === 'select_image') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請選擇正確圖片'));
        const imgs = shuffle(
          [{ url: slide.correct, ok: true }].concat(
            (slide.distractors || []).map((u) => ({ url: u, ok: false }))
          )
        );
        const grid = el('div', 'img-grid');
        imgs.forEach((item) => {
          const b = el('button', 'img-choice');
          b.type = 'button';
          const img = document.createElement('img');
          img.src = item.url;
          img.alt = '';
          b.appendChild(img);
          b.addEventListener('click', () => {
            if (item.ok) {
              idx++;
              renderSlide();
            } else {
              showFail('圖片不對');
            }
          });
          grid.appendChild(b);
        });
        body.appendChild(grid);
        return;
      }

      if (type === 'multi_tap' || (type === 'tap' && quiz.objective === 'sentence_l1_palace_multi_tap')) {
        const ctx = hooks.context || {};
        const parsed = multiTapTargets(slide);
        const image = multiTapImage(slide, quiz, ctx);
        const l1 = slide.prompt || slide.l1 || quiz.l1 || ctx.sentenceL1 || '';
        if (!image || !parsed.ok) {
          const why = !image && !parsed.ok
            ? '未有宮殿圖同熱區，跳過呢題。'
            : !image
              ? '未有宮殿圖，跳過呢題。'
              : '未有呢句嘅熱區，跳過呢題。';
          mountSoftSkip(why);
          return;
        }
        if (l1) body.appendChild(el('p', 'prompt sentence-l1', l1));
        body.appendChild(el('p', 'instruction', slide.instruction || '請點選呢句相關嘅所有位置'));
        const targets = parsed.targets;
        const collected = [];
        const progress = el('p', 'multi-tap-progress', '已點 0/' + targets.length);
        body.appendChild(progress);
        const wrap = el('div', 'tap-wrap');
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        img.className = 'tap-img';
        wrap.appendChild(img);
        const selectedBoxes = new Map();
        let hints = [];

        function clearHints() {
          hints.forEach((node) => node.remove());
          hints = [];
        }

        function paintBox(hotspot, className) {
          const box = el('div', className);
          box.style.left = hotspot.left + '%';
          box.style.top = hotspot.top + '%';
          box.style.width = hotspot.width + '%';
          box.style.height = hotspot.height + '%';
          wrap.appendChild(box);
          return box;
        }

        img.addEventListener('click', (evt) => {
          const rect = img.getBoundingClientRect();
          const point = {
            x: ((evt.clientX - rect.left) / rect.width) * 100,
            y: ((evt.clientY - rect.top) / rect.height) * 100,
          };
          clearHints();
          const result = gradeMultiTap(targets, collected, point);
          if (result.kind === 'hit') {
            collected.push(result.id);
            const target = targets.filter((item) => item.id === result.id)[0];
            if (target && !selectedBoxes.has(target.id)) {
              const box = paintBox(target.hotspot, 'hotspot-selected');
              if (target.label) box.title = target.label;
              selectedBoxes.set(target.id, box);
            }
            progress.textContent = '已點 ' + collected.length + '/' + targets.length;
            if (result.done) {
              idx++;
              renderSlide();
            } else {
              feedback.textContent = '啱，仲有位置未點';
              feedback.className = 'quiz-feedback ok';
            }
          } else if (result.kind === 'repeat') {
            if (slide.allow_change) {
              const at = collected.indexOf(result.id);
              if (at !== -1) collected.splice(at, 1);
              const box = selectedBoxes.get(result.id);
              if (box) {
                box.remove();
                selectedBoxes.delete(result.id);
              }
              progress.textContent = '已點 ' + collected.length + '/' + targets.length;
              feedback.textContent = '';
              feedback.className = 'quiz-feedback';
            } else {
              feedback.textContent = '呢度已經點過';
              feedback.className = 'quiz-feedback';
            }
          } else {
            showFail('呢個位置唔係呢句（已點 ' + collected.length + '/' + targets.length + '）');
            const fb = quiz.feedback || {};
            if (
              fb.on_wrong === 'show_correct_box' ||
              fb.on_wrong === 'show_correct_boxes' ||
              fb.on_wrong === 'show_correct'
            ) {
              targets.forEach((target) => {
                if (collected.indexOf(target.id) !== -1) return;
                hints.push(paintBox(target.hotspot, 'hotspot-hint'));
              });
            }
          }
        });
        body.appendChild(wrap);
        return;
      }

      if (type === 'tap') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請點擊正確位置'));
        const wrap = el('div', 'tap-wrap');
        const img = document.createElement('img');
        img.src = slide.image;
        img.alt = '';
        img.className = 'tap-img';
        wrap.appendChild(img);
        let overlay = null;
        img.addEventListener('click', (evt) => {
          const ok = hitTest(img, evt, slide.hotspot);
          if (overlay) overlay.remove();
          if (ok) {
            idx++;
            renderSlide();
          } else {
            showFail('位置不對');
            if (
              (quiz.feedback || {}).on_wrong === 'show_correct_box' ||
              (quiz.feedback || {}).on_wrong === 'show_correct_boxes' ||
              (quiz.feedback || {}).on_wrong === 'show_correct'
            ) {
              overlay = el('div', 'hotspot-hint');
              const hs = slide.hotspot;
              overlay.style.left = hs.left + '%';
              overlay.style.top = hs.top + '%';
              overlay.style.width = hs.width + '%';
              overlay.style.height = hs.height + '%';
              wrap.appendChild(overlay);
            }
          }
        });
        body.appendChild(wrap);
        return;
      }

      if (type === 'sequence_tap') {
        // Wrong tap reveals this step's correct box, then the whole sequence
        // starts over at the first item. No 「再試」 button.
        const SEQUENCE_REVEAL_MS = 3000;
        body.appendChild(el('p', 'instruction', slide.instruction || '請按順序點選'));
        const seq = slide.sequence || [];
        let step = 0;
        let revealLocked = false;
        let revealTimer = null;
        let hint = null;
        const progress = el('p', 'seq-progress', '下一個：' + (seq[0] && seq[0].text));
        body.appendChild(progress);
        const wrap = el('div', 'tap-wrap');
        const img = document.createElement('img');
        img.src = slide.image;
        img.alt = '';
        img.className = 'tap-img';
        wrap.appendChild(img);

        function clearHint() {
          if (hint) {
            hint.remove();
            hint = null;
          }
        }

        function showCorrectBox(target) {
          clearHint();
          const hs = target && target.hotspot;
          if (!hs) return;
          hint = el('div', 'hotspot-hint');
          hint.style.left = hs.left + '%';
          hint.style.top = hs.top + '%';
          hint.style.width = hs.width + '%';
          hint.style.height = hs.height + '%';
          if (target.text) hint.title = target.text;
          wrap.appendChild(hint);
        }

        function resetSequence() {
          revealLocked = false;
          revealTimer = null;
          clearHint();
          step = 0;
          if (!progress.isConnected) return;
          progress.textContent = '下一個：' + (seq[0] && seq[0].text);
          feedback.textContent = '';
          feedback.className = 'quiz-feedback';
        }

        img.addEventListener('click', (evt) => {
          if (revealLocked) return;
          const target = seq[step];
          if (!target) return;
          if (target.hotspot && hitTest(img, evt, target.hotspot)) {
            step++;
            if (step >= seq.length) {
              if (revealTimer) clearTimeout(revealTimer);
              idx++;
              renderSlide();
            } else {
              progress.textContent = '下一個：' + seq[step].text;
              feedback.textContent = '對！';
              feedback.className = 'quiz-feedback ok';
            }
          } else {
            revealLocked = true;
            showFail('順序錯了，從第一個再來');
            showCorrectBox(target);
            if (revealTimer) clearTimeout(revealTimer);
            revealTimer = setTimeout(resetSequence, SEQUENCE_REVEAL_MS);
          }
        });
        body.appendChild(wrap);
        return;
      }

      if (type === 'writing') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請抄寫'));
        if (slide.target) body.appendChild(el('p', 'writing-target', slide.target));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'writing-input';
        input.lang = 'ja';
        body.appendChild(input);
        if (slide.self_check) {
          body.appendChild(
            selfCheckBar(
              () => {
                idx++;
                renderSlide();
              },
              () => {
                feedback.textContent = '再試';
                feedback.className = 'quiz-feedback bad';
                input.focus();
              }
            )
          );
        } else {
          const submit = el('button', 'btn btn-primary', '確認');
          submit.type = 'button';
          submit.addEventListener('click', () => {
            if (input.value.trim() === (slide.target || '').trim()) {
              idx++;
              renderSlide();
            } else {
              showFail('寫法不對');
            }
          });
          body.appendChild(submit);
        }
        return;
      }

      if (
        type === 'audio_listen' ||
        type === 'audio_shadow' ||
        type === 'audio_segment_shadow' ||
        type === 'audio_chunk' ||
        type === 'audio_check'
      ) {
        const resolved = resolveAudio(slide);
        const audioSrc = resolved.src;
        const audioOpts = resolved.opts;
        // Q18 (and any non-whitelisted 0.75× clip) keeps segment chrome.
        // Q22/Q23 force their whole-sentence rate and never set segment_shadow.
        const plan = shadowSlidePlan(quiz, type, audioOpts);
        if (plan.segmentShadow) {
          audioOpts.segment_shadow = true;
          audioOpts.rate = 0.75;
          audioOpts.rate_options = null;
        } else if (plan.record.enabled) {
          audioOpts.segment_shadow = false;
          audioOpts.rate = plan.rate;
          audioOpts.rate_options = null;
        }
        const instruction = plan.record.enabled
          ? (slide.instruction || ('請跟讀成句（' + plan.rate + '×）'))
          : (slide.instruction || '請聆聽');
        body.appendChild(el('p', 'instruction', instruction));
        if (plan.record.enabled && (slide.text || slide.prompt)) {
          body.appendChild(el('p', 'prompt', slide.text || slide.prompt));
        }
        // Example L1 (Chinese gloss) — Lexicon / quiz.example_l1 / slide.l1|gloss
        const l1Text =
          slide.l1 ||
          slide.gloss ||
          quiz.example_l1 ||
          quiz.l1 ||
          '';
        if (l1Text) {
          body.appendChild(el('p', 'example-l1 gloss', l1Text));
        }
        body.appendChild(makeAudio(audioSrc, audioOpts));
        if (plan.record.enabled) {
          disposeRecorder = mountEphemeralRecorder(body);
          const done = el('button', 'btn btn-primary', '完成跟讀');
          done.type = 'button';
          done.addEventListener('click', () => {
            idx++;
            renderSlide();
          });
          body.appendChild(done);
          return;
        }
        if (slide.self_check !== false) {
          body.appendChild(
            selfCheckBar(
              () => {
                idx++;
                renderSlide();
              },
              () => {
                feedback.textContent = '再聽一次';
                feedback.className = 'quiz-feedback bad';
              }
            )
          );
        } else {
          const next = el('button', 'btn btn-primary', '下一題');
          next.type = 'button';
          next.addEventListener('click', () => {
            idx++;
            renderSlide();
          });
          body.appendChild(next);
        }
        return;
      }

      if (type === 'youglish') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請聆聽 YouGlish / YouTube'));
        const vid = slide.video_id;
        const start = slide.start_sec || 0;
        if (vid) {
          const iframe = document.createElement('iframe');
          iframe.className = 'yt-frame';
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          iframe.src = 'https://www.youtube.com/embed/' + vid + '?start=' + Math.floor(start);
          body.appendChild(iframe);
          const link = el('a', 'ext-link', '在 YouTube 開啟');
          link.href = 'https://www.youtube.com/watch?v=' + vid + '&t=' + Math.floor(start) + 's';
          link.target = '_blank';
          link.rel = 'noopener';
          body.appendChild(link);
        }
        body.appendChild(
          selfCheckBar(
            () => {
              idx++;
              renderSlide();
            },
            () => {
              feedback.textContent = '再聽一次';
              feedback.className = 'quiz-feedback bad';
            }
          )
        );
        return;
      }

      if (type === 'record_pronounce') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請朗讀'));
        if (slide.gloss) body.appendChild(el('p', 'gloss', slide.gloss));
        body.appendChild(el('p', 'hint', '（v1：無需錄音，自評即可）'));
        body.appendChild(
          selfCheckBar(
            () => {
              idx++;
              renderSlide();
            },
            () => {
              feedback.textContent = '再試';
              feedback.className = 'quiz-feedback bad';
            }
          )
        );
        return;
      }

      if (type === 'group_audio') {
        mountGroupAudio(slide);
        return;
      }

      // Unknown slide type: skip with note
      body.appendChild(el('p', 'instruction', '未支援嘅題型：' + type));
      const skip = el('button', 'btn', '跳過');
      skip.type = 'button';
      skip.addEventListener('click', () => {
        idx++;
        renderSlide();
      });
      body.appendChild(skip);
    }

    renderSlide();
  }

  global.QuizRunner = {
    run: run,
    reportLines: reportLines,
    formatReport: formatReport,
    prepareSlides: prepareSlides,
    isSegmentShadow: isSegmentShadow,
    shadowSlidePlan: shadowSlidePlan,
    wholeSentenceShadowRate: wholeSentenceShadowRate,
    multiTapTargets: multiTapTargets,
    multiTapImage: multiTapImage,
    gradeMultiTap: gradeMultiTap,
    gradeGroupAudio: gradeGroupAudio,
    placementAfterReturnMisplaced: placementAfterReturnMisplaced,
    hotspotRect: hotspotRect,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = global.QuizRunner;
  }
})(typeof window !== 'undefined' ? window : global);
