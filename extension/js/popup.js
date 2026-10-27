// Toolbar popup: lists the pictures on the current page and saves the chosen ones into a category of the
// picture library, or into Downloads (always possible, and the only way without the helper). See saver.js.
// 工具栏小窗口：列出当前网页上的图片，把选中的存进图片库的分类，或存到“下载”（随时可用，没有本机助手时只能这样）。见 saver.js。

import * as store from './store.js';
import { data, folderOf } from './store.js';
import { collectImages, fetchImage } from './collect.js';
import { libraryStatus, bytesInPage, pageName, saveToCategory, saveToDownloads } from './saver.js';
import { t, localizePage } from './i18n.js';

const $ = s => document.querySelector(s);
const SMALL = 200; // known sizes up to this are icons, avatars and buttons / 已知尺寸不超过这个的视为图标、头像、按钮

// ready: pictures can go into categories (helper + library); otherwise only Downloads. / ready：能存进分类，否则只能存到“下载”。
const state = { tab: null, page: null, picked: new Set(), showSmall: false, ready: false, library: '', busy: false };
// The popup keeps its own small setting, so it never rewrites the gallery's data. / 小窗口单独保存自己的设置，不改写图库的数据。
const POPUP_KEY = 'io:popup';

/** Opens the gallery (or brings it to the front), optionally at a view such as "cat:<id>". / 打开图库（已打开就切过去），可指定视图。 */
async function openGallery(view = '') {
  const base = chrome.runtime.getURL('gallery.html');
  const url = view ? `${base}#view=${encodeURIComponent(view)}` : base;
  const [open] = (await chrome.runtime.getContexts?.({ contextTypes: ['TAB'] }))?.filter(c => c.documentUrl?.startsWith(base)) || [];
  if (open?.tabId >= 0) {
    await chrome.tabs.update(open.tabId, view ? { active: true, url } : { active: true });
    if (open.windowId >= 0) await chrome.windows?.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
}
$('#pOpen').onclick = () => openGallery();

function note(text) {
  $('#pNote').hidden = !text;
  $('#pNote').textContent = text || '';
}

const isSmall = x => (x.width || x.height) && Math.max(x.width, x.height) <= SMALL;
const shown = () => state.page.images.filter(x => state.showSmall || !isSmall(x));

function render() {
  const list = shown();
  const hiddenCount = state.page.images.length - list.length;
  $('#pSub').textContent = [t('count.pictures', list.length), hiddenCount ? t('popup.smallHidden', hiddenCount) : ''].filter(Boolean).join(' · ');
  $('#pGrid').replaceChildren(
    ...list.map(x => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `p-tile${state.picked.has(x.url) ? ' on' : ''}`;
      b.dataset.url = x.url;
      const img = document.createElement('img');
      img.src = x.url;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = x.alt;
      const check = document.createElement('span');
      check.className = 'p-check';
      b.append(img, check);
      // The page reports the size it shows; the tile loads the largest candidate, so show that size once known.
      // 网页给的是显示尺寸；小图加载的是最大候选，加载后显示实际尺寸。
      const size = document.createElement('span');
      size.className = 'p-size';
      const label = () => {
        size.hidden = !x.width;
        size.textContent = `${x.width}×${x.height}`;
      };
      img.onload = () => {
        x.width = img.naturalWidth;
        x.height = img.naturalHeight;
        label();
      };
      label();
      b.append(size);
      return b;
    }),
  );
  updateSave();
}

function updateSave() {
  const n = state.picked.size;
  $('#pSave').textContent = n ? t('popup.saveN', n) : t('popup.save');
  $('#pSave').disabled = !n || !state.ready || state.busy;
  $('#pDownloads').textContent = n && !state.ready ? t('popup.saveDownloadsN', n) : t('popup.saveDownloads');
  $('#pDownloads').disabled = !n || state.busy;
  $('#pAll').textContent = n && n === shown().length ? t('selection.none') : t('selection.all');
}

$('#pGrid').addEventListener('click', e => {
  const tile = e.target.closest('.p-tile');
  if (!tile || tile.querySelector('.p-state')) return;
  const url = tile.dataset.url;
  state.picked.has(url) ? state.picked.delete(url) : state.picked.add(url);
  tile.classList.toggle('on', state.picked.has(url));
  updateSave();
});

$('#pAll').onclick = () => {
  const list = shown();
  if (state.picked.size === list.length) state.picked.clear();
  else list.forEach(x => state.picked.add(x.url));
  render();
};

$('#pShowSmall').onchange = e => {
  state.showSmall = e.target.checked;
  render();
};

/** "Title_03" from the page title and the picture's place on the page. / 由网页标题和图片在页面中的位置生成名字。 */
function fileName(x) {
  return `${pageName(state.page)}_${String(x.n).padStart(2, '0')}`;
}

/** The picture's bytes: from inside the page first, then from the extension. / 先在网页里取，取不到再由插件取。 */
async function bytesOf(url) {
  try {
    return { ...(await bytesInPage(state.tab.id, url)), via: 'page' };
  } catch (e) {
    const direct = await fetchImage(url);
    if (direct.data) return { ...direct, via: 'extension' };
    throw e;
  }
}

function mark(url, text, kind) {
  const tile = $(`.p-tile[data-url="${CSS.escape(url)}"]`);
  if (!tile) return;
  tile.querySelector('.p-state')?.remove();
  const s = document.createElement('span');
  s.className = `p-state ${kind}`;
  s.textContent = text;
  tile.append(s);
}

/** Saves the chosen pictures, one by one, into a category or (category null) into Downloads. / 逐张保存到分类，或（category 为空）存到“下载”。 */
async function saveChosen(category) {
  state.busy = true;
  updateSave();
  const chosen = state.page.images.filter(x => state.picked.has(x.url));
  let saved = 0;
  let already = 0;
  let failed = 0;
  for (const x of chosen) {
    mark(x.url, t('popup.saving'), '');
    try {
      const got = await bytesOf(x.url);
      if (category) {
        const r = await saveToCategory(got, fileName(x), category, state.page, x.url);
        r.duplicate ? already++ : saved++;
        mark(x.url, r.duplicate ? t('popup.already') : got.via === 'page' ? t('popup.saved') : t('popup.savedDirect'), 'done');
      } else {
        await saveToDownloads(got, fileName(x), state.page, x.url);
        saved++;
        mark(x.url, t('popup.saved'), 'done');
      }
    } catch (e) {
      failed++;
      console.warn('save failed', x.url, e);
      mark(x.url, t('popup.failed', e.message), 'fail');
    }
    state.picked.delete(x.url);
  }
  const where = category
    ? t('popup.result', saved, category.name, `${state.library}/${folderOf(category.name)}`)
    : t('popup.resultDownloads', saved, `${t('downloads.folder')}/${pageName(state.page)}`);
  note([saved ? where : '', already ? t('popup.resultAlready', already) : '', failed ? t('popup.resultFailedN', failed) : ''].filter(Boolean).join(' '));
  if (saved || already) {
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'button small plain p-view';
    view.textContent = t('popup.viewInGallery');
    view.onclick = () => openGallery(category ? `cat:${category.id}` : '');
    $('#pNote').append(view);
    // An open gallery reads the library and Downloads again. / 已打开的图库重新读取图片库和“下载”。
    chrome.runtime.sendMessage?.({ type: 'library-changed' })?.catch?.(() => {});
  }
  state.busy = false;
  updateSave();
}

$('#pSave').onclick = () => {
  const category = data.categories.find(c => c.id === $('#pCategory').value);
  if (!category) return;
  chrome.storage.local.set({ [POPUP_KEY]: { category: category.id } });
  saveChosen(category);
};
$('#pDownloads').onclick = () => saveChosen(null);

async function start() {
  localizePage();
  await store.load();
  [state.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('#pTitle').textContent = t('appName');
  if (!/^https?:/.test(state.tab?.url || '')) return note(t('popup.cannotRead'));
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, func: collectImages });
    state.page = result;
    // Numbered in page order, the pictures shown first, so names have no gaps and stay the same between saves.
    // 按页面顺序编号，先编显示出来的图，这样编号连续，分几次保存也不变。
    let n = 0;
    for (const x of state.page.images) if (!isSmall(x)) x.n = ++n;
    for (const x of state.page.images) if (isSmall(x)) x.n = ++n;
  } catch {
    // Expected on pages Chrome does not let extensions read (error pages, the Web Store…). Only the note says so:
    // nothing is logged, because Chrome lists any logged message under the extension's errors.
    // Chrome 不允许插件读取的页面（出错页、应用商店等）本来就会这样。只在提示里说明，不记日志，否则 Chrome 会算成插件错误。
    return note(t('popup.cannotRead'));
  }
  $('#pTitle').textContent = state.page.title || state.tab.url;
  $('#pTools').hidden = false;
  $('#pFoot').hidden = false;
  render();
  if (!state.page.images.length) note(t('popup.noPictures'));

  // Categories need the helper and a connected picture library; without them only Downloads is offered.
  // 存进分类需要本机助手和已连接的图片库；没有时只提供“存到下载”。
  const status = await libraryStatus();
  if (!status.ok) {
    document.body.classList.add('downloads-only');
    $('#pDownloads').classList.add('primary');
    if (state.page.images.length) note(status.note);
    return;
  }
  state.library = status.library;
  const select = $('#pCategory');
  select.replaceChildren(
    ...data.categories.map(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      return o;
    }),
  );
  const last = (await chrome.storage.local.get(POPUP_KEY))[POPUP_KEY]?.category;
  if (data.categories.some(c => c.id === last)) select.value = last;
  state.ready = data.categories.length > 0;
  updateSave();
}

start();
