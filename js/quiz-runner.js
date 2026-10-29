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
    mother_language_pronounce: '母語發音',
    mother_to_target_language: '母語譯目標語',
    pronunciation_sounding_select: '發音諧音選擇',
    sentence_segment_shadowing: '句子分段跟讀',
    sequence_training: '順序訓練',
    story_select_image: '故事選圖',
    target_to_mnemonic_image: '目標語記憶圖',
    tone_shadowing_05: '語調跟讀 0.5×',
    whole_sentence_listening: '整句聆聽',
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
    if (kind === 'sentence' || (kind !== 'chunk' && id == null && !text)) return '整句 / n/a';
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
      { label: 'Sentence Group', value: groupDisplay(quiz, ctx) },
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

  /** 「回報問題」 — collapsed until tapped; one Copy writes the plain-text block.
   *  A full-screen overlay sits behind the open panel; a tap on it dismisses
   *  the panel. Taps inside the panel (including Copy) do not. */
  function mountReport(quiz, hooks) {
    var ctx = (hooks && hooks.context) || {};
    var text = formatReport(quiz, ctx);
    var wrap = el('div', 'report-problem');
    var toggle = el('button', 'btn btn-ghost report-toggle', '回報問題');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'report-panel');

    var overlay = el('div', 'report-overlay');
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

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

    function setReportOpen(open) {
      panel.hidden = !open;
      overlay.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function (evt) {
      evt.stopPropagation();
      setReportOpen(panel.hidden);
    });

    overlay.addEventListener('click', function () {
      setReportOpen(false);
    });

    panel.addEventListener('click', function (evt) {
      evt.stopPropagation();
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
    wrap.appendChild(overlay);
    wrap.appendChild(panel);
    return wrap;
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

  function makeAudio(src, opts) {
    opts = opts || {};
    const segmentShadow = !!opts.segment_shadow;
    const wrap = el('div', 'audio-wrap');
    const audio = document.createElement('audio');
    // Segment shadowing: custom 重播 only (no native scrub).
    audio.controls = !segmentShadow;
    audio.preload = 'auto';
    audio.src = src;
    const fixedRate = segmentShadow ? 0.75 : opts.rate;
    if (fixedRate != null) audio.playbackRate = fixedRate;
    wrap.appendChild(audio);

    const btns = el('div', 'audio-btns');
    const play = el('button', 'btn', segmentShadow ? '重播' : '播放');
    play.type = 'button';
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

    // No speed picker for sentence_segment_shadowing (fixed 0.75×).
    if (!segmentShadow && opts.rate_options) {
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
  function run(quiz, root, hooks) {
    root.innerHTML = '';
    const slides = quiz.slides || [];
    let idx = 0;
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

    function renderSlide() {
      feedback.textContent = '';
      feedback.className = 'quiz-feedback';
      body.innerHTML = '';
      setStatus();
      if (idx >= slides.length) {
        finishPass();
        return;
      }
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
        body.appendChild(el('p', 'instruction', '請選擇正確答案'));
        const correct = cleanChoiceText(slide.correct);
        const opts = shuffle([correct].concat((slide.distractors || []).map(cleanChoiceText)));
        const list = el('div', 'choices');
        opts.forEach((opt) => {
          const b = el('button', 'btn choice', opt);
          b.type = 'button';
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
        body.appendChild(list);
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
            if ((quiz.feedback || {}).on_wrong === 'show_correct_box' || (quiz.feedback || {}).on_wrong === 'show_correct') {
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
        body.appendChild(el('p', 'instruction', slide.instruction || '請按順序點選'));
        const seq = slide.sequence || [];
        let step = 0;
        const progress = el('p', 'seq-progress', '下一個：' + (seq[0] && seq[0].text));
        body.appendChild(progress);
        const wrap = el('div', 'tap-wrap');
        const img = document.createElement('img');
        img.src = slide.image;
        img.alt = '';
        img.className = 'tap-img';
        wrap.appendChild(img);
        img.addEventListener('click', (evt) => {
          const target = seq[step];
          if (!target) return;
          if (hitTest(img, evt, target.hotspot)) {
            step++;
            if (step >= seq.length) {
              idx++;
              renderSlide();
            } else {
              progress.textContent = '下一個：' + seq[step].text;
              feedback.textContent = '對！';
              feedback.className = 'quiz-feedback ok';
            }
          } else {
            showFail('順序錯了，從第一個再來');
            step = 0;
            progress.textContent = '下一個：' + seq[0].text;
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
        body.appendChild(el('p', 'instruction', slide.instruction || '請聆聽'));
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
        // Accept either string URL or {url, start_sec, end_sec, rate} (Notion Q bots sometimes nest).
        let audioSrc = slide.audio;
        let audioOpts = {
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
        // sentence_segment_shadowing / audio_segment_shadow / rate 0.75 clipped slide → force 0.75× + 重播.
        const hasClip = audioOpts.start_sec != null || audioOpts.end_sec != null;
        const segmentShadow =
          quiz.objective === 'sentence_segment_shadowing' ||
          type === 'audio_segment_shadow' ||
          (Number(audioOpts.rate) === 0.75 && hasClip);
        if (segmentShadow) {
          audioOpts.segment_shadow = true;
          audioOpts.rate = 0.75;
          audioOpts.rate_options = null;
        }
        body.appendChild(makeAudio(audioSrc, audioOpts));
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

  global.QuizRunner = { run: run, reportLines: reportLines, formatReport: formatReport };
})(window);
