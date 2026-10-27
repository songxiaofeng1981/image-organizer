// Functions that run inside the web page the user is looking at (chrome.scripting.executeScript).
// They must be self-contained: no imports, no outside variables. They only read the page; nothing is changed.
// 在用户正在看的网页里运行的函数（chrome.scripting.executeScript）。必须自成一体：不能引用外部变量。只读取网页，不修改。

/**
 * The pictures on the page, in page order: the largest candidate of each picture the page offers (srcset,
 * <picture> sources, CSS backgrounds, links to image files). When a post or note is open in a dialog
 * (Instagram, X, Xiaohongshu…), only the pictures in that dialog.
 * 网页上的图片，按页面顺序；每张取网页自己提供的最大尺寸。帖子或笔记以弹窗打开时，只取弹窗里的图片。
 */
export function collectImages() {
  const found = new Map();
  const abs = u => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const largest = srcset => {
    let best = null;
    let size = -1;
    for (const part of (srcset || '').split(/,\s+(?=\S)/)) {
      const [u, d = ''] = part.trim().split(/\s+/);
      if (!u) continue;
      const n = d.endsWith('w') ? parseFloat(d) : d.endsWith('x') ? parseFloat(d) * 1000 : 0;
      if (n > size) {
        size = n;
        best = u;
      }
    }
    return best;
  };
  // The same picture at two sizes has the same id-like file name on the same server (Pinterest 236x/… and
  // 1200x/…, X ?name=small and ?name=large): keep one, the larger. Short names such as "large.jpg" are not ids.
  // 同一张图的两个尺寸，在同一个服务器上文件名相同（像编号）：只留大的。"large.jpg" 这类短名字不算编号。
  const byName = new Map();
  let order = 0;
  const nameOf = url => {
    if (!url.startsWith('http')) return null;
    const { host, pathname } = new URL(url);
    const file = pathname.split('/').pop();
    return /^(?=.*\d)[\w-]{10,}$/.test(file.replace(/\.\w+$/, '')) ? `${host}/${file}` : null;
  };
  const add = (url, width, height, alt = '') => {
    url = url && abs(url);
    if (!url || !/^(https?:|data:image\/)/.test(url) || url.length > 4_000_000) return;
    const known = found.get(url);
    if (known) {
      known.width = Math.max(known.width, width || 0);
      known.height = Math.max(known.height, height || 0);
      return;
    }
    const entry = { url, width: width || 0, height: height || 0, alt: (alt || '').slice(0, 200), order: order++ };
    const name = nameOf(url);
    const twin = name && found.get(byName.get(name));
    if (twin) {
      // An unknown size (a link to the file) is usually the full-size one. / 尺寸未知（链接到文件）的通常是大图。
      const area = x => x.width * x.height || Infinity;
      if (area(entry) <= area(twin)) return;
      found.delete(twin.url);
      entry.order = twin.order;
      entry.alt ||= twin.alt;
    }
    if (name) byName.set(name, url);
    found.set(url, entry);
  };

  // An open post or note in a dialog: look only there. / 弹窗里打开的帖子或笔记：只看弹窗。
  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open], #noteContainer, .note-container')].filter(
    d => d.getBoundingClientRect().width > 300 && d.querySelector('img'),
  );
  const scope = dialogs.at(-1) || document;
  // X's photo viewer also shows the replies beside the photo: only the post's own photos.
  // X 的看大图界面旁边还有回复：只取帖子本身的图。
  const photos = [...scope.querySelectorAll('[data-testid="swipe-to-dismiss"]')];
  const roots = photos.length ? photos : [scope];
  const all = selector => roots.flatMap(root => [...root.querySelectorAll(selector)]);

  for (const img of all('img')) {
    const sources = [img.getAttribute('srcset'), ...[...(img.closest('picture')?.querySelectorAll('source') || [])].map(s => s.getAttribute('srcset'))];
    const best = sources.map(largest).find(Boolean);
    const shown = img.currentSrc || img.src || img.dataset.src || img.dataset.original;
    // The largest candidate's size is unknown until loaded; the shown size is a lower bound. / 最大候选的尺寸要加载后才知道，显示尺寸是下限。
    add(best || shown, img.naturalWidth, img.naturalHeight, img.alt);
  }
  for (const el of all('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) continue;
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(m[1], Math.round(rect.width), Math.round(rect.height));
  }
  for (const a of all('a[href]')) {
    if (/\.(jpe?g|png|gif|webp|avif|heic)(\?|#|$)/i.test(a.href)) add(a.href, 0, 0);
  }
  return { title: document.title, url: location.href, inDialog: scope !== document, images: [...found.values()].sort((a, b) => a.order - b.order) };
}

/**
 * The bytes of one picture, fetched from inside the page, so the request is the page's own (same referrer and
 * rules as when the page shows it). Returns { data: base64, type } or { error }.
 * 在网页里取一张图片的数据，请求和网页显示它时一样。返回 { data, type } 或 { error }。
 */
export async function fetchImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `http_${res.status}` };
    const blob = await res.blob();
    if (blob.size > 60 * 1024 * 1024) return { error: 'too_large' };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { data: btoa(text), type: blob.type };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  }
}
