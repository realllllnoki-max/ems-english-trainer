#!/usr/bin/env bash
# SNS宣伝画像(静止画)を書き出すスクリプト
#   ./render.sh            → promo-square.png (1080×1080) と promo-story.png (1080×1920)
# 必要なもの: Chromium(Playwright同梱の /opt/pw-browsers か、CHROME_BIN で指定)
set -euo pipefail
cd "$(dirname "$0")"

FONT_URL='https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf'

# フォント(9.5MB・gitignore対象)— 兄弟ディレクトリにあれば再利用、なければDL
if [ ! -f NotoSansJP.ttf ]; then
  for sib in ../reel/assets/NotoSansJP.ttf ../vocab/assets/NotoSansJP.ttf ../assets/NotoSansJP.ttf; do
    if [ -f "$sib" ]; then cp "$sib" NotoSansJP.ttf; break; fi
  done
fi
if [ ! -f NotoSansJP.ttf ]; then
  echo 'Downloading Noto Sans JP…'
  curl -sSfL -o NotoSansJP.ttf "$FONT_URL"
fi

# Chromium を探す
CHROME="${CHROME_BIN:-}"
if [ -z "$CHROME" ]; then
  for c in /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell \
           /opt/pw-browsers/chromium-*/chrome-linux/chrome \
           "$(command -v chromium || true)" "$(command -v google-chrome || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then echo 'Chromium が見つかりません(CHROME_BIN で指定してください)' >&2; exit 1; fi

shot() { # $1=html $2=png $3=WxH
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$3" \
    --screenshot="$2" "file://$PWD/$1" 2>/dev/null
  echo "wrote $2"
}

shot promo-square.html promo-square.png 1080,1080
shot promo-story.html  promo-story.png  1080,1920
