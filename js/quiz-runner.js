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

  function hitTest(imgEl, evt, hotspot) {
    const rect = imgEl.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 100;
    const y = ((evt.clientY - rect.top) / rect.height) * 100;
    const l = hotspot.left, t = hotspot.top, w = hotspot.width, h = hotspot.height;
    return x >= l && x <= l + w && y >= t && y <= t + h;
  }

  function makeAudio(src, opts) {
    const wrap = el('div', 'audio-wrap');
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.src = src;
    if (opts && opts.rate != null) audio.playbackRate = opts.rate;
    wrap.appendChild(audio);

    const btns = el('div', 'audio-btns');
    const play = el('button', 'btn', '播放');
    play.type = 'button';
    play.addEventListener('click', () => {
      if (opts && opts.start_sec != null) audio.currentTime = opts.start_sec;
      if (opts && opts.rate != null) audio.playbackRate = opts.rate;
      audio.play();
      if (opts && opts.end_sec != null) {
        const onTime = () => {
          if (audio.currentTime >= opts.end_sec) {
            audio.pause();
            audio.removeEventListener('timeupdate', onTime);
          }
        };
        audio.addEventListener('timeupdate', onTime);
      }
    });
    btns.appendChild(play);

    if (opts && opts.rate_options) {
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
   * @param {{ onPass: Function, onFail?: Function }} hooks
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
        const next = el('button', 'btn btn-primary', '下一題');
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
        const opts = shuffle([slide.correct].concat(slide.distractors || []));
        const list = el('div', 'choices');
        opts.forEach((opt) => {
          const b = el('button', 'btn choice', opt);
          b.type = 'button';
          b.addEventListener('click', () => {
            if (opt === slide.correct) {
              idx++;
              renderSlide();
            } else {
              showFail('錯：正確是「' + slide.correct + '」');
            }
          });
          list.appendChild(b);
        });
        body.appendChild(list);
        return;
      }

      if (type === 'multi_select') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請全選正確項'));
        const correctSet = new Set(slide.correct || []);
        const opts = shuffle((slide.correct || []).concat(slide.distractors || []));
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

      if (type === 'audio_listen' || type === 'audio_shadow' || type === 'audio_chunk' || type === 'audio_check') {
        body.appendChild(el('p', 'instruction', slide.instruction || '請聆聽'));
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

  global.QuizRunner = { run };
})(window);
