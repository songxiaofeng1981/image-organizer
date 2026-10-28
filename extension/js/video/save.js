// Saving a video from the page into a category of the picture library: fetched inside the page (fetch.js), then
// passed to the helper piece by piece (videoBegin → videoChunk … → videoFinish, helper/VideoSave.swift).
// Separate from picture saving (../saver.js); both share only the page names (../page.js) and the helper bridge.
// 把网页上的视频存进图片库的分类：先在网页里取数据（fetch.js），再一块一块交给本机助手
// （videoBegin → videoChunk … → videoFinish，见 helper/VideoSave.swift）。和图片保存（../saver.js）分开，
// 只共用网页名字（../page.js）和与助手的通信。

import { call, versionAtLeast } from '../host.js';
import { folderOf, finderTag } from '../store.js';
import { commentFor } from '../page.js';
import { findVideos } from './find.js';
import { videoOpen, videoPiece, videoClose } from './fetch.js';

export const MIN_VIDEO_HELPER_VERSION = '2.5.0';
const PIECE = 4 * 1024 * 1024; // 4 MB of video per message (about 5.3 MB as base64) / 每条消息 4 MB 视频

/** Whether the installed helper can take videos. / 已安装的本机助手能否接收视频。 */
export async function helperTakesVideos() {
  try {
    return versionAtLeast((await call('hello')).version, MIN_VIDEO_HELPER_VERSION);
  } catch {
    return false;
  }
}

/** The videos on the page (see find.js). / 网页上的视频。 */
export async function videosOn(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: findVideos });
  return result || [];
}

const inPage = async (tabId, func, ...args) => (await chrome.scripting.executeScript({ target: { tabId }, func, args }))[0]?.result;

/**
 * Saves one video. `progress(fraction)` is called as pieces arrive. Returns the helper's reply ({ path, duplicate }).
 * 保存一个视频。每传完一块调用 progress(比例)。返回助手的回复。
 */
export async function saveVideo(tabId, video, name, category, page, progress = () => {}) {
  const opened = await inPage(tabId, videoOpen, video.url);
  if (!opened?.size) throw new Error(opened?.error || 'fetch_failed');
  let token = null;
  try {
    ({ token } = await call('videoBegin', { size: opened.size }));
    for (let at = 0; at < opened.size; at += PIECE) {
      const piece = await inPage(tabId, videoPiece, video.url, at, Math.min(at + PIECE, opened.size));
      if (!piece?.data) throw new Error(piece?.error || 'fetch_failed');
      await call('videoChunk', { token, offset: at, data: piece.data });
      progress(Math.min(1, (at + PIECE) / opened.size));
    }
    const reply = await call('videoFinish', {
      token,
      name,
      folder: folderOf(category.name),
      tag: finderTag(category),
      comment: commentFor(page),
      from: [video.url, page.url],
    });
    token = null;
    return reply;
  } finally {
    if (token) call('videoCancel', { token }).catch(() => {});
    inPage(tabId, videoClose, video.url).catch(() => {});
  }
}
