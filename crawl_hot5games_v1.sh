#!/usr/bin/env bash
# crawl_hot5games_v1.sh
# 爬取 hot5games.businessentity.us 门户文件（不含游戏资源）
# 输出到 games_hot5games/ 目录

set -euo pipefail

BASE="https://hot5games.businessentity.us"
OUT="$(dirname "$0")/games_hot5games"

# ── 颜色输出 ──────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

# ── 工具函数 ──────────────────────────────────────────────
fetch() {
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if curl -sf --retry 3 --retry-delay 1 -o "$dest" "$url"; then
    ok "$dest"
  else
    err "failed: $url"
    return 1
  fi
}

# ── 创建目录结构 ──────────────────────────────────────────
echo ""
echo "=== crawl_hot5games_v1 ==="
echo "目标: $BASE"
echo "输出: $OUT"
echo ""

mkdir -p "$OUT"/{webp,detail,policy/static/{css,script,img}}

# ── 1. 首页核心文件 ───────────────────────────────────────
echo "--- [1/4] 首页文件 ---"
fetch "$BASE/"             "$OUT/index.html"
fetch "$BASE/script.js"    "$OUT/script.js"
fetch "$BASE/style.css"    "$OUT/style.css"
fetch "$BASE/games.json"   "$OUT/games.json"

# ── 2. 详情页文件 ─────────────────────────────────────────
echo ""
echo "--- [2/4] detail/ 文件 ---"
fetch "$BASE/detail/"            "$OUT/detail/index.html"
fetch "$BASE/detail/script.js"   "$OUT/detail/script.js"
fetch "$BASE/detail/style.css"   "$OUT/detail/style.css"

# ── 3. policy 文件 ────────────────────────────────────────
echo ""
echo "--- [3/4] policy/ 文件 ---"
fetch "$BASE/policy/index.html"                    "$OUT/policy/index.html"
fetch "$BASE/policy/static/css/style.css"          "$OUT/policy/static/css/style.css"
fetch "$BASE/policy/static/script/policy.js"       "$OUT/policy/static/script/policy.js"
fetch "$BASE/policy/static/img/logo.png"           "$OUT/policy/static/img/logo.png"

# ── 4. 批量下载 webp 图标 ─────────────────────────────────
echo ""
echo "--- [4/4] webp 图标 ---"

TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/games.json','utf8')).length)")
echo "共 $TOTAL 个图标"

DONE=0; SKIP=0; FAIL=0

node -e "
const games = JSON.parse(require('fs').readFileSync('$OUT/games.json','utf8'));
games.forEach(g => console.log(g.icon));
" | while IFS= read -r icon; do
  dest="$OUT/$icon"
  if [[ -f "$dest" ]]; then
    SKIP=$((SKIP+1))
    continue
  fi
  if curl -sf --retry 2 -o "$dest" "$BASE/$icon"; then
    DONE=$((DONE+1))
    printf "\r  下载中... %s" "$icon"
  else
    FAIL=$((FAIL+1))
    warn "图标失败: $icon"
  fi
done

echo ""
echo "  图标完成（新下载/跳过/失败将在统计中显示）"

# ── 5. 修复硬编码域名 ─────────────────────────────────────
echo ""
echo "--- [5/5] 修复 detail/script.js 硬编码域名 ---"

# detail/script.js 中图标 src 硬编码了 hot5games 域名，改为相对路径
if grep -q "hot5games.businessentity.us" "$OUT/detail/script.js"; then
  sed -i 's|"https://hot5games\.businessentity\.us/" + iconUrl|iconUrl|g' "$OUT/detail/script.js"
  ok "detail/script.js: 图标路径改为相对路径"
else
  warn "detail/script.js: 未找到硬编码域名，可能已修复或结构有变"
fi

# ── 6. 统计结果 ───────────────────────────────────────────
echo ""
echo "=== 完成 ==="
ICON_COUNT=$(find "$OUT/webp" -name "*.webp" | wc -l)
TOTAL_SIZE=$(du -sh "$OUT" 2>/dev/null | cut -f1)
echo "  图标数量 : $ICON_COUNT / $TOTAL"
echo "  总大小   : $TOTAL_SIZE"
echo ""
echo "⚠ 待手动替换："
echo "  AdSense pub-id : ca-pub-4121608817985858  (index.html + detail/index.html)"
echo "  AdSense slot   : 6465136575 (首页) / 2525891569 (详情页)"
echo ""
echo "输出目录: $OUT"
