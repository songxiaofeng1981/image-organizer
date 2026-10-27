// What the user decides is kept in chrome.storage.local: categories (name, color, order), manual groups
// and view preferences. A picture in the picture library belongs to the category named like its folder;
// `assign` only holds pictures still in Downloads that were categorized before version 2.3.
// 用户的整理结果保存在 chrome.storage.local：分类（名称、颜色、顺序）、手动组、显示偏好。
// 图片库里的图属于和它所在文件夹同名的分类；`assign` 只保存 2.3 之前归过类、但还在“下载”里的图。

import { t } from './i18n.js';

export const KEY = 'io:v2';
// Keys used by version 1.x of the extension. Read once to migrate, then left alone.
// 1.x 版本使用的键。只在迁移时读取一次，之后不再改动。
const OLD_CATEGORIES = 'image-organizer:.image-categories.json';
const OLD_GROUPS = 'image-organizer:.image-groups.json';

export const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE', '#FF2D55'];

export const DEFAULT_PREFS = { sort: 'newest', rowHeight: 190, infoOpen: false, collapsed: [] };

export const data = {
  categories: [], // [{ id, name, color }]
  assign: {}, // { path: categoryId }
  groups: [], // [{ id, name, paths: [] }]
  prefs: { ...DEFAULT_PREFS },
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function defaults() {
  return {
    categories: t('defaultCategories').split('|').map((name, i) => ({ id: newId(), name, color: COLORS[[5, 3, 1][i] ?? i] })),
    assign: {},
    groups: [],
    prefs: { ...DEFAULT_PREFS },
  };
}

function migrate(oldCategories, oldGroups) {
  const result = defaults();
  const names = [...new Set(Object.values(oldCategories || {}))].filter(Boolean);
  if (names.length) {
    // Keep the 1.x names (they were Chinese) so the user's own categories look the same.
    // 保留 1.x 的分类名，用户看到的分类不变。
    const legacy = ['家庭照片', '截图', '参考素材'];
    const all = [...legacy, ...names.filter(n => !legacy.includes(n))];
    result.categories = all.map((name, i) => ({ id: newId(), name, color: COLORS[[5, 3, 1][i] ?? (i + 2) % COLORS.length] }));
    const idOf = Object.fromEntries(result.categories.map(c => [c.name, c.id]));
    for (const [path, name] of Object.entries(oldCategories)) if (idOf[name]) result.assign[path] = idOf[name];
  }
  if (Array.isArray(oldGroups)) {
    result.groups = oldGroups
      .filter(g => g && g.name && Array.isArray(g.paths))
      .map(g => ({ id: g.id || newId(), name: g.name, paths: g.paths }));
  }
  return result;
}

export async function load() {
  const got = await chrome.storage.local.get([KEY, OLD_CATEGORIES, OLD_GROUPS]);
  let saved = got[KEY];
  if (!saved) {
    saved = got[OLD_CATEGORIES] || got[OLD_GROUPS] ? migrate(got[OLD_CATEGORIES], got[OLD_GROUPS]) : defaults();
    await chrome.storage.local.set({ [KEY]: saved });
  }
  data.categories = saved.categories || [];
  data.assign = saved.assign || {};
  data.groups = saved.groups || [];
  data.prefs = { ...DEFAULT_PREFS, ...(saved.prefs || {}) };
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ [KEY]: { ...data } }), 150);
}

/** Returns a function that puts everything back the way it is now (used for Undo). */
export function snapshot() {
  const copy = JSON.parse(JSON.stringify({ categories: data.categories, assign: data.assign, groups: data.groups }));
  return () => {
    Object.assign(data, JSON.parse(JSON.stringify(copy)));
    save();
  };
}

export const LIB = 'lib:';
export const inLibrary = path => path.startsWith(LIB);

/** The library folder for a category name: one plain folder name. / 分类对应的图片库文件夹名。 */
export const folderOf = name => name.trim().replace(/[/:\\]/g, '-').replace(/^\.+/, '') || '_';

/** First folder inside the library, or '' for a picture outside it (or directly in it). */
export const libraryFolder = path => (inLibrary(path) && path.includes('/') ? path.slice(LIB.length).split('/')[0] : '');

// Finder tag colors: 0 none, 1 gray, 2 green, 3 purple, 4 blue, 5 yellow, 6 red, 7 orange.
// 访达标签颜色编号。
const FINDER = { '#FF3B30': 6, '#FF9500': 7, '#FFCC00': 5, '#34C759': 2, '#00C7BE': 4, '#007AFF': 4, '#AF52DE': 3, '#FF2D55': 6 };
export const finderTag = c => ({ name: c.name, color: FINDER[c.color] ?? 0 });

export function categoryOf(path) {
  if (inLibrary(path)) {
    const folder = libraryFolder(path);
    return folder ? data.categories.find(c => folderOf(c.name) === folder) || null : null;
  }
  return data.categories.find(c => c.id === data.assign[path]) || null;
}

export function assign(paths, categoryId) {
  for (const p of paths) {
    if (categoryId) data.assign[p] = categoryId;
    else delete data.assign[p];
  }
  save();
}

export function addCategory(name) {
  // One category per library folder: the same name gives back the existing one. / 一个图片库文件夹只对应一个分类：同名时返回已有的。
  const same = data.categories.find(c => folderOf(c.name) === folderOf(name));
  if (same) return same;
  const used = new Set(data.categories.map(c => c.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[data.categories.length % COLORS.length];
  const category = { id: newId(), name, color };
  data.categories.push(category);
  save();
  return category;
}

export function renameCategory(id, name) {
  const c = data.categories.find(x => x.id === id);
  if (c) c.name = name;
  save();
}

export function recolorCategory(id, color) {
  const c = data.categories.find(x => x.id === id);
  if (c) c.color = color;
  save();
}

export function removeCategory(id) {
  data.categories = data.categories.filter(c => c.id !== id);
  for (const [p, c] of Object.entries(data.assign)) if (c === id) delete data.assign[p];
  save();
}

/** A picture is in at most one manual group; making a new group takes pictures out of old ones. */
export function addGroup(name, paths) {
  const chosen = new Set(paths);
  data.groups = data.groups
    .map(g => ({ ...g, paths: g.paths.filter(p => !chosen.has(p)) }))
    .filter(g => g.paths.length >= 2);
  const group = { id: newId(), name, paths: [...chosen] };
  data.groups.push(group);
  save();
  return group;
}

export function renameGroup(id, name) {
  const g = data.groups.find(x => x.id === id);
  if (g) g.name = name;
  save();
}

export function removeGroup(id) {
  data.groups = data.groups.filter(g => g.id !== id);
  save();
}

/** Pictures that moved (into or inside the library): groups follow them, old Downloads categories are dropped. */
export function moved(pairs) {
  const to = new Map(pairs.map(m => [m.from, m.to]));
  for (const p of to.keys()) delete data.assign[p];
  data.groups = data.groups.map(g => ({ ...g, paths: g.paths.map(p => to.get(p) || p) }));
  save();
}

/** Forget pictures that are gone (moved to the Trash). */
export function forget(paths) {
  const gone = new Set(paths);
  for (const p of gone) delete data.assign[p];
  data.groups = data.groups
    .map(g => ({ ...g, paths: g.paths.filter(p => !gone.has(p)) }))
    .filter(g => g.paths.length >= 2);
  save();
}

export function setPref(key, value) {
  data.prefs[key] = value;
  save();
}

