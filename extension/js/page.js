// The web page a picture or video is saved from: names for files and folders, and the Finder comment.
// Shared by picture saving (saver.js) and video saving (video/save.js), so neither depends on the other.
// 保存图片或视频时所在的网页：文件和文件夹的名字、访达注释。图片保存（saver.js）和视频保存（video/save.js）共用，互不依赖。

import { formatDate } from './library.js';
import { t } from './i18n.js';

/** A file or folder name from a page title: no slashes or other characters Finder or Chrome refuse. / 由网页标题得到的文件名或文件夹名。 */
export function plainName(text) {
  return (text || '').replace(/[\\/:*?"<>|~\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim().slice(0, 60);
}

/** The page's name for files: its title, or the site's name. / 文件用的网页名：标题，没有就用网站名。 */
export function pageName(page) {
  let site = '';
  try {
    site = new URL(page.url).hostname.replace(/^www\./, '');
  } catch {}
  return plainName(page.title) || plainName(site) || 'image';
}

/** The Finder comment: page title, address, when it was saved. / 访达注释：网页标题、网址、保存时间。 */
export function commentFor(page) {
  const line = (k, v) => t('comment.line', t(k), v);
  return [line('comment.page', page.title), line('comment.address', page.url), line('comment.filed', formatDate(Date.now()))].join('\n');
}
