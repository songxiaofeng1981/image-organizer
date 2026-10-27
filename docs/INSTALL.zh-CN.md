# 安装“图片整理”

[English](INSTALL.md) | **中文**

这份说明不需要任何编程基础。按顺序做就行，大约 5 分钟。

**需要：** 一台 macOS 12（Monterey）或更新系统的 Mac，以及 Google Chrome。
Microsoft Edge、Brave、Arc、Vivaldi 也可以用，步骤相同。

---

## 第 1 步：下载

1. 打开[最新版本页面](https://github.com/songxiaofeng1981/image-organizer/releases/latest)。
2. 在 **Assets** 下面点 **`image-organizer-v2.3.0.zip`**（版本号可能更高）。
   不要点“Source code”，那是源代码，需要开发工具才能用。
3. 打开“下载”文件夹，双击这个 zip 文件，会出现一个叫 `image-organizer-v2.3.0` 的文件夹。

## 第 2 步：运行安装程序

1. 打开“终端”：按 `⌘ 空格`，输入 `终端`（或 `Terminal`），按回车。
2. 在终端窗口里输入 `bash`，后面加**一个空格**。先不要按回车。
3. 把 `image-organizer-v2.3.0` 文件夹里的 **`install.sh`** 拖进终端窗口。
   这一行会变成类似 `bash /Users/你的用户名/Downloads/image-organizer-v2.3.0/install.sh` 的样子。
4. 按回车。

几秒钟后会显示 **“完成！”**，并自动打开 Chrome 的扩展程序页面。

> **为什么用终端，而不是双击？** macOS 会拦截从网上下载的脚本，不让双击运行，绕过去的设置藏得很深。
> 从终端启动就不会遇到这个拦截。安装程序只把文件复制到你自己的用户文件夹，不需要输入密码。

## 第 3 步：把插件加到 Chrome

安装程序已经帮你打开了 `chrome://extensions`。如果没有，在 Chrome 地址栏输入 `chrome://extensions` 并回车。

1. 打开右上角的 **“开发者模式”** 开关。
2. 点左上角的 **“加载已解压的扩展程序”**。
3. 会弹出一个选择文件夹的窗口。按 `⌘ Shift G`，再按 `⌘ V`（安装程序已经帮你复制好了文件夹路径），然后按回车。
4. 点 **“选择”**。
5. 点 Chrome 工具栏上的拼图图标，再点 **“图片整理”** 旁边的图钉，把它固定到工具栏。

> 因为这个插件还没有上架 Chrome 应用商店，所以需要打开开发者模式。
> Chrome 偶尔会提醒你装了开发者模式的插件，这是正常的。

## 第 4 步：打开使用

1. 点工具栏里的 **“图片整理”** 图标。
2. 第一次打开时，macOS 会问：*“Image Organizer Helper”想要访问“下载”文件夹中的文件。* 点 **“允许”**。

你的图片就出现了。🎉

## 第 5 步：清理

现在可以删掉 `image-organizer-v2.3.0` 文件夹和 zip 文件了。需要的东西都已经复制到：

- `~/Applications/Image Organizer/extension`（插件）
- `~/Library/Application Support/ImageOrganizer`（本机助手）

如果把这个文件夹留在“下载”里，它自带的图标也会出现在图库中。

---

## 更新到新版本

1. 下载新的 zip 并解压（第 1 步）。
2. 再运行一次 `bash install.sh`（第 2 步）。
3. 在 `chrome://extensions` 里点“图片整理”卡片上的刷新图标（↻）。

你的分类和组都会保留。

## 从 1.x 版本（“图片整理（Mac 试用）”）升级

按第 2 步运行新的安装程序。它会发现旧版本，并直接原地更新。
然后在 `chrome://extensions` 里点旧的 **“图片整理”** 卡片上的刷新图标（↻），就完成了。

**不要移除旧插件。** 移除插件会同时删除它保存的数据，包括你的分类和组。
直接刷新的话，这些数据会自动保留下来。

## 遇到问题？

| 你看到的情况 | 怎么办 |
|---|---|
| 图库显示 **“还差一步：安装本机助手”** | 重新做第 2 步。然后确认 `chrome://extensions` 里“图片整理”卡片上显示的 ID 是 `gjmkfcibnihdnoahklpfdjcjekangjhh`。 |
| 图库显示 **“macOS 还没允许访问‘下载’”** | 打开 **“系统设置”→“隐私与安全性”→“文件和文件夹”**，找到 **Image Organizer Helper**，打开 **“下载”文件夹**开关，然后点 **“重试”**。 |
| 终端显示 `No such file or directory` | 确认 `bash` 后面有一个空格，并且拖进去的是 `install.sh` 文件，而不是整个文件夹。 |
| 终端显示“这个文件夹里没有现成的本机助手” | 你下载的是“Source code”，不是发布版 zip。回到第 1 步重新下载。 |
| Chrome 提示 **清单文件缺失或不可读** | 第 3 步选错了文件夹。请选择 `~/Applications/Image Organizer/extension`（按 `⌘ Shift G` 后粘贴）。 |
| 出现了一些软件或项目里的图片 | 名为 `node_modules`、`venv`、`Pods` 等的文件夹会被跳过，隐藏文件也会被跳过。“下载”里的其他子文件夹会被包含。 |

想不经过 Chrome 检查本机助手，可以在下载的文件夹里运行 `bash selftest.sh`。它会显示找到了多少张图片，以及生成缩略图用了多久。

还是解决不了？请[提一个 issue](https://github.com/songxiaofeng1981/image-organizer/issues/new/choose)，写上你的 macOS 版本和看到的情况。中文英文都可以。

## 卸载

1. 打开终端，粘贴下面这一行并按回车。它会删除本机助手和插件文件，不会动你的图片。
   ```bash
   bash "$HOME/Library/Application Support/ImageOrganizer/uninstall.sh"
   ```
2. 在 `chrome://extensions` 里点“图片整理”的 **“移除”**。这也会删除你的分类和组。
