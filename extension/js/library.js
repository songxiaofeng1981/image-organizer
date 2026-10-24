// Turns the raw file list into what the screen shows: which pictures are in the current view,
// in what order, which ones fold into a group, and the date sections.
// 把文件列表变成屏幕上要显示的内容：当前视图有哪些图、什么顺序、哪些合成一组、按日期怎么分段。

import { data, categoryOf } from './store.js';
import { t, lang } from './i18n.js';

const DAY = 86400000;

const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Known websites, by the host names browsers record for downloads. Anything else is listed by its domain.
// 常见网站（按浏览器记录的下载来源域名识别）。其他网站按域名显示。
const SITES = [
  ['xhs', /(^|\.)(xiaohongshu\.com|xhscdn\.com|xhslink\.com)$/],
  ['chatgpt', /(^|\.)(chatgpt\.com|openai\.com|oaiusercontent\.com)$/],
  ['wechat', /(^|\.)(weixin\.qq\.com|wx\.qq\.com|qpic\.cn|qlogo\.cn)$/],
  ['weibo', /(^|\.)(weibo\.com|weibo\.cn|sinaimg\.cn)$/],
  ['zhihu', /(^|\.)(zhihu\.com|zhimg\.com)$/],
  ['douyin', /(^|\.)(douyin\.com|douyinpic\.com|douyinstatic\.com)$/],
  ['bilibili', /(^|\.)(bilibili\.com|hdslb\.com)$/],
  ['x', /(^|\.)(x\.com|twitter\.com|twimg\.com)$/],
  ['pinterest', /(^|\.)(pinterest\.[a-z.]+|pinimg\.com)$/],
  ['gemini', /(^|\.)gemini\.google\.com$/],
  ['midjourney', /(^|\.)midjourney\.com$/],
  ['napkin', /(^|\.)napkin\.ai$/],
];
// Sites whose pictures are AI-generated. / 生成的图片属于 AI 生成的网站。
const AI_SITES = new Set(['chatgpt', 'gemini', 'midjourney', 'napkin']);
const AI_HOSTS = /(^|\.)(doubao\.com|jimeng\.jianying\.com|klingai\.com|ideogram\.ai|leonardo\.ai|krea\.ai|tongyi\.aliyun\.com|yiyan\.baidu\.com)$/;

/** A site key for a host: a known site, or the main domain ("static.mysmth.net" → "mysmth.net"). */
function siteOf(host) {
  for (const [key, re] of SITES) if (re.test(host)) return key;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost') return '';
  const parts = host.replace(/^www\./, '').split('.');
  const two = /^(com|net|org|gov|edu|co)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(two ? -3 : -2).join('.');
}

export const siteName = key => (SITES.some(([k]) => k === key) ? t(`site.${key}`) : key);

const SCREENSHOT_NAME = /截图|截屏|屏幕快照|screen ?shot|snipaste|cleanshot/i;
const AI_NAME = /^(dall[·-]?e|chatgpt image|gemini_generated_image|comfyui|midjourney|firefly)|_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;
const WEB_ASSET_NAME = /^(favicon|logo|icon|avatar|sprite|badge|emoji)([-_.\d]|$)|-[A-Za-z0-9_]{8}\.(png|svg|jpe?g|webp|gif)$/i;

/**
 * Small pictures that are not worth looking at: favicons, logos, UI icons, website build assets.
 * They are hidden everywhere except in "Small Icons" and in categories you put them in.
 * 不值得看的小图：网站图标、logo、界面图标、网页打包产生的素材。除“小图标”和你手动归入的分类外，其他地方都不显示。
 */
function isIcon(x) {
  if (x.ext === 'ico' || x.ext === 'svg') return true;
  const side = Math.max(x.width, x.height);
  if (!side) return false;
  return side <= 256 || (side <= 512 && WEB_ASSET_NAME.test(x.name));
}

/** Phone-shaped PNGs at screen resolution are almost always phone screenshots (e.g. 1179×2556). */
const phoneScreen = x => x.ext === 'png' && x.width >= 640 && x.height / x.width > 1.9 && x.height / x.width < 2.3;

// Smart categories, worked out from the file's own information. Their views are named `f:<id>`.
// 智能分类，根据文件自带的信息判断。视图名为 `f:<id>`。
export const SMART = [
  ['photos', 'camera', x => x.isPhoto],
  ['screenshots', 'screenshot', x => x.isScreenshot],
  ['ai', 'sparkles', x => x.isAI],
  ['xhs', 'book', x => x.sites.includes('xhs') || /小红书|小紅書/.test(x.name)],
  ['wechat', 'message', x => x.sites.includes('wechat') || /^(微信图片|微信截图|mmexport|wx_camera)/i.test(x.name)],
  ['animated', 'play', x => x.frames > 1],
  ['sequence', 'film', x => x.isSequence],
  ['duplicates', 'copies', x => !!x.duplicateOf],
  ['large', 'disk', x => x.size >= 5 * 1024 * 1024],
  ['icons', 'shapes', x => x.isIcon],
];

const TIME = {
  today: x => x.addedTime >= startOfToday(),
  week: x => Date.now() - x.addedTime < 7 * DAY,
  month: x => Date.now() - x.addedTime < 30 * DAY,
  older: x => Date.now() - x.addedTime >= 30 * DAY,
};
export const TIME_FILTERS = Object.keys(TIME);

const FILTERS = { ...Object.fromEntries(SMART.map(([id, , test]) => [id, test])), ...TIME };

/** First-level folder inside Downloads, or '' for pictures directly in Downloads. */
export const topFolder = x => (x.folder ? x.folder.split('/')[0] : '');

/** Devices, websites and sub-folders present, most pictures first: [[key, count], ...]. Small icons are left out. */
export function facets(items) {
  const devices = new Map();
  const sites = new Map();
  const folders = new Map();
  const add = (map, key) => key && map.set(key, (map.get(key) || 0) + 1);
  for (const x of items) {
    if (x.isIcon) continue;
    add(devices, x.device);
    for (const s of new Set(x.sites)) add(sites, s);
    add(folders, topFolder(x));
  }
  const order = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return { devices: [...devices].sort(order), sites: [...sites].sort(order), folders: [...folders].sort(order) };
}

/** Adds fields the UI needs to each item from the helper. */
export function prepare(items) {
  const out = items.map(x => {
    const y = {
      ...x,
      from: x.from || [],
      frames: x.frames || 1,
      addedTime: Date.parse(x.added) || Date.parse(x.modified) || 0,
      aspect: x.width > 0 && x.height > 0 ? x.width / x.height : 1,
    };
    y.sites = [...new Set(y.from.map(siteOf).filter(Boolean))];
    // "iPhone 17" and "NIKON Z 6" already name the maker; "EOS R6" needs "Canon" in front.
    // “iPhone 17”“NIKON Z 6”已包含厂商；“EOS R6”前面要加上“Canon”。
    const make = x.make || '';
    const model = x.model || '';
    const brand = make.split(' ')[0].toLowerCase();
    y.device = !model ? '' : brand && brand !== 'apple' && !model.toLowerCase().includes(brand) ? `${make.split(' ')[0]} ${model}` : model;
    y.isIcon = isIcon(y);
    y.isScreenshot = !!x.screenshot || SCREENSHOT_NAME.test(x.name) || phoneScreen(y);
    y.isPhoto = !y.isScreenshot && (!!x.model || x.ext === 'heic' || x.ext === 'heif' || /^IMG_\d{4}\.(heic|jpe?g)$/i.test(x.name));
    y.isAI = AI_NAME.test(x.name) || y.sites.some(s => AI_SITES.has(s)) || y.from.some(h => AI_HOSTS.test(h));
    return y;
  });
  // Numbered runs in one folder (frame-001.png, scene_12.jpg …), five or more: frames exported from a video or a slide deck.
  // 同一文件夹里五张以上连续编号的图（frame-001.png、scene_12.jpg……）：通常是从视频或幻灯片导出的帧。
  const runs = new Map();
  const runKey = x => {
    const m = x.name.match(/^(.*?)[-_ ]?\d+\.[^.]+$/);
    return m && !x.isPhoto && !x.isScreenshot && !/^img$/i.test(m[1]) ? `${x.folder}/${m[1].toLowerCase()}|${x.ext}` : null;
  };
  for (const x of out) {
    const k = runKey(x);
    if (k) runs.set(k, (runs.get(k) || 0) + 1);
  }
  for (const x of out) x.isSequence = (runs.get(runKey(x)) || 0) >= 5;
  return out;
}

export function inView(x, view) {
  if (view === 'all') return true;
  if (view === 'uncategorized') return !categoryOf(x.path);
  if (view.startsWith('cat:')) return data.assign[x.path] === view.slice(4);
  if (view.startsWith('f:')) return FILTERS[view.slice(2)]?.(x) ?? false;
  if (view.startsWith('device:')) return x.device === view.slice(7);
  if (view.startsWith('site:')) return x.sites.includes(view.slice(5));
  if (view.startsWith('folder:')) return topFolder(x) === view.slice(7);
  return true;
}

/** Small icons only show up in "Small Icons" and in categories the user put them in. */
const shows = (x, view) => !x.isIcon || view === 'f:icons' || view.startsWith('cat:');

export function viewCount(items, view) {
  let n = 0;
  for (const x of items) if (shows(x, view) && inView(x, view)) n++;
  return n;
}

const collator = new Intl.Collator(lang === 'zh' ? 'zh-CN' : 'en', { numeric: true, sensitivity: 'base' });

const SORTS = {
  newest: (a, b) => b.addedTime - a.addedTime,
  oldest: (a, b) => a.addedTime - b.addedTime,
  name: (a, b) => collator.compare(a.name, b.name),
  largest: (a, b) => b.size - a.size,
};

/**
 * Xiaohongshu ("小红书") saves a post's pictures as `_1_title.jpg`, `_2_title.jpg`, … or
 * `title_1_xxx.jpg`. Such files are shown together as one group automatically.
 * 小红书把一篇笔记的图保存为 `_1_标题.jpg`、`_2_标题.jpg`… 或 `标题_1_xxx.jpg`，自动合成一组。
 */
export function autoGroup(name) {
  let m = name.match(/^_(\d+)_(.+)\.[^.]+$/);
  if (m) {
    const stem = m[2];
    return { key: `a:p:${stem}`, name: stem.replace(/_(来自小红书网页版|來自小紅書網頁版)$/, '').replace(/[_-]+/g, ' ').trim() || stem };
  }
  m = name.match(/^(.+?)_(\d+)_(.+?)(_来自小红书网页版)?\.[^.]+$/);
  if (m) return { key: `a:s:${m[1]}|${m[3]}${m[4] || ''}`, name: m[1].replace(/[_-]+/g, ' ').trim() || m[1] };
  return null;
}

/** All groups that have at least two pictures present: manual ones first, then automatic ones. */
export function allGroups(items) {
  const byPath = new Map(items.map(x => [x.path, x]));
  const taken = new Set();
  const groups = new Map();
  for (const g of data.groups) {
    const members = g.paths.map(p => byPath.get(p)).filter(x => x && !taken.has(x.path));
    if (members.length < 2) continue;
    members.forEach(x => taken.add(x.path));
    groups.set(`m:${g.id}`, { key: `m:${g.id}`, id: g.id, name: g.name, manual: true, items: members });
  }
  const auto = new Map();
  for (const x of items) {
    if (taken.has(x.path)) continue;
    const info = autoGroup(x.name);
    if (!info) continue;
    if (!auto.has(info.key)) auto.set(info.key, { key: info.key, name: info.name, manual: false, items: [] });
    auto.get(info.key).items.push(x);
  }
  for (const g of auto.values()) {
    if (g.items.length < 2) continue;
    g.items.sort((a, b) => collator.compare(a.name, b.name));
    groups.set(g.key, g);
  }
  return groups;
}

/**
 * The pictures for the current view, filtered and sorted.
 * @returns {{ items: object[], tiles: object[], sections: object[] }}
 *   items: every picture in order (what the viewer steps through)
 *   tiles: what the grid shows (a group folds into one tile, except inside the group's own view)
 *   sections: tiles split into date sections when sorted by date
 */
export function compute(all, { view, search, sort, hidden }) {
  const q = search.trim().toLocaleLowerCase();
  const groups = allGroups(all.filter(x => !hidden.has(x.path)));
  let items;
  if (view.startsWith('group:')) {
    items = [...(groups.get(view.slice(6))?.items || [])];
  } else {
    items = all.filter(x => !hidden.has(x.path) && shows(x, view) && inView(x, view));
  }
  if (q) items = items.filter(x => `${x.name} ${x.folder}`.toLocaleLowerCase().includes(q));
  if (!view.startsWith('group:') || sort !== 'newest') items.sort(SORTS[sort] || SORTS.newest);

  let tiles;
  if (view.startsWith('group:')) {
    tiles = items.map(x => ({ kind: 'image', key: x.path, item: x }));
  } else {
    const groupOf = new Map();
    for (const g of groups.values()) for (const x of g.items) groupOf.set(x.path, g);
    const shown = new Set(items.map(x => x.path));
    const seen = new Set();
    tiles = [];
    for (const x of items) {
      const g = groupOf.get(x.path);
      const members = g ? g.items.filter(m => shown.has(m.path)) : [];
      if (!g || members.length < 2) {
        tiles.push({ kind: 'image', key: x.path, item: x });
      } else if (!seen.has(g.key)) {
        seen.add(g.key);
        tiles.push({ kind: 'group', key: g.key, group: g, items: members, item: members[0] });
      }
    }
    // The viewer follows the grid: a folded group's pictures come right where its tile is.
    // 大图查看的顺序跟网格一致：折叠的组在它所在的位置依次展开。
    items = tiles.flatMap(tile => (tile.kind === 'group' ? tile.items : [tile.item]));
  }
  const byDate = sort === 'newest' || sort === 'oldest';
  return { items, tiles, sections: byDate ? dateSections(tiles) : [{ title: '', tiles }], groups };
}

function dateSections(tiles) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const label = time => {
    if (time >= today) return t('date.today');
    if (time >= today - DAY) return t('date.yesterday');
    if (time >= today - 6 * DAY) return t('date.thisWeek');
    const d = new Date(time);
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long' }).format(d);
  };
  const sections = [];
  for (const tile of tiles) {
    const title = label(tile.item.addedTime);
    if (!sections.length || sections.at(-1).title !== title) sections.push({ title, tiles: [] });
    sections.at(-1).tiles.push(tile);
  }
  return sections;
}

export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function formatDate(time) {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
}
