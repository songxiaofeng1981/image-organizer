#!/bin/bash
# Check the helper without Chrome: count the pictures in Downloads and time 20 thumbnails.
# 不经过 Chrome 检查本机助手：统计“下载”里的图片数量，并测 20 张缩略图的耗时。
#   bash selftest.sh                 # your Downloads / 你的“下载”文件夹
#   bash selftest.sh --root /path    # another folder / 其他文件夹
HELPER="$HOME/Library/Application Support/ImageOrganizer/ImageOrganizerHelper.app/Contents/MacOS/image-organizer-helper"
if [ ! -x "$HELPER" ]; then
  echo "The helper is not installed yet. Run: bash install.sh / 还没安装本机助手，请先运行：bash install.sh"
  exit 1
fi
echo "If macOS asks whether Terminal may access Downloads, click Allow. / 如果 macOS 询问终端能否访问“下载”，请点“允许”。"
"$HELPER" --selftest "$@"
