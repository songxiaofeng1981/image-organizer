# Contributing / 参与贡献

Issues and pull requests are welcome, in English or Chinese.
欢迎提 issue 和 PR，中文英文都可以。

## Reporting a problem / 报告问题

Please use the issue templates and include:
请使用 issue 模板，并附上：

- your macOS and Chrome versions / macOS 和 Chrome 的版本
- the output of `bash selftest.sh` / `bash selftest.sh` 的输出
- what the gallery page showed (a screenshot helps) / 图库页面显示了什么（最好附截图）

The self-test prints file names of pictures it could not read, but no picture content. Remove anything you don't want to share.
自测会打印读不了的图片文件名，但不含图片内容。不想公开的内容可以先删掉。

## Development setup / 开发环境

You need the Xcode Command Line Tools (`xcode-select --install`) and Python 3 (it comes with them).
需要 Xcode 命令行工具（`xcode-select --install`），Python 3 随之附带。

```bash
bash helper/build.sh                           # build the helper / 编译本机助手
python3 dev/make_samples.py /tmp/io-samples    # sample pictures / 生成示例图片
python3 dev/protocol_test.py /tmp/io-samples   # test the helper / 测试本机助手
python3 dev/serve.py /tmp/io-samples           # run the gallery / 运行图库
```

Then open <http://127.0.0.1:8770/gallery.html> in any browser (add `?lang=zh` or `?lang=en`).
The page is the real `extension/` code. `dev/chrome-shim.js` stands in for the `chrome.*` APIs and forwards
Native Messaging to the real helper, which reads the sample folder instead of Downloads.
Edit files and reload the page; there is no build step.

然后在任意浏览器打开 <http://127.0.0.1:8770/gallery.html>（可加 `?lang=zh` 或 `?lang=en`）。
页面运行的就是 `extension/` 里的真实代码。`dev/chrome-shim.js` 代替 `chrome.*` 接口，把 Native Messaging
转发给真正的本机助手，助手读取示例文件夹而不是“下载”。改完文件刷新页面即可，不需要构建。

**Use a sample folder, not your real Downloads.** "Move to Trash" really moves files.
**请用示例文件夹，不要用真正的“下载”。** “移到废纸篓”是真的会移动文件。

### Testing inside Chrome / 在 Chrome 里测试

```bash
bash install.sh      # builds the helper from source if needed / 需要时会从源码编译助手
```

Then load `~/Applications/Image Organizer/extension` in `chrome://extensions`. Or, while developing, load the repository's
`extension/` folder directly so your edits are picked up: click the reload icon on the card, then reload the gallery.
After changing `helper/ImageOrganizerHelper.swift`, run `bash install.sh` again.

然后在 `chrome://extensions` 里加载 `~/Applications/Image Organizer/extension`。开发时也可以直接加载仓库里的 `extension/`
文件夹，这样改动会直接生效：点卡片上的刷新图标，再刷新图库页。改了 `helper/ImageOrganizerHelper.swift` 后，请重新运行 `bash install.sh`。

### Making a release / 发布新版本

1. Update `version` in `extension/manifest.json`, `helperVersion` in the Swift file (if the helper changed), `CHANGELOG.md`.
   更新 `extension/manifest.json` 里的 `version`、Swift 文件里的 `helperVersion`（如果助手有改动）以及 `CHANGELOG.md`。
2. `bash scripts/package.sh` → `dist/image-organizer-vX.Y.Z.zip` (universal helper, Apple silicon + Intel).
3. Create a GitHub release with a `vX.Y.Z` tag and attach the zip.
   在 GitHub 上创建 `vX.Y.Z` 标签的 release，并上传这个 zip。

## Ground rules / 基本原则

1. **The helper only touches pictures inside Downloads.** Every path goes through `resolve()`. Don't add operations that write, rename or delete. Moving to the Trash is the only change it makes.
   **本机助手只处理“下载”里的图片。** 所有路径都必须经过 `resolve()`。不要增加写入、重命名或删除的操作。移到废纸篓是它唯一会做的修改。
2. **Never delete for real.** Use the Trash, and keep Undo working.
   **永远不真正删除。** 用废纸篓，并保证撤销可用。
3. **No network requests** from the helper or the extension without discussing it in an issue first.
   **不经 issue 讨论，助手和插件都不要加任何网络请求。**
4. **Nothing on the helper's stdout** except protocol messages. Use `stderr` for logging.
   **助手的 stdout 只能输出协议消息。** 日志请输出到 `stderr`。
5. **Keep the extension build-free**: plain HTML, CSS and ES modules.
   **插件保持无需构建**：纯 HTML、CSS 和 ES 模块。
6. **Every interface string goes in `extension/js/i18n.js`**, in both English and Chinese.
   **界面上的每一句文字都放进 `extension/js/i18n.js`**，中英文都要有。
7. Read [docs/DESIGN.md](docs/DESIGN.md) before larger changes.
   较大的改动前请先读 [docs/DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)。

## Pull requests / 提交 PR

- One topic per PR. / 一个 PR 只做一件事。
- Run `python3 dev/protocol_test.py` if you touched the helper. / 改了助手请运行 `python3 dev/protocol_test.py`。
- Say how you tested: dev server, Chrome, light and dark mode. / 写清楚怎么测的：开发服务器、Chrome、浅色和深色模式。
- Update both language versions of any doc you change. / 改了文档的话，中英两个版本都要更新。
