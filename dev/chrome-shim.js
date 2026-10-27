// Development only: stands in for the chrome.* APIs so the gallery runs in a normal tab.
// See dev/serve.py. / 仅供开发：代替 chrome.* 接口，让图库能在普通标签页运行。见 dev/serve.py。
(() => {
  // Like Chrome, every connectNative() call gives a new port. / 和 Chrome 一样，每次 connectNative() 返回新的端口。
  const connectNative = () => {
    const listeners = { message: [], disconnect: [] };
    let open = true;
    return {
      onMessage: { addListener: f => listeners.message.push(f) },
      onDisconnect: { addListener: f => listeners.disconnect.push(f) },
      async postMessage(request) {
        if (!open) throw new Error('Attempting to use a disconnected port object');
        const r = await fetch('/__native', { method: 'POST', body: JSON.stringify(request) });
        const messages = await r.json();
        if (!Array.isArray(messages)) {
          open = false;
          listeners.disconnect.forEach(f => f());
          return;
        }
        for (const m of messages) listeners.message.forEach(f => f(m));
      },
    };
  };
  const KEY = 'dev-chrome-storage';
  const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  // The toolbar popup works on "the current tab": here that is dev/sample-page.html in a hidden same-origin
  // frame, and executeScript runs the function in that frame.
  // 工具栏小窗口操作“当前标签页”：开发时是隐藏框架里的 dev/sample-page.html，executeScript 在框架里运行函数。
  const PAGE = '/__dev/page.html';
  let frame = null;
  const pageFrame = () =>
    (frame ||= new Promise(resolve => {
      const f = document.createElement('iframe');
      // Off screen rather than hidden, so the page is laid out like a real one. / 放在屏幕外而不是隐藏，让网页正常排版。
      f.style.cssText = 'position:absolute;left:-12000px;top:0;width:1200px;height:900px;border:0';
      f.src = PAGE;
      f.onload = () => resolve(f.contentWindow);
      document.documentElement.append(f);
    }));
  const tabs = {
    query: async () => [{ id: 1, url: location.origin + PAGE, title: 'Autumn kitchen ideas' }],
    create: async ({ url }) => open(url, '_blank'),
    update: async () => {},
  };
  const scripting = {
    async executeScript({ func, args = [] }) {
      const win = await pageFrame();
      return [{ result: await win.eval(`(${func})`)(...args) }];
    },
  };
  // The real manifest, read once (synchronously, like chrome.runtime.getManifest). / 真实的 manifest，同步读一次。
  let manifest = null;
  const getManifest = () => {
    if (!manifest) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/manifest.json', false);
      xhr.send();
      manifest = JSON.parse(xhr.responseText);
    }
    return manifest;
  };
  // Background-only APIs record what they are asked to do in window.__dev, so dev/background.html can check
  // the right-click menu, downloads and the toolbar badge. / 后台专用接口把调用记在 window.__dev 里，供检查。
  const dev = (window.__dev = { menus: [], downloads: [], badges: [], listeners: { installed: [], clicked: [] } });
  const event = list => ({ addListener: f => list.push(f) });
  const contextMenus = {
    create: item => dev.menus.push(item),
    removeAll: async () => (dev.menus.length = 0),
    onClicked: event(dev.listeners.clicked),
  };
  const downloads = {
    async download(options) {
      dev.downloads.push({ filename: options.filename, url: options.url.slice(0, 40), conflictAction: options.conflictAction });
      return dev.downloads.length;
    },
  };
  const action = {
    setBadgeText: o => dev.badges.push(o.text),
    setBadgeBackgroundColor: () => {},
    setTitle: o => (dev.title = o.title),
  };
  window.chrome = {
    tabs,
    scripting,
    contextMenus,
    downloads,
    action,
    runtime: {
      lastError: null,
      connectNative,
      getURL: p => `/${p}`,
      getContexts: async () => [],
      getManifest,
      sendMessage: async () => {},
      onInstalled: event(dev.listeners.installed),
      onStartup: event([]),
    },
    i18n: { getUILanguage: () => navigator.language, getMessage: key => key },
    storage: {
      onChanged: event([]),
      local: {
        async get(keys) {
          const all = read();
          return Object.fromEntries([].concat(keys).filter(k => k in all).map(k => [k, all[k]]));
        },
        async set(obj) {
          localStorage.setItem(KEY, JSON.stringify({ ...read(), ...obj }));
        },
      },
    },
  };
})();

// ?demo=select | viewer | dark-viewer puts the page in a state for README screenshots.
// ?demo=select | viewer 用于生成 README 截图。
(() => {
  const demo = new URLSearchParams(location.search).get('demo');
  if (!demo) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  addEventListener('load', async () => {
    await wait(1500);
    const tiles = [...document.querySelectorAll('.tile')];
    if (demo === 'select') {
      for (const i of [1, 2, 6]) tiles[i]?.querySelector('.check').click();
      await wait(100);
      document.querySelector('#selCategory').click();
    }
    if (demo === 'viewer') {
      tiles[0]?.click();
      await wait(600);
      document.querySelector('#viewer').classList.remove('idle');
      document.querySelector('[data-v="info"]').click();
      setInterval(() => document.querySelector('#viewer').classList.remove('idle'), 200);
    }
  });
})();
