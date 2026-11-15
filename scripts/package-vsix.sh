#!/usr/bin/env bash
# 打包 VS Code 扩展为 .vsix
# 用法：npm run package:vsix
# 说明：优先使用本机全局 vsce；没有则用 npx 临时拉取 @vscode/vsce，无需全局安装。
#      npx 的 npm 缓存固定在仓库内 .npm-cache/，避免 ``~/.npm`` 权限问题，打包后自动清理。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist-vsc"
# npx 缓存放在仓库内，避免污染或受限于全局 npm 缓存权限。
NPM_CACHE="$ROOT/.npm-cache"
NPX=(npx --yes --cache "$NPM_CACHE")

VSCE=()
VSCE_IS_GLOBAL=1
if command -v vsce >/dev/null 2>&1; then
  VSCE=(vsce)
else
  VSCE=("${NPX[@]}" @vscode/vsce)
  VSCE_IS_GLOBAL=0
fi

cleanup() {
  # 仅清理本脚本创建的缓存；同时清掉 npx 缓存的锁文件，避免下次复用时被沙箱拦截。
  if [ "$VSCE_IS_GLOBAL" = "0" ] && [ -d "$NPM_CACHE" ]; then
    rm -rf "$NPM_CACHE"
  fi
}
trap cleanup EXIT

echo "==> 校验版本号"
cd "$ROOT"
npm run --silent version:check

echo "==> 构建 VS Code 扩展"
npm run build:vsc

echo "==> 打包 .vsix"
cd "$DIST"

VERSION="$(node -p "require('./package.json').version")"
OUT="$ROOT/vsc-postman-$VERSION.vsix"
rm -f "$OUT"

# 已声明 repository，无需 --allow-missing-repository；仅在支持该开关时传入，兼容旧版 vsce。
if "${VSCE[@]}" package --help 2>&1 | grep -q -- '--allow-missing-repository'; then
  "${VSCE[@]}" package --allow-missing-repository -o "$OUT"
else
  "${VSCE[@]}" package -o "$OUT"
fi

echo
echo "完成：$OUT"
echo "安装：code --install-extension \"$OUT\" --force"
