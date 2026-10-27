// Starts the gallery and connects the pieces: sidebar, toolbar, grid, viewer, and the
// actions that change things (move into a category of the picture library, make a group, move to the Trash).
// 启动图库，把侧边栏、工具栏、网格、大图查看和各种操作（移到图片库的分类、建组、移到废纸篓）连在一起。

import { host, HostError, MIN_HELPER_VERSION, versionAtLeast } from './host.js';
import * as store from './store.js';
import { data, inLibrary, folderOf, finderTag, libraryFolder, LIB } from './store.js';
import { SMART, TIME_FILTERS, facets, siteName, prepare, compute, viewCount, formatDate } from './library.js';
import * as images from './images.js';
import { Grid } from './grid.js';
import { Viewer } from './viewer.js';
import { icon, fillIcons, paintDots, escapeHtml, toast, menu, closeMenu, menuOpen, askName } from './ui.js';
import { t, lang, localizePage } from './i18n.js';

const $ = s => document.querySelector(s);
const TRASH_DELAY = 6000;

const state = {
  all: [],
  view: 'inbox',
  search: '',
  result: { items: [], tiles: [], sections: [], groups: new Map() },
  hidden: new Set(), // waiting to go to the Trash / 等待移入废纸篓
  lastView: 'inbox',
  library: { path: '', available: false, suggestions: [] }, // where the picture library is / 图片库位置
  busy: false, // a move is running; key presses wait for it / 正在移动文件
};

const grid = new Grid($('#scroller'), {
  open: openTile,
  selectionChanged: renderSelectionBar,
  contextMenu: e => menu(selectionMenu(), e),
});

const viewer = new Viewer($('#viewer'), {
  categoryOf: store.categoryOf,
  categoryMenu: (path, anchor) => menu(categoryItems([path], { advance: true }), anchor),
  assignByNumber: (path, n) => {
    if (n === 0) return assign([path], null, { advance: true });
    const c = data.categories[n - 1];
    if (c) assign([path], c.id, { advance: true });
  },
  trash: path => trash([path]),
  reveal: path => host.reveal(path).catch(showError),
  remaining: () => (state.view === 'inbox' ? state.result.items.length : null),
  infoOpen: () => data.prefs.infoOpen,
  setInfoOpen: open => store.setPref('infoOpen', open),
  closed: path => {
    grid.scrollToKey(path);
    const node = document.querySelector(`.tile[data-key="${CSS.escape(path || '')}"]`);
    node?.focus({ preventScroll: true });
  },
});

// ---------- loading / 读取 ----------

async function start() {
  localizePage();
  fillIcons();
  await store.load();
  $('#sort').value = data.prefs.sort;
  $('#size').value = data.prefs.rowHeight;
  await scan();
}

async function scan({ keepImages = false } = {}) {
  if (!keepImages) showStatus('loading');
  try {
    const hello = await host.hello();
    if (!versionAtLeast(hello.version, MIN_HELPER_VERSION)) return showStatus('outdated');
    state.library = libraryState(await host.config(t('library.folderName')));
    const rows = await host.list();
    if (!keepImages) images.forgetAll();
    state.all = prepare(rows);
    adoptFolders();
    showStatus(null);
    refresh();
  } catch (e) {
    console.error(e);
    if (e instanceof HostError && e.permissionDenied) showStatus('permission');
    else if (e instanceof HostError && e.message === 'unknown_op') showStatus('outdated');
    else showStatus('missing', e.message);
  }
}

function showStatus(kind, detail = '') {
  const el = $('#status');
  document.body.classList.toggle('has-status', !!kind);
  $('#helperDot').className = `helper-dot ${kind ? (kind === 'loading' ? 'busy' : 'bad') : 'ok'}`;
  $('#helperLabel').textContent = kind && kind !== 'loading' ? t('helper.notConnected') : kind === 'loading' ? t('helper.scanning') : t('helper.connected');
  if (!kind) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (kind === 'loading') {
    el.innerHTML = `<div class="spinner"></div><p>${escapeHtml(t('status.loading'))}</p>`;
    return;
  }
  const steps = t(`status.${kind}.steps`).split('|');
  el.innerHTML = `
    <div class="status-card">
      <div class="status-icon">${icon(kind === 'permission' ? 'folder' : 'tray')}</div>
      <h2>${escapeHtml(t(`status.${kind}.title`))}</h2>
      <p>${escapeHtml(t(`status.${kind}.body`))}</p>
      <ol>${steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      <div class="status-actions">
        <button type="button" class="button primary" id="retry">${escapeHtml(t('retry'))}</button>
        <a class="button" href="https://github.com/songxiaofeng1981/image-organizer/blob/main/docs/INSTALL${lang === 'zh' ? '.zh-CN' : ''}.md" target="_blank" rel="noopener">${escapeHtml(t('status.guide'))}</a>
      </div>
      ${detail ? `<details><summary>${escapeHtml(t('status.details'))}</summary><code>${escapeHtml(detail)}</code></details>` : ''}
    </div>`;
  $('#retry').onclick = () => scan();
}

const libraryState = r => ({ path: r.library || '', available: !!r.available, suggestions: r.suggestions || [] });

/** A folder in the library that no category is named after becomes a category (e.g. made in Finder). */
function adoptFolders() {
  const known = new Set(data.categories.map(c => folderOf(c.name)));
  for (const x of state.all) {
    const folder = libraryFolder(x.path);
    if (folder && !known.has(folder)) {
      known.add(folder);
      store.addCategory(folder);
    }
  }
}

// ---------- rendering / 显示 ----------

function refresh({ keepScroll = true } = {}) {
  state.result = compute(state.all, {
    view: state.view,
    search: state.search,
    sort: data.prefs.sort,
    hidden: state.hidden,
  });
  // The group fell apart (pictures moved to the Trash, or ungrouped): go back. / 组已不存在，返回上一视图。
  if (state.view.startsWith('group:') && !state.result.groups.has(state.view.slice(6))) {
    state.view = state.lastView;
    return refresh({ keepScroll: false });
  }
  const top = $('#scroller').scrollTop;
  grid.set(state.result.sections, Number(data.prefs.rowHeight));
  if (!keepScroll) $('#scroller').scrollTop = 0;
  else $('#scroller').scrollTop = top;
  renderSidebar();
  renderHeader();
  renderSelectionBar();
  renderEmpty();
}

function viewTitle(view) {
  if (view === 'all') return t('view.all');
  if (view === 'inbox') return t('view.inbox');
  if (view.startsWith('f:')) return t(`filter.${view.slice(2)}`);
  if (view.startsWith('device:')) return view.slice(7);
  if (view.startsWith('site:')) return siteName(view.slice(5));
  if (view.startsWith('folder:')) return view.slice(7);
  if (view.startsWith('cat:')) return data.categories.find(c => c.id === view.slice(4))?.name || '';
  if (view.startsWith('group:')) return state.result.groups.get(view.slice(6))?.name || '';
  return '';
}

function renderHeader() {
  const v = state.view;
  const isGroup = v.startsWith('group:');
  const group = isGroup ? state.result.groups.get(v.slice(6)) : null;
  $('#back').hidden = !isGroup;
  $('#viewTitle').textContent = viewTitle(v);
  const n = state.result.items.length;
  const parts = [t('count.pictures', n)];
  if (group) parts.push(group.manual ? t('group.manual') : t('group.auto'));
  else if (state.result.tiles.length !== n) parts.push(t('count.groups', state.result.tiles.filter(x => x.kind === 'group').length));
  $('#viewSub').textContent = parts.join(' · ');
  const actions = $('#viewActions');
  actions.replaceChildren();
  const add = (label, fn, danger = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `button small${danger ? ' danger-text' : ''}`;
    b.textContent = label;
    b.onclick = fn;
    actions.append(b);
  };
  if (group?.manual) {
    add(t('group.rename'), () => renameGroup(group));
    add(t('group.ungroup'), () => ungroup(group), true);
  } else if (group) {
    add(t('group.keep'), () => keepAutoGroup(group));
  } else if (v.startsWith('cat:')) {
    const c = data.categories.find(x => x.id === v.slice(4));
    if (c) add(t('category.edit'), e => menu(categoryEditItems(c), e.currentTarget));
  }
  // Pictures categorized before 2.3 are still in Downloads: offer to move them. / 2.3 之前归类的图还在“下载”里：提供一键移动。
  const pending = pendingPaths(v);
  if (pending.length && (v === 'inbox' || v.startsWith('cat:'))) {
    add(t('pending.move', pending.length), () => movePending(pending));
    actions.lastChild.classList.add('primary');
    actions.lastChild.title = t('pending.hint', pending.length);
  }
  document.title = `${viewTitle(v)} · ${t('appName')}`;
}

function renderEmpty() {
  const el = $('#empty');
  const empty = !state.result.items.length && !document.body.classList.contains('has-status');
  el.hidden = !empty;
  if (!empty) return;
  const v = state.view;
  const libraryView = v === 'all' || v.startsWith('cat:');
  let key = state.all.length ? 'empty.view' : 'empty.none';
  if (state.search) key = 'empty.search';
  else if (v === 'inbox') key = state.all.length ? 'empty.done' : 'empty.none';
  else if (libraryView && !state.library.path) key = 'empty.noLibrary';
  else if (libraryView && !state.library.available) key = 'empty.offline';
  const setup = key === 'empty.noLibrary' ? `<button type="button" class="button primary" id="emptySetup">${escapeHtml(t('library.setUp'))}</button>` : '';
  el.innerHTML = `<div class="empty-icon">${icon(key === 'empty.done' ? 'check' : key === 'empty.noLibrary' || key === 'empty.offline' ? 'disk' : 'photos')}</div><h2>${escapeHtml(t(`${key}.title`))}</h2><p>${escapeHtml(t(`${key}.body`))}</p>${setup}`;
  if (setup) $('#emptySetup').onclick = () => openLibraryDialog();
}

function sidebarItem(view, label, iconHtml, count, extra = '') {
  const active = state.view === view || (state.view.startsWith('group:') && state.lastView === view);
  return `<button type="button" class="side-item${active ? ' active' : ''}${iconHtml ? '' : ' plain'}" data-view="${escapeHtml(view)}">${iconHtml}<span class="side-label">${escapeHtml(label)}</span><span class="side-count">${count}</span>${extra}</button>`;
}

const SHOW_FIRST = 5;
const expanded = new Set(); // sections showing all rows / 展开了全部行的分区

/**
 * A sidebar section whose heading folds it. `rows` are [view, label, count, iconHtml?, extraHtml?].
 * Empty rows are left out (unless keepEmpty), except the one being viewed. Long lists show the first few.
 * 侧边栏分区，点标题可折叠。数量为 0 的行默认不显示（当前正在看的除外）；行太多时只显示前几行。
 */
function sideSection(id, title, rows, { extraHeading = '', keepEmpty = false, limit = SHOW_FIRST, note = '' } = {}) {
  if (!keepEmpty) rows = rows.filter(r => r[2] > 0 || state.view === r[0]);
  if (!rows.length && !extraHeading) return '';
  const folded = data.prefs.collapsed.includes(id);
  const out = [`<div class="side-section${folded ? ' folded' : ''}"><div class="side-heading"><button type="button" class="side-fold" data-fold="${id}" aria-expanded="${!folded}">${escapeHtml(title)}${icon('chevronDown')}</button>${extraHeading}</div>`];
  if (!folded) {
    const activeAt = rows.findIndex(r => r[0] === state.view);
    const all = expanded.has(id) || rows.length <= limit + 1 || activeAt >= limit;
    for (const [view, label, count, iconHtml = '', extra = ''] of all ? rows : rows.slice(0, limit)) out.push(sidebarItem(view, label, iconHtml, count, extra));
    if (rows.length > limit + 1) {
      out.push(`<button type="button" class="side-more" data-more="${id}">${escapeHtml(all ? t('side.showLess') : t('side.showAll', rows.length))}</button>`);
    }
    out.push(note);
  }
  out.push('</div>');
  return out.join('');
}

function renderSidebar() {
  const live = state.all.filter(x => !state.hidden.has(x.path));
  const count = view => viewCount(live, view);
  const { devices, sites, folders } = facets(live);
  const html = [];
  html.push(sideSection('inbox', t('side.inbox'), [['inbox', t('downloads'), count('inbox'), icon('tray')]], { keepEmpty: true, limit: Infinity }));

  const button = (id, iconName, label) => `<button type="button" class="side-add" id="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(iconName)}</button>`;
  const heading = button('librarySettings', 'more', t('library.settings')) + button('addCategory', 'plus', t('category.new'));
  // Number keys file into categories; the key shows next to each category while pictures are selected.
  // 数字键对应分类；选中图片时在分类旁显示对应的数字。
  const cats = data.categories.map((c, i) => [
    `cat:${c.id}`,
    c.name,
    count(`cat:${c.id}`),
    `<span class="dot" data-color="${escapeHtml(c.color)}"></span>`,
    i < 9 ? `<kbd class="side-key">${i + 1}</kbd>` : '',
  ]);
  // The library: all its pictures, then one row per category (= folder). / 图片库：全部图片，然后每个分类（即文件夹）一行。
  const lib = state.library;
  const note = !lib.path
    ? `<button type="button" class="side-more side-setup" id="sideSetup">${escapeHtml(t('library.setUp'))}</button>`
    : !lib.available
      ? `<div class="side-note" title="${escapeHtml(lib.path)}">${icon('disk')}<span>${escapeHtml(t('library.offline'))} · ${escapeHtml(lib.path)}</span></div>`
      : '';
  html.push(sideSection('library', t('side.library'), [['all', t('view.all'), count('all'), icon('photos')], ...cats], { extraHeading: heading, keepEmpty: true, limit: Infinity, note }));

  html.push(sideSection('smart', t('side.smart'), SMART.map(([id, iconName]) => [`f:${id}`, t(`filter.${id}`), count(`f:${id}`), icon(iconName)]), { limit: Infinity }));
  html.push(sideSection('devices', t('side.devices'), devices.map(([d, n]) => [`device:${d}`, d, n])));
  html.push(sideSection('sites', t('side.sites'), sites.map(([k, n]) => [`site:${k}`, siteName(k), n])));
  html.push(sideSection('time', t('side.time'), TIME_FILTERS.map(f => [`f:${f}`, t(`filter.${f}`), count(`f:${f}`)]), { limit: Infinity }));
  html.push(sideSection('folders', t('side.folders'), folders.map(([d, n]) => [`folder:${d}`, d, n])));

  const manual = [...state.result.groups.values()].filter(g => g.manual);
  html.push(sideSection('groups', t('side.groups'), manual.map(g => [`group:${g.key}`, g.name, g.items.length, icon('stack')])));

  $('#sideNav').innerHTML = html.join('');
  paintDots($('#sideNav'));
  // A group opened from the grid is highlighted on its own row if it has one.
  $('#sideNav').querySelectorAll('.side-item').forEach(b => {
    if (state.view.startsWith('group:')) b.classList.toggle('active', b.dataset.view === state.view);
  });
}

function selectedPaths() {
  return grid.selectedTiles().flatMap(tile => (tile.kind === 'group' ? tile.items.map(x => x.path) : [tile.item.path]));
}

function renderSelectionBar() {
  const n = selectedPaths().length;
  document.body.classList.toggle('selecting', n > 0);
  $('#selCount').textContent = t('selection.count', n);
  $('#selGroup').disabled = n < 2;
}

// ---------- navigation / 切换视图 ----------

function setView(view) {
  if (view === state.view) return;
  if (!view.startsWith('group:')) state.lastView = view;
  state.view = view;
  grid.clearSelection();
  refresh({ keepScroll: false });
}

function openTile(tile) {
  if (!tile) return;
  if (tile.kind === 'group') return setView(`group:${tile.group.key}`);
  const items = state.result.items;
  viewer.open(items, items.findIndex(x => x.path === tile.item.path));
}

// ---------- actions / 操作 ----------

let undoStack = [];
function remember(label, undo) {
  undoStack.push(undo);
  if (undoStack.length > 30) undoStack.shift();
  toast(label, {
    undo: () => {
      undoStack = undoStack.filter(u => u !== undo);
      undo();
    },
  });
}

function undoLast() {
  const u = undoStack.pop();
  if (u) u();
}

function afterChange(paths, { advance = false } = {}) {
  refresh();
  if (viewer.isOpen) viewer.update(state.result.items, { path: paths[0], advance });
}

// ---------- moving into the picture library / 移到图片库 ----------

const byPath = path => state.all.find(x => x.path === path);

/** The Finder comment written on a filed picture. / 写在归档图片上的访达注释。 */
function commentFor(x) {
  if (!x) return '';
  const line = (k, v) => t('comment.line', t(k), v);
  return [
    ...(x.from.length ? [line('comment.source', x.from.join(', '))] : []),
    line('comment.name', x.name),
    line('comment.downloaded', formatDate(x.addedTime)),
    line('comment.filed', formatDate(Date.now())),
  ].join('\n');
}

/** Same picture at its new path. / 同一张图换成新的路径。 */
function relocate(x, to) {
  const rel = inLibrary(to) ? to.slice(LIB.length) : to;
  const slash = rel.lastIndexOf('/');
  const y = { ...x, path: to, name: rel.slice(slash + 1), folder: slash >= 0 ? rel.slice(0, slash) : '', library: inLibrary(to) || undefined };
  if (!y.library) delete y.filed;
  else if (!inLibrary(x.path)) {
    y.filed = new Date().toISOString();
    y.originalName = x.name;
  }
  return y;
}

/** Takes the helper's answer [{ from, to, duplicate? }] into the page. / 把助手返回的移动结果应用到页面。 */
function applyMoves(moved) {
  const real = moved.filter(m => !m.duplicate && m.from !== m.to);
  const gone = new Set(moved.filter(m => m.duplicate).map(m => m.from));
  const to = new Map(real.map(m => [m.from, m.to]));
  state.all = state.all.filter(x => !gone.has(x.path)).map(x => (to.has(x.path) ? relocate(x, to.get(x.path)) : x));
  // Copies point at the copy in the library as their original. / 副本以图片库里的那份为原件。
  const at = new Map(state.all.map(x => [x.path, x]));
  for (const x of state.all) {
    if (to.has(x.duplicateOf)) x.duplicateOf = to.get(x.duplicateOf);
    const original = at.get(x.duplicateOf);
    if (original && inLibrary(original.path) === false && inLibrary(x.path)) {
      original.duplicateOf = x.path;
      delete x.duplicateOf;
    }
  }
  images.rename(real);
  images.forget([...gone]);
  store.moved(real);
  store.forget([...gone]);
}

/** True when filing can go ahead; asks for the library's place the first time. / 可以归类时返回 true；第一次会先问图片库放在哪里。 */
async function libraryReady() {
  if (!state.library.path && !(await openLibraryDialog())) return false;
  if (!state.library.available) {
    toast(t('toast.libraryOffline', state.library.path), { error: true });
    return false;
  }
  return true;
}

/** Moves pictures to `folder` of the library (or back to Downloads when folder is null). */
function moveRequest(paths, category, folder = category ? folderOf(category.name) : null) {
  if (!folder) return host.unfile(paths.map(p => ({ path: p, removeTag: store.categoryOf(p)?.name })));
  const items = paths.map(p => (inLibrary(p) ? { path: p, removeTag: store.categoryOf(p)?.name } : { path: p, comment: commentFor(byPath(p)) }));
  return host.file(items, folder, category ? finderTag(category) : null);
}

/**
 * Number keys, menus and drag & drop end here. A category moves the pictures into its library folder;
 * no category (0) moves library pictures back to Downloads. Undo puts every picture back where it was.
 * 数字键、菜单和拖放最终都走这里。选分类：移到它在图片库里的文件夹；不选分类（0）：把图片库里的图移回“下载”。撤销会把每张图放回原处。
 */
async function assign(paths, categoryId, { advance = false } = {}) {
  if (!paths.length || state.busy) return;
  const category = categoryId ? data.categories.find(c => c.id === categoryId) : null;
  const toMove = category ? paths.filter(p => !inLibrary(p) || store.categoryOf(p)?.id !== category.id) : paths.filter(inLibrary);
  // Older Downloads pictures with a category just lose it on 0. / 0 键：以前归类、还在“下载”里的图只去掉分类。
  const unassign = category ? [] : paths.filter(p => !inLibrary(p) && data.assign[p]);
  if (!toMove.length && !unassign.length) return;
  if (toMove.length && !(await libraryReady())) return;
  state.busy = true;
  grid.clearSelection();
  const restore = store.snapshot();
  const before = new Map(toMove.map(p => [p, store.categoryOf(p)]));
  let moved = [];
  try {
    if (unassign.length) store.assign(unassign, null);
    if (toMove.length) {
      const r = await moveRequest(toMove, category);
      moved = r.moved || [];
      applyMoves(moved);
      if (r.failed?.length) toast(t('toast.fileFailed', r.failed.length), { error: true });
    }
  } catch (e) {
    showError(e);
  } finally {
    state.busy = false;
  }
  const done = moved.length + unassign.length;
  const first = moved[0]?.to || unassign[0] || paths[0];
  afterChange([first], { advance });
  if (!done) return;
  const dupes = moved.filter(m => m.duplicate).length;
  const label = category ? t('toast.filed', done, category.name) : moved.length ? t('toast.movedBack', done) : t('toast.assigned', done, t('uncategorized'));
  remember(dupes === done ? t('toast.duplicates', dupes) : dupes ? `${label} · ${t('toast.duplicates', dupes)}` : label, async () => {
    restore();
    const back = moved.filter(m => !m.duplicate && m.from !== m.to);
    if (dupes) toast(t('toast.undoDuplicate'));
    try {
      // Back to Downloads, or back into the folder each one came from. / 放回“下载”，或放回各自原来的文件夹。
      const home = back.filter(m => !inLibrary(m.from));
      if (home.length) applyMoves((await host.unfile(home.map(m => ({ path: m.to, removeTag: category?.name })))).moved || []);
      const byFolder = new Map();
      for (const m of back.filter(m => inLibrary(m.from) && libraryFolder(m.from))) {
        const f = libraryFolder(m.from);
        byFolder.set(f, [...(byFolder.get(f) || []), m.to]);
      }
      for (const [folder, list] of byFolder) {
        const old = before.get(back.find(m => libraryFolder(m.from) === folder).from);
        applyMoves((await moveRequest(list, old, folder)).moved || []);
      }
    } catch (e) {
      showError(e);
    }
    afterChange(back.map(m => m.from));
  });
}

/** Downloads pictures that have a category from before 2.3 (in this category's view: only its own). */
function pendingPaths(view) {
  const id = view.startsWith('cat:') ? view.slice(4) : null;
  return state.all.filter(x => !inLibrary(x.path) && !state.hidden.has(x.path) && store.categoryOf(x.path) && (!id || data.assign[x.path] === id)).map(x => x.path);
}

async function movePending(paths) {
  const byCategory = new Map();
  for (const p of paths) byCategory.set(data.assign[p], [...(byCategory.get(data.assign[p]) || []), p]);
  for (const [id, list] of byCategory) await assign(list, id);
}

// ---------- picture library settings / 图片库设置 ----------

function openLibraryDialog() {
  const d = $('#libraryDialog');
  const input = $('#libraryPath');
  const error = $('#libraryError');
  const list = $('#librarySuggestions');
  const { path, suggestions = [] } = state.library;
  input.value = path || suggestions[0] || '';
  error.hidden = true;
  $('#libraryCurrent').textContent = path ? t('library.current', path) : '';
  const mark = () => list.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.path === input.value.trim()));
  list.replaceChildren(
    ...suggestions.map(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'library-suggestion';
      b.dataset.path = s;
      b.innerHTML = `${icon(s.startsWith('/Volumes/') ? 'disk' : 'folder')}<span></span>`;
      b.lastChild.textContent = s;
      b.onclick = () => {
        input.value = s;
        mark();
      };
      return b;
    }),
  );
  mark();
  input.oninput = mark;
  input.onkeydown = e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    d.querySelector('form').requestSubmit(d.querySelector('button[value="ok"]'));
  };
  $('#libraryChoose').onclick = async () => {
    try {
      const r = await host.chooseFolder(t('library.prompt'));
      if (r.path) input.value = r.path;
      mark();
    } catch (e) {
      showError(e);
    }
  };
  return new Promise(resolve => {
    const form = d.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault();
      if (e.submitter?.value === 'cancel') return d.close();
      try {
        state.library = libraryState(await host.setLibrary(input.value, t('library.folderName')));
        d.close('ok');
        toast(t('toast.librarySet', state.library.path));
        // The new place may already hold a library: read it before filing anything. / 新位置可能已有图片库：先读取再归类。
        await scan({ keepImages: true });
        resolve(true);
      } catch (err) {
        error.textContent = /bad_library/.test(err.message) ? t('library.bad') : t('toast.error', err.message);
        error.hidden = false;
      }
    };
    d.onclose = () => d.returnValue !== 'ok' && resolve(false);
    d.returnValue = '';
    d.showModal();
  });
}

function categoryItems(paths, opts = {}) {
  const current = new Set(paths.map(p => data.assign[p] || ''));
  const one = current.size === 1 ? [...current][0] : null;
  return [
    ...data.categories.map((c, i) => ({
      label: c.name,
      color: c.color,
      checked: one === c.id,
      shortcut: i < 9 ? String(i + 1) : '',
      action: () => assign(paths, c.id, opts),
    })),
    { label: paths.some(inLibrary) ? t('moveBack') : t('uncategorized'), icon: 'tray', checked: one === '', shortcut: '0', action: () => assign(paths, null, opts) },
    { separator: true },
    {
      label: t('category.newEllipsis'),
      icon: 'plus',
      action: async () => {
        const name = await askName({ title: t('category.new'), confirm: t('create') });
        if (!name) return;
        const c = store.addCategory(name);
        assign(paths, c.id, opts);
      },
    },
  ];
}

function selectionMenu() {
  const paths = selectedPaths();
  const single = grid.selectedTiles().length === 1 ? grid.selectedTiles()[0] : null;
  return [
    ...(single ? [{ label: single.kind === 'group' ? t('open.group') : t('open'), icon: 'photos', action: () => openTile(single) }] : []),
    ...(single?.kind === 'image' ? [{ label: t('revealInFinder'), icon: 'folder', action: () => host.reveal(single.item.path).catch(showError) }] : []),
    { heading: t('selection.fileInto') },
    ...categoryItems(paths),
    { separator: true },
    { label: t('selection.makeGroup'), icon: 'stack', disabled: paths.length < 2, action: makeGroup },
    { label: t('trash.action', paths.length), icon: 'trash', danger: true, shortcut: '⌫', action: () => trash(paths) },
  ];
}

async function makeGroup() {
  const paths = selectedPaths();
  if (paths.length < 2) return;
  const first = state.all.find(x => x.path === paths[0]);
  const name = await askName({ title: t('group.newTitle', paths.length), value: first?.name.replace(/\.[^.]+$/, '') || '', confirm: t('create') });
  if (!name) return;
  const restore = store.snapshot();
  store.addGroup(name, paths);
  grid.clearSelection();
  refresh();
  remember(t('toast.grouped', name), () => {
    restore();
    refresh();
  });
}

async function keepAutoGroup(group) {
  const restore = store.snapshot();
  const g = store.addGroup(group.name, group.items.map(x => x.path));
  state.view = `group:m:${g.id}`;
  refresh();
  remember(t('toast.grouped', group.name), () => {
    restore();
    state.view = state.lastView;
    refresh();
  });
}

async function renameGroup(group) {
  const name = await askName({ title: t('group.rename'), value: group.name, confirm: t('save') });
  if (!name) return;
  store.renameGroup(group.id, name);
  refresh();
}

function ungroup(group) {
  const restore = store.snapshot();
  store.removeGroup(group.id);
  state.view = state.lastView;
  refresh();
  remember(t('toast.ungrouped', group.name), () => {
    restore();
    refresh();
  });
}

function categoryEditItems(c) {
  return [
    {
      label: t('category.rename'),
      icon: 'tag',
      action: async () => {
        const name = await askName({ title: t('category.rename'), value: c.name, confirm: t('save') });
        if (!name || name === c.name) return;
        if (!(await renameFolder(c, { ...c, name }))) return;
        store.renameCategory(c.id, name);
        refresh();
      },
    },
    { heading: t('category.color') },
    ...store.COLORS.map(color => ({
      label: '',
      color,
      checked: c.color === color,
      action: async () => {
        if (!(await renameFolder(c, { ...c, color }))) return;
        store.recolorCategory(c.id, color);
        refresh();
      },
    })),
    { separator: true },
    {
      label: t('category.delete'),
      icon: 'trash',
      danger: true,
      action: () => {
        if (state.all.some(x => inLibrary(x.path) && store.categoryOf(x.path)?.id === c.id)) return toast(t('toast.categoryNotEmpty', c.name), { error: true });
        const restore = store.snapshot();
        store.removeCategory(c.id);
        if (state.view === `cat:${c.id}`) state.view = 'all';
        refresh();
        remember(t('toast.categoryDeleted', c.name), () => {
          restore();
          refresh();
        });
      },
    },
  ];
}

/** Renames (or recolors) the category's library folder and the tags on its pictures. Returns false if it could not. */
async function renameFolder(old, next) {
  const from = folderOf(old.name);
  const to = folderOf(next.name);
  const inside = state.all.filter(x => libraryFolder(x.path) === from);
  if (!inside.length) return true;
  if (!state.library.available) {
    toast(t('toast.libraryOffline', state.library.path), { error: true });
    return false;
  }
  try {
    await host.renameFolder(from, to, old.name, finderTag(next));
  } catch (e) {
    toast(/folder_exists/.test(e.message) ? t('toast.folderExists', to) : t('toast.error', e.message), { error: true });
    return false;
  }
  if (from !== to) applyMoves(inside.map(x => ({ from: x.path, to: LIB + to + x.path.slice(LIB.length + from.length) })));
  return true;
}

// Moving to the Trash waits a few seconds so Undo is instant; then the helper does it.
// Closing the page sends it right away. If anything fails, the picture comes back.
// 移到废纸篓会先等几秒，这样“撤销”可以立即生效；之后由助手真正执行。关闭页面时会立刻执行。失败的图片会恢复显示。
let pendingTrash = null;

function trash(paths) {
  if (!paths.length) return;
  flushTrash();
  paths.forEach(p => state.hidden.add(p));
  const job = { paths, timer: setTimeout(() => flushTrash(), TRASH_DELAY) };
  pendingTrash = job;
  grid.clearSelection();
  afterChange(paths);
  remember(t('toast.trashed', paths.length), () => {
    if (pendingTrash !== job) return toast(t('toast.trashTooLate'));
    clearTimeout(job.timer);
    pendingTrash = null;
    paths.forEach(p => state.hidden.delete(p));
    afterChange(paths);
  });
}

async function flushTrash() {
  const job = pendingTrash;
  if (!job) return;
  pendingTrash = null;
  clearTimeout(job.timer);
  try {
    const r = await host.trash(job.paths);
    const done = new Set(r.trashed || []);
    store.forget([...done]);
    images.forget([...done]);
    state.all = state.all.filter(x => !done.has(x.path));
    job.paths.forEach(p => state.hidden.delete(p));
    if (r.failed?.length) toast(t('toast.trashFailed', r.failed.length), { error: true });
  } catch (e) {
    job.paths.forEach(p => state.hidden.delete(p));
    showError(e);
  }
  refresh();
  if (viewer.isOpen) viewer.update(state.result.items, { path: viewer.current?.path });
}

addEventListener('pagehide', flushTrash);

function showError(e) {
  toast(t('toast.error', e.message || e), { error: true });
}

// ---------- events / 事件 ----------

$('#sideNav').addEventListener('click', async e => {
  const fold = e.target.closest('[data-fold]');
  if (fold) {
    const id = fold.dataset.fold;
    const set = new Set(data.prefs.collapsed);
    set.has(id) ? set.delete(id) : set.add(id);
    store.setPref('collapsed', [...set]);
    return renderSidebar();
  }
  const more = e.target.closest('[data-more]');
  if (more) {
    expanded.has(more.dataset.more) ? expanded.delete(more.dataset.more) : expanded.add(more.dataset.more);
    return renderSidebar();
  }
  if (e.target.closest('#librarySettings, #sideSetup')) return openLibraryDialog();
  if (e.target.closest('#addCategory')) {
    const name = await askName({ title: t('category.new'), confirm: t('create') });
    if (!name) return;
    const c = store.addCategory(name);
    setView(`cat:${c.id}`);
    return;
  }
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});

$('#sideNav').addEventListener('contextmenu', e => {
  const b = e.target.closest('[data-view^="cat:"]');
  if (!b) return;
  e.preventDefault();
  const c = data.categories.find(x => x.id === b.dataset.view.slice(4));
  if (c) menu(categoryEditItems(c), e);
});

// Drop selected pictures onto a category in the sidebar. / 把选中的图拖到侧边栏的分类上。
$('#sideNav').addEventListener('dragover', e => {
  const b = e.target.closest('[data-view^="cat:"], [data-view="inbox"]');
  if (!b || !e.dataTransfer.types.includes('application/x-image-organizer')) return;
  e.preventDefault();
  b.classList.add('drop');
});
$('#sideNav').addEventListener('dragleave', e => e.target.closest('.side-item')?.classList.remove('drop'));
$('#sideNav').addEventListener('drop', e => {
  const b = e.target.closest('[data-view^="cat:"], [data-view="inbox"]');
  if (!b) return;
  e.preventDefault();
  b.classList.remove('drop');
  const paths = JSON.parse(e.dataTransfer.getData('application/x-image-organizer') || '[]');
  assign(paths, b.dataset.view === 'inbox' ? null : b.dataset.view.slice(4));
});
$('#scroller').addEventListener('dragstart', e => {
  const node = e.target.closest('.tile');
  if (!node) return;
  if (!grid.selected.has(node.dataset.key)) {
    grid.selected.clear();
    grid.selected.add(node.dataset.key);
    grid.refreshSelection();
  }
  const paths = selectedPaths();
  e.dataTransfer.setData('application/x-image-organizer', JSON.stringify(paths));
  e.dataTransfer.effectAllowed = 'move';
  const ghost = $('#dragGhost');
  ghost.textContent = t('count.pictures', paths.length);
  e.dataTransfer.setDragImage(ghost, 20, 20);
});

$('#back').onclick = () => setView(state.lastView);
let searchTimer = null;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    refresh({ keepScroll: false });
  }, 120);
});
$('#sort').addEventListener('change', e => {
  store.setPref('sort', e.target.value);
  refresh({ keepScroll: false });
});
$('#size').addEventListener('input', e => {
  store.setPref('rowHeight', Number(e.target.value));
  refresh();
});
$('#rescan').onclick = () => scan();
$('#selCategory').onclick = e => menu(categoryItems(selectedPaths()), e.currentTarget);
$('#selGroup').onclick = makeGroup;
$('#selTrash').onclick = () => trash(selectedPaths());
$('#selClear').onclick = () => grid.clearSelection();
$('#selAll').onclick = () => grid.selectAll();
$('#shortcuts').onclick = () => $('#keysDialog').showModal();

document.addEventListener('keydown', e => {
  if (menuOpen() || document.querySelector('dialog[open]')) return;
  const typing = e.target.matches('input, textarea, select');
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    return undoLast();
  }
  if (viewer.isOpen) {
    if (viewer.key(e)) e.preventDefault();
    return;
  }
  if (cmd && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    return $('#search').focus();
  }
  if (typing) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (cmd && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    return grid.selectAll();
  }
  if (e.key === 'Escape') return grid.clearSelection();
  if ((e.key === 'Backspace' || e.key === 'Delete') && grid.selected.size) return trash(selectedPaths());
  if (e.key === '?') return $('#keysDialog').showModal();
  if (cmd && (e.key === '=' || e.key === '+' || e.key === '-')) {
    e.preventDefault();
    const v = Math.max(100, Math.min(360, Number(data.prefs.rowHeight) + (e.key === '-' ? -40 : 40)));
    $('#size').value = v;
    store.setPref('rowHeight', v);
    return refresh();
  }
  if (/^[0-9]$/.test(e.key) && grid.selected.size) {
    const n = Number(e.key);
    if (n === 0) assign(selectedPaths(), null);
    else if (data.categories[n - 1]) assign(selectedPaths(), data.categories[n - 1].id);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushTrash();
});
addEventListener('scroll', closeMenu, true);

start();
