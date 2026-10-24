// Client for the Mac helper, over Chrome Native Messaging.
// Every request carries an id; the helper answers with one or more messages with the same id:
//   images (list batches), chunk (base64 file data), done, result, error.
// See docs/DESIGN.md, "Message protocol".
// 与本机助手通信（Chrome Native Messaging）。每个请求带 id，助手用同一个 id 回复一条或多条消息。

export const HOST_NAME = 'com.songxiaofeng.imageorganizer';
export const MIN_HELPER_VERSION = '2.1.0';

let port = null;
let seq = 0;
const pending = new Map();

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message || 'disconnected';
    port = null;
    for (const [id, p] of pending) {
      pending.delete(id);
      p.reject(new HostError(reason));
    }
  });
  return port;
}

function onMessage(msg) {
  const p = pending.get(msg.id);
  if (!p) return;
  switch (msg.type) {
    case 'images':
      p.items.push(...msg.items);
      break;
    case 'chunk':
      p.chunks.push(Uint8Array.from(atob(msg.data), c => c.charCodeAt(0)));
      break;
    case 'done':
      pending.delete(msg.id);
      p.resolve(p.op === 'list' ? p.items : new Blob(p.chunks, { type: msg.mime }));
      break;
    case 'result':
      pending.delete(msg.id);
      p.resolve(msg);
      break;
    case 'error':
      pending.delete(msg.id);
      p.reject(new HostError(msg.error));
      break;
  }
}

export class HostError extends Error {
  /** True when Chrome could not start the helper at all (not installed or not registered). */
  get notInstalled() {
    return /not found|forbidden|native messaging host|disconnected|exited/i.test(this.message);
  }
  /** True when macOS refused access to Downloads. */
  get permissionDenied() {
    return /permission|not permitted|Code=257|Code=513|no_downloads/i.test(this.message);
  }
}

function request(op, details = {}) {
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    pending.set(id, { op, items: [], chunks: [], resolve, reject });
    try {
      connect().postMessage({ id, op, ...details });
    } catch (e) {
      pending.delete(id);
      reject(new HostError(e.message));
    }
  });
}

export const host = {
  hello: () => request('hello'),
  list: () => request('list'),
  thumb: (path, size) => request('thumb', { path, size }),
  full: path => request('full', { path }),
  trash: paths => request('trash', { paths }),
  reveal: path => request('reveal', { path }),
};

export function versionAtLeast(version, minimum) {
  const a = String(version).split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
