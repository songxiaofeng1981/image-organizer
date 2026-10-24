#!/usr/bin/env python3
"""Talk to the helper the way Chrome does and check the answers / 像 Chrome 一样和助手通信并检查结果.

Usage / 用法:
    bash helper/build.sh
    python3 dev/make_samples.py /tmp/io-samples
    python3 dev/protocol_test.py /tmp/io-samples

Works on a copy-free sample folder only; it moves one file to the Trash at the end.
只在示例文件夹上运行；最后会把其中一个文件移到废纸篓。
"""
import base64
import json
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "helper", "build", "ImageOrganizerHelper.app", "Contents", "MacOS", "image-organizer-helper")
ORIGIN = "chrome-extension://gjmkfcibnihdnoahklpfdjcjekangjhh/"


class Helper:
    def __init__(self, root):
        self.p = subprocess.Popen([BIN, ORIGIN, "--root", root], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.n = 0

    def ask(self, op, **kw):
        self.n += 1
        body = json.dumps({"id": str(self.n), "op": op, **kw}).encode()
        self.p.stdin.write(struct.pack("<I", len(body)) + body)
        self.p.stdin.flush()
        out, data = [], b""
        while True:
            size = struct.unpack("<I", self.p.stdout.read(4))[0]
            msg = json.loads(self.p.stdout.read(size))
            assert msg["id"] == str(self.n), msg
            if msg["type"] == "images":
                out += msg["items"]
            elif msg["type"] == "chunk":
                data += base64.b64decode(msg["data"])
            elif msg["type"] == "done":
                return out if op == "list" else (data, msg["mime"])
            else:
                return msg


def check(label, ok):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok:
        check.failed = True


def main(root):
    h = Helper(root)
    check("hello returns a version", h.ask("hello").get("version", "").startswith("2."))
    items = h.ask("list")
    paths = sorted(i["path"] for i in items)
    print("      listed:", paths)
    check("skips hidden, node_modules, symlinks, non-images",
          not any(p.startswith(".") or "node_modules" in p or p in ("link.png", "notes.txt") for p in paths))
    check("finds sub-folders", "Design/moodboard/texture.jpg" in paths)
    heic = next(i for i in items if i["ext"] == "heic")
    check("reads HEIC dimensions", (heic["width"], heic["height"]) == (480, 640))
    check("has added date", all(i["added"] for i in items))
    data, mime = h.ask("thumb", path=heic["path"], size=256)
    check("HEIC thumbnail is JPEG", mime == "image/jpeg" and data[:2] == b"\xff\xd8")
    data, mime = h.ask("full", path="scan.tiff")
    check("TIFF full view converted to JPEG", mime == "image/jpeg" and data[:2] == b"\xff\xd8")
    data, mime = h.ask("full", path="wallpaper.jpg")
    check("JPEG full view is the original bytes", data == open(os.path.join(root, "wallpaper.jpg"), "rb").read())
    for bad in ["../etc/passwd", "/etc/hosts", ".hidden.png", "link.png", "notes.txt", "node_modules/../wallpaper.jpg"]:
        check(f"refuses {bad!r}", h.ask("full", path=bad).get("type") == "error")
    target = "chair_2_reference.png"
    r = h.ask("trash", paths=[target, "../outside.png"])
    check("trash moves allowed file, refuses the other",
          r.get("trashed") == [target] and len(r.get("failed", [])) == 1 and not os.path.exists(os.path.join(root, target)))
    check("unknown op is an error", h.ask("format_disk").get("type") == "error")
    h.p.stdin.close()
    h.p.wait(timeout=5)
    rejected = subprocess.run([BIN, "chrome-extension://someoneelse/"], input=b"", capture_output=True)
    check("rejects other extensions", rejected.returncode == 2)
    sys.exit(1 if getattr(check, "failed", False) else 0)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/io-samples"))
