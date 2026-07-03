#!/usr/bin/env bash
# Make the whisper.cpp binaries + dylibs self-contained on macOS.
#
# whisper.cpp's CMake build bakes absolute LC_RPATH entries pointing at the
# (temporary) build tree and links siblings via @rpath/libX.dylib. Once we copy
# the artifacts into resources/whisper-bin and delete the build tree, those
# rpaths dangle. It happens to work in `npm run dev` only because the app sets
# DYLD_LIBRARY_PATH — but macOS strips DYLD_* from child processes launched by a
# hardened-runtime (signed) app, so a packaged .dmg would crash on first
# transcription with "Library not loaded: @rpath/libwhisper.1.dylib".
#
# Fix: give every Mach-O an `@loader_path` rpath (all artifacts are siblings) and
# drop the stale absolute build-tree rpaths. Then @rpath/libX.dylib resolves to
# the file sitting next to the loader — env-free and signing-safe.
#
# Idempotent: safe to re-run. Called automatically by build-whisper-unix.sh on
# macOS; can also be run standalone against an existing resources/whisper-bin.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:-$ROOT/resources/whisper-bin}"

[[ "$(uname -s)" == "Darwin" ]] || { echo "fix-macos-rpaths.sh: not macOS, skipping."; exit 0; }
[[ -d "$DIR" ]] || { echo "✘ $DIR not found"; exit 1; }

shopt -s nullglob
for f in "$DIR"/whisper-cli "$DIR"/whisper-server "$DIR"/*.dylib; do
  [[ -f "$f" ]] || continue

  # Drop absolute build-tree rpaths (anything not already @loader_path).
  while IFS= read -r rp; do
    [[ "$rp" == "@loader_path" ]] && continue
    install_name_tool -delete_rpath "$rp" "$f" 2>/dev/null || true
  done < <(otool -l "$f" | awk '/LC_RPATH/{f=1} f&&/path /{print $2; f=0}')

  # Ensure a single @loader_path rpath so @rpath/* resolves to siblings.
  if ! otool -l "$f" | awk '/LC_RPATH/{f=1} f&&/path /{print $2; f=0}' | grep -qx '@loader_path'; then
    install_name_tool -add_rpath '@loader_path' "$f"
  fi
  echo "  patched $(basename "$f")"
done

# Re-sign ad-hoc: editing a Mach-O invalidates its signature, and on Apple
# Silicon an invalid signature is worse than none (the loader kills it).
# electron-builder re-signs with a real identity at package time; this keeps the
# dev/unsigned artifacts runnable in the meantime.
for f in "$DIR"/whisper-cli "$DIR"/whisper-server "$DIR"/*.dylib; do
  [[ -f "$f" ]] && codesign --force --sign - "$f" 2>/dev/null || true
done

echo "✔ macOS rpaths patched to @loader_path in $DIR"
