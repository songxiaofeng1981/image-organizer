// The large viewer. Click the left or right part of the picture (or press ← →) to move,
// pinch or ⌘-scroll to zoom, double-click for 100%, drag to pan, swipe sideways with two
// fingers to move. Number keys file the picture and go to the next one.
// 大图查看。点图片左右两侧（或按 ← →）切换，双指捏合或 ⌘ 滚轮缩放，双击看原始大小，拖动平移，
// 双指左右滑动切换。按数字键归类并自动跳到下一张。

import { thumb, cachedThumb, full } from './images.js';
import { icon, escapeHtml, menuOpen } from './ui.js';
import { formatSize, formatDate, siteName } from './library.js';
import { t } from './i18n.js';

const STRIP_RADIUS = 40;

/** "Downloads/sub-folder" or "Picture Library/category". / “下载/子文件夹”或“图片库/分类”。 */
const place = x => {
  const top = x.library ? t('info.library') : t('downloads');
  return x.folder ? `${top}/${x.folder}` : top;
};

export class Viewer {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.items = [];
    this.index = 0;
    this.scale = 1;
    this.fit = 1;
    this.ox = 0;
    this.oy = 0;
    this.token = 0;
    this.stage = root.querySelector('#vStage');
    this.img = root.querySelector('#vImg');
    this.strip = root.querySelector('#vStrip');
    this.info = root.querySelector('#vInfo');
    this.bind();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  get current() {
    return this.items[this.index];
  }

  open(items, index) {
    this.items = items;
    this.root.hidden = false;
    document.body.classList.add('viewing');
    this.root.classList.toggle('info-open', !!this.hooks.infoOpen());
    this.wake();
    this.show(index);
  }

  close() {
    if (!this.isOpen) return;
    const path = this.current?.path;
    this.root.hidden = true;
    document.body.classList.remove('viewing');
    this.token++;
    this.img.removeAttribute('src');
    this.hooks.closed(path);
  }

  /** Replace the list after something changed, staying on `path` or the picture that took its place. */
  update(items, { path, advance = false } = {}) {
    const old = this.index;
    this.items = items;
    if (!items.length) return this.close();
    const at = path ? items.findIndex(x => x.path === path) : -1;
    if (at >= 0) this.show(advance ? Math.min(at + 1, items.length - 1) : at);
    else this.show(Math.min(old, items.length - 1));
  }

  show(index) {
    if (!this.items.length) return this.close();
    this.index = Math.max(0, Math.min(index, this.items.length - 1));
    const x = this.current;
    const token = ++this.token;
    this.root.querySelector('#vName').textContent = x.name;
    const meta = [`${this.index + 1} / ${this.items.length}`];
    const left = this.hooks.remaining?.();
    if (left != null) meta.push(t('viewer.remaining', left));
    this.root.querySelector('#vMeta').textContent = meta.join('  ·  ');
    this.root.querySelector('.v-nav.prev').hidden = this.index === 0;
    this.root.querySelector('.v-nav.next').hidden = this.index === this.items.length - 1;
    this.renderCategory();
    this.renderInfo();
    this.renderStrip();

    // Show the thumbnail right away, then swap in the full picture. / 先显示缩略图，再换成大图。
    this.natural = { w: x.width || 0, h: x.height || 0 };
    const quick = cachedThumb(x.path);
    this.img.classList.toggle('loading', true);
    if (quick) this.img.src = quick;
    else this.img.removeAttribute('src');
    this.stage.classList.remove('failed');
    this.layoutFit();
    full(x.path)
      .then(url => {
        if (token !== this.token) return;
        const probe = new Image();
        probe.onload = () => {
          if (token !== this.token) return;
          this.natural = { w: probe.naturalWidth, h: probe.naturalHeight };
          this.img.src = url;
          this.img.classList.remove('loading');
          this.layoutFit();
        };
        probe.onerror = () => token === this.token && this.failed();
        probe.src = url;
      })
      .catch(() => token === this.token && this.failed());
    // Get the neighbours ready. / 预先加载前后两张。
    for (const d of [1, -1, 2]) {
      const n = this.items[this.index + d];
      if (n) full(n.path).catch(() => {});
    }
  }

  failed() {
    this.stage.classList.add('failed');
    this.img.removeAttribute('src');
  }

  step(d) {
    const i = this.index + d;
    if (i >= 0 && i < this.items.length) this.show(i);
  }

  // ---------- zoom & pan / 缩放与平移 ----------

  layoutFit() {
    const { w, h } = this.natural;
    const sw = this.stage.clientWidth;
    const sh = this.stage.clientHeight;
    if (!w || !h) {
      this.img.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);max-width:90%;max-height:90%';
      return;
    }
    this.fit = Math.min((sw - 48) / w, (sh - 32) / h, 1);
    this.scale = this.fit;
    this.ox = (sw - w * this.scale) / 2;
    this.oy = (sh - h * this.scale) / 2;
    this.apply();
  }

  apply() {
    const { w, h } = this.natural;
    if (!w) return;
    this.clamp();
    this.img.style.cssText = `left:${this.ox}px;top:${this.oy}px;width:${w * this.scale}px;height:${h * this.scale}px`;
    this.root.classList.toggle('zoomed', this.zoomed);
  }

  get zoomed() {
    return this.scale > this.fit * 1.01;
  }

  clamp() {
    const { w, h } = this.natural;
    const sw = this.stage.clientWidth;
    const sh = this.stage.clientHeight;
    const iw = w * this.scale;
    const ih = h * this.scale;
    this.ox = iw <= sw ? (sw - iw) / 2 : Math.min(0, Math.max(sw - iw, this.ox));
    this.oy = ih <= sh ? (sh - ih) / 2 : Math.min(0, Math.max(sh - ih, this.oy));
  }

  zoomTo(scale, cx = this.stage.clientWidth / 2, cy = this.stage.clientHeight / 2) {
    const next = Math.max(this.fit, Math.min(8, scale));
    this.ox = cx - (cx - this.ox) * (next / this.scale);
    this.oy = cy - (cy - this.oy) * (next / this.scale);
    this.scale = next;
    this.apply();
  }

  toggleZoom(cx, cy) {
    if (this.zoomed) this.layoutFit();
    else this.zoomTo(Math.max(1, this.fit * 2), cx, cy);
  }

  // ---------- parts / 各部分 ----------

  renderCategory() {
    const c = this.hooks.categoryOf(this.current.path);
    const b = this.root.querySelector('[data-v="category"]');
    b.querySelector('.dot').style.background = c ? c.color : 'transparent';
    b.querySelector('.dot').classList.toggle('none', !c);
    b.querySelector('.label').textContent = c ? c.name : t('uncategorized');
  }

  renderInfo() {
    const x = this.current;
    const c = this.hooks.categoryOf(x.path);
    const rows = [
      [t('info.folder'), place(x)],
      [t('info.dimensions'), x.width ? `${x.width} × ${x.height}` : '—'],
      [t('info.size'), formatSize(x.size)],
      [t('info.type'), x.ext.toUpperCase()],
      [t('info.added'), formatDate(x.addedTime)],
      [t('info.modified'), formatDate(Date.parse(x.modified))],
      [t('info.category'), c ? c.name : t('uncategorized')],
    ];
    // Only shown when the file has them. / 文件有这些信息时才显示。
    if (x.device) rows.push([t('info.device'), x.device]);
    if (x.sites.length) rows.push([t('info.source'), x.sites.map(siteName).join(', ')]);
    if (x.originalName && x.originalName !== x.name) rows.push([t('info.originalName'), x.originalName]);
    if (x.filed) rows.push([t('info.filed'), formatDate(Date.parse(x.filed))]);
    if (x.duplicateOf) rows.push([t('info.duplicateOf'), x.duplicateOf.startsWith('lib:') ? `${t('info.library')}/${x.duplicateOf.slice(4)}` : `${t('downloads')}/${x.duplicateOf}`]);
    this.info.innerHTML = `<h3>${escapeHtml(x.name)}</h3><dl>${rows
      .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
      .join('')}</dl><button type="button" class="link-button" data-v="reveal">${icon('folder')}${escapeHtml(t('revealInFinder'))}</button>
      <div class="v-keys"><h4>${escapeHtml(t('keys.title'))}</h4>${t('keys.viewer')
        .split('|')
        .map(line => {
          const [k, v] = line.split('=');
          return `<div><kbd>${escapeHtml(k)}</kbd><span>${escapeHtml(v)}</span></div>`;
        })
        .join('')}</div>`;
  }

  renderStrip() {
    const from = Math.max(0, this.index - STRIP_RADIUS);
    const to = Math.min(this.items.length, this.index + STRIP_RADIUS + 1);
    const keep = new Map([...this.strip.children].map(n => [n.dataset.path, n]));
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const x = this.items[i];
      let b = keep.get(x.path);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'v-thumb';
        b.dataset.path = x.path;
        b.setAttribute('aria-label', x.name);
        const ready = cachedThumb(x.path);
        if (ready) b.style.backgroundImage = `url("${ready}")`;
        else thumb(x.path, () => b.isConnected).then(url => (b.style.backgroundImage = `url("${url}")`), () => {});
      }
      b.dataset.index = i;
      b.classList.toggle('current', i === this.index);
      frag.append(b);
    }
    this.strip.replaceChildren(frag);
    const cur = this.strip.querySelector('.current');
    if (cur) this.strip.scrollTo({ left: cur.offsetLeft - this.strip.clientWidth / 2 + cur.offsetWidth / 2, behavior: 'smooth' });
  }

  toggleInfo() {
    const open = !this.root.classList.contains('info-open');
    this.root.classList.toggle('info-open', open);
    this.hooks.setInfoOpen(open);
    requestAnimationFrame(() => this.layoutFit());
  }

  // Bars fade out while you just look at the picture. / 只看图时，工具栏会自动淡出。
  wake() {
    this.root.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.hovering && !menuOpen()) this.root.classList.add('idle');
    }, 2500);
  }

  bind() {
    const r = this.root;
    r.addEventListener('pointermove', e => {
      this.hovering = !!e.target.closest('.v-bar, .v-strip, .v-info');
      this.wake();
    });
    r.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      const x = this.current;
      switch (b.dataset.v) {
        case 'close': return this.close();
        case 'prev': return this.step(-1);
        case 'next': return this.step(1);
        case 'info': return this.toggleInfo();
        case 'trash': return this.hooks.trash(x.path);
        case 'category': return this.hooks.categoryMenu(x.path, b);
        case 'reveal': return this.hooks.reveal(x.path);
      }
    });
    this.strip.addEventListener('click', e => {
      const b = e.target.closest('.v-thumb');
      if (b) this.show(Number(b.dataset.index));
    });
    this.stage.addEventListener('dblclick', e => {
      const s = this.stage.getBoundingClientRect();
      this.toggleZoom(e.clientX - s.left, e.clientY - s.top);
    });

    let swipe = 0;
    let swipeLock = 0;
    this.stage.addEventListener('wheel', e => {
      e.preventDefault();
      const s = this.stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        this.zoomTo(this.scale * Math.exp(-e.deltaY * 0.01), e.clientX - s.left, e.clientY - s.top);
      } else if (this.zoomed) {
        this.ox -= e.deltaX;
        this.oy -= e.deltaY;
        this.apply();
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Two-finger swipe. One swipe moves one picture, however long its momentum lasts.
        // 双指左右滑动；一次滑动只切换一张，不受惯性影响。
        const now = performance.now();
        if (now < swipeLock) {
          swipeLock = now + 250;
          return;
        }
        swipe += e.deltaX;
        if (Math.abs(swipe) > 60) {
          this.step(swipe > 0 ? 1 : -1);
          swipe = 0;
          swipeLock = now + 250;
        }
      }
    }, { passive: false });

    let drag = null;
    this.stage.addEventListener('pointerdown', e => {
      if (!this.zoomed || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.classList.add('dragging');
    });
    this.stage.addEventListener('pointermove', e => {
      if (!drag) return;
      this.ox = drag.ox + e.clientX - drag.x;
      this.oy = drag.oy + e.clientY - drag.y;
      this.apply();
    });
    const end = () => {
      drag = null;
      this.stage.classList.remove('dragging');
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    new ResizeObserver(() => this.isOpen && this.layoutFit()).observe(this.stage);
  }

  /** Keyboard, called by main.js while the viewer is open. Returns true when handled. */
  key(e) {
    const k = e.key;
    if (k === 'Escape') {
      if (this.zoomed) this.layoutFit();
      else this.close();
    } else if (k === 'ArrowLeft') this.step(-1);
    else if (k === 'ArrowRight') this.step(1);
    else if (k === 'Home') this.show(0);
    else if (k === 'End') this.show(this.items.length - 1);
    else if (k === 'i' || k === 'I') this.toggleInfo();
    else if (k === 'z' && !e.metaKey && !e.ctrlKey) this.toggleZoom();
    else if (k === '+' || k === '=') this.zoomTo(this.scale * 1.4);
    else if (k === '-' || k === '_') this.zoomTo(this.scale / 1.4);
    else if (k === '0' && (e.metaKey || e.ctrlKey)) this.layoutFit();
    else if (k === 'Backspace' || k === 'Delete') this.hooks.trash(this.current.path);
    else if (/^[0-9]$/.test(k) && !e.metaKey && !e.ctrlKey) this.hooks.assignByNumber(this.current.path, Number(k));
    else if (k === 'c' || k === 'C') this.hooks.categoryMenu(this.current.path, this.root.querySelector('[data-v="category"]'));
    else return false;
    this.wake();
    return true;
  }
}
