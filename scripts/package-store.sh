#!/bin/bash
# Build the Chrome Web Store upload zip: only the extension, manifest.json at the zip root,
# without the "key" field (the store rejects it and assigns its own ID).
# Output: dist/store/image-organizer-store-vX.Y.Z.zip
# 生成上传 Chrome 应用商店的 zip：只含插件，manifest.json 在 zip 根目录，
# 去掉商店不接受的 "key"（商店会分配自己的插件 ID）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/extension/manifest.json'))['version'])")"
OUT_DIR="$ROOT/dist/store"
STAGE="$OUT_DIR/image-organizer-store-v$VERSION"
ZIP="$STAGE.zip"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

rsync -a --exclude '.DS_Store' --exclude '._*' "$ROOT/extension/" "$STAGE/"

python3 - "$STAGE/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p, encoding='utf-8'))
m.pop('key', None)
json.dump(m, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(p, 'a').write('\n')
PY

# Zip the contents of the folder (not the folder itself), so manifest.json is at the root.
# 压缩文件夹里的内容而不是文件夹本身，manifest.json 才会在 zip 根目录。
(cd "$STAGE" && zip -qrX "$ZIP" . -x '.*' -x '*/.*')

python3 - "$ZIP" <<'PY'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
assert 'manifest.json' in names, 'manifest.json is not at the zip root'
m = json.loads(z.read('manifest.json'))
assert 'key' not in m, 'key is still in manifest.json'
for path in list(m.get('icons', {}).values()) + [m['background']['service_worker'], 'gallery.html', m['action']['default_popup']]:
    assert path in names, f'missing {path}'
for loc in ('en', 'zh_CN'):
    assert f'_locales/{loc}/messages.json' in names, f'missing locale {loc}'
print(f'OK: {len(names)} entries, manifest.json at root, no key, version {m["version"]}')
PY
echo "Store zip / 商店上传包: $ZIP"
