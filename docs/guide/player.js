// The player: shows one step at a time and draws everything from the step's clock (t, in ms), so pausing,
// stepping and dragging the progress bar always land on the same picture. Steps are in steps.js.
// 播放器：一次显示一步，所有画面都由这一步的时钟（t，毫秒）算出来，所以暂停、单步、拖进度条都停在同一个画面。步骤在 steps.js。
(() => {
  const $ = s => document.querySelector(s);
  const stage = $('#stage');
  const box = $('#stageBox');
  let lang = new URLSearchParams(location.search).get('lang') || (/^zh/i.test(navigator.language) ? 'zh' : 'en');
  let si = 0;            // step index / 第几步
  let t = 0;             // time inside the step / 这一步里的时间
  let playing = false;
  let last = 0;
  let speed = 1;
  let started = false;   // the big ▶ only shows before the first play / 大 ▶ 只在第一次播放前显示
  let ev = [];           // this step's events, built in the current language / 当前语言下这一步的事件
  const T = (zh, en) => (lang === 'zh' ? zh : en);
  window.GUIDE_T = T;

  const CURSOR = '<svg class="cursor" id="cur" viewBox="0 0 22 30"><path d="M2 2v22l6-5.5 4 9 3.6-1.6-4-8.8H19Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  // ---------- one step / 一步 ----------

  function build() {
    const s = STEPS[si];
    stage.innerHTML = s.scene(T) + CURSOR + '<div class="ripple hid" id="rip"></div><div class="keycap hid" id="key"></div>';
    ev = s.ev ? s.ev(T) : [];
    for (const e of ev) if (e[0] === 'type') { const el = stage.querySelector(e[3]); if (el) el.textContent = ''; }
    fit();
  }

  /** Centre of an element (or [x, y]) in stage coordinates. / 元素中心（或 [x, y]）在舞台坐标里的位置。 */
  function point(target) {
    if (Array.isArray(target)) return target;
    const el = stage.querySelector(target);
    if (!el) return [480, 300];
    const k = scale();
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k];
  }

  const ease = x => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

  function cursorAt(time) {
    const kf = STEPS[si].cur;
    if (!kf || !kf.length) return null;
    if (time <= kf[0][0]) return point(kf[0][1]);
    for (let i = 0; i < kf.length - 1; i++) {
      const [t0, a] = kf[i];
      const [t1, b] = kf[i + 1];
      if (time < t1) {
        const p = point(a), q = point(b), f = ease((time - t0) / Math.max(1, t1 - t0));
        return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      }
    }
    return point(kf[kf.length - 1][1]);
  }

  function render() {
    const within = (a, b) => t >= a && t < (b ?? Infinity);
    let key = null;
    let click = null;
    // Show / hide and classes first, so the cursor aims at where things are now. / 先处理显示和样式，光标才能对准。
    for (const e of ev) {
      const [type] = e;
      if (type === 'key') { if (within(e[1], e[2])) key = e[3]; continue; }
      if (type === 'click') { if (t >= e[1] && t - e[1] < 450) click = e[1]; continue; }
      const el = stage.querySelector(type === 'type' || type === 'follow' || type === 'prog' ? e[3] : e[2]);
      if (!el) continue;
      if (type === 'show') el.classList.toggle('hid', !within(e[1], e[3]));
      else if (type === 'hide') el.classList.toggle('hid', t >= e[1]);
      else if (type === 'cls') el.classList.toggle(e[3], within(e[1], e[4]));
      else if (type === 'type') {
        const f = Math.max(0, Math.min(1, (t - e[1]) / Math.max(1, e[2] - e[1])));
        el.textContent = e[4].slice(0, Math.round(e[4].length * f));
      } else if (type === 'prog') {
        el.style.width = `${Math.max(0, Math.min(1, (t - e[1]) / (e[2] - e[1]))) * 100}%`;
      }
    }
    const cur = $('#cur');
    const p = cursorAt(t);
    cur.classList.toggle('hid', !p);
    if (p) cur.style.transform = `translate(${p[0] - 2}px, ${p[1] - 2}px)`;
    for (const e of ev) {
      if (e[0] !== 'follow') continue;
      const el = stage.querySelector(e[3]);
      if (!el) continue;
      el.classList.toggle('hid', !within(e[1], e[2]) || !p);
      if (p) { el.style.left = `${p[0] + (e[4] || 0)}px`; el.style.top = `${p[1] + (e[5] || 0)}px`; }
    }
    const rip = $('#rip');
    rip.classList.toggle('hid', click == null);
    if (click != null) {
      const q = cursorAt(click) || [0, 0];
      const f = (t - click) / 450;
      rip.style.left = `${q[0]}px`;
      rip.style.top = `${q[1]}px`;
      rip.style.transform = `scale(${0.4 + f})`;
      rip.style.opacity = String(1 - f);
    }
    const k = $('#key');
    k.classList.toggle('hid', !key);
    if (key) k.textContent = key;
    paintBar();
  }

  // ---------- playing / 播放 ----------

  function frame(now) {
    if (!playing) return;
    t += (now - last) * speed;
    last = now;
    const dur = STEPS[si].dur;
    if (t >= dur) {
      if ($('#pauseEach').checked || si === STEPS.length - 1) {
        t = dur;
        render();
        return setPlaying(false);
      }
      go(si + 1, 0, true);
    } else render();
    requestAnimationFrame(frame);
  }

  function setPlaying(on) {
    if (on && t >= STEPS[si].dur) {
      if (si === STEPS.length - 1) go(0, 0);
      else go(si + 1, 0);
    }
    playing = on;
    if (on) started = true;
    document.body.classList.toggle('playing', on);
    $('#bigPlay').hidden = on || started;
    $('#play').title = UI.play[lang === 'zh' ? 0 : 1];
    if (on) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function go(i, time = 0, keepPlaying = playing) {
    si = Math.max(0, Math.min(STEPS.length - 1, i));
    t = time;
    build();
    caption();
    render();
    if (!keepPlaying && playing) setPlaying(false);
    history.replaceState(null, '', `?lang=${lang}&step=${si + 1}`);
  }

  // ---------- around the stage / 舞台周围 ----------

  const scale = () => box.clientWidth / 960;
  function fit() { stage.style.transform = `scale(${scale()})`; }
  new ResizeObserver(() => { fit(); render(); }).observe(box);

  const chapterOf = i => CHAPTERS.findIndex((c, k) => i >= c.from && (k === CHAPTERS.length - 1 || i < CHAPTERS[k + 1].from));

  function caption() {
    const s = STEPS[si];
    const c = CHAPTERS[chapterOf(si)];
    $('#capNum').textContent = T(`第 ${si + 1} 步 / 共 ${STEPS.length} 步 · ${c.title[0]}`, `Step ${si + 1} of ${STEPS.length} · ${c.title[1]}`);
    $('#capText').textContent = s.cap[lang === 'zh' ? 0 : 1];
    $('#capTip').innerHTML = s.tip ? s.tip[lang === 'zh' ? 0 : 1] : '';
    document.querySelectorAll('.toc button').forEach((b, k) => {
      b.classList.toggle('on', k === si);
      b.classList.toggle('done', k < si);
    });
  }

  const total = () => STEPS.reduce((n, s) => n + s.dur, 0);
  const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function makeBar() {
    $('#bar').innerHTML = STEPS.map((s, i) => `<div class="seg${CHAPTERS.some(c => c.from === i && i) ? ' ch' : ''}" style="flex-grow:${s.dur}"><i></i></div>`).join('');
  }

  function paintBar() {
    document.querySelectorAll('.seg i').forEach((el, i) => {
      el.style.width = i < si ? '100%' : i > si ? '0' : `${(t / STEPS[si].dur) * 100}%`;
    });
    const before = STEPS.slice(0, si).reduce((n, s) => n + s.dur, 0);
    $('#time').textContent = `${fmt(before + t)} / ${fmt(total())}`;
  }

  function seekFromBar(x) {
    const segs = [...document.querySelectorAll('.seg')];
    for (let i = 0; i < segs.length; i++) {
      const r = segs[i].getBoundingClientRect();
      if (x <= r.right + 2 || i === segs.length - 1) {
        const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
        if (i !== si) go(i, f * STEPS[i].dur);
        else { t = f * STEPS[i].dur; render(); }
        return;
      }
    }
  }
  let dragging = false;
  $('#bar').addEventListener('pointerdown', e => { dragging = true; $('#bar').setPointerCapture(e.pointerId); seekFromBar(e.clientX); });
  $('#bar').addEventListener('pointermove', e => dragging && seekFromBar(e.clientX));
  $('#bar').addEventListener('pointerup', () => { dragging = false; });

  function makeToc() {
    $('#toc').innerHTML = CHAPTERS.map((c, k) => {
      const end = k === CHAPTERS.length - 1 ? STEPS.length : CHAPTERS[k + 1].from;
      const rows = [];
      for (let i = c.from; i < end; i++) rows.push(`<button type="button" data-i="${i}"><b>${i + 1}</b><span>${STEPS[i].short[lang === 'zh' ? 0 : 1]}</span></button>`);
      return `<h3>${c.title[lang === 'zh' ? 0 : 1]}</h3>${rows.join('')}`;
    }).join('');
  }
  $('#toc').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    go(Number(b.dataset.i), 0);
    setPlaying(true);
  });

  function texts() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = UI.title[lang === 'zh' ? 0 : 1] + (lang === 'zh' ? ' · 图片整理' : ' · Image Organizer');
    document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = UI[el.dataset.t][lang === 'zh' ? 0 : 1]; });
    document.querySelectorAll('[data-tt]').forEach(el => { el.title = UI[el.dataset.tt][lang === 'zh' ? 0 : 1]; });
    document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    $('#faq').innerHTML = FAQ.map(([q, a]) => `<details><summary>${q[lang === 'zh' ? 0 : 1]}</summary><p>${a[lang === 'zh' ? 0 : 1]}</p></details>`).join('');
    makeToc();
  }

  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    texts();
    go(si, t);
  }));
  $('#play').addEventListener('click', () => setPlaying(!playing));
  $('#bigPlay').addEventListener('click', e => { e.stopPropagation(); setPlaying(true); });
  box.addEventListener('click', () => setPlaying(!playing));
  $('#prev').addEventListener('click', () => go(t > 1500 ? si : si - 1, 0));
  $('#next').addEventListener('click', () => go(si + 1, 0));
  $('#speed').addEventListener('change', e => { speed = Number(e.target.value); });
  try { $('#pauseEach').checked = localStorage.getItem('guide:pauseEach') === '1'; } catch {}
  $('#pauseEach').addEventListener('change', e => { try { localStorage.setItem('guide:pauseEach', e.target.checked ? '1' : '0'); } catch {} });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowLeft') go(t > 1500 ? si : si - 1, 0);
    else if (e.key === 'ArrowRight') go(si + 1, 0);
  });

  // For checking a frame by hand: GUIDE.go(stepIndex, ms). / 手动检查某一帧用。
  window.GUIDE = { go: (i, ms = 0) => { setPlaying(false); go(i, ms); } };

  texts();
  makeBar();
  const start = Number(new URLSearchParams(location.search).get('step')) || 1;
  go(start - 1, 0, false);
  setPlaying(false);
})();
