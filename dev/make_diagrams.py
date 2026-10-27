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
        "find": ("find pictures and", "fetch them in the page"),
        "chrome": "Chrome extension · plain HTML/CSS/JS modules, no build step",
        "popup": ("Toolbar popup", ("popup.html · popup.js", "pick pictures on this page"), ("save into a category",)),
        "gallery": ("Gallery page", ("gallery.html · main.js", "To Sort · Library · views"), ("file with 1–9, undo",)),
        "storage": ("chrome.storage", ("io:v2", "categories, colors,"), ("groups, preferences",)),
        "nm": "Native Messaging · JSON over stdin/stdout · replies in 512 KB chunks",
        "save": "save",
        "ops": "list · thumb · full · file · unfile · trash · renameFolder",
        "helper": ("Image Organizer Helper", ("Swift app, macOS ImageIO · runs only while the gallery or popup needs it",
                                              "resolve() lets it touch only Downloads and the picture library"),
                   ("settings.json: where the picture library is",)),
        "rules": ("Ground rules", ("No network requests", "Never deletes: Trash only", "Checked copy across drives",
                                   "(size + SHA-256)", "Only what you can see"), ()),
        "downloads": ("~/Downloads", ("the inbox: To Sort",), ("pictures only",)),
        "library": ("Picture library", ("e.g. /Volumes/ssd2/Pictures/", "<category>/ folders"), (".image-organizer.json index",)),
        "file": ("file", "tag + comment"),
        "mods": "Image Organizer modules",
        "l_pages": "Pages (entry points)",
        "l_feat": "Views and features",
        "l_shared": "Shared modules",
        "l_bridge": "Bridge to the Mac",
        "l_helper": "Native helper",
        "main": ("main.js", ("gallery wiring: sidebar, toolbar,", "filing, undo, library dialog, keys"),
                 ("uses: library · grid · viewer · store", "images · ui · host · i18n")),
        "popupjs": ("popup.js", ("toolbar popup: list this page's", "pictures, save the chosen ones"),
                    ("uses: collect · store · host · library · i18n",)),
        "bg": ("background.js", ("service worker: toolbar click", "when there is no popup"), ("later: the right-click menu",)),
        "library_m": ("library.js", ("views, smart categories,", "groups, sorting"), ("uses: store · i18n",)),
        "grid": ("grid.js", ("justified rows, sections,", "selection, drag box"), ("uses: images · ui · i18n",)),
        "viewer": ("viewer.js", ("big picture view,", "info panel"), ("uses: images · ui · library",)),
        "collect": ("collect.js", ("runs inside the web page:", "collectImages, fetchImage"), ("no imports",)),
        "store": ("store.js", ("io:v2 storage, migration,", "category ↔ library folder"), ("uses: i18n",)),
        "images": ("images.js", ("thumbnail queue", "and cache"), ("uses: host",)),
        "ui": ("ui.js", ("icons, menus, toasts,", "name dialog, color dots"), ("uses: i18n",)),
        "i18n": ("i18n.js", ("every UI string,", "English + Chinese"), ()),
        "host": ("host.js", ("Native Messaging client: requests, 512 KB chunks, errors, MIN_HELPER_VERSION check",), ()),
        "swift": "helper/ImageOrganizerHelper.swift · one file · resolve() checks every path",
        "g_browse": ("Browse", "hello · list · thumb · full"),
        "g_lib": ("Picture library", "config · setLibrary · chooseFolder"),
        "g_file": ("File", "file · unfile · save · renameFolder"),
        "g_finder": ("Finder", "trash · reveal"),
    },
    "zh": {
        "arch": "图片整理 整体架构",
        "web": "你正在看的网页",
        "web1": ("Pinterest、X、小红书……", "登录后你看到的内容"),
        "find": ("在网页里", "找图片、取数据"),
        "chrome": "Chrome 插件 · 纯 HTML/CSS/JS 模块，不需要构建",
        "popup": ("工具栏小窗口", ("popup.html · popup.js", "挑选本页的图片"), ("存进某个分类",)),
        "gallery": ("图库页面", ("gallery.html · main.js", "待整理 · 图片库 · 各种视图"), ("按 1–9 归类，可撤销",)),
        "storage": ("chrome.storage", ("io:v2", "分类、颜色、"), ("组、偏好设置",)),
        "nm": "Native Messaging · 通过标准输入输出传 JSON · 回复按 512 KB 分块",
        "save": "save 存图",
        "ops": "list · thumb · full · file · unfile · trash · renameFolder",
        "helper": ("图片整理本机助手", ("Swift 程序，用 macOS ImageIO · 只在图库或小窗口需要时运行",
                                        "resolve() 只允许它碰“下载”和图片库"),
                   ("settings.json：图片库的位置",)),
        "rules": ("基本原则", ("不发任何网络请求", "从不直接删除：只进废纸篓", "跨硬盘复制要校验",
                               "（大小 + SHA-256）", "只存你看得到的内容"), ()),
        "downloads": ("~/Downloads（下载）", ("收件箱：待整理",), ("只看图片",)),
        "library": ("图片库", ("如 /Volumes/ssd2/图片库/", "<分类>/ 文件夹"), (".image-organizer.json 索引",)),
        "file": ("归类", "标签 + 注释"),
        "mods": "图片整理 模块图",
        "l_pages": "页面（入口）",
        "l_feat": "视图与功能",
        "l_shared": "共用模块",
        "l_bridge": "连接 Mac 的桥",
        "l_helper": "本机助手",
        "main": ("main.js", ("图库的连线：侧边栏、工具栏、", "归类、撤销、图片库对话框、快捷键"),
                 ("用到：library · grid · viewer · store", "images · ui · host · i18n")),
        "popupjs": ("popup.js", ("工具栏小窗口：列出本页图片，", "把选中的存进分类"),
                    ("用到：collect · store · host · library · i18n",)),
        "bg": ("background.js", ("后台：没有小窗口时", "处理工具栏点击"), ("之后放右键菜单",)),
        "library_m": ("library.js", ("视图、智能分类、", "组、排序"), ("用到：store · i18n",)),
        "grid": ("grid.js", ("等高行网格、日期分段、", "选择、拖框"), ("用到：images · ui · i18n",)),
        "viewer": ("viewer.js", ("看大图、", "信息面板"), ("用到：images · ui · library",)),
        "collect": ("collect.js", ("在网页里运行：", "collectImages、fetchImage"), ("不引用别的模块",)),
        "store": ("store.js", ("io:v2 存储、旧版迁移、", "分类 ↔ 图片库文件夹"), ("用到：i18n",)),
        "images": ("images.js", ("缩略图队列", "和缓存"), ("用到：host",)),
        "ui": ("ui.js", ("图标、菜单、提示条、", "命名对话框、色点"), ("用到：i18n",)),
        "i18n": ("i18n.js", ("所有界面文字，", "英文 + 中文"), ()),
        "host": ("host.js", ("Native Messaging 客户端：发请求、512 KB 分块、错误分类、检查 MIN_HELPER_VERSION",), ()),
        "swift": "helper/ImageOrganizerHelper.swift · 一个文件 · resolve() 把关所有路径",
        "g_browse": ("浏览", "hello · list · thumb · full"),
        "g_lib": ("图片库", "config · setLibrary · chooseFolder"),
        "g_file": ("归档", "file · unfile · save · renameFolder"),
        "g_finder": ("访达", "trash · reveal"),
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
    s = Svg(960, 760, T["mods"])
    s.text(30, 36, T["mods"], "title")

    def layer(y, label):
        s.text(30, y, label, "frame-label")

    # Pages / 页面
    layer(70, T["l_pages"])
    for x, w, key in [(30, 340, "main"), (390, 330, "popupjs"), (740, 190, "bg")]:
        head, lines, small = T[key]
        s.box(x, 82, w, 112, "accent", head, lines, small)
    # Views and features / 视图与功能
    layer(236, T["l_feat"])
    xs = [(30, 210, "library_m", "box"), (255, 210, "grid", "box"), (480, 210, "viewer", "box"), (720, 210, "collect", "page")]
    for x, w, key, kind in xs:
        head, lines, small = T[key]
        s.box(x, 248, w, 96, kind, head, lines, small)
    # Shared / 共用
    layer(386, T["l_shared"])
    for i, key in enumerate(["store", "images", "ui", "i18n"]):
        head, lines, small = T[key]
        s.box(30 + i * 230, 398, 210, 96, "box", head, lines, small)
    # Bridge / 桥
    layer(536, T["l_bridge"])
    head, lines, small = T["host"]
    s.box(30, 548, 900, 50, "accent", head, lines, small)
    # Helper / 助手
    layer(640, T["l_helper"])
    s.parts.append('<rect class="helper" x="30" y="652" width="900" height="92" rx="10"/>')
    s.text(44, 674, T["swift"], "t")
    for i, key in enumerate(["g_browse", "g_lib", "g_file", "g_finder"]):
        x = 44 + i * 222
        s.parts.append(f'<rect class="pill" x="{x}" y="686" width="208" height="48" rx="8"/>')
        s.text(x + 12, 706, T[key][0], "h")
        s.text(x + 12, 724, T[key][1], "s")
    # Main calls / 主要调用
    s.arrow([(200, 194), (200, 248)])
    s.arrow([(310, 194), (360, 248)])
    s.arrow([(350, 194), (585, 248)])
    s.arrow([(600, 194), (825, 248)])
    s.arrow([(200, 344), (200, 398)], gray=True)
    s.arrow([(360, 344), (360, 398)], gray=True)
    s.arrow([(360, 494), (360, 548)])
    s.arrow([(480, 598), (480, 652)])
    s.save(name)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    architecture(TEXT["en"], "architecture.svg")
    architecture(TEXT["zh"], "architecture.zh-CN.svg")
    modules(TEXT["en"], "modules.svg")
    modules(TEXT["zh"], "modules.zh-CN.svg")
