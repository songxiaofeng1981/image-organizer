// Finding the video on the page the user is looking at. Runs inside the page, in the page's own world
// (chrome.scripting world "MAIN"), because the addresses are in the page's own data, not in the <video> tag:
// the sites play videos from blob: addresses (pieces) or one size only, but describe every size in their data.
//   Xiaohongshu: window.__INITIAL_STATE__ → the open note's video.media.stream (several sizes and codecs).
//   X: the data behind each video player ("variants": several MP4 sizes and one stream playlist).
//   Douyin: the data behind each video player ("bitRateList": several MP4 sizes, H.264 and H.265).
// Self-contained, read-only. Only addresses the page already has; nothing is guessed.
// 找出用户正在看的网页上的视频。在网页自己的环境里运行（world "MAIN"），因为地址在网页自己的数据里，而不在 <video> 标签上：
// 这些网站用 blob: 地址分段播放，或只播一种尺寸，但数据里写着每种尺寸。小红书：__INITIAL_STATE__ 里打开的笔记的 video.media.stream；
// X：每个视频播放器背后的数据（variants：几种尺寸的 MP4 和一个分段播放列表）；
// 抖音：每个视频播放器背后的数据（bitRateList：几种尺寸的 MP4，H.264 和 H.265）。只读，只用网页已有的地址，不猜测网址。

/** Returns [{ url, width, height, size?, duration?, poster?, site }], the largest MP4 of each video. / 每个视频取最大的 MP4。 */
export function findVideos() {
  const out = [];
  const add = v => {
    // Xiaohongshu gives http addresses. On an https page Chrome plays them over https (it upgrades media), but a
    // fetch of http would be blocked as mixed content, so the address is upgraded the same way.
    // 小红书给的是 http 地址。https 网页上 Chrome 播放时会自动改用 https，但用 fetch 取 http 会被当作混合内容拦下，所以同样改成 https。
    if (location.protocol === 'https:' && /^http:/.test(v.url || '')) v.url = v.url.replace(/^http:/, 'https:');
    if (v.url && /^https:/.test(v.url) && !out.some(x => x.url === v.url)) out.push(v);
  };
  const area = v => (v.width || 0) * (v.height || 0);
  // The data behind a video player: up the React tree from `el`, the first props holding something `test` accepts.
  // 视频播放器背后的数据：从 el 沿 React 结构往上找，第一个含有 test 认可的内容的 props。
  const dataBehind = (el, test) => {
    while (el && !Object.keys(el).some(k => k.startsWith('__reactFiber$'))) el = el.parentElement;
    let fiber = el && el[Object.keys(el).find(k => k.startsWith('__reactFiber$'))];
    const seen = new WeakSet();
    const search = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 6 || seen.has(o)) return null;
      seen.add(o);
      if (test(o)) return o;
      for (const k of Object.keys(o)) {
        if (k.startsWith('_') || k === 'children') continue;
        const found = search(o[k], depth + 1);
        if (found) return found;
      }
      return null;
    };
    let info = null;
    for (let up = 0; fiber && up < 60 && !info; up++, fiber = fiber.return) info = search(fiber.memoizedProps, 0);
    return info;
  };

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
      const info = dataBehind(player, o => Array.isArray(o.variants) && o.variants.some(v => v?.url));
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

  // Douyin: each video player that is showing, the one playing first (a feed keeps empty players out of sight).
  // 抖音：每个显示着的视频播放器，正在播放的优先（推荐流里有看不见的空播放器）。
  if (/(^|\.)douyin\.com$/.test(location.hostname)) {
    const shown = v => v.getBoundingClientRect().height > 0;
    const videos = [...document.querySelectorAll('video')].filter(shown).sort((a, b) => a.paused - b.paused);
    for (const video of videos) {
      const info = dataBehind(video, o => Array.isArray(o.bitRateList) && o.bitRateList.length > 0);
      if (!info) continue;
      // Same rule as Xiaohongshu: the largest picture, and at the same size the larger file (H.264 rather than H.265).
      // 和小红书一样：取分辨率最高的；分辨率相同时取文件更大的（H.264 而不是 H.265）。
      const best = info.bitRateList
        .filter(b => b?.playAddr?.[0]?.src && (b.format || 'mp4') === 'mp4')
        .sort((a, b) => area(b) - area(a) || (b.dataSize || 0) - (a.dataSize || 0))[0];
      if (!best) continue;
      const src = best.playAddr[0].src;
      add({
        url: src.startsWith('//') ? `https:${src}` : src,
        width: best.width,
        height: best.height,
        size: best.dataSize,
        duration: info.duration ? Math.round(info.duration / 1000) : undefined,
        poster: info.coverUrlList?.[0] || (typeof info.cover === 'string' ? info.cover : ''),
        site: 'douyin',
      });
    }
  }
  return out;
}
