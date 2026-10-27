#!/usr/bin/env python3
"""Make a folder of sample pictures for development / 生成开发用的示例图片文件夹.

Usage / 用法:  python3 dev/make_samples.py /tmp/io-samples

Only uses the Python standard library and macOS `sips`. Creates PNG, JPEG, HEIC, TIFF,
GIF and SVG files of different shapes, a sub-folder, Xiaohongshu-style numbered sets
(auto-grouped by the app), and things the helper must skip (hidden files, node_modules,
a symbolic link).
只用 Python 标准库和 macOS 自带的 sips。生成不同比例的 PNG、JPEG、HEIC、TIFF、GIF、SVG，
一个子文件夹、小红书式的编号组图（应用会自动成组），以及助手必须跳过的东西
（隐藏文件、node_modules、符号链接）。
"""
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import zlib


def png(path, w, h, rgb1, rgb2):
    rows = []
    for y in range(h):
        t = y / max(h - 1, 1)
        row = bytearray([0])
        for x in range(w):
            s = (x / max(w - 1, 1) + t) / 2
            row += bytes(int(a + (b - a) * s) for a, b in zip(rgb1, rgb2))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 6)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def where_from(path, *urls):
    """Record a download source the way browsers do. / 像浏览器一样记录下载来源。"""
    data = plistlib.dumps(list(urls), fmt=plistlib.FMT_BINARY).hex()
    subprocess.run(["xattr", "-wx", "com.apple.metadata:kMDItemWhereFroms", data, path], check=True)


def camera(path, make, model):
    subprocess.run(["sips", "-s", "make", make, "-s", "model", model, path], check=True, capture_output=True)


def convert(src, fmt, dst):
    subprocess.run(["sips", "-s", "format", fmt, src, "--out", dst], check=True, capture_output=True)


COLORS = [((255, 94, 87), (255, 189, 46)), ((52, 120, 246), (90, 200, 250)), ((48, 209, 88), (0, 122, 94)),
          ((175, 82, 222), (255, 45, 85)), ((255, 159, 10), (255, 214, 10)), ((100, 210, 255), (94, 92, 230))]
SHAPES = [(480, 360), (360, 480), (400, 400), (640, 360), (300, 600), (500, 330)]


def main(out):
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, ".tmp.png")
    n = 0

    def make(name, fmt="png", shape=None):
        nonlocal n
        w, h = shape or SHAPES[n % len(SHAPES)]
        c1, c2 = COLORS[n % len(COLORS)]
        n += 1
        path = os.path.join(out, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if fmt == "png":
            png(path, w, h, c1, c2)
        else:
            png(tmp, w, h, c1, c2)
            convert(tmp, fmt, path)

    make("Screenshot 2026-10-21 at 10.12.33.png", shape=(640, 400))
    make("截屏2026-10-20 下午3.22.10.png", shape=(390, 844))
    make("IMG_4021.HEIC", "heic", (480, 640))
    make("IMG_3988.jpeg", "jpeg")
    make("wallpaper.jpg", "jpeg", (640, 360))
    make("scan.tiff", "tiff", (420, 594))
    make("loading.gif", "gif", (300, 300))
    for i in range(1, 4):
        make(f"_{i}_秋天的厨房灵感_来自小红书网页版.jpg", "jpeg", (450, 600))
    for i in range(1, 3):
        make(f"chair_{i}_reference.png", shape=(400, 400))
    make("微信图片_20261020153012.jpg", "jpeg", (480, 640))
    make("mmexport1729412345678.jpg", "jpeg", (640, 480))
    make("Design/poster_final.png", shape=(420, 594))
    make("Travel/kyoto_01.jpg", "jpeg", (640, 427))
    make("Travel/kyoto_02.jpg", "jpeg", (427, 640))
    make("Design/moodboard/texture.jpg", "jpeg")
    # Things the smart categories should find / 智能分类应该识别出的情况
    make("IMG_6078.jpeg", "jpeg", (480, 640))
    camera(os.path.join(out, "IMG_6078.jpeg"), "Apple", "iPhone 17")
    make("DSC_0042.jpg", "jpeg", (600, 400))
    camera(os.path.join(out, "DSC_0042.jpg"), "NIKON CORPORATION", "NIKON Z 6")
    make("IMG_6067.PNG", shape=(603, 1311))  # iPhone screenshot shape, half size / iPhone 截屏比例
    make("download.jpeg", "jpeg", (500, 500))
    where_from(os.path.join(out, "download.jpeg"), "https://sns-webpic-qc.xhscdn.com/abc", "https://www.xiaohongshu.com/explore/1")
    make("ChatGPT Image 2026年10月20日 15_30_12.png", shape=(512, 512))
    where_from(os.path.join(out, "ChatGPT Image 2026年10月20日 15_30_12.png"), "https://chatgpt.com/")
    make("diagram.png", shape=(640, 360))
    where_from(os.path.join(out, "diagram.png"), "https://app.napkin.ai/page/1")
    make("chart.png", shape=(640, 400))
    where_from(os.path.join(out, "chart.png"), "https://static.mysmth.net/nForum/att/1")
    for i in range(1, 7):
        make(f"Video/frame-{i:03d}.png", shape=(640, 360))
    shutil.copy(os.path.join(out, "wallpaper.jpg"), os.path.join(out, "wallpaper (1).jpg"))
    shutil.copy(os.path.join(out, "wallpaper.jpg"), os.path.join(out, "Design/wallpaper copy.jpg"))
    # The same picture at two sizes on a picture server (like Pinterest's 236x/ and 1200x/) / 图片服务器上同一张图的两个尺寸
    make("cdn/236x/8c3f2a9d41e07b65.jpg", "jpeg", (236, 354))
    make("cdn/1200x/8c3f2a9d41e07b65.jpg", "jpeg", (800, 1200))
    for name, shape in [("favicon.png", (32, 32)), ("icon-64.png", (64, 64)), ("logo-CRQNAZ12.png", (400, 120))]:
        make(f"site/{name}", shape=shape)
    with open(os.path.join(out, "logo.svg"), "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#0a84ff"/><circle cx="60" cy="60" r="30" fill="#fff"/></svg>')
    # Must be skipped / 必须被跳过
    make("node_modules/pkg/icon.png", shape=(64, 64))
    make(".hidden.png", shape=(64, 64))
    with open(os.path.join(out, "notes.txt"), "w") as f:
        f.write("not an image")
    link = os.path.join(out, "link.png")
    if not os.path.lexists(link):
        os.symlink(os.path.join(out, "wallpaper.jpg"), link)
    os.remove(tmp)
    print(f"Wrote samples to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/io-samples")
