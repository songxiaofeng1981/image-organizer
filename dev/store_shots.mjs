#!/usr/bin/env node
// Chrome Web Store images: 1280×800 screenshots of the gallery (sample files) and of the install guide, in Chinese
// and English, plus the 440×280 promo tile. Uses a throwaway headless Chrome profile; your own Chrome is not touched.
// 商店图片：图库（示例文件）和安装演示的 1280×800 截图，中英文各一套，加 440×280 小宣传图。用临时的无界面 Chrome，不碰你自己的 Chrome。
//
//   bash helper/build.sh && python3 dev/make_samples.py /tmp/io-samples
//   python3 dev/serve.py /tmp/io-samples &                 # gallery on :8770
//   (cd docs && python3 -m http.server 8790 --bind 127.0.0.1 &)   # guide on :8790
//   node dev/store_shots.mjs                                # → dist/store/assets/
//
// It sets the sample picture library to /tmp/io-samples-library and files a few samples into the first categories.
// 它会把示例图片库设为 /tmp/io-samples-library，并把几张示例归进前几个分类。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist/store/assets');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GALLERY = 'http://127.0.0.1:8770/gallery.html';
const GUIDE = 'http://127.0.0.1:8790/guide/';
const LIB = '/tmp/io-samples-library';
const PORT = 9341;
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'io-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return session(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

async function session(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let n = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++n;
    waiting.set(id, m => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, js, close: () => ws.close() };
}

const s = await connect();
const size = (width, height) => s.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
const go = async url => { await s.send('Page.navigate', { url }); await sleep(1200); };
const until = async (expr, ms = 8000) => {
  for (let t = 0; t < ms; t += 200) { if (await s.js(`return !!(${expr})`)) return; await sleep(200); }
  throw new Error(`timed out: ${expr}`);
};
const shot = async name => {
  const { data } = await s.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log('wrote', name);
};
const key = k => s.js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); return 1`);

await s.send('Page.enable');
await size(1280, 800);

for (const lang of ['zh', 'en']) {
  // Fresh page storage, so the default category names are in this language. / 清空页面存储，默认分类名用这个语言。
  await go(`${GALLERY}?lang=${lang}`);
  await s.js('localStorage.clear(); return 1');
  await go(`${GALLERY}?lang=${lang}`);
  await until("document.querySelectorAll('.tile').length > 5");
  const cats = await s.js("return [...document.querySelectorAll('.side-item[data-view^=\"cat:\"] .side-label')].map(x => x.textContent)");
  // Library folders named after this language's categories. / 图片库文件夹按这个语言的分类命名。
  for (const [i, name] of cats.entries()) {
    const other = lang === 'zh' ? ['Family', 'Work', 'Reference'][i] : ['家庭', '工作', '参考素材'][i];
    if (other && existsSync(join(LIB, other)) && !existsSync(join(LIB, name))) renameSync(join(LIB, other), join(LIB, name));
  }
  await go(`${GALLERY}?lang=${lang}`);
  await until("document.querySelectorAll('.tile').length > 5");
  await sleep(1500);
  await shot(`screenshot-gallery-${lang}.png`);

  // A picture in the viewer with its info panel. / 大图和信息面板。
  await s.js("[...document.querySelectorAll('.tile')].find(t => /IMG_6078|wallpaper|kyoto/.test(t.getAttribute('aria-label'))).click(); return 1");
  await sleep(1500);
  await key('i');
  await sleep(800);
  await shot(`screenshot-viewer-${lang}.png`);
  await key('i');
  await key('Escape');
  await sleep(500);

  // Only videos. / 只看视频。
  await s.js("const k = document.querySelector('#kind'); k.value = 'videos'; k.dispatchEvent(new Event('change')); return 1");
  await sleep(1000);
  await shot(`screenshot-videos-${lang}.png`);
  await s.js("const k = document.querySelector('#kind'); k.value = 'all'; k.dispatchEvent(new Event('change')); return 1");

  // The install guide at the drag step. / 安装演示的拖动步骤。
  await go(`${GUIDE}?lang=${lang}&step=10`);
  await sleep(800);
  await s.js("document.querySelector('#play').click(); document.querySelector('#play').click(); GUIDE.go(9, 2300); return 1");
  await sleep(500);
  await shot(`screenshot-guide-${lang}.png`);
}

// Promo tile 440×280. / 小宣传图。
const icon = readFileSync(join(ROOT, 'extension/icons/icon128.png')).toString('base64');
const tile = (title, line) => `<!doctype html><meta charset="utf-8"><body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;
  font-family:-apple-system,'PingFang SC',sans-serif;background:linear-gradient(135deg,#eaf3ff,#f6eefe 55%,#fff1e8)">
  <img src="data:image/png;base64,${icon}" width="104" height="104" style="border-radius:24px;box-shadow:0 10px 30px rgba(0,60,140,.18)">
  <div><div style="font-size:34px;font-weight:700;color:#1d1d1f">${title}</div><div style="font-size:16px;color:#4a4a4f;margin-top:8px;line-height:1.45">${line}</div></div></body>`;
await size(440, 280);
for (const [lang, title, line] of [['zh', '图片整理', '把“下载”里的图片和视频<br>一键归进你的图片库'], ['en', 'Image Organizer', 'File the pictures and videos<br>in Downloads with one key']]) {
  await go(`data:text/html;base64,${Buffer.from(tile(title, line)).toString('base64')}`);
  await shot(`promo-440x280-${lang}.png`);
}

s.close();
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });
