#!/usr/bin/env python3
"""Run the gallery in any browser tab, talking to the real helper / 在普通浏览器标签页里运行图库，连接真正的本机助手.

Usage / 用法:
    bash helper/build.sh
    python3 dev/make_samples.py /tmp/io-samples
    python3 dev/serve.py /tmp/io-samples          # then open http://127.0.0.1:8770/gallery.html
                                                  # choose e.g. /tmp/io-samples-library as the picture library

The page is served from extension/ with dev/chrome-shim.js injected. The shim stands in for
chrome.runtime.connectNative (forwarded to the helper over HTTP) and chrome.storage (kept in
localStorage). Point it at a sample folder, not your real Downloads: Trash really moves files.
页面来自 extension/，并注入 dev/chrome-shim.js：它代替 chrome.runtime.connectNative（经 HTTP 转发给助手）
和 chrome.storage（存在 localStorage）。请指向示例文件夹而不是真正的“下载”：移到废纸篓是真的会移动文件。
"""
import json
import mimetypes
import os
import urllib.parse
import queue
import struct
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(HERE, "..", "extension")
BIN = os.path.join(HERE, "..", "helper", "build", "ImageOrganizerHelper.app", "Contents", "MacOS", "image-organizer-helper")
ORIGIN = "chrome-extension://gjmkfcibnihdnoahklpfdjcjekangjhh/"
CSP = json.load(open(os.path.join(EXT, "manifest.json")))["content_security_policy"]["extension_pages"]


class Bridge:
    def __init__(self, root, config):
        self.p = subprocess.Popen([BIN, ORIGIN, "--root", root, "--config", config], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.lock = threading.Lock()
        self.waiting = {}
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        while True:
            head = self.p.stdout.read(4)
            if len(head) < 4:
                return
            msg = json.loads(self.p.stdout.read(struct.unpack("<I", head)[0]))
            q = self.waiting.get(msg.get("id"))
            if q:
                q.put(msg)

    def ask(self, request):
        # Page ids restart at 1 on every reload, so use our own unique id with the helper.
        # 页面每次刷新 id 都从 1 开始，所以和助手通信时换成自己的唯一 id。
        page_id = request["id"]
        q = queue.Queue()
        with self.lock:
            self.counter = getattr(self, "counter", 0) + 1
            own = f"dev-{self.counter}"
            self.waiting[own] = q
            body = json.dumps({**request, "id": own}).encode()
            self.p.stdin.write(struct.pack("<I", len(body)) + body)
            self.p.stdin.flush()
        out = []
        try:
            while True:
                msg = q.get(timeout=60)
                out.append({**msg, "id": page_id})
                if msg["type"] in ("done", "result", "error"):
                    return out
        finally:
            self.waiting.pop(own, None)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=EXT, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        # Always serve the files as they are on disk while developing. / 开发时总是返回磁盘上的最新文件。
        self.send_header("Cache-Control", "no-store")
        # Same Content Security Policy as the extension, so violations show up here too.
        # 使用和插件相同的内容安全策略，违规在这里也能看到。
        # (The sample web page stands for someone else's site, so it does not get the extension's policy.)
        # （示例网页代表别人的网站，不套用插件的策略。）
        if not self.path.startswith(("/__dev/page", "/__dev/sample-page", "/__samples/")):
            self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/gallery.html":
            html = open(os.path.join(EXT, "gallery.html"), encoding="utf-8").read()
            html = html.replace('<script type="module"', '<script src="/__dev/chrome-shim.js"></script>\n  <script type="module"', 1)
            return self.reply(200, "text/html; charset=utf-8", html.encode())
        if self.path.split("?")[0] == "/popup.html":
            html = open(os.path.join(EXT, "popup.html"), encoding="utf-8").read()
            html = html.replace('<script type="module"', '<script src="/__dev/chrome-shim.js"></script>\n  <script type="module"', 1)
            return self.reply(200, "text/html; charset=utf-8", html.encode())
        if self.path == "/__dev/chrome-shim.js":
            return self.reply(200, "text/javascript", open(os.path.join(HERE, "chrome-shim.js"), "rb").read())
        # A sample web page for the toolbar popup, with pictures from the sample folder.
        # 给工具栏小窗口用的示例网页，图片来自示例文件夹。
        if self.path in ("/__dev/page.html", "/__dev/sample-page.css"):
            name = "sample-page.html" if self.path.endswith(".html") else "sample-page.css"
            kind = "text/html; charset=utf-8" if name.endswith(".html") else "text/css"
            return self.reply(200, kind, open(os.path.join(HERE, name), "rb").read())
        if self.path.startswith("/__samples/"):
            rel = urllib.parse.unquote(self.path[len("/__samples/"):].split("?")[0])
            full = os.path.realpath(os.path.join(self.server.root, rel))
            if not full.startswith(os.path.realpath(self.server.root) + os.sep) or not os.path.isfile(full):
                return self.reply(404, "text/plain", b"not found")
            return self.reply(200, mimetypes.guess_type(full)[0] or "application/octet-stream", open(full, "rb").read())
        return super().do_GET()

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        try:
            body = json.dumps(self.server.bridge.ask(request)).encode()
            self.reply(200, "application/json", body)
        except Exception as e:  # noqa: BLE001
            self.reply(500, "application/json", json.dumps({"error": str(e)}).encode())

    def reply(self, code, kind, body):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/io-samples")
    port = int(os.environ.get("PORT", "8770"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    # The picture library setting is kept next to the sample folder, never in your real settings.
    # 图片库设置保存在示例文件夹旁边，不会改到你真正的设置。
    config = root.rstrip("/") + "-config"
    server.root = root
    server.bridge = Bridge(root, config)
    print(f"Serving {root} (settings in {config})\nOpen http://127.0.0.1:{port}/gallery.html  (add ?lang=zh or ?lang=en)")
    server.serve_forever()


if __name__ == "__main__":
    main()
