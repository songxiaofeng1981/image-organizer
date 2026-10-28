#!/usr/bin/env python3
"""Draws the architecture and module diagrams in docs/images as SVG, in English and Chinese.
Run it again after the structure changes: python3 dev/make_diagrams.py
画出 docs/images 里的整体架构图和模块图（SVG，中英文各一份）。结构变了就重新运行。
"""
import os
from xml.sax.saxutils import escape

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "images")

STYLE = """
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif; fill: #1d1d1f; }
  .bg { fill: #ffffff; }
  .box { fill: #f3f3f5; stroke: #d2d2d7; stroke-width: 1; }
  .frame { fill: none; stroke: #007aff; stroke-width: 1.5; stroke-dasharray: 6 4; }
  .accent { fill: #e8f1ff; stroke: #007aff; stroke-width: 1.2; }
  .helper { fill: #fff4e5; stroke: #ff9500; stroke-width: 1.2; }
  .disk { fill: #eaf8ee; stroke: #34c759; stroke-width: 1.2; }
  .page { fill: #ffffff; stroke: #86868b; stroke-width: 1.2; stroke-dasharray: 4 3; }
  .pill { fill: #ffffff; stroke: #ffcc80; stroke-width: 1; }
  .title { font-size: 15px; font-weight: 700; }
  .h { font-size: 13.5px; font-weight: 650; }
  .t { font-size: 12px; fill: #424245; }
  .s { font-size: 11px; fill: #6e6e73; }
  .label { font-size: 11.5px; fill: #0060df; font-weight: 600; }
  .frame-label { font-size: 12px; fill: #0060df; font-weight: 700; }
  .line { stroke: #007aff; stroke-width: 1.6; fill: none; }
  .line.gray { stroke: #86868b; }
  .arrow { fill: #007aff; }
  .arrow.gray { fill: #86868b; }
  @media (prefers-color-scheme: dark) {
    text { fill: #f5f5f7; }
    .bg { fill: #1e1e1e; }
    .box { fill: #2c2c2e; stroke: #48484a; }
    .accent { fill: #0b2a4d; stroke: #0a84ff; }
    .helper { fill: #3a2a12; stroke: #ff9f0a; }
    .disk { fill: #123320; stroke: #30d158; }
    .page { fill: #1e1e1e; stroke: #8e8e93; }
    .pill { fill: #2c2c2e; stroke: #8a5a1c; }
    .frame { stroke: #0a84ff; }
    .t { fill: #d1d1d6; }
    .s { fill: #a1a1a6; }
    .label, .frame-label { fill: #64a8ff; }
    .line { stroke: #0a84ff; }
    .line.gray { stroke: #8e8e93; }
    .arrow { fill: #0a84ff; }
    .arrow.gray { fill: #8e8e93; }
  }
</style>
<defs>
  <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path class="arrow" d="M0,0 L10,5 L0,10 z"/>
  </marker>
  <marker id="g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path class="arrow gray" d="M0,0 L10,5 L0,10 z"/>
  </marker>
</defs>
"""


class Svg:
    def __init__(self, w, h, title):
        self.w, self.h = w, h
        self.parts = [f'<rect class="bg" width="{w}" height="{h}" rx="14"/>']
        self.title = title

    def box(self, x, y, w, h, kind="box", head=None, lines=(), small=(), r=10, center=False):
        self.parts.append(f'<rect class="{kind}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/>')
        cy = y + 22
        tx, anchor = (x + w / 2, "middle") if center else (x + 14, "start")
        if head:
            self.text(tx, cy, head, "h", anchor)
            cy += 19
        for line in lines:
            self.text(tx, cy, line, "t", anchor)
            cy += 17
        for line in small:
            self.text(tx, cy, line, "s", anchor)
            cy += 15

    def text(self, x, y, s, cls, anchor="start"):
        self.parts.append(f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{escape(s)}</text>')

    def arrow(self, points, gray=False, both=False):
        d = " ".join(f"{'M' if i == 0 else 'L'}{x},{y}" for i, (x, y) in enumerate(points))
        m = "g" if gray else "a"
        start = f' marker-start="url(#{m})"' if both else ""
        self.parts.append(f'<path class="line{" gray" if gray else ""}" d="{d}"{start} marker-end="url(#{m})"/>')

    def save(self, name):
        body = "\n".join(self.parts)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
               f'role="img" aria-label="{escape(self.title)}">\n<title>{escape(self.title)}</title>{STYLE}{body}\n</svg>\n')
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(svg)
        print("wrote", name)


TEXT = {
    "en": {
        "arch": "Image Organizer architecture",
        "web": "Web page you are viewing",
        "web1": ("Pinterest, X, Xiaohongshu…", "as you see it, logged in"),
        "find": ("find and fetch", "in the page"),
        "chrome": "Chrome extension · plain HTML/CSS/JS modules, no build step",
        "popup": ("Popup · right-click", ("popup.js · background.js", "pictures and videos"), ("into a category or Downloads",)),
        "gallery": ("Gallery page", ("gallery.html · main.js", "To Sort · Library · views"), ("file with 1–9, undo",)),
        "storage": ("chrome.storage", ("io:v2", "categories, colors,"), ("groups, preferences",)),
        "nm": "Native Messaging · JSON over stdin/stdout · replies in 512 KB chunks",
        "save": "save · video…",
        "nohelper": "no helper: Chrome → Downloads",
        "ops": "list · thumb · full · file · unfile · trash · renameFolder",
        "helper": ("Image Organizer Helper", ("Swift app, macOS ImageIO · runs only while the gallery or popup needs it",
                                              "resolve() lets it touch only Downloads and the picture library"),
                   ("settings.json: where the picture library is",)),
        "rules": ("Ground rules", ("Helper never goes online", "Never deletes: Trash only", "Checked copy across drives",
                                   "(size + SHA-256)", "Only what you can see"), ()),
        "downloads": ("~/Downloads", ("the inbox: To Sort",), ("pictures only",)),
        "library": ("Picture library", ("e.g. /Volumes/ssd2/Pictures/", "<category>/ folders"), (".image-organizer.json index",)),
        "file": ("file", "tag + comment"),
        "mods": "Image Organizer modules",
        "c_manage": "Manage the gallery",
        "c_pics": "Save pictures from web pages",
        "c_video": "Save videos from web pages",
        "main": ("main.js", ("gallery wiring: sidebar, filing, undo, keys",)),
        "library_m": ("library.js", ("views, smart categories, groups, sorting",)),
        "grid": ("grid.js", ("justified rows, date sections, selection",)),
        "viewer": ("viewer.js", ("big picture view, info panel",)),
        "images": ("images.js", ("thumbnail queue and cache",)),
        "popupjs": ("popup.js", ("toolbar popup: pick this page's pictures",)),
        "bg": ("background.js", ("right-click menu: Save to Picture Library ▸",)),
        "collect": ("collect.js", ("in the page: collectImages, fetchImage",)),
        "saver": ("saver.js", ("into a category, or Downloads without helper",)),
        "v_panel": ("video/panel.js", ("“Video on this page” rows in the popup",)),
        "v_find": ("video/find.js", ("in the page (MAIN): Xiaohongshu and X rules",)),
        "v_fetch": ("video/fetch.js", ("in the page: fetch once, hand out pieces",)),
        "v_save": ("video/save.js", ("4 MB pieces to the helper, then finish",)),
        "store": ("store.js", ("io:v2 storage, category ↔ folder",)),
        "page": ("page.js", ("file names and comment from the page",)),
        "ui": ("ui.js", ("icons, menus, toasts, dialogs",)),
        "i18n": ("i18n.js", ("every UI string, English + Chinese",)),
        "host": ("host.js", ("Native Messaging bridge: requests, 512 KB reply chunks, errors, version checks",)),
        "h_manage": ("Manage.swift", "list · thumb · full · trash · reveal", "file · unfile · renameFolder"),
        "h_pics": ("PictureSave.swift", "save (one picture, base64)"),
        "h_video": ("VideoSave.swift", "videoBegin · videoChunk", "videoFinish · videoCancel"),
        "h_main": ("main.swift", "routes each request to its part,", "reads messages, runs 4 at a time"),
        "h_core": ("Core.swift", "message framing, errors,", "resolve(): the path gate"),
        "h_library": ("Library.swift", "settings, index, tags and comments,", "checked moves, config · setLibrary"),
        "l_pages": "Pages (entry points)",
        "l_feat": "Views and features",
        "l_shared": "Shared modules",
        "l_bridge": "Bridge to the Mac",
        "l_helper": "Native helper",
    },
    "zh": {
        "arch": "图片整理 整体架构",
        "web": "你正在看的网页",
        "web1": ("Pinterest、X、小红书……", "登录后你看到的内容"),
        "find": ("在网页里", "找图片、取数据"),
        "chrome": "Chrome 插件 · 纯 HTML/CSS/JS 模块，不需要构建",
        "popup": ("小窗口 · 右键菜单", ("popup.js · background.js", "挑选网页上的图片和视频"), ("存进分类或“下载”",)),
        "gallery": ("图库页面", ("gallery.html · main.js", "待整理 · 图片库 · 各种视图"), ("按 1–9 归类，可撤销",)),
        "storage": ("chrome.storage", ("io:v2", "分类、颜色、"), ("组、偏好设置",)),
        "nm": "Native Messaging · 通过标准输入输出传 JSON · 回复按 512 KB 分块",
        "save": "save · video… 存图和视频",
        "nohelper": "没有助手时由 Chrome 存到“下载”",
        "ops": "list · thumb · full · file · unfile · trash · renameFolder",
        "helper": ("图片整理本机助手", ("Swift 程序，用 macOS ImageIO · 只在图库或小窗口需要时运行",
                                        "resolve() 只允许它碰“下载”和图片库"),
                   ("settings.json：图片库的位置",)),
        "rules": ("基本原则", ("本机助手从不联网", "从不直接删除：只进废纸篓", "跨硬盘复制要校验",
                               "（大小 + SHA-256）", "只存你看得到的内容"), ()),
        "downloads": ("~/Downloads（下载）", ("收件箱：待整理",), ("只看图片",)),
        "library": ("图片库", ("如 /Volumes/ssd2/图片库/", "<分类>/ 文件夹"), (".image-organizer.json 索引",)),
        "file": ("归类", "标签 + 注释"),
        "mods": "图片整理 模块图",
        "c_manage": "管理图库",
        "c_pics": "下载网页图片",
        "c_video": "下载网页视频",
        "main": ("main.js", ("图库的连线：侧边栏、归类、撤销、快捷键",)),
        "library_m": ("library.js", ("视图、智能分类、组、排序",)),
        "grid": ("grid.js", ("等高行网格、日期分段、选择",)),
        "viewer": ("viewer.js", ("看大图、信息面板",)),
        "images": ("images.js", ("缩略图队列和缓存",)),
        "popupjs": ("popup.js", ("工具栏小窗口：挑选本页图片",)),
        "bg": ("background.js", ("右键菜单：保存到图片库 ▸",)),
        "collect": ("collect.js", ("在网页里：collectImages、fetchImage",)),
        "saver": ("saver.js", ("存进分类；没有助手时存到“下载”",)),
        "v_panel": ("video/panel.js", ("小窗口里的“本页视频”",)),
        "v_find": ("video/find.js", ("在网页里（MAIN）：小红书、X 的规则",)),
        "v_fetch": ("video/fetch.js", ("在网页里：取一次，分块交出",)),
        "v_save": ("video/save.js", ("每块 4 MB 交给助手，最后收尾",)),
        "store": ("store.js", ("io:v2 存储、分类 ↔ 文件夹",)),
        "page": ("page.js", ("由网页得到文件名和注释",)),
        "ui": ("ui.js", ("图标、菜单、提示条、对话框",)),
        "i18n": ("i18n.js", ("所有界面文字，英文 + 中文",)),
        "host": ("host.js", ("Native Messaging 桥：发请求、回复按 512 KB 分块、错误分类、版本检查",)),
        "h_manage": ("Manage.swift", "list · thumb · full · trash · reveal", "file · unfile · renameFolder"),
        "h_pics": ("PictureSave.swift", "save（一张图片，base64）"),
        "h_video": ("VideoSave.swift", "videoBegin · videoChunk", "videoFinish · videoCancel"),
        "h_main": ("main.swift", "把每个请求交给对应部分，", "读取消息，最多 4 个同时处理"),
        "h_core": ("Core.swift", "消息收发、错误、", "resolve()：路径把关"),
        "h_library": ("Library.swift", "设置、索引、标签和注释、", "校验后的移动、config · setLibrary"),
        "l_pages": "页面（入口）",
        "l_feat": "视图与功能",
        "l_shared": "共用模块",
        "l_bridge": "连接 Mac 的桥",
        "l_helper": "本机助手",
    },
}


def architecture(T, name):
    s = Svg(960, 600, T["arch"])
    s.text(30, 36, T["arch"], "title")
    # Web page / 网页
    s.box(20, 80, 220, 100, "page", T["web"], T["web1"])
    # Chrome extension frame / Chrome 插件外框
    s.parts.append('<rect class="frame" x="340" y="52" width="600" height="148" rx="14"/>')
    s.text(356, 72, T["chrome"], "frame-label")
    head, lines, small = T["popup"]
    s.box(356, 84, 182, 100, "accent", head, lines, small)
    head, lines, small = T["gallery"]
    s.box(552, 84, 196, 100, "accent", head, lines, small)
    head, lines, small = T["storage"]
    s.box(762, 84, 162, 100, "box", head, lines, small)
    s.arrow([(748, 134), (762, 134)], gray=True, both=True)
    # popup ↔ web page / 小窗口 ↔ 网页
    s.arrow([(356, 134), (240, 134)], both=True)
    for i, line in enumerate(T["find"]):
        s.text(298, 158 + i * 15, line, "label", "middle")
    # Native Messaging: the channel both pages talk through / 两个页面都通过它和助手通信
    s.parts.append('<rect class="box" x="340" y="218" width="600" height="28" rx="8"/>')
    s.text(640, 236, T["nm"], "s", "middle")
    s.arrow([(447, 184), (447, 218)])
    s.arrow([(447, 246), (447, 300)])
    s.text(455, 278, T["save"], "label")
    s.text(455, 293, T["nohelper"], "s")
    s.arrow([(650, 184), (650, 218)])
    s.arrow([(650, 246), (650, 300)])
    s.text(658, 278, T["ops"], "label")
    # Helper / 本机助手
    head, lines, small = T["helper"]
    s.box(340, 300, 600, 96, "helper", head, lines, small)
    # Rules / 原则
    head, lines, small = T["rules"]
    s.box(20, 300, 280, 140, "box", head, lines, small)
    # Disks / 磁盘
    head, lines, small = T["downloads"]
    s.box(340, 470, 250, 100, "disk", head, lines, small)
    head, lines, small = T["library"]
    s.box(690, 470, 250, 100, "disk", head, lines, small)
    s.arrow([(465, 396), (465, 470)], gray=True, both=True)
    s.arrow([(815, 396), (815, 470)], gray=True, both=True)
    s.arrow([(590, 520), (690, 520)])
    s.text(640, 508, T["file"][0], "label", "middle")
    s.text(640, 540, T["file"][1], "s", "middle")
    s.save(name)


def modules(T, name):
    """Three independent parts side by side (manage, pictures, videos), the shared parts below.
    三个独立的部分并排（管理、图片、视频），共用部分在下面。"""
    s = Svg(960, 800, T["mods"])
    s.text(30, 36, T["mods"], "title")
    columns = [(30, 290, "c_manage", ["main", "library_m", "grid", "viewer", "images"]),
               (335, 290, "c_pics", ["popupjs", "bg", "collect", "saver"]),
               (640, 290, "c_video", ["v_panel", "v_find", "v_fetch", "v_save"])]
    for x, w, label, keys in columns:
        s.parts.append(f'<rect class="frame" x="{x}" y="52" width="{w}" height="352" rx="12"/>')
        s.text(x + 14, 72, T[label], "frame-label")
        for i, key in enumerate(keys):
            head, lines = T[key]
            kind = "page" if key in ("collect", "v_find", "v_fetch") else "accent" if key in ("main", "popupjs", "bg", "v_panel") else "box"
            s.box(x + 12, 84 + i * 63, w - 24, 56, kind, head, lines)
    # Shared extension modules / 插件共用模块
    s.text(30, 432, T["l_shared"], "frame-label")
    for i, key in enumerate(["store", "page", "ui", "i18n"]):
        head, lines = T[key]
        s.box(30 + i * 226, 444, 214, 56, "box", head, lines)
    for x, _, _, _ in columns:
        s.arrow([(x + 145, 404), (x + 145, 444)], gray=True)
    head, lines = T["host"]
    s.box(30, 524, 900, 50, "accent", head, lines)
    # Helper: one part per column, shared parts below / 本机助手：每列一个部分，共用部分在下面
    s.text(30, 602, T["l_helper"], "frame-label")
    s.parts.append('<rect class="helper" x="30" y="612" width="900" height="172" rx="12"/>')
    for (x, w, _, _), key in zip(columns, ["h_manage", "h_pics", "h_video"]):
        s.parts.append(f'<rect class="pill" x="{x + 10}" y="624" width="{w - 20}" height="62" rx="8"/>')
        s.text(x + 22, 646, T[key][0], "h")
        s.text(x + 22, 664, T[key][1], "s")
        if len(T[key]) > 2:
            s.text(x + 22, 678, T[key][2], "s")
        s.arrow([(x + 145, 574), (x + 145, 624)])
    for i, key in enumerate(["h_main", "h_core", "h_library"]):
        x = 40 + i * 300
        s.parts.append(f'<rect class="pill" x="{x}" y="700" width="280" height="70" rx="8"/>')
        s.text(x + 12, 722, T[key][0], "h")
        s.text(x + 12, 740, T[key][1], "s")
        s.text(x + 12, 756, T[key][2], "s")
    s.save(name)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    architecture(TEXT["en"], "architecture.svg")
    architecture(TEXT["zh"], "architecture.zh-CN.svg")
    modules(TEXT["en"], "modules.svg")
    modules(TEXT["zh"], "modules.zh-CN.svg")
