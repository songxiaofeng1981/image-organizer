#!/bin/bash
# Publish the website (for now only the animated install guide, docs/guide/) to Cloudflare Pages,
# project "image-organizer" → https://image-organizer.pages.dev/guide/ . The site root sends visitors to the guide
# until there is a real home page.
# Needs a one-time `npx wrangler login` (it opens the browser to allow access to your Cloudflare account).
# 把网站发布到 Cloudflare Pages（目前只有安装动画 docs/guide/），项目名 image-organizer，地址见上。
# 网站首页暂时直接跳到安装动画，等以后有了正式首页再换。第一次用前先运行 `npx wrangler login`（会打开浏览器，授权访问你的 Cloudflare 账号）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/dist/site"
PROJECT="image-organizer"
WRANGLER="npx --yes wrangler@4"

rm -rf "$SITE"
mkdir -p "$SITE"
rsync -a --exclude '.DS_Store' "$ROOT/docs/guide/" "$SITE/guide/"
cat > "$SITE/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Image Organizer</title>
<meta http-equiv="refresh" content="0; url=guide/">
<a href="guide/">Image Organizer guide</a>
HTML

# The project was created once on 2026-11-11 with
#   npx wrangler@4 pages project create image-organizer --production-branch main --force
# (--force keeps it a plain Pages project instead of moving it to Workers). Later runs only deploy.
# 项目已在 2026-11-11 用上面这条命令建好（--force 让它保持普通 Pages 项目，不转成 Workers），之后只需发布。
$WRANGLER pages deploy "$SITE" --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Guide / 安装动画: https://$PROJECT.pages.dev/guide/"
