#!/bin/bash
# Remove the helper and the installed extension files. Your pictures are not touched.
# 删除本机助手和已安装的插件文件。不会动你的图片。
HOST_NAME="com.songxiaofeng.imageorganizer"
AS="$HOME/Library/Application Support"
for browser in "Google/Chrome" "Google/Chrome Beta" "Google/Chrome Dev" "Google/Chrome Canary" "Chromium" \
               "Microsoft Edge" "BraveSoftware/Brave-Browser" "Vivaldi" "Arc/User Data"; do
  rm -f "$AS/$browser/NativeMessagingHosts/$HOST_NAME.json"
done
rm -rf "$AS/ImageOrganizer" "$HOME/Applications/Image Organizer"
echo "Removed the helper and extension files. / 已删除本机助手和插件文件。"
echo "Last step: remove Image Organizer in chrome://extensions (this also deletes your categories and groups)."
echo "最后一步：在 chrome://extensions 里移除“图片整理”（这也会删除你的分类和组）。"
