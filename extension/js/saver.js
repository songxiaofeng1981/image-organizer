// Saving pictures from a web page, shared by the toolbar popup and the right-click menu: into a category of the
// picture library (the helper writes the file), or into Downloads when the helper is not there (Chrome writes it).
// The picture's bytes always come from inside the page first (collect.js fetchImage), like the page loads it.
// 保存网页上的图片，工具栏小窗口和右键菜单共用：存进图片库的分类（由本机助手写文件），没有本机助手时存到“下载”
// （由 Chrome 写文件）。图片数据总是先在网页里取（collect.js 的 fetchImage），和网页自己加载时一样。

import { host, MIN_HELPER_VERSION, versionAtLeast } from './host.js';
import { folderOf, finderTag } from './store.js';
import { fetchImage } from './collect.js';
import { plainName, pageName, commentFor } from './page.js';
import { t } from './i18n.js';

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/svg+xml': 'svg',
};

/**
 * Whether pictures can go into categories now: the helper is installed and new enough, and the picture library
 * is set up and connected. Returns { ok: true, library } or { ok: false, note } (a sentence for the user).
 * 现在能否存进分类：本机助手已安装且够新，图片库已设置并已连接。
 */
export async function libraryStatus() {
  try {
    const hello = await host.hello();
    if (!versionAtLeast(hello.version, MIN_HELPER_VERSION)) return { ok: false, note: t('popup.noHelper') };
    const lib = await host.config(t('library.folderName'));
    if (!lib.library) return { ok: false, note: t('popup.noLibrary') };
    if (!lib.available) return { ok: false, note: t('toast.libraryOffline', lib.library) };
    return { ok: true, library: lib.library };
  } catch {
    return { ok: false, note: t('popup.noHelper') };
  }
}

/** The picture's bytes, fetched inside the page (in the frame it is in). / 在网页里（图片所在的框架）取图片数据。 */
export async function bytesInPage(tabId, url, frameId = 0) {
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func: fetchImage, args: [url] });
  if (result?.data) return result;
  throw new Error(result?.error || 'fetch_failed');
}

/** Writes the picture into a category of the library. Returns the helper's reply ({ path, duplicate }). / 写进图片库的分类。 */
export function saveToCategory(pic, name, category, page, url) {
  return host.save({
    data: pic.data,
    name,
    folder: folderOf(category.name),
    tag: finderTag(category),
    comment: commentFor(page),
    from: [url, page.url],
  });
}

/** Saves the picture into Downloads/Image Organizer/<page>/<name>.<ext>, written by Chrome. / 存到“下载/图片整理/<网页>/”。 */
export async function saveToDownloads(pic, name, page, url) {
  let ext = EXT[(pic.type || '').split(';')[0]];
  if (!ext) {
    const m = /\.(jpe?g|png|webp|gif|avif|heic|bmp|tiff?|svg)(?:[?#]|$)/i.exec(url);
    ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  }
  const type = pic.type || 'image/jpeg';
  // A blob address from a page; a service worker has no blob addresses, so it uses a data address.
  // 页面里用 blob 地址；后台没有 blob 地址，改用 data 地址。
  const href = typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(new Blob([Uint8Array.from(atob(pic.data), c => c.charCodeAt(0))], { type }))
    : `data:${type};base64,${pic.data}`;
  const filename = `${plainName(t('downloads.folder'))}/${pageName(page)}/${plainName(name) || 'image'}.${ext}`;
  return chrome.downloads.download({ url: href, filename, conflictAction: 'uniquify', saveAs: false });
}
