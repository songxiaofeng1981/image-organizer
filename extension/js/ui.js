// Small shared pieces: icons, the toast with Undo, pop-up menus and a name dialog.
// 公共小部件：图标、带“撤销”的提示条、弹出菜单、命名对话框。

import { t } from './i18n.js';

// Line icons drawn in the style of SF Symbols. / 仿 SF Symbols 风格的线条图标。
const PATHS = {
  photos: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
  tray: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  screenshot: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z"/><path d="M12 6.5v13"/>',
  disk: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13 7.5 5h9L19 13"/><circle cx="17" cy="16.5" r=".8" fill="currentColor"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  sparkles: '<path d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  message: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5Z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>',
  copies: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  shapes: '<circle cx="7.5" cy="7.5" r="3.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><path d="M7.5 13.5 11.5 20h-8Z"/><circle cx="16.5" cy="16.5" r="3.5"/>',
  stack: '<rect x="4" y="8" width="13" height="12" rx="2"/><path d="M8 5h10a2 2 0 0 1 2 2v9"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.8Z"/><circle cx="8" cy="8" r="1.4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7m3 0-.8 12.5a1.5 1.5 0 0 1-1.5 1.5H8.3a1.5 1.5 0 0 1-1.5-1.5L6 7m4 4v6m4-6v6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  check: '<path d="m6.5 12.5 3.5 3.5 7.5-8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronLeft: '<path d="m14.5 5-7 7 7 7"/>',
  chevronRight: '<path d="m9.5 5 7 7-7 7"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9 4.5v15"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
}

/** Replaces <i data-icon="name"> placeholders in the page with the icon. */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.outerHTML = icon(el.dataset.icon);
}

/**
 * Colors category dots marked data-color. The extension's security policy blocks style="" in HTML,
 * so colors are set from script instead.
 * 给带 data-color 的分类圆点上色。插件的安全策略不允许 HTML 里写 style=""，所以用脚本设置颜色。
 */
export function paintDots(root) {
  for (const el of root.querySelectorAll('[data-color]')) el.style.background = el.dataset.color;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Toast / 提示条 ----------

let toastTimer = null;
export function toast(message, { undo = null, error = false } = {}) {
  const el = document.querySelector('#toast');
  el.replaceChildren();
  el.classList.toggle('error', error);
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t('undo');
    b.onclick = () => {
      hideToast();
      undo();
    };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 6000 : 3000);
}

export function hideToast() {
  document.querySelector('#toast').classList.remove('show');
}

// ---------- Menu / 弹出菜单 ----------
// items: [{ label, icon?, color?, checked?, danger?, disabled?, shortcut?, action }] or { separator: true } or { heading }

let openMenu = null;
export function menu(items, anchor) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.separator) {
      el.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>');
      continue;
    }
    if (item.heading) {
      const h = document.createElement('div');
      h.className = 'menu-heading';
      h.textContent = item.heading;
      el.append(h);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item';
    b.setAttribute('role', 'menuitem');
    b.disabled = !!item.disabled;
    b.classList.toggle('danger', !!item.danger);
    const mark = item.color
      ? `<span class="dot" data-color="${escapeHtml(item.color)}"></span>`
      : item.icon ? icon(item.icon) : '<span class="icon"></span>';
    b.innerHTML = `${item.checked ? icon('check', 'tick') : '<span class="tick"></span>'}${mark}<span class="menu-label"></span>${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ''}`;
    b.querySelector('.menu-label').textContent = item.label;
    b.onclick = () => {
      closeMenu();
      item.action();
    };
    el.append(b);
  }
  paintDots(el);
  document.body.append(el);
  const r = anchor instanceof Event
    ? { left: anchor.clientX, right: anchor.clientX, top: anchor.clientY, bottom: anchor.clientY }
    : anchor.getBoundingClientRect();
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  let x = anchor instanceof Event ? r.left : r.left;
  let y = r.bottom + 6;
  if (x + mw > innerWidth - 8) x = Math.max(8, (anchor instanceof Event ? r.left : r.right) - mw);
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  openMenu = el;
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', menuKeys, true);
  });
}

function outside(e) {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
}

function menuKeys(e) {
  if (!openMenu) return;
  const items = [...openMenu.querySelectorAll('.menu-item:not(:disabled)')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeMenu();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    const down = e.key === 'ArrowDown';
    items[i < 0 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : items.length - 1)) % items.length]?.focus();
  }
}

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', menuKeys, true);
}

export const menuOpen = () => !!openMenu;

// ---------- Name dialog / 命名对话框 ----------

export function askName({ title, value = '', confirm }) {
  return new Promise(resolve => {
    const dialog = document.querySelector('#nameDialog');
    dialog.querySelector('h3').textContent = title;
    const input = dialog.querySelector('input');
    input.value = value;
    dialog.querySelector('[data-confirm]').textContent = confirm;
    const ok = dialog.querySelector('[data-confirm]');
    const sync = () => (ok.disabled = !input.value.trim());
    input.oninput = sync;
    sync();
    dialog.onclose = () => resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
    dialog.showModal();
    input.select();
  });
}
