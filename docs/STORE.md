# Chrome Web Store listing / 商店上架资料

This file is for the maintainer. Part A is the order of work; part B is the text to paste into the store dashboard, field by field.
这份文件给维护者看。A 部分是上架的先后顺序；B 部分是按商店后台栏目准备好、可以直接粘贴的文字。

## A. Order of work / 上架顺序

The store gives the extension a new ID, and the helper only talks to IDs it knows, so the ID has to be in the helper
before anyone installs the store version.
商店会给插件一个新的 ID，而本机助手只和认识的 ID 通信，所以必须先把这个 ID 加进助手，再让别人安装商店版。

1. **Upload zip / 上传包:** `bash scripts/package-store.sh` → `dist/store/image-organizer-store-vX.Y.Z.zip`
   (manifest.json at the zip root, no `key`). In the [developer dashboard](https://chrome.google.com/webstore/devconsole) click
   "New item" and upload it. **Don't submit yet.** / 在开发者后台点“新增内容”上传。**先不要提交审核。**
2. **Store ID / 商店 ID:** copy the 32-letter ID the dashboard shows and put it in `STORE_ID` in `install.sh` and in
   `allowedExtensionIDs` in `helper/Core.swift`. Run the protocol tests.
   复制后台显示的 32 位 ID，填进 `install.sh` 的 `STORE_ID` 和 `helper/Core.swift` 的 `allowedExtensionIDs`，跑一遍协议测试。
3. **Release / 发布:** set the version to 2.5.0 (manifest, CHANGELOG), `bash scripts/package.sh`, commit, push, and
   `gh release create v2.5.0` with **both** `dist/image-organizer-v2.5.0.zip` and `dist/image-organizer.zip`
   (the gallery's "Download the Helper" button links to `releases/latest/download/image-organizer.zip`).
   版本改成 2.5.0，打包、提交、推送，发布 Release 时**两个 zip 都上传**（图库里的“下载本机助手”按钮指向固定名字的那个）。
4. **GitHub Pages:** Settings → Pages → Deploy from branch `main`, folder `/docs`. The animated guide is then at
   https://songxiaofeng1981.github.io/image-organizer/guide/ (the gallery's "Watch the Guide" button links there).
   打开 GitHub Pages（main 分支的 /docs），安装演示就在上面这个地址（图库里“看安装演示”按钮指向它）。
5. **Images / 图片:** `dist/store/assets/` — screenshots 1280×800 (`-zh` for the Chinese listing, `-en` for the English one)
   and the small promo tile 440×280. Remake them with `node dev/store_shots.mjs` (needs the dev server: see AGENTS.md).
   截图 1280×800 和小宣传图 440×280；用 `node dev/store_shots.mjs` 重新生成。
6. Re-upload the zip if anything changed, fill in part B, then **Submit for review**. After approval, put the store link in
   `STORE_URL` in `docs/guide/steps2.js` and in the READMEs.
   有改动就重新上传 zip，填好 B 部分，再提交审核。通过后把商店链接填进 `docs/guide/steps2.js` 的 `STORE_URL` 和 README。

- **Privacy policy URL / 隐私政策网址:** https://github.com/songxiaofeng1981/image-organizer/blob/main/PRIVACY.md
- **Homepage / 主页:** https://github.com/songxiaofeng1981/image-organizer
- **Support / 支持:** https://github.com/songxiaofeng1981/image-organizer/issues

## B. Text for the dashboard / 后台填写内容

### Store listing / 商品详情

**Category:** Tools (or Productivity / Workflow & Planning) — **Languages:** English, Chinese (Simplified)

**Short description** comes from `extension/_locales/*/messages.json` (`appDescription`, at most 132 characters).
简短说明来自 `extension/_locales/*/messages.json` 的 `appDescription`（最多 132 个字符）。

**Detailed description (English)**

> Your Downloads folder fills up with screenshots, saved posts, reference pictures, AI images and videos. Image Organizer turns it into an inbox you can empty: see everything on one page, press one key to file a picture into your own picture library, and move the rest to the Trash. It looks and works like Apple Photos, and everything stays on your Mac.
>
> • All the pictures and videos in Downloads, newest first, grouped by Today, Yesterday, This Week and by month
> • Press 1–9 to file a picture into a category: it moves out of Downloads into your picture library (an external drive works well), checked byte by byte, with a Finder tag and a note of where it came from
> • ⌫ moves to the Trash, ⌘Z undoes anything
> • Smart categories from the files themselves: phone and camera photos, screenshots, AI-generated, Xiaohongshu, WeChat, animated, duplicates, large files, by website and by camera
> • Videos sit with the pictures; "All / Pictures / Videos" shows one kind, and videos play right in the viewer
> • Save pictures from the page you are reading: click the toolbar icon, tick them and pick a category, or right-click a picture → Save to Picture Library. Videos from Xiaohongshu, X and Douyin pages can be saved too
> • A large viewer with swipe, pinch to zoom and a filmstrip; HEIC and TIFF shown as well; light and dark appearance
>
> Nothing leaves your Mac. There is no account and no analytics, and the helper never goes online. Files are only ever moved to the Trash, never deleted.
>
> Requires macOS 12 or later and Image Organizer's small, free and open-source helper app, because a browser extension can't read your folders by itself. The extension shows how to install it, and there is an animated step-by-step guide: https://songxiaofeng1981.github.io/image-organizer/guide/

**详细说明（中文）**

> 截图、收藏的笔记、参考图、AI 生成的图片和视频，最后都堆在“下载”文件夹里。图片整理把“下载”变成一个可以清空的收件箱：在一个页面里看全部图片，按一个键就把它收进你自己的图片库，不要的移到废纸篓。界面和操作参照 Apple“照片”，所有处理都在你自己的 Mac 上完成。
>
> • “下载”里的所有图片和视频，最新的在前，按今天、昨天、本周、各月份分段
> • 按 1–9 把图片归进分类：从“下载”移到你的图片库（放在外置硬盘上很合适），逐字节核对，加上访达标签并记下来历
> • 按 ⌫ 移到废纸篓，⌘Z 撤销任何操作
> • 根据文件本身的信息自动分类：手机/相机照片、截图、AI 生成、小红书、微信、动图、重复的副本、大文件，还能按来源网站和拍摄设备看
> • 视频和图片放在一起，“全部 / 图片 / 视频”可以只看一种，视频直接在大图里播放
> • 存网页上的图片：点工具栏图标，勾选、选分类；或者对着图片点右键 →“保存到图片库”。小红书、X、抖音页面上的视频也能存
> • 好用的大图查看：双指滑动切换、捏合缩放、胶片栏；HEIC、TIFF 也能显示；浅色、深色模式
>
> 数据不出你的 Mac。没有账号、没有统计，本机助手不连外网。只会移到废纸篓，从不直接删除。
>
> 需要 macOS 12 或更新系统，以及图片整理免费开源的本机小助手（浏览器插件本身无法读取文件夹）。插件里有安装步骤，也有一步一步的安装动画：https://songxiaofeng1981.github.io/image-organizer/guide/?lang=zh

### Privacy practices / 隐私权规范

**Single purpose**

> Image Organizer helps a Mac user sort the pictures and videos in their Downloads folder into their own picture library, and save pictures and videos from the web page they are viewing into that library, using its companion macOS helper app.

**Justification for `nativeMessaging`**

> A Chrome extension cannot read or move local files. Image Organizer's only data source is its own companion macOS app ("Image Organizer Helper", native messaging host `com.songxiaofeng.imageorganizer`, open source in the same repository). The gallery page asks it to list the pictures and videos in Downloads and in the picture library folder the user chose, make thumbnails, move a file the user files into a category folder, move a file to the Trash when the user presses Delete, write pictures the user saves from a web page into a category, and serve a video on 127.0.0.1 so the page can play it. The helper accepts only this extension, only files inside those two folders, and never goes online.

**Justification for `activeTab`**

> When the user clicks the toolbar icon (or the right-click menu) on a web page, the popup lists the pictures and videos on that page so the user can pick which ones to save. activeTab limits this to the page the user clicked on; the extension requests no host permissions and has no content scripts that run by themselves.

**Justification for `scripting`**

> Used together with activeTab, only after the user clicks the toolbar icon or the context menu: a script is injected into that one page to find its pictures and videos (largest available size) and to fetch the ones the user picked, the way the page itself loads them.

**Justification for `contextMenus`**

> Adds "Save to Picture Library ▸ category" and "Save to Downloads only" to the right-click menu on pictures.

**Justification for `downloads`**

> When the helper app is not installed, or the user chooses "Save to Downloads", the picked pictures are saved with chrome.downloads into Downloads/Image Organizer/<page title>/, so they appear in the gallery's inbox.

**Justification for `storage`**

> Keeps the user's category names and colors, groups and display preferences (sort order, thumbnail size) on this computer.

**Remote code:** No, I am not using remote code. All scripts are in the package and the Content Security Policy is `script-src 'self'`.

**Data usage:** tick none of the data types. Certify all three statements (not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness).

### Test instructions for reviewers / 给审核员的测试说明

> Image Organizer needs its companion macOS helper; without it the gallery shows how to install it, and the popup saves to Downloads.
>
> 1. On a Mac with macOS 12 or later, open the extension's gallery (toolbar icon → Open Image Organizer) and click "Download the Helper", or download image-organizer.zip from https://github.com/songxiaofeng1981/image-organizer/releases/latest. Double-click it to unzip.
> 2. In Terminal, run: bash install.sh (in the unzipped folder). It installs the helper in ~/Library/Application Support/ImageOrganizer and registers it with Chrome. No account, no network access, no password.
> 3. Back in the gallery, click "Try Again". macOS asks to let "Image Organizer Helper" access Downloads: click Allow. The pictures and videos in Downloads appear.
> 4. Click a picture and press 1. When asked, choose a folder for the picture library (for example ~/Pictures/Test Library). The picture moves into that folder's sub-folder for the first category ("Family"); ⌘Z puts it back.
> 5. On any web page with pictures, click the toolbar icon, tick a picture, choose a category and click "Save to Category". It appears in that category in the gallery.
>
> A step-by-step animation of the same steps: https://songxiaofeng1981.github.io/image-organizer/guide/?lang=en
> To remove everything: bash "$HOME/Library/Application Support/ImageOrganizer/uninstall.sh"
