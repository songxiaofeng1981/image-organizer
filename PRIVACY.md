# Privacy Policy / 隐私政策

Image Organizer (Chrome extension and its macOS helper app)
图片整理（Chrome 插件及其 macOS 本机助手）

Last updated / 更新日期: 2026-11-11 (2.5)

## English

- **No data collection.** Image Organizer does not collect, transmit, sell or share any personal data or usage data. There is no account, no analytics, no tracking and no remote code.
- **No servers.** Neither the extension nor the helper app sends anything to any server. The helper never goes online. To play a video inside the gallery, the helper serves that one file on 127.0.0.1 (your own Mac), behind a random token that changes every time, and stops when you close the gallery.
- **Web pages.** Only when you click the toolbar icon or the right-click menu on a page does the extension look at that page (Chrome's `activeTab`), to list its pictures and videos. The ones you pick are fetched inside that page, the way the page itself loads them, and handed to the helper on your Mac. Nothing is sent anywhere else.
- **What the helper reads.** Pictures and videos (MP4, MOV, M4V) in your Downloads folder and in the picture library folder you choose. It refuses other paths, hidden files and symbolic links.
- **What it writes.** When you file or save a picture or video, it moves or writes the file into `<your library>/<category>/`, adds a Finder tag and a Finder comment (where it came from), and updates a hidden index file `.image-organizer.json` in the library. The library location is kept in `~/Library/Application Support/ImageOrganizer/settings.json`.
- **Where data lives.** Your files stay in your own folders on your Mac. Category names, colors, groups and display preferences are kept by Chrome for this extension on this computer (`chrome.storage.local`, not synced).
- **Deleting.** Files are only ever moved to the macOS Trash, never deleted outright.
- **Permissions.** `nativeMessaging`: talk to the helper app on your Mac. `activeTab` and `scripting`: read the pictures on the page you clicked the icon on. `contextMenus`: the right-click "Save to Picture Library" menu. `downloads`: save to Downloads when the helper is not installed. `storage`: your categories and preferences.

Questions: open an issue at https://github.com/songxiaofeng1981/image-organizer/issues

## 中文

- **不收集任何数据。** 图片整理不收集、不上传、不出售、不分享任何个人数据或使用数据。没有账号、没有统计、没有追踪、没有远程代码。
- **不连服务器。** 插件和本机助手都不向任何服务器发送数据，本机助手不连外网。在图库里播放视频时，助手只在 127.0.0.1（你自己的 Mac）上提供这一个文件，地址带每次都不同的随机口令，关掉图库就停止。
- **网页。** 只有你在网页上点工具栏图标或右键菜单时，插件才查看这一页（Chrome 的 `activeTab`），列出上面的图片和视频。你选中的内容在这个网页里取出，和网页自己加载时一样，然后交给你 Mac 上的本机助手，不发送到其他任何地方。
- **助手读取什么。** “下载”文件夹和你选定的图片库文件夹里的图片和视频（MP4、MOV、M4V）。它拒绝其他路径、隐藏文件和符号链接。
- **写入什么。** 归类或保存图片、视频时，把文件移动或写入 `<图片库>/<分类>/`，加上访达标签和访达注释（记下来历），并更新图片库里的隐藏索引文件 `.image-organizer.json`。图片库的位置保存在 `~/Library/Application Support/ImageOrganizer/settings.json`。
- **数据在哪里。** 你的文件都留在你 Mac 上自己的文件夹里。分类名称、颜色、组和显示偏好由 Chrome 为这个插件保存在本机（`chrome.storage.local`，不同步）。
- **删除。** 只会移到 macOS 的废纸篓，从不直接删除。
- **权限。** `nativeMessaging`：和 Mac 上的本机助手通信。`activeTab`、`scripting`：读取你点图标时所在网页上的图片。`contextMenus`：右键菜单“保存到图片库”。`downloads`：没装本机助手时存到“下载”。`storage`：保存分类和偏好。

问题反馈：https://github.com/songxiaofeng1981/image-organizer/issues
