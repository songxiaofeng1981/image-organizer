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
  window.chrome = {
    runtime: { lastError: null, connectNative, getURL: p => `/${p}` },
    i18n: { getUILanguage: () => navigator.language },
    storage: {
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
