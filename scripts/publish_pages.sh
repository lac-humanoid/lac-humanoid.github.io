#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch of lac-humanoid.github.io.
# gh-pages is always a single orphan commit (force-pushed), so repeated
# deploys never grow the repo history.
#
# Uses npm from PATH by default; override with e.g. NPM="conda run -n myenv npm".
set -euo pipefail

VIEWER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="$(git -C "$VIEWER_DIR" remote get-url origin)"

cd "$VIEWER_DIR"
SRC_REV="$(git log -1 --format=%h)"

${NPM:-npm} run build
touch dist/.nojekyll
# SPA fallback: direct hits on unknown paths serve the app (GitHub Pages serves 404.html)
cp dist/index.html dist/404.html
# /demo as a real path (HTTP 200): Pages serves demo/index.html for /demo/
mkdir -p dist/demo
cp dist/index.html dist/demo/index.html

cd dist
rm -rf .git
git init -q -b gh-pages
git config user.name  "liyoutongxue"
git config user.email "liuyang.tohoku@gmail.com"
git add -A
git commit -qm "deploy from ${SRC_REV} ($(date +%F))"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "published: https://lac-humanoid.github.io/  (source rev ${SRC_REV})"
