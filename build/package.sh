#!/usr/bin/env bash
# 打包成 .bobplugin —— 注意 zip 里放的必须是插件目录内的文件，而不是目录本身
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' info.json | head -n 1)
NAME="merriam-webster-dictionary-${VERSION}.bobplugin"

mkdir -p dist
rm -f "dist/${NAME}"

zip -r -X "dist/${NAME}" \
  info.json main.js icon.png src README.md LICENSE \
  -x '*.DS_Store' '*__MACOSX*' >/dev/null

echo "已生成 dist/${NAME}"
unzip -l "dist/${NAME}"
