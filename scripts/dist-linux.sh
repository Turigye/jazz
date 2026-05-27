#!/usr/bin/env bash
# One-command build: deps + node modules + whisper.cpp from source + installers.
# After this finishes you'll have dist-installer/*.AppImage and *.deb you can
# hand to anyone with a Linux machine — they just double-click.
#
# Usage:  ./scripts/dist-linux.sh
# CUDA:   WHISPER_CUDA=1 ./scripts/dist-linux.sh   (only useful for NVIDIA hosts)

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▸ [1/5] Installing system dependencies (sudo)…"
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y build-essential cmake git xdotool libxss1 libgtk-3-0 libnss3 libasound2t64 || \
    sudo apt-get install -y build-essential cmake git xdotool libxss1 libgtk-3-0 libnss3 libasound2
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc-c++ cmake git xdotool libXScrnSaver gtk3 nss alsa-lib
else
  echo "⚠ Unknown package manager. Install manually: build-essential cmake git xdotool gtk3 nss alsa"
fi

echo
echo "▸ [2/5] Installing Node dependencies…"
npm install --no-audit --no-fund

echo
echo "▸ [3/5] Building whisper.cpp from source…"
bash scripts/build-whisper-unix.sh

echo
echo "▸ [4/5] Generating Linux icon…"
npm run make:icon

echo
echo "▸ [5/5] Packaging installers (AppImage + .deb)…"
npm run dist

echo
echo "✔ Done. Installers are in dist-installer/"
ls -lh dist-installer/*.AppImage dist-installer/*.deb 2>/dev/null || ls -lh dist-installer/
