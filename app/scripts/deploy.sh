#!/usr/bin/env bash
# 构建并推到 gh-pages。GitHub Pages 约 1 分钟后自动生效。
set -euo pipefail

REPO="https://github.com/Emanon4/qixi-poem-forge.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"
npm run build

cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.email=noreply@anthropic.com -c user.name="Claude" \
    commit -qm "构建产物 $(date +%Y-%m-%d\ %H:%M)"
git push -qf "$REPO" gh-pages
rm -rf .git

echo "✓ 已发布 → https://emanon4.github.io/qixi-poem-forge/"
