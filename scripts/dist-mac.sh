#!/usr/bin/env bash
# One-command Mac build: deps + node modules + whisper.cpp (Metal) + signed .dmg.
#
# Usage (unsigned, for personal use):
#   ./scripts/dist-mac.sh
#
# Usage (signed + notarized for distribution to non-technical users):
#   export APPLE_ID="you@example.com"
#   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # https://appleid.apple.com
#   export APPLE_TEAM_ID="ABCDE12345"
#   export CSC_LINK="path/to/DeveloperID.p12"                  # or use keychain
#   export CSC_KEY_PASSWORD="…"
#   ./scripts/dist-mac.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "✘ dist-mac.sh must run on macOS." ; exit 1
fi

echo "▸ [1/6] Xcode Command Line Tools check…"
xcode-select -p >/dev/null 2>&1 || xcode-select --install

echo "▸ [2/6] Installing Node dependencies…"
npm install --no-audit --no-fund

echo "▸ [3/6] Building whisper.cpp (Metal accelerated)…"
bash scripts/build-whisper-unix.sh

echo "▸ [4/6] Generating Linux PNG (also used as fallback)…"
npm run make:icon

echo "▸ [5/6] Generating .icns icon…"
ICONSET="resources/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for size in 16 32 64 128 256 512 1024; do
  sips -z "$size" "$size" resources/icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  half=$((size/2))
  [[ $half -ge 16 ]] && sips -z "$size" "$size" resources/icon.png --out "$ICONSET/icon_${half}x${half}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o resources/icon.icns
rm -rf "$ICONSET"

echo "▸ [6/6] Packaging .dmg…"
npm run dist

echo
echo "✔ Done. Installer:"
ls -lh dist-installer/*.dmg
