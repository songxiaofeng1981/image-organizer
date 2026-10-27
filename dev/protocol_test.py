#!/usr/bin/env python3
"""Talk to the helper the way Chrome does and check the answers / 像 Chrome 一样和助手通信并检查结果.

Usage / 用法:
    bash helper/build.sh
    python3 dev/make_samples.py /tmp/io-samples
    python3 dev/protocol_test.py /tmp/io-samples
    IO_TEST_LIBRARY=/Volumes/<drive>/io-test python3 dev/protocol_test.py /tmp/io-samples   # library on another drive / 图片库在另一块硬盘上

Works on a sample folder only: it files pictures into a picture library next to it (or IO_TEST_LIBRARY,
which must not exist yet and is removed afterwards) and moves a few files to the Trash.
只在示例文件夹上运行：会把图片归入旁边的测试图片库（或 IO_TEST_LIBRARY，须是还不存在的文件夹，测完删除），
并把几个文件移到废纸篓。
"""
import base64
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "helper", "build", "ImageOrganizerHelper.app", "Contents", "MacOS", "image-organizer-helper")
ORIGIN = "chrome-extension://gjmkfcibnihdnoahklpfdjcjekangjhh/"


class Helper:
    def __init__(self, root, config):
        self.p = subprocess.Popen([BIN, ORIGIN, "--root", root, "--config", config], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
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


def xattr(path, name):
    r = subprocess.run(["xattr", "-px", name, path], capture_output=True, text=True)
    return plistlib.loads(bytes.fromhex(r.stdout.replace("\n", "").replace(" ", ""))) if r.returncode == 0 else None


def library_tests(h, root, lib):
    check("no library set yet", h.ask("config", name="Library").get("available") is False and "library" not in h.ask("config"))
    check("filing without a library is refused", h.ask("file", items=[{"path": "wallpaper.jpg"}], folder="X").get("type") == "error")
    for bad in ["/", os.path.expanduser("~"), root, os.path.join(root, "inside"), os.path.dirname(root), "/System/Library", "relative/path"]:
        check(f"refuses library {bad!r}", h.ask("setLibrary", path=bad, name="Library").get("type") == "error")
    r = h.ask("setLibrary", path=lib, name="Library")
    check("sets the library (creating the folder)", r.get("available") is True and os.path.isdir(lib))
    lib = os.path.realpath(lib)

    # A picture with a download record, and an exact copy of it. / 一张有下载记录的图，以及它的完全相同的副本。
    src = os.path.join(root, "Design", "moodboard", "texture.jpg")
    shutil.copy(src, os.path.join(root, "copy-of-shot.jpg"))
    subprocess.run(["xattr", "-wx", "com.apple.metadata:kMDItemWhereFroms",
                    plistlib.dumps(["https://www.xiaohongshu.com/explore/1"], fmt=plistlib.FMT_BINARY).hex(), src], check=True)
    original = open(src, "rb").read()
    rel = "Design/moodboard/texture.jpg"
    r = h.ask("file", items=[{"path": rel, "comment": "From: xiaohongshu.com"}], folder="截图", tag={"name": "截图", "color": 6})
    dest = os.path.join(lib, "截图", os.path.basename(rel))
    check("file moves the picture into <library>/<folder>/", r.get("ok") and r["moved"][0]["to"] == "lib:截图/" + os.path.basename(rel)
          and os.path.exists(dest) and not os.path.exists(src))
    check("filed copy is identical", open(dest, "rb").read() == original)
    check("filed picture has the Finder tag", xattr(dest, "com.apple.metadata:_kMDItemUserTags") == ["截图\n6"])
    check("filed picture has the Finder comment", xattr(dest, "com.apple.metadata:kMDItemFinderComment") == "From: xiaohongshu.com")
    check("download record travels with it", xattr(dest, "com.apple.metadata:kMDItemWhereFroms") == ["https://www.xiaohongshu.com/explore/1"])
    index = json.load(open(os.path.join(lib, ".image-organizer.json")))["files"]
    entry = index.get("截图/" + os.path.basename(rel), {})
    check("index records where it came from", entry.get("originalPath") == rel and entry.get("from") == ["www.xiaohongshu.com"]
          and len(entry.get("sha256", "")) == 64 and entry.get("downloaded"))
    left = [f for f in os.listdir(os.path.join(lib, "截图")) if f.startswith(".io-partial")]
    check("no partial copies left behind", not left)

    r = h.ask("file", items=[{"path": "copy-of-shot.jpg"}], folder="Other", tag={"name": "Other", "color": 4})
    check("an exact copy is not filed twice (download goes to the Trash)",
          r["moved"][0].get("duplicate") is True and r["moved"][0]["to"] == "lib:截图/" + os.path.basename(rel)
          and not os.path.exists(os.path.join(root, "copy-of-shot.jpg")) and not os.path.exists(os.path.join(lib, "Other", "copy-of-shot.jpg")))

    shutil.copy(os.path.join(root, "wallpaper.jpg"), os.path.join(root, "Design", "wallpaper.jpg"))
    os.utime(os.path.join(root, "Design", "wallpaper.jpg"))
    with open(os.path.join(root, "Design", "wallpaper.jpg"), "ab") as f:
        f.write(b"\0")  # different content, same name / 内容不同、名字相同
    r = h.ask("file", items=[{"path": "wallpaper.jpg"}, {"path": "Design/wallpaper.jpg"}, {"path": "../outside.png"}], folder="Walls", tag={"name": "Walls", "color": 2})
    check("same name gets a number, bad path is refused",
          [m["to"] for m in r["moved"]] == ["lib:Walls/wallpaper.jpg", "lib:Walls/wallpaper 2.jpg"] and len(r["failed"]) == 1)
    for bad in ["../x", ".hidden", "a/b", "a:b", ""]:
        check(f"refuses folder {bad!r}", h.ask("file", items=[{"path": "scan.tiff"}], folder=bad).get("type") == "error")
    check("refuses lib:../ paths", h.ask("full", path="lib:../" + os.path.basename(root) + "/wallpaper.jpg").get("type") == "error")

    items = h.ask("list")
    in_lib = {i["path"]: i for i in items if i.get("library")}
    check("list includes library pictures", set(in_lib) == {"lib:截图/" + os.path.basename(rel), "lib:Walls/wallpaper.jpg", "lib:Walls/wallpaper 2.jpg"})
    shot = in_lib["lib:截图/" + os.path.basename(rel)]
    check("library picture keeps its download time and folder", shot["added"] == entry["downloaded"] and shot["folder"] == "截图" and shot.get("from"))
    data, mime = h.ask("thumb", path="lib:Walls/wallpaper.jpg", size=128)
    check("thumbnail of a library picture", mime == "image/jpeg" and data[:2] == b"\xff\xd8")

    r = h.ask("file", items=[{"path": "lib:Walls/wallpaper 2.jpg", "removeTag": "Walls"}], folder="截图", tag={"name": "截图", "color": 6})
    check("moves between library folders and swaps the tag", r["moved"][0]["to"] == "lib:截图/wallpaper 2.jpg"
          and xattr(os.path.join(lib, "截图", "wallpaper 2.jpg"), "com.apple.metadata:_kMDItemUserTags") == ["截图\n6"])

    r = h.ask("renameFolder", **{"from": "截图", "to": "Screens", "removeTag": "截图", "tag": {"name": "Screens", "color": 3}})
    moved_shot = os.path.join(lib, "Screens", os.path.basename(rel))
    index = json.load(open(os.path.join(lib, ".image-organizer.json")))["files"]
    check("renames a category folder, retags and rekeys the index", r.get("ok") and os.path.exists(moved_shot)
          and xattr(moved_shot, "com.apple.metadata:_kMDItemUserTags") == ["Screens\n3"] and "Screens/" + os.path.basename(rel) in index)
    check("rename onto an existing folder is refused", h.ask("renameFolder", **{"from": "Screens", "to": "Walls"}).get("type") == "error")

    r = h.ask("unfile", items=[{"path": "lib:Screens/" + os.path.basename(rel), "removeTag": "Screens"}])
    check("unfile puts it back where it was in Downloads", r.get("ok") and r["moved"][0]["to"] == rel and os.path.exists(src)
          and open(src, "rb").read() == original and not os.path.exists(moved_shot))
    check("unfile takes off the tag and comment", xattr(src, "com.apple.metadata:_kMDItemUserTags") is None
          and xattr(src, "com.apple.metadata:kMDItemFinderComment") is None)
    # Saving a picture taken from a web page (bytes from the extension). / 保存从网页取来的图片。
    png = open(os.path.join(root, "chart.png"), "rb").read()
    page = ["https://images.example.com/a/chart.png", "https://www.example.com/post/1"]
    r = h.ask("save", data=base64.b64encode(png).decode(), name="../My: chart?.webp", folder="Pins",
              tag={"name": "Pins", "color": 3}, comment="From: example.com", **{"from": page + ["javascript:alert(1)"]})
    saved = os.path.join(lib, r.get("path", "lib:")[4:])
    check("save writes the picture into the library, named by its real type", r.get("ok") and r["path"].startswith("lib:Pins/")
          and r["path"].endswith(".png") and open(saved, "rb").read() == png and "/" not in r["path"][9:] and ":" not in r["path"][4:])
    check("saved picture records where it came from (http only)", xattr(saved, "com.apple.metadata:kMDItemWhereFroms") == page)
    check("saved picture has tag and comment", xattr(saved, "com.apple.metadata:_kMDItemUserTags") == ["Pins\n3"]
          and xattr(saved, "com.apple.metadata:kMDItemFinderComment") == "From: example.com")
    index = json.load(open(os.path.join(lib, ".image-organizer.json")))["files"]
    check("saved picture is in the index", index.get(r["path"][4:], {}).get("page") == page[-1])
    r2 = h.ask("save", data=base64.b64encode(png).decode(), name="again.png", folder="Other")
    check("the same picture is not saved twice", r2.get("duplicate") is True and r2.get("path") == r["path"])
    check("save refuses data that is not a picture", h.ask("save", data=base64.b64encode(b"<html>hi</html>").decode(), name="x.png", folder="Pins").get("type") == "error")
    check("save refuses a bad folder", h.ask("save", data=base64.b64encode(png).decode(), name="x.png", folder="../x").get("type") == "error")
    r = h.ask("trash", paths=["lib:Walls/wallpaper.jpg"])
    index = json.load(open(os.path.join(lib, ".image-organizer.json")))["files"]
    check("trash works in the library and forgets the index entry", r.get("trashed") == ["lib:Walls/wallpaper.jpg"] and "Walls/wallpaper.jpg" not in index)


def main(root):
    config = root.rstrip("/") + "-config"
    shutil.rmtree(config, ignore_errors=True)
    h = Helper(root, config)
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
    lib = os.environ.get("IO_TEST_LIBRARY") or root.rstrip("/") + "-library"
    if os.environ.get("IO_TEST_LIBRARY") and os.path.exists(lib):
        sys.exit(f"{lib} already exists / 已存在")
    shutil.rmtree(root.rstrip("/") + "-library", ignore_errors=True)
    try:
        library_tests(h, root, lib)
    finally:
        if os.environ.get("IO_TEST_LIBRARY"):
            shutil.rmtree(lib, ignore_errors=True)
    h.p.stdin.close()
    h.p.wait(timeout=5)
    rejected = subprocess.run([BIN, "chrome-extension://someoneelse/"], input=b"", capture_output=True)
    check("rejects other extensions", rejected.returncode == 2)
    sys.exit(1 if getattr(check, "failed", False) else 0)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/io-samples"))
