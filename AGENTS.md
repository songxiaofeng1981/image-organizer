# AGENTS.md — handoff for coding agents / 给编程助手的交接说明

Read this first, then `docs/DESIGN.md` (why things are the way they are) and `CONTRIBUTING.md` (ground rules).
先读这里，再读 `docs/DESIGN.zh-CN.md`（为什么这样设计）和 `CONTRIBUTING.md`（基本规则）。

## What this is / 项目是什么

图片整理 / Image Organizer: a Chrome extension (Apple Photos look) plus a Swift Native Messaging helper.
Downloads is the inbox ("待整理"); pressing 1–9 moves a picture into the user's picture library
(`<library>/<category>/`, e.g. `/Volumes/ssd2/图片库`), with a Finder tag, a Finder comment and an index entry.
Public repo `songxiaofeng1981/image-organizer`. Current version: see `extension/manifest.json` and `CHANGELOG.md`.

Owner: Song (GitHub `songxiaofeng1981`). Talks Chinese, often by voice: restate what you understood and
propose before big changes; give progress updates often; show screenshots of UI changes.

## Identifiers that must never change / 绝不能改的标识

| What | Value | Why |
|---|---|---|
| Extension ID (manifest `key`) | `gjmkfcibnihdnoahklpfdjcjekangjhh` | Chrome storage and helper registration belong to it |
| Native host name | `com.songxiaofeng.imageorganizer` | registered by `install.sh` |
| Helper bundle ID | `com.songxiaofeng.imageorganizer.helper` | macOS remembers its Downloads / drive permission |
| Storage key | `io:v2` in `chrome.storage.local` | categories, groups, prefs; 1.x keys are read once for migration |
| Library settings | `~/Library/Application Support/ImageOrganizer/settings.json` | written by the helper |
| Library index | `<library>/.image-organizer.json` | where each filed picture came from |

## Layout / 结构

```
extension/            plain HTML/CSS/ES modules, no build step
  js/main.js          wiring: sidebar, toolbar, filing (assign/applyMoves/undo), library dialog, keys
  js/library.js       views (inbox / all / cat: / f: …), smart categories, groups, sorting
  js/store.js         io:v2 storage; categoryOf(): library pictures → category by folder name
  js/host.js          Native Messaging client; MIN_HELPER_VERSION
  js/popup.js         toolbar popup (2.4): this page's pictures → helper `save`; hosts the video rows
  js/collect.js       runs inside the web page (chrome.scripting): collectImages, fetchImage; no imports
  js/saver.js         saving pictures (category or Downloads), shared by popup and background.js (right-click menu)
  js/page.js          file names and Finder comment from the page; shared by pictures and videos
  js/video/           saving videos (2.5): find.js (MAIN world: Xiaohongshu, X rules), fetch.js (isolated world:
                      fetch once, hand out pieces), save.js (videoBegin/Chunk/Finish), panel.js (popup rows)
  js/i18n.js          every UI string, en + zh
helper/               one program, one file per part: main.swift (dispatch), Core.swift (framing, errors, resolve()
                      path gate), Library.swift (settings, index, tags, checked moves), Manage.swift (gallery requests),
                      PictureSave.swift (`save`), VideoSave.swift (video pieces). "lib:" paths = library
dev/                  serve.py + chrome-shim.js (run the page in a normal tab), protocol_test.py, make_samples.py,
                      make_diagrams.py (docs/images/architecture*.svg, modules*.svg)
scripts/package.sh    release zip (universal helper)
```

## Rules / 规则

- Managing the gallery, saving pictures and saving videos are separate parts, in the extension and in the helper.
  Don't mix them: shared code goes into Core/Library.swift or host/store/page/i18n.js.
- No build step; the helper never goes online; the extension fetches only pictures the user picked on a page
  (inside that page first) and sends nothing anywhere; helper stdout is protocol only.
- Every UI string in `i18n.js`, both languages. Docs: change both language versions.
- Extension CSP: no `style="…"` in HTML strings; set colors with CSSOM (`el.style.x`, `paintDots`).
- Helper changes: add checks to `dev/protocol_test.py`; bump `helperVersion`, `helper/Info.plist`
  (`CFBundleShortVersionString` + `CFBundleVersion`) and `MIN_HELPER_VERSION` when the page needs them.
- Never delete files: Trash only (`FileManager.trashItem`). Moves across drives: copy → verify size + SHA-256 → remove original (`safeMove`).
- Never test anything that moves files against the real `~/Downloads` or the real library.

## Develop and test / 开发和测试

```bash
bash helper/build.sh
python3 dev/make_samples.py /tmp/io-samples
python3 dev/protocol_test.py /tmp/io-samples          # helper: uses /tmp/io-samples-library and -config
IO_TEST_LIBRARY=/Volumes/<drive>/io-test python3 dev/protocol_test.py /tmp/io-samples   # cross-drive copy path
python3 dev/serve.py /tmp/io-samples                  # page: http://127.0.0.1:8770/gallery.html?lang=zh
```

`protocol_test.py` changes the sample folder; run `make_samples.py` again before re-running it.
In the dev page, choose a scratch folder (e.g. `/tmp/io-samples-library`) as the picture library;
settings go to `/tmp/io-samples-config`, never the real ones. Dev storage is the page's localStorage.

## Release / 发布

1. Bump `extension/manifest.json` (and helper version + Info.plist if the helper changed), zip names in `docs/INSTALL*.md`, `CHANGELOG.md`.
2. `bash scripts/package.sh` → `dist/image-organizer-vX.Y.Z.zip`. Commit.
3. Push and `gh release create` **only after Song confirms in chat.** Then check `releases/latest/download/…` with curl.
4. Song loads the extension from `~/Chrome插件/图片整理`: after installing the helper (`bash install.sh`),
   copy `extension/` there, update the version in `~/Chrome插件/加载清单.txt`, and tell Song to click reload (↻), never "Remove".
   Check where Chrome really loads it first (`extensions.settings.<id>.path` in Chrome's `Default/Secure Preferences`):
   in Oct 2026 it was still `~/Applications/Image Organizer/extension`, so copy there too.
5. Between releases, bump the fourth number (`2.4.0.1`, `2.4.0.2` …) each time Song tests a build, so the version in
   `chrome://extensions` and the gallery's sidebar shows which build is loaded. Set it back to `X.Y.Z` for the release.

More lessons and the shared approach for Song's Mac extensions: the `song-mac-chrome-extension` skill
(`~/.local/share/video-ai-tools/skills/song-mac-chrome-extension/SKILL.md`).
