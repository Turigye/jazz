# 🎵 Jazz

**Your personal offline voice dictation app for Windows.**  
*Like Wispr Flow — but 100% local, 100% free, zero cloud.*

---

## What is Jazz?

Jazz lets you hold `Ctrl+Win`, speak naturally, and have your words instantly typed into any app on your computer — Cursor, VS Code, ChatGPT, Claude, Slack, Discord, Notepad, the browser, anywhere.

It runs **entirely on your machine**. No API keys. No subscriptions. No audio ever leaves your computer.

Built for **vibe coders** who want to dictate prompts to AI tools faster than they can type.

---

## Features

| Feature | Status |
|---------|--------|
| `Ctrl+Win` push-to-talk | ✅ v1 |
| Works in every Windows app | ✅ v1 |
| 100% offline / on-device AI | ✅ v1 |
| Filler word removal | ✅ v1 |
| Auto punctuation | ✅ v1 |
| Personal dictionary | ✅ v1 |
| System tray app | ✅ v1 |
| Visual recording overlay | ✅ v1 |
| Settings UI | ✅ v1 |
| Snippet library | 🔜 v1.5 |
| Command Mode (AI text editing) | 🔜 v1.5 |
| NVIDIA GPU acceleration | 🔜 v2 |

---

## Tech Stack

- **Electron** + TypeScript + React + Tailwind CSS
- **whisper.cpp** (GGML quantized models) for speech-to-text
- **uiohook-napi** for global hotkey detection
- **Web Audio API** (hidden renderer window) for microphone capture — no native audio addon to build
- Zero external API calls

---

## Quick Start (Development)

```bash
# Prerequisites: Node.js 20+, Windows 10/11 x64
git clone <repo>
cd jazz
npm install
npm run dev
```

On first launch, Jazz will download the `ggml-small.en-q5_1` model (~190 MB).

---

## Build Installer

```bash
npm run build
npm run dist
# → dist/Jazz-Setup-1.0.0.exe
```

---

## Documentation

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — **What's next** (queued features, not yet shipped)
- [`docs/PRD.md`](docs/PRD.md) — Product Requirements Document
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Technical Architecture
- [`docs/PLAN.md`](docs/PLAN.md) — Phased Execution Plan
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — Research Notes & References

---

## Privacy

Jazz is designed to be maximally private:
- All audio is processed on-device using local AI models
- No telemetry, no analytics, no data collection
- No internet connection required after model download
- Audio buffers are held in memory only and never written to permanent storage

---

## Inspiration

Jazz is a personal clone of [Wispr Flow](https://wisprflow.ai/), built to replicate its core experience without cloud dependency or subscription cost.

---

*Jazz — speak your code into existence.*
