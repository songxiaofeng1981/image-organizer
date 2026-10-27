# Changelog / 更新记录

## Unreleased — 2.4 in development / 未发布 — 2.4 开发中

Save pictures from the web page you are viewing straight into a category. Not finished: the capture page and the right-click menu are still to come. / 把正在看的网页上的图片直接存进分类。还没做完：抓取页面和右键菜单还没做。

- **Toolbar popup.** Lists the pictures on the current page (the largest size the page offers, small icons hidden, the same picture at two sizes counted once), and saves the chosen ones into a category. Each picture is fetched inside the page, like the page itself loads it. On X's photo viewer only the post's photos are listed. / **工具栏小窗口。** 列出当前网页上的图片（取网页提供的最大尺寸，隐藏小图标，同一张图的两个尺寸只算一张），把选中的存进分类。每张图都在网页里取数据，和网页自己加载时一样。在 X 的看大图界面只列出帖子本身的图。
- Gallery: "Select All" next to the view title; "Deselect All" when everything is selected; "Select" / "Deselect" beside each date section. / 图库：视图标题旁有“全选”；全选后可“取消全选”；每个日期分段旁有“选择 / 取消选择”。
- The gallery reloads the library when it comes back into view, and shows the extension's version in the sidebar. / 图库回到前台时重新读取图片库，侧边栏显示插件版本号。
- Helper 2.4.0: new `save` request (writes picture bytes into a category, with the same checks, tag, comment and index as filing). / 本机助手 2.4.0：新增 `save` 请求（把图片数据写进分类，校验、标签、注释、索引和归类一样）。
- Docs: architecture and module diagrams (SVG) in the README and design notes. / 文档：README 和设计说明里加入整体架构图和模块图（SVG）。

## v2.3.0 — 2026-10-27

Downloads becomes an inbox: filing moves pictures into your own picture library. / “下载”变成收件箱：归类会把图片移进你自己的图片库。

- **Picture library.** Choose a folder (an external drive works well). Pressing `1`–`9` moves the picture out of Downloads into `<library>/<category>/`; `0` moves it back; `⌘Z` undoes. / **图片库。** 选一个文件夹（放在外置硬盘上很合适）。按 `1`–`9` 把图片从“下载”移到 `<图片库>/<分类>/`；按 `0` 移回；`⌘Z` 撤销。
- Across drives the original is removed only after the copy is checked (size and SHA-256). A picture already in the library is not stored twice; the download goes to the Trash. Names never overwrite each other. / 跨硬盘时，副本核对无误（大小和 SHA-256）后才移走原件。图片库里已有的图不再存第二份，下载的那份移到废纸篓。重名不会覆盖。
- Each filed picture gets a Finder tag (category name and color) and a Finder comment (website, original name, download and filing time); the library keeps a hidden `.image-organizer.json` index. / 每张收入的图都有访达标签（分类名和颜色）和访达注释（来源网站、原文件名、下载和收入时间）；图片库里保存隐藏的 `.image-organizer.json` 索引。
- A category is its library folder: renaming or recoloring a category renames the folder and retags its pictures; folders made in Finder show up as categories. / 分类就是图片库里的文件夹：重命名或改颜色会同时改文件夹和标签；在访达里建的文件夹也会成为分类。
- Sidebar: "To Sort" (Downloads) and "Picture Library" (all pictures and categories). Works when the drive is unplugged: the library shows "Not connected". / 侧边栏分为“待整理”（下载）和“图片库”（全部图片和各分类）。硬盘没接上时，图片库显示“未连接”。
- Pictures categorized with 2.2 stay where they are; one click moves them into the library. / 用 2.2 归过类的图保持不动，点一下即可全部移进图片库。
- Return now saves in the name dialog (it used to cancel). / 命名对话框里按回车现在是保存（以前会变成取消）。
- Helper 2.3.0 (needs reinstalling): new `config`, `setLibrary`, `chooseFolder`, `file`, `unfile`, `renameFolder` requests; asks macOS for access to external drives when the library is there. / 本机助手 2.3.0（需要重新安装）：新增 `config`、`setLibrary`、`chooseFolder`、`file`、`unfile`、`renameFolder` 请求；图片库在外置硬盘上时会向 macOS 申请访问权限。

## v2.2.0 — 2026-10-24

First public release: a rewrite of the 1.x trial version. / 第一个公开版本：在 1.x 试用版基础上重写。

- Smart categories from each file's own information: phone & camera photos (EXIF, HEIC), screenshots (system flag, name, phone screen shape), AI-generated, Xiaohongshu, WeChat, animated, video frames & sequences, duplicate copies (same content), large files. / 根据文件自身信息的智能分类：手机/相机照片（EXIF、HEIC）、截图（系统标记、文件名、手机屏幕比例）、AI 生成、小红书、微信、动图、视频帧/序列图、重复的副本（内容完全相同）、大文件。
- "Downloaded from" (the website, from the browser's download record) and "Taken with" (camera model). / “来源网站”（来自浏览器的下载记录）和“拍摄设备”（相机型号）。
- Small icons, logos and website assets are hidden except under "Small Icons". / 小图标、logo、网页素材只在“小图标”里显示。

- New look based on Apple Photos, with light and dark mode. / 参照 Apple“照片”的全新界面，支持浅色和深色模式。
- Sidebar with Library, your own categories (names and colors), smart categories, groups, time added and sub-folders. Sections fold. / 侧边栏：图库、自定义分类（名称和颜色）、智能分类、组、加入时间、子文件夹。分区可折叠。
- Justified rows that keep each picture's shape, date sections, adjustable thumbnail size, smooth scrolling for thousands of pictures. / 保持图片比例的等高行排列、按日期分段、可调缩略图大小，几千张图也能顺畅滚动。
- Selection like Photos: circle, ⌘-click, Shift-click, drag a box; drag onto a category. / 和“照片”一样的选择方式：圆圈、⌘ 单击、Shift 单击、拖框；可拖到分类上。
- New viewer: click either side or swipe to move, pinch and double-click to zoom, film strip, info panel, Show in Finder. / 新的大图查看：点两侧或滑动切换，捏合和双击缩放，胶片栏，信息面板，在访达中显示。
- Keyboard sorting: 1–9 files and moves to the next picture; ⌘Z undoes anything. / 键盘整理：按 1–9 归类并跳到下一张；所有操作都能 ⌘Z 撤销。
- **Moves to the Trash instead of deleting permanently.** / **改为移到废纸篓，不再永久删除。**
- Helper: thumbnails for every format via ImageIO, TIFF support, parallel requests, skips `node_modules` and similar folders. / 本机助手：所有格式都用 ImageIO 生成缩略图，支持 TIFF，并行处理请求，跳过 `node_modules` 等文件夹。
- English and Chinese interface. / 中英文界面。
- Installer registers Chrome, Edge, Brave, Arc and Vivaldi, and upgrades 1.x in place, keeping categories and groups. / 安装程序支持 Chrome、Edge、Brave、Arc、Vivaldi，并原地升级 1.x，保留分类和组。

## v1.1.2

Private trial version ("图片整理（Mac 试用）"). / 内部试用版。
