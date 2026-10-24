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
echo "Release zip / 发布包: $OUT.zip"
