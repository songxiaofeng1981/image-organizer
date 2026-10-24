// The photo grid: justified rows (every picture keeps its shape, each row fills the width),
// date section headers, and only the rows near the screen exist in the page, so thousands
// of pictures scroll smoothly. Also handles selection: check circles, ⌘-click, Shift-click
// and dragging a box.
// 图片网格：等高行排列（保持每张图比例，每行铺满），按日期分段；只有屏幕附近的行才真正放进页面，
// 几千张图也能顺畅滚动。同时负责选择：勾选圆圈、⌘ 点击、Shift 连选、拖框多选。

import { thumb, cachedThumb } from './images.js';
import { icon } from './ui.js';
import { t } from './i18n.js';

const GAP = 4;
const PAD = 20;
const HEADER = 48;
const OVERSCAN = 900;

export class Grid {
  /**
   * @param {HTMLElement} scroller  the scrolling element
   * @param {object} hooks  { open(tile), selectionChanged(), contextMenu(tile, event) }
   */
  constructor(scroller, hooks) {
    this.scroller = scroller;
    this.hooks = hooks;
    this.canvas = document.createElement('div');
    this.canvas.className = 'grid-canvas';
    scroller.append(this.canvas);
    this.sections = [];
    this.rows = []; // { top, height, tiles: [{ tile, x, w }] }
    this.headers = []; // { top, title }
    this.flat = []; // tiles in order
    this.rowHeight = 190;
    this.selected = new Set(); // tile keys
    this.anchor = null;
    this.nodes = new Map(); // key -> element
    this.width = 0;
    scroller.addEventListener('scroll', () => this.paint(), { passive: true });
    new ResizeObserver(() => {
      if (Math.abs(scroller.clientWidth - this.width) > 1) this.layout();
    }).observe(scroller);
    this.bindPointer();
  }

  set(sections, rowHeight) {
    this.sections = sections;
    this.rowHeight = rowHeight;
    this.flat = sections.flatMap(s => s.tiles);
    const keys = new Set(this.flat.map(x => x.key));
    for (const k of [...this.selected]) if (!keys.has(k)) this.selected.delete(k);
    this.layout();
  }

  layout() {
    this.width = this.scroller.clientWidth;
    const inner = Math.max(200, this.width - PAD * 2);
    const target = this.rowHeight;
    this.rows = [];
    this.headers = [];
    let y = 8;
    for (const section of this.sections) {
      if (section.title) {
        this.headers.push({ top: y, title: section.title, key: `h:${y}` });
        y += HEADER;
      }
      let row = [];
      let sum = 0;
      const flush = last => {
        if (!row.length) return;
        const gaps = GAP * (row.length - 1);
        let h = (inner - gaps) / sum;
        if (last && h > target * 1.25) h = target;
        let x = PAD;
        const tiles = row.map(tile => {
          const w = tile.aspectUsed * h;
          const out = { tile, x, w };
          x += w + GAP;
          return out;
        });
        this.rows.push({ top: y, height: h, tiles });
        y += h + GAP;
        row = [];
        sum = 0;
      };
      for (const tile of section.tiles) {
        tile.aspectUsed = Math.min(2.6, Math.max(0.45, tile.item.aspect || 1));
        row.push(tile);
        sum += tile.aspectUsed;
        if (sum * target + GAP * (row.length - 1) >= inner) flush(false);
      }
      flush(true);
      y += section.title ? 12 : 0;
    }
    this.height = y + 40;
    this.canvas.style.height = `${this.height}px`;
    this.paint(true);
  }

  paint(force = false) {
    const top = this.scroller.scrollTop - OVERSCAN;
    const bottom = this.scroller.scrollTop + this.scroller.clientHeight + OVERSCAN;
    const want = new Map();
    for (const h of this.headers) if (h.top + HEADER > top && h.top < bottom) want.set(h.key, { header: h });
    for (const r of this.rows) {
      if (r.top + r.height < top || r.top > bottom) continue;
      for (const cell of r.tiles) want.set(cell.tile.key, { cell, row: r });
    }
    for (const [key, node] of this.nodes) {
      if (!want.has(key) || force) {
        node.remove();
        this.nodes.delete(key);
      }
    }
    for (const [key, spec] of want) {
      if (this.nodes.has(key)) continue;
      const node = spec.header ? this.headerNode(spec.header) : this.tileNode(spec.cell, spec.row);
      this.nodes.set(key, node);
      this.canvas.append(node);
    }
  }

  headerNode(h) {
    const el = document.createElement('h2');
    el.className = 'section-title';
    el.style.top = `${h.top}px`;
    el.textContent = h.title;
    return el;
  }

  tileNode(cell, row) {
    const { tile } = cell;
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.key = tile.key;
    el.tabIndex = 0;
    el.draggable = true;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', tile.kind === 'group' ? tile.group.name : tile.item.name);
    el.style.cssText = `left:${cell.x}px;top:${row.top}px;width:${cell.w}px;height:${row.height}px`;
    el.classList.toggle('selected', this.selected.has(tile.key));
    el.classList.toggle('is-group', tile.kind === 'group');
    const check = document.createElement('button');
    check.className = 'check';
    check.type = 'button';
    check.tabIndex = -1;
    check.setAttribute('aria-label', t('select'));
    check.innerHTML = icon('check');
    el.append(check);
    if (tile.kind === 'group') {
      el.insertAdjacentHTML('beforeend', `<span class="stack-count">${icon('stack')}${tile.items.length}</span><span class="tile-caption"></span>`);
      el.querySelector('.tile-caption').textContent = tile.group.name;
    } else if (tile.item.ext === 'gif') {
      el.insertAdjacentHTML('beforeend', '<span class="tile-badge">GIF</span>');
    }
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    const path = tile.item.path;
    const ready = cachedThumb(path);
    if (ready) {
      img.src = ready;
      el.prepend(img);
    } else {
      thumb(path, () => el.isConnected)
        .then(url => {
          if (!el.isConnected) return;
          img.src = url;
          img.classList.add('fade-in');
          el.prepend(img);
        })
        .catch(e => {
          if (el.isConnected && e.message !== 'skipped') el.classList.add('broken');
        });
    }
    return el;
  }

  refreshSelection() {
    for (const [key, node] of this.nodes) node.classList?.toggle('selected', this.selected.has(key));
    document.body.classList.toggle('selecting', this.selected.size > 0);
    this.hooks.selectionChanged();
  }

  selectedTiles() {
    return this.flat.filter(x => this.selected.has(x.key));
  }

  clearSelection() {
    this.selected.clear();
    this.anchor = null;
    this.refreshSelection();
  }

  selectAll() {
    this.flat.forEach(x => this.selected.add(x.key));
    this.refreshSelection();
  }

  toggle(key, range = false) {
    if (range && this.anchor) {
      const a = this.flat.findIndex(x => x.key === this.anchor);
      const b = this.flat.findIndex(x => x.key === key);
      if (a >= 0 && b >= 0) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.selected.add(this.flat[i].key);
      }
    } else if (this.selected.has(key)) {
      this.selected.delete(key);
    } else {
      this.selected.add(key);
    }
    this.anchor = key;
    this.refreshSelection();
  }

  tileAt(key) {
    return this.flat.find(x => x.key === key);
  }

  scrollToKey(key) {
    const row = this.rows.find(r => r.tiles.some(c => c.tile.key === key));
    if (!row) return;
    const st = this.scroller.scrollTop;
    if (row.top < st + 60 || row.top + row.height > st + this.scroller.clientHeight) {
      this.scroller.scrollTop = Math.max(0, row.top - this.scroller.clientHeight / 3);
    }
  }

  bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('click', e => {
      const node = e.target.closest('.tile');
      if (!node || this.dragged) return;
      const key = node.dataset.key;
      if (e.target.closest('.check') || e.metaKey || e.ctrlKey || e.shiftKey || this.selected.size) {
        this.toggle(key, e.shiftKey);
      } else {
        this.hooks.open(this.tileAt(key));
      }
    });
    canvas.addEventListener('keydown', e => {
      const node = e.target.closest?.('.tile');
      if (!node) return;
      if (e.key === 'Enter') this.hooks.open(this.tileAt(node.dataset.key));
      if (e.key === ' ') {
        e.preventDefault();
        this.toggle(node.dataset.key, e.shiftKey);
      }
    });
    canvas.addEventListener('contextmenu', e => {
      const node = e.target.closest('.tile');
      if (!node) return;
      e.preventDefault();
      if (!this.selected.has(node.dataset.key)) {
        this.selected.clear();
        this.selected.add(node.dataset.key);
        this.anchor = node.dataset.key;
        this.refreshSelection();
      }
      this.hooks.contextMenu(e);
    });

    // Drag a box on empty space to select. / 在空白处拖框选择。
    let start = null;
    let box = null;
    let base = null;
    this.scroller.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.tile') || e.target !== canvas && e.target !== this.scroller) return;
      const r = canvas.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      base = e.shiftKey || e.metaKey ? new Set(this.selected) : new Set();
      this.dragged = false;
      this.scroller.setPointerCapture(e.pointerId);
    });
    this.scroller.addEventListener('pointermove', e => {
      if (!start) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!this.dragged && Math.hypot(x - start.x, y - start.y) < 5) return;
      this.dragged = true;
      if (!box) {
        box = document.createElement('div');
        box.className = 'marquee';
        canvas.append(box);
      }
      const left = Math.min(x, start.x);
      const top = Math.min(y, start.y);
      const w = Math.abs(x - start.x);
      const h = Math.abs(y - start.y);
      box.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
      this.selected = new Set(base);
      for (const row of this.rows) {
        if (row.top > top + h || row.top + row.height < top) continue;
        for (const c of row.tiles) if (c.x < left + w && c.x + c.w > left) this.selected.add(c.tile.key);
      }
      this.refreshSelection();
      const sr = this.scroller.getBoundingClientRect();
      if (e.clientY > sr.bottom - 30) this.scroller.scrollTop += 20;
      if (e.clientY < sr.top + 30) this.scroller.scrollTop -= 20;
    });
    const end = () => {
      if (start && !this.dragged && this.selected.size) this.clearSelection();
      start = null;
      box?.remove();
      box = null;
      setTimeout(() => (this.dragged = false));
    };
    this.scroller.addEventListener('pointerup', end);
    this.scroller.addEventListener('pointercancel', end);
  }
}
