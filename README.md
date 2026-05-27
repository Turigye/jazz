# 🎵 Jazz

**Offline voice dictation for Windows, Linux, and macOS.**
Like Wispr Flow — but 100% local, 100% free, zero cloud.

Hold `Ctrl+Win` (or `Ctrl+Alt` to toggle hands-free), speak, and your words
type into whatever app has focus — Cursor, VS Code, ChatGPT, Claude, Slack,
Discord, Notepad, your browser. Anywhere.

No API keys. No subscriptions. No audio ever leaves your machine.

---

## Install

### Windows (just download)

Grab the latest installer from
**[Releases →](https://github.com/Turigye/jazz/releases/latest)** and
double-click. ~389 MB. Bundles the CUDA 12 runtime — on an NVIDIA GPU you get
~200ms transcription; without one it auto-falls-back to CPU.

> Windows SmartScreen will warn on first launch ("Windows protected your PC")
> because the installer is unsigned. Click **More info → Run anyway**. Signed
> builds for non-technical recipients are a future thing; see [docs/SETUP.md](docs/SETUP.md).

### Linux (one command, for your own machine)

```bash
git clone https://github.com/Turigye/jazz.git
cd jazz
chmod +x scripts/*.sh
./scripts/dist-linux.sh
```

That single script installs system deps (`apt` / `dnf`), npm modules, builds
whisper.cpp from source, and packages the installers. Result:

- `dist-installer/Jazz-1.0.0.AppImage` — double-click to run, no install
- `dist-installer/jazz_1.0.0_amd64.deb` — for apt-based distros

**For your own use**, run the AppImage directly:

```bash
chmod +x "dist-installer/Jazz-1.0.0.AppImage"
./dist-installer/Jazz-1.0.0.AppImage
```

NVIDIA Linux users wanting GPU acceleration: `WHISPER_CUDA=1 ./scripts/dist-linux.sh`.
Everyone else (including **Intel Iris Xe** integrated graphics) gets a clean
CPU build — `large-v3-turbo-q5_0` runs at ~2-3s per 5s of audio on a modern
Intel CPU, perfectly usable.

### macOS (one command, no Apple Developer required for personal use)

```bash
git clone https://github.com/Turigye/jazz.git
cd jazz
chmod +x scripts/*.sh
./scripts/dist-mac.sh
```

Builds whisper.cpp with **Metal** acceleration (uses your Apple Silicon /
Intel GPU automatically), packages a `.dmg`. The script does NOT require an
Apple Developer account — the resulting `.dmg` is unsigned and runs locally
on your own Mac.

**To run an unsigned .dmg on your own Mac:**
1. Open the `.dmg`, drag Jazz to Applications.
2. First launch: macOS will refuse to open it. Right-click the app →
   **Open** → confirm. This permission persists; subsequent launches are
   normal.
3. If Gatekeeper still blocks: `xattr -d com.apple.quarantine /Applications/Jazz.app`

That's it. No signing, no notarization, no App Store Connect.

> If you ever DO want to share a `.dmg` with non-technical friends/users,
> set `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_SPECIFIC_PASSWORD` /
> `CSC_LINK` env vars before running `dist-mac.sh` and you'll get a
> properly signed + notarized build. Optional; see [docs/SETUP.md](docs/SETUP.md).

---

## Hardware behavior

| Your machine | What runs | Latency (5s audio) |
|---|---|---|
| Windows + NVIDIA GPU | CUDA | ~200ms |
| Windows, no GPU | CPU (auto-fallback) | ~1-3s |
| Linux + NVIDIA (CUDA build) | CUDA | ~200ms |
| Linux Intel/AMD/Iris Xe | CPU | ~1-3s |
| macOS Apple Silicon | Metal GPU | ~150ms |
| macOS Intel | Metal where supported, CPU else | ~1-2s |

The GPU toggle in **Settings → General** lets you force CPU on any
GPU-capable machine.

---

## Features

- Hold `Ctrl+Win` to dictate, or tap `Ctrl+Alt` to toggle hands-free mode
- Custom hotkey rebinding (any modifier chord, F-keys, Space, letters)
- Always-visible draggable orb showing the active model + recording timer
- Vocabulary boost — feed whisper your jargon for far better recognition
- Personal dictionary (find/replace) and snippet expansion
- Transcript history with copy + re-inject
- Silero VAD trims silence/noise before encoding
- Beam search for higher accuracy
- System-audio muting while you talk
- Settings, first-run wizard, system tray, Windows 11 acrylic glass

---

## Tech Stack

- **Electron** + TypeScript + React + Tailwind CSS
- **whisper.cpp** (`large-v3-turbo-q5_0` by default) for speech-to-text
- **uiohook-napi** for global hotkey detection
- **Web Audio API** in a hidden renderer for mic capture — no native audio addon
- whisper-server architecture: model preloaded, HTTP POST per dictation, near-zero per-request overhead
- Zero external API calls

---

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) — Per-platform build instructions, signing
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — What's queued next
- [`docs/PRD.md`](docs/PRD.md) — Product Requirements
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Technical architecture
- [`docs/PLAN.md`](docs/PLAN.md) — Phased execution plan
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — Research notes

---

## Privacy

Jazz is designed to be maximally private:
- All audio is processed on-device using local AI models
- No telemetry, no analytics, no data collection
- No internet connection required after model download
- Audio buffers are held in memory only and never written to permanent storage

---

## Inspiration

Jazz is a personal clone of [Wispr Flow](https://wisprflow.ai/), built to
replicate its core experience without cloud dependency or subscription cost.

---

*Jazz — speak your code into existence.*
