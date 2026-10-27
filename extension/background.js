// Background (service worker): the right-click menu on pictures, "Save to Picture Library ▸ <category>" and
// "Save to Downloads only". The picture is fetched inside the page, then saved the same way as from the toolbar
// popup (js/saver.js). The toolbar icon shows ✓ or ! for a few seconds.
// 后台：图片的右键菜单“保存到图片库 ▸ <分类>”和“只存到下载”。图片在网页里取数据，再和工具栏小窗口一样保存
// （js/saver.js）。工具栏图标上显示 ✓ 或 ! 几秒钟。

import * as store from './js/store.js';
import { data } from './js/store.js';
import { libraryStatus, bytesInPage, pageName, saveToCategory, saveToDownloads } from './js/saver.js';
import { t } from './js/i18n.js';

const ROOT = 'save';
const DOWNLOADS = 'downloads';

// Menus are rebuilt one at a time, so ids never clash. / 菜单一次只重建一个，id 不会冲突。
let building = Promise.resolve();
function buildMenus() {
  building = building.then(async () => {
    await store.load();
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: ROOT, title: t('menu.saveTo'), contexts: ['image'] });
    // The first nine, like the 1–9 keys in the gallery. / 前 9 个，和图库里的 1–9 键一样。
    for (const c of data.categories.slice(0, 9)) chrome.contextMenus.create({ id: `cat:${c.id}`, parentId: ROOT, title: c.name, contexts: ['image'] });
    if (data.categories.length) chrome.contextMenus.create({ id: 'sep', parentId: ROOT, type: 'separator', contexts: ['image'] });
    chrome.contextMenus.create({ id: DOWNLOADS, parentId: ROOT, title: t('menu.saveDownloads'), contexts: ['image'] });
  }).catch(() => {});
  return building;
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);
// New, renamed or reordered categories. / 新增、改名或调整顺序的分类。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[store.KEY]) return;
  const names = v => JSON.stringify((v?.categories || []).slice(0, 9).map(c => [c.id, c.name]));
  if (names(changes[store.KEY].oldValue) !== names(changes[store.KEY].newValue)) buildMenus();
});

/** ✓ or ! on the toolbar icon for this tab, with the reason as its tooltip. / 在这个标签页的工具栏图标上显示 ✓ 或 !，提示里写原因。 */
function flash(tabId, ok, message) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#34c759' : '#ff3b30' });
  chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  chrome.action.setTitle({ tabId, title: message });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setTitle({ tabId, title: chrome.i18n.getMessage('actionTitle') });
  }, ok ? 3000 : 8000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.srcUrl || !(tab?.id >= 0)) return;
  const page = { title: tab.title || '', url: info.pageUrl || tab.url || '' };
  const name = pageName(page);
  try {
    const pic = await bytesInPage(tab.id, info.srcUrl, info.frameId || 0);
    await store.load();
    const category = data.categories.find(c => `cat:${c.id}` === info.menuItemId);
    if (category) {
      const status = await libraryStatus();
      if (status.ok) {
        const r = await saveToCategory(pic, name, category, page, info.srcUrl);
        flash(tab.id, true, r.duplicate ? t('popup.already') : t('menu.savedTo', category.name));
      } else {
        // No helper or library: keep the picture anyway, in Downloads. / 没有本机助手或图片库：照样存下，放在“下载”。
        await saveToDownloads(pic, name, page, info.srcUrl);
        flash(tab.id, false, `${t('menu.savedDownloads')} ${status.note}`);
      }
    } else {
      await saveToDownloads(pic, name, page, info.srcUrl);
      flash(tab.id, true, t('menu.savedDownloads'));
    }
    // An open gallery reads the library and Downloads again. / 已打开的图库重新读取图片库和“下载”。
    chrome.runtime.sendMessage({ type: 'library-changed' }).catch(() => {});
  } catch (e) {
    flash(tab.id, false, t('menu.failed', e.message));
  }
});
