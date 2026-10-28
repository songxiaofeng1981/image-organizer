// Fetching a video inside the page, in the extension's own isolated world there (not visible to the page), and
// handing it out in pieces, because one message cannot carry a whole video. Self-contained functions for
// chrome.scripting.executeScript; the fetched file waits in that world until videoClose.
// 在网页里取视频数据：在插件自己的隔离环境里（网页看不到），再分块交出，因为一条消息放不下整个视频。
// 供 chrome.scripting.executeScript 使用，每个函数自成一体；取到的文件留在那个环境里，直到 videoClose。

/** Fetches the whole video. Returns { size, type } or { error }. / 取整个视频。 */
export async function videoOpen(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `http_${res.status}` };
    const blob = await res.blob();
    (globalThis.__ioVideos ||= new Map()).set(url, blob);
    return { size: blob.size, type: blob.type };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  }
}

/** One piece of a fetched video, as base64. / 已取视频的一块（base64）。 */
export async function videoPiece(url, start, end) {
  const blob = globalThis.__ioVideos?.get(url);
  if (!blob) return { error: 'not_open' };
  const bytes = new Uint8Array(await blob.slice(start, end).arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { data: btoa(text) };
}

/** Lets go of a fetched video. / 释放已取的视频。 */
export function videoClose(url) {
  globalThis.__ioVideos?.delete(url);
  return true;
}
