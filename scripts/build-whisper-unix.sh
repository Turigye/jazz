#!/usr/bin/env bash
# Builds whisper.cpp from source for the current platform (Linux / macOS) and
# copies the binaries into resources/whisper-bin so electron-builder packages
# them. Run this ONCE per machine before `npm run dist` on Linux/macOS.
#
# Linux prereqs:    apt install build-essential cmake git           (Debian/Ubuntu/Mint)
# macOS prereqs:    xcode-select --install                          (Xcode CLT)
#
# Optional GPU acceleration:
#   Linux + NVIDIA: install CUDA toolkit, then run with WHISPER_CUDA=1
#   macOS:          Metal acceleration is on by default (Apple Silicon)

set -euo pipefail

VERSION="${VERSION:-v1.8.4}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/resources/whisper-bin"
TMP="$(mktemp -d -t jazz-whisper-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

OS="$(uname -s)"
case "$OS" in
  Linux*)   PLATFORM="linux" ;;
  Darwin*)  PLATFORM="macos" ;;
  *) echo "Unsupported OS: $OS — use scripts/fetch-whisper.ps1 on Windows."; exit 1 ;;
esac

echo "▸ whisper.cpp $VERSION for $PLATFORM"
echo "▸ Working directory: $TMP"

git clone --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$TMP/whisper.cpp"
cd "$TMP/whisper.cpp"

CMAKE_FLAGS=()
if [[ "$PLATFORM" == "macos" ]]; then
  # Metal is enabled by default in the whisper.cpp CMake on macOS.
  CMAKE_FLAGS+=(-DWHISPER_METAL=ON)
elif [[ "$PLATFORM" == "linux" && "${WHISPER_CUDA:-0}" == "1" ]]; then
  CMAKE_FLAGS+=(-DGGML_CUDA=ON)
  echo "▸ Building with CUDA support"
fi

cmake -B build "${CMAKE_FLAGS[@]}"
cmake --build build -j --config Release

mkdir -p "$DEST"

# Wipe Windows-only leftovers if this repo was previously used for a Windows
# build. We never want .exe / .dll in a Linux or macOS package.
rm -f "$DEST"/*.exe "$DEST"/*.dll 2>/dev/null || true

# Collect everything the runtime needs (binaries + dynamic libs).
if [[ "$PLATFORM" == "macos" ]]; then
  cp -v build/bin/whisper-cli "$DEST/" 2>/dev/null || true
  cp -v build/bin/whisper-server "$DEST/" 2>/dev/null || true
  # dylibs
  for f in build/src/*.dylib build/ggml/src/*.dylib build/ggml/src/**/*.dylib; do
    [ -f "$f" ] && cp -v "$f" "$DEST/"
  done
else
  cp -v build/bin/whisper-cli "$DEST/" 2>/dev/null || true
  cp -v build/bin/whisper-server "$DEST/" 2>/dev/null || true
  for f in build/src/*.so build/ggml/src/*.so build/ggml/src/**/*.so; do
    [ -f "$f" ] && cp -v "$f" "$DEST/"
  done
fi

chmod +x "$DEST"/whisper-cli "$DEST"/whisper-server 2>/dev/null || true

# macOS: whisper.cpp bakes rpaths pointing at the (now-deleted) build tree and
# links siblings via @rpath. Rewrite to @loader_path so the copied binaries find
# their dylibs with no DYLD_* env — which a hardened-runtime .app strips anyway.
if [[ "$PLATFORM" == "macos" ]]; then
  bash "$ROOT/scripts/fix-macos-rpaths.sh" "$DEST"
fi

echo
echo "✔ Installed whisper.cpp binaries to $DEST"
ls -lh "$DEST"
