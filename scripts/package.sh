#!/bin/bash
# Build the release zip that users download: a universal helper (Apple silicon + Intel),
# the extension, the scripts and the docs. Output: dist/image-organizer-vX.Y.Z.zip
# 生成用户下载的发布包：通用版本机助手（Apple 芯片 + Intel）、插件、脚本和文档。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/extension/manifest.json'))['version'])")"
NAME="image-organizer-v$VERSION"
OUT="$ROOT/dist/$NAME"
rm -rf "$OUT" "$OUT.zip"
mkdir -p "$OUT/helper" "$OUT/docs"
bash "$ROOT/helper/build.sh" universal
ditto "$ROOT/helper/build/ImageOrganizerHelper.app" "$OUT/helper/ImageOrganizerHelper.app"
rsync -a --exclude '.DS_Store' "$ROOT/extension/" "$OUT/extension/"
cp "$ROOT"/{install.sh,uninstall.sh,selftest.sh,README.md,README.zh-CN.md,LICENSE,CHANGELOG.md} "$OUT/"
cp "$ROOT"/docs/INSTALL*.md "$OUT/docs/"
(cd "$ROOT/dist" && ditto -c -k --keepParent "$NAME" "$NAME.zip")
# The same zip under a name that never changes, so releases/latest/download/image-organizer.zip (the gallery's
# "Download the Helper" button) is always the newest. Upload both to the release.
# 再存一份名字固定的同一个 zip，这样 releases/latest/download/image-organizer.zip（图库里“下载本机助手”按钮）总是最新版。两个都上传到 Release。
cp "$OUT.zip" "$ROOT/dist/image-organizer.zip"
echo "Release zips / 发布包: $OUT.zip + $ROOT/dist/image-organizer.zip"
