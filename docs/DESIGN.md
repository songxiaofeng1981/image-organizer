# Design

**English** | [中文](DESIGN.zh-CN.md)

Why the project is built the way it is. Read this before a larger change; if your change goes against one of these decisions, say which one and why.

## 1. The job

Pictures pile up in `~/Downloads`: screenshots, saved posts, references, photos from chats. The job is **triage**: look at each one briefly, keep and sort what matters, clear out the rest. So the design puts speed of going through pictures first. Browsing and searching come second.

## 2. Architecture

```
extension/  (Chrome page, plain ES modules, no build step)
  gallery.html, gallery.css
  js/main.js      wiring: sidebar, toolbar, actions, keyboard
  js/library.js   filtering, sorting, sidebar filters, groups, date sections
  js/grid.js      justified rows, virtual scrolling, selection
  js/viewer.js    large viewer: navigation, zoom, film strip, info panel
  js/images.js    thumbnail queue and blob URL cache
  js/store.js     categories, groups, preferences in chrome.storage.local
  js/host.js      Native Messaging client
  js/i18n.js      English and Chinese text
  js/ui.js        icons, menus, toast, name dialog
helper/ImageOrganizerHelper.swift   (one file, Foundation + ImageIO only)
```

## 3. Key decisions

### 3.1 A helper app, through Native Messaging

A Chrome extension cannot read an arbitrary local folder. The File System Access API needs the user to pick the folder again in each session, cannot decode HEIC, and cannot use the Trash. And macOS protects Downloads with its own privacy permission.

So a small Swift program does the file work. Chrome starts it with Native Messaging when the gallery opens and stops it when the page closes. There is no local web server, no open port, and nothing running in the background.

The helper is an app bundle (`ImageOrganizerHelper.app`) with a fixed bundle ID and a `NSDownloadsFolderUsageDescription`. That lets macOS show a clear "would like to access your Downloads folder" prompt once and remember the answer.

### 3.2 The helper is deliberately narrow

Every path from the page is checked by `resolve()`:

- It must be relative, inside Downloads, with no `..` and no hidden component.
- No component may be a symbolic link.
- It must be a regular file with an allowed image extension.

The helper also checks the caller's origin (Chrome passes it as the first argument) against the extension ID.

### 3.3 Move to the Trash, never delete; Undo without touching the Trash

The helper uses `FileManager.trashItem`, so Finder's Put Back always works.

For in-app Undo, the page hides the picture at once and **waits about 6 seconds before asking the helper**. Undo within that time just un-hides it. Taking files back out of the Trash would need Full Disk Access, which this app should never ask for. Closing or hiding the tab sends any waiting request immediately. If the request fails, the picture comes back. The safe failure is "the file was not moved".

### 3.4 Speed

- **Shapes are known before pixels.** The helper reads each file's pixel size from its header (no decoding, in parallel) during the listing, so the justified layout is final on first paint and does not jump.
- **Only nearby rows exist.** The grid computes every row's position, but only tiles within about one screen of the viewport are in the DOM.
- **Thumbnails are made by ImageIO**, using the file's embedded thumbnail when it is large enough. They are requested last-in-first-out, so tiles you just scrolled to come first, and requests for tiles that scrolled away are dropped.
- **The helper runs up to 4 requests at once**, so a large full-size image never blocks thumbnails.
- **The viewer shows the thumbnail immediately**, then swaps in the full image, and preloads the neighbours.

### 3.5 Where the data lives

Categories, assignments (by path relative to Downloads), groups and view preferences live in `chrome.storage.local` under one key, `io:v2`. Nothing is written into Downloads.

Version 1.x data (`image-organizer:.image-categories.json`, `…groups.json`) is migrated once on first start. The extension keeps the same ID (the `key` in `manifest.json`), so the data stays with it across updates. Removing the extension erases it, which is why the installer updates 1.x in place.

Known limit: if you rename or move a file in Finder, its category is lost, because the path changed.

### 3.6 "Added" date

The date sections use the date the file was **added to its folder** (`addedToDirectoryDate`, the same as Finder's "Date Added"), which for Downloads is the download time. Modification dates are often older (when the picture was made), which would put new downloads in the wrong section.

### 3.7 Automatic groups

Xiaohongshu saves a post's pictures as `_1_title.jpg`, `_2_title.jpg`… or `title_1_xxx.jpg`. These are grouped by file name (`autoGroup()` in `library.js`). A group appears as one stacked tile; clicking it opens the group. "Keep as Group" turns an automatic group into a manual one, which you can rename.

### 3.8 Look and feel

Apple Photos on macOS is the reference: white content, light gray sidebar, system blue as the only accent color, red only for the Trash, system font, and system light/dark appearance. Thumbnails fill the tile with no gaps or borders. File details are in the viewer's info panel, not under each thumbnail.

### 3.9 Smart categories

Most pictures in Downloads have no useful name, but the files themselves say a lot. While listing, the helper reads (without decoding pixels):

| Signal | Where it comes from | Used for |
|---|---|---|
| Website | `com.apple.metadata:kMDItemWhereFroms`, the download record browsers attach to every file. Only host names are sent to the page. | "Downloaded from", Xiaohongshu, WeChat, AI generated |
| Camera make and model | EXIF/TIFF | "Taken with", Phone & Camera Photos |
| Screen capture | `kMDItemIsScreenCapture`, or EXIF comment "Screenshot" (macOS and iOS add it) | Screenshots |
| Frame count | ImageIO | Animated |
| Exact copies | SHA-256, only for files whose byte size matches another file | Duplicate Copies (every copy except the oldest) |

The page adds rules on top (`prepare()` in `library.js`): HEIC/HEIF and `IMG_1234.JPG` count as phone photos; PNGs shaped like a phone screen (e.g. 1179×2556) count as screenshots; five or more numbered files in one folder (`frame-001.png`…) are video frames or sequences; known AI file names (`ChatGPT Image…`, `DALL·E…`, `Gemini_Generated_Image…`) count as AI generated.

**Small icons** (ICO, SVG, anything up to 256 px, and website build assets like `logo-CRQNAZ12.png` up to 512 px) are hidden from every view except "Small Icons" and categories you put them in. In real Downloads folders they are often a fifth of all files and only get in the way.

### 3.10 A quiet sidebar

Only the Library rows and the smart categories have icons, and categories have color dots. Devices, websites, time and folders are plain text. Lists built from your files (devices, websites, folders) show the five largest with "Show all". Empty rows are hidden, and each section folds by clicking its heading (remembered).

### 3.11 No build step

The extension is plain HTML, CSS and ES modules. Anyone can read or change it without installing Node, and the folder in the repository is exactly what Chrome loads.

## 4. Message protocol

Each request is a JSON object with an `id` and an `op`. The helper answers with one or more messages with the same `id`. Requests may be answered out of order.

| Request | Answer |
|---|---|
| `{op: "hello"}` | `{type: "result", version}` |
| `{op: "list"}` | `{type: "images", items: [...]}` batches of 200, then `{type: "done"}` |
| `{op: "thumb", path, size}` | `{type: "chunk", data}` (base64, ≤512 KB each)…, then `{type: "done", mime}`. JPEG, or the SVG file itself. |
| `{op: "full", path}` | Same as thumb. The original bytes for formats Chrome shows; a JPEG (≤4096 px) for HEIC/HEIF/TIFF. |
| `{op: "trash", paths: [...]}` | `{type: "result", ok, trashed: [...], failed: [{path, error}]}` |
| `{op: "reveal", path}` | `{type: "result", ok}` (opens a Finder window with the file selected) |
| anything wrong | `{type: "error", error}` with a short code such as `invalid_path`, `not_found`, `no_downloads` |

An item from `list`: `{path, name, folder, ext, size, added, modified, width, height}`, plus, only when present, `make`, `model`, `screenshot: true`, `frames` (>1), `from` (host names) and `duplicateOf` (path of the original). `path` and `folder` are relative to Downloads; `width`/`height` take EXIF orientation into account and are 0 when unknown (SVG).

Chrome limits a message from the helper to 1 MB, hence the chunks.

## 5. Known gaps

- macOS only. A Windows helper would need a different way to make thumbnails and use the Recycle Bin.
- Only Downloads. Other folders would need a folder picker and the matching permission.
- Categories follow file paths, so renaming or moving a file in Finder loses its category.
- No disk cache for thumbnails yet. Thumbnails are made again each time the page opens (fast for most files thanks to embedded thumbnails).
- Not in the Chrome Web Store, so Developer mode is required.
