// Loads thumbnails and full-size pictures from the helper and keeps them as blob URLs.
// Thumbnails are requested newest-first, so the tiles just scrolled into view load before older requests.
// 从助手读取缩略图和大图，保存为 blob URL。缩略图请求“后到先做”，刚滚进屏幕的先加载。

import { host } from './host.js';

const THUMB_SIZE = 480;
const PARALLEL = 6;
const FULL_KEEP = 10;

const thumbs = new Map(); // path -> url
const thumbWaiters = new Map(); // path -> [ {resolve, reject} ]
const queue = []; // [{ path, wanted }]
let running = 0;

export function cachedThumb(path) {
  return thumbs.get(path) || null;
}

/**
 * @param {string} path
 * @param {() => boolean} wanted  checked right before the request is sent; return false to skip it
 */
export function thumb(path, wanted = () => true) {
  if (thumbs.has(path)) return Promise.resolve(thumbs.get(path));
  return new Promise((resolve, reject) => {
    const waiters = thumbWaiters.get(path);
    if (waiters) {
      waiters.push({ resolve, reject });
      queue.push({ path, wanted });
    } else {
      thumbWaiters.set(path, [{ resolve, reject }]);
      queue.push({ path, wanted });
    }
    // Run after the caller has put its element on the page, so wanted() sees it.
    // 等调用方把元素放进页面后再执行，这样 wanted() 才能判断准确。
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        pump();
      });
    }
  });
}

let scheduled = false;

function pump() {
  while (running < PARALLEL && queue.length) {
    const job = queue.pop();
    if (thumbs.has(job.path) || !thumbWaiters.has(job.path)) continue;
    if (!job.wanted()) {
      // Nobody needs it now. Drop the waiters; a tile that comes back will ask again.
      // 现在没人需要，丢掉；图块再出现时会重新请求。
      if (!queue.some(q => q.path === job.path)) {
        thumbWaiters.get(job.path)?.forEach(w => w.reject(new Error('skipped')));
        thumbWaiters.delete(job.path);
      }
      continue;
    }
    running++;
    const waiters = thumbWaiters.get(job.path);
    thumbWaiters.delete(job.path);
    host.thumb(job.path, Math.round(THUMB_SIZE * Math.min(2, devicePixelRatio || 1) / 1.5))
      .then(blob => {
        const url = URL.createObjectURL(blob);
        thumbs.set(job.path, url);
        waiters.forEach(w => w.resolve(url));
      })
      .catch(e => waiters.forEach(w => w.reject(e)))
      .finally(() => {
        running--;
        pump();
      });
  }
}

const fulls = new Map(); // path -> Promise<url>, oldest first

export function full(path) {
  if (fulls.has(path)) {
    const p = fulls.get(path);
    fulls.delete(path);
    fulls.set(path, p);
    return p;
  }
  const p = host.full(path).then(blob => URL.createObjectURL(blob));
  p.catch(() => fulls.delete(path));
  fulls.set(path, p);
  while (fulls.size > FULL_KEEP) {
    const [oldest, op] = fulls.entries().next().value;
    fulls.delete(oldest);
    op.then(url => URL.revokeObjectURL(url), () => {});
  }
  return p;
}

export function forget(paths) {
  for (const p of paths) {
    if (thumbs.has(p)) URL.revokeObjectURL(thumbs.get(p));
    thumbs.delete(p);
    fulls.get(p)?.then(url => URL.revokeObjectURL(url), () => {});
    fulls.delete(p);
  }
}

/** Keeps the cached pictures of files that moved: [{ from, to }]. / 文件移动后保留已缓存的图片。 */
export function rename(pairs) {
  for (const { from, to } of pairs) {
    if (thumbs.has(from)) thumbs.set(to, thumbs.get(from));
    thumbs.delete(from);
    if (fulls.has(from)) fulls.set(to, fulls.get(from));
    fulls.delete(from);
  }
}

export function forgetAll() {
  forget([...new Set([...thumbs.keys(), ...fulls.keys()])]);
}
