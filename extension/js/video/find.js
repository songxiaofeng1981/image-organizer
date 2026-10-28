// Finding the video on the page the user is looking at. Runs inside the page, in the page's own world
// (chrome.scripting world "MAIN"), because the addresses are in the page's own data, not in the <video> tag:
// both sites play videos from blob: addresses (pieces), but describe the whole file in their data.
//   Xiaohongshu: window.__INITIAL_STATE__ → the open note's video.media.stream (several sizes and codecs).
//   X: the data behind each video player ("variants": several MP4 sizes and one stream playlist).
// Self-contained, read-only. Only what the page already has; nothing is rewritten or guessed.
// 找出用户正在看的网页上的视频。在网页自己的环境里运行（world "MAIN"），因为地址在网页自己的数据里，而不在 <video> 标签上：
// 两个网站都用 blob: 地址分段播放，但数据里写着完整文件。小红书：__INITIAL_STATE__ 里打开的笔记的 video.media.stream；
// X：每个视频播放器背后的数据（variants：几种尺寸的 MP4 和一个分段播放列表）。只读，只用网页已有的内容，不改写、不猜测网址。

/** Returns [{ url, width, height, size?, duration?, poster?, site }], the largest MP4 of each video. / 每个视频取最大的 MP4。 */
export function findVideos() {
  const out = [];
  const add = v => {
    // Xiaohongshu gives http addresses; the page itself fetches them like that. / 小红书给的是 http 地址，网页自己也这样取。
    if (v.url && /^https?:/.test(v.url) && !out.some(x => x.url === v.url)) out.push(v);
  };
  const area = v => (v.width || 0) * (v.height || 0);

  // Xiaohongshu: the note that is open (its id is the last part of the address). / 小红书：当前打开的笔记。
  if (/(^|\.)xiaohongshu\.com$/.test(location.hostname)) {
    const id = location.pathname.split('/').filter(Boolean).pop();
    const map = window.__INITIAL_STATE__?.note?.noteDetailMap;
    const box = map && (map[id] || map._value?.[id] || map.value?.[id]);
    const note = box?.note || box?._value?.note;
    const stream = note?.video?.media?.stream || {};
    // The codec names in this data are codes, so they are not relied on: the largest picture wins, and at the same
    // size the larger file (the more widely playable codec, H.264). / 编码名字是代号，不依赖它：取分辨率最高的；
    // 分辨率相同时取文件更大的（兼容性更好的 H.264）。
    const best = Object.values(stream).flat().filter(x => x?.masterUrl).sort((a, b) => area(b) - area(a) || (b.size || 0) - (a.size || 0))[0];
    if (best) {
      add({
        url: best.masterUrl,
        width: best.width,
        height: best.height,
        size: best.size,
        duration: note.video?.capa?.duration,
        poster: note.imageList?.[0]?.urlDefault || '',
        site: 'xiaohongshu',
      });
    }
  }

  // X: each video player on the page; a post that is open first. / X：页面上的每个视频播放器；打开的帖子优先。
  if (/(^|\.)(x|twitter)\.com$/.test(location.hostname)) {
    const players = [...document.querySelectorAll('[data-testid="videoPlayer"]')];
    const open = document.querySelector('[role="dialog"] [data-testid="videoPlayer"], article[tabindex="-1"] [data-testid="videoPlayer"]');
    if (open) players.unshift(open);
    for (const player of players) {
      const key = Object.keys(player).find(k => k.startsWith('__reactFiber$'));
      let fiber = key && player[key];
      let info = null;
      const seen = new WeakSet();
      const search = (o, depth) => {
        if (!o || typeof o !== 'object' || depth > 6 || seen.has(o)) return null;
        seen.add(o);
        if (Array.isArray(o.variants) && o.variants.some(v => v?.url)) return o;
        for (const k of Object.keys(o)) {
          if (k.startsWith('_') || k === 'children') continue;
          const found = search(o[k], depth + 1);
          if (found) return found;
        }
        return null;
      };
      for (let up = 0; fiber && up < 60 && !info; up++, fiber = fiber.return) info = search(fiber.memoizedProps, 0);
      const mp4 = (info?.variants || []).filter(v => /mp4/.test(v.content_type || v.contentType || '')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (!mp4) continue;
      const [, w, h] = /\/(\d+)x(\d+)\//.exec(mp4.url) || [];
      add({
        url: mp4.url,
        width: +w || 0,
        height: +h || 0,
        duration: info.duration_millis ? Math.round(info.duration_millis / 1000) : undefined,
        poster: player.querySelector('video')?.poster || '',
        site: 'x',
      });
    }
  }
  return out;
}
