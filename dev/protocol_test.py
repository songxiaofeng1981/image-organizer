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
STORE_ORIGIN = "chrome-extension://ojaefnnfnihdggfmhfnagcaamgjnilni/"  # Chrome Web Store version / 商店版


class Helper:
    def __init__(self, root, config, origin=ORIGIN):
        self.p = subprocess.Popen([BIN, origin, "--root", root, "--config", config], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
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


def video_tests(h, lib):
    """Saving a video from a web page, in pieces. / 分块保存网页上的视频。"""
    video = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" + os.urandom(3 * 1024 * 1024)
    piece = 1024 * 1024
    page = ["https://video.example.com/v/1.mp4", "https://www.example.com/note/1"]

    def send(data, name="My: clip?", folder="Clips"):
        token = h.ask("videoBegin", size=len(data)).get("token")
        for at in range(0, len(data), piece):
            r = h.ask("videoChunk", token=token, offset=at, data=base64.b64encode(data[at:at + piece]).decode())
            if r.get("type") == "error":
                return r
        return h.ask("videoFinish", token=token, name=name, folder=folder, tag={"name": "Clips", "color": 4},
                     comment="From: example.com", **{"from": page})

    r = send(video)
    saved = os.path.join(lib, r.get("path", "lib:")[4:])
    check("video arrives in pieces and lands in the category as .mp4", r.get("ok") and r["path"].startswith("lib:Clips/")
          and r["path"].endswith(".mp4") and ":" not in r["path"][4:] and open(saved, "rb").read() == video)
    index = json.load(open(os.path.join(lib, ".image-organizer.json")))["files"]
    entry = index.get(r["path"][4:], {})
    check("saved video has tag, comment, source and an index entry of kind video",
          xattr(saved, "com.apple.metadata:_kMDItemUserTags") == ["Clips\n4"] and xattr(saved, "com.apple.metadata:kMDItemWhereFroms") == page
          and entry.get("kind") == "video" and entry.get("size") == len(video))
    check("the same video is not saved twice", send(video, name="again").get("duplicate") is True)
    mov = b"\x00\x00\x00\x14ftypqt  \x00\x00\x02\x00qt  " + os.urandom(1000)
    check("a QuickTime video is saved as .mov", send(mov).get("path", "").endswith(".mov"))
    check("data that is not a video is refused", send(b"<html>" + os.urandom(2000)).get("error") == "not_a_video")
    token = h.ask("videoBegin", size=10).get("token")
    check("a piece in the wrong place is refused", h.ask("videoChunk", token=token, offset=5, data=base64.b64encode(b"12345").decode()).get("error") == "out_of_order")
    h.ask("videoChunk", token=token, offset=0, data=base64.b64encode(b"12345").decode())
    check("a video shorter than announced is refused", h.ask("videoFinish", token=token, name="x", folder="Clips").get("error") == "size_mismatch")
    token = h.ask("videoBegin", size=10).get("token")
    h.ask("videoChunk", token=token, offset=0, data=base64.b64encode(b"12345").decode())
    h.ask("videoCancel", token=token)
    check("cancel leaves no hidden pieces behind", not [n for n in os.listdir(lib) if n.startswith(".io-video-")])
    check("unknown upload and bad sizes are refused", h.ask("videoChunk", token="nope", offset=0, data="AA==").get("error") == "unknown_upload"
          and h.ask("videoBegin", size=0).get("error") == "bad_size")
    check("a video into a bad folder is refused", send(video[:5000], folder="../x").get("type") == "error")


def stream_tests(h, root, path):
    """Playing a video in the page from 127.0.0.1 (helper 2.5.2). / 在页面里从 127.0.0.1 播放视频。"""
    import urllib.error
    import urllib.request

    def get(url, method="GET", headers=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method=method, headers=headers or {}), timeout=5) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), b""

    r = h.ask("playURL", path=path)
    url = r.get("url", "")
    check("playURL gives a 127.0.0.1 address with no file path in it",
          url.startswith("http://127.0.0.1:") and "/v/" in url and path.split(".")[0] not in url)
    check("the same video keeps its address", h.ask("playURL", path=path).get("url") == url)
    whole = open(os.path.join(root, path), "rb").read()
    status, headers, body = get(url)
    check("serves the whole video as video/mp4", status == 200 and body == whole and headers.get("Content-Type") == "video/mp4"
          and headers.get("Accept-Ranges") == "bytes")
    status, headers, body = get(url, headers={"Range": "bytes=100-1099"})
    check("serves a range (seeking)", status == 206 and body == whole[100:1100]
          and headers.get("Content-Range") == f"bytes 100-1099/{len(whole)}")
    status, _, body = get(url, headers={"Range": "bytes=-500"})
    check("serves the end of the file", status == 206 and body == whole[-500:])
    check("refuses a range past the end", get(url, headers={"Range": f"bytes={len(whole) + 10}-"})[0] == 416)
    status, headers, body = get(url, method="HEAD")
    check("HEAD gives the size only", status == 200 and headers.get("Content-Length") == str(len(whole)) and body == b"")
    base, number = url.rsplit("/", 1)
    token_part = base.rsplit("/", 1)
    check("a wrong token is refused", get(token_part[0] + "/wrongtoken/" + number)[0] == 403)
    check("a number it did not hand out is refused", get(base + "/999")[0] == 404)
    check("only GET and HEAD", get(url, method="POST")[0] == 405)
    check("playURL refuses pictures and bad paths", h.ask("playURL", path="wallpaper.jpg").get("error") == "unsupported_type"
          and h.ask("playURL", path="../x.mp4").get("type") == "error")
    listening = subprocess.run(["lsof", "-a", "-p", str(h.p.pid), "-iTCP", "-sTCP:LISTEN", "-nP"], capture_output=True, text=True).stdout
    check("listens on 127.0.0.1 only", "127.0.0.1:" in listening and "*:" not in listening)


def filing_video_tests(h, root):
    """Videos are filed, put back and listed like pictures. / 视频和图片一样归类、放回和列出。"""
    name = "抖音_秋天的厨房.mp4"
    if not os.path.exists(os.path.join(root, name)):
        return print("SKIP  filing a video (no sample videos) / 没有示例视频")
    r = h.ask("file", items=[{"path": name}], folder="工作", tag={"name": "工作", "color": 4})
    check("a video is filed into a category like a picture", r.get("ok") and r["moved"][0]["to"] == "lib:工作/" + name)
    listed = next((i for i in h.ask("list") if i["path"] == "lib:工作/" + name), {})
    check("a filed video is listed in the library with its length", listed.get("library") is True and listed.get("duration") == 3.0)
    r = h.ask("unfile", items=[{"path": "lib:工作/" + name, "removeTag": "工作"}])
    check("a filed video goes back to Downloads", r.get("ok") and r["moved"][0]["to"] == name and os.path.exists(os.path.join(root, name)))


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
    clip = next((i for i in items if i["path"] == "抖音_秋天的厨房.mp4"), None)
    if clip is None:
        print("SKIP  videos in the gallery (no sample videos: FFmpeg missing) / 没有示例视频")
    else:
        mov = next((i for i in items if i["path"] == "Travel/kyoto_walk.mov"), {})
        check("lists videos with their shown size and length",
              (clip["width"], clip["height"], clip.get("duration")) == (360, 640, 3.0) and mov.get("duration") == 75.0)
        check("video keeps its download record", clip.get("from") == ["www.douyin.com"])
        data, mime = h.ask("thumb", path=clip["path"], size=256)
        check("video thumbnail is a JPEG frame", mime == "image/jpeg" and data[:2] == b"\xff\xd8")
        data, mime = h.ask("full", path=mov["path"])
        check("video full view is a JPEG poster, not the video", mime == "image/jpeg" and data[:2] == b"\xff\xd8" and len(data) < 1_000_000)
        check("play refuses pictures and bad paths", h.ask("play", path="wallpaper.jpg").get("error") == "unsupported_type"
              and h.ask("play", path="../x.mp4").get("type") == "error")
        stream_tests(h, root, clip["path"])
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
        video_tests(h, lib)
        filing_video_tests(h, root)
    finally:
        if os.environ.get("IO_TEST_LIBRARY"):
            shutil.rmtree(lib, ignore_errors=True)
    h.p.stdin.close()
    h.p.wait(timeout=5)
    store = Helper(root, config, STORE_ORIGIN)
    check("accepts the Chrome Web Store version", store.ask("hello").get("ok") is True)
    store.p.stdin.close()
    store.p.wait(timeout=5)
    rejected = subprocess.run([BIN, "chrome-extension://someoneelse/"], input=b"", capture_output=True)
    check("rejects other extensions", rejected.returncode == 2)
    sys.exit(1 if getattr(check, "failed", False) else 0)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/io-samples"))
