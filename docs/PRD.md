# Jazz — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-05-19  
**Author:** Mich  
**Status:** Draft — ready for implementation

---

## 1. Overview

Jazz is a **fully offline, privacy-first, Windows-native voice dictation application** inspired by Wispr Flow. It lets you press a global hotkey, speak naturally, and have your words instantly transcribed and injected into any focused input field on your computer — in any app, at any time.

Jazz runs entirely on-device. No audio ever leaves your machine. No API keys. No subscriptions. No cloud dependency of any kind.

The primary use case is **vibe coding** — speaking to AI coding tools (Cursor, VS Code + Copilot, Claude, ChatGPT, etc.) faster and more expressively than typing.

---

## 2. Goals

### Primary Goals
- Replace Wispr Flow with a **100% local, zero-cost** alternative
- Achieve sub-2-second transcription latency on modern consumer hardware (no GPU required)
- Work in **every Windows application** without per-app integration
- Support the `Ctrl + Win` trigger hotkey (matching Wispr Flow's Windows shortcut feel)

### Secondary Goals
- Match Wispr Flow's core feature set: push-to-talk, AI post-processing (cleanup filler words), command mode, snippets, personal dictionary
- Be a great tool for **developers** (IDE-aware, terminal-aware text injection)
- Support future extensibility (additional STT engines, LLM post-processing backends)

### Non-Goals (v1)
- Mobile app (iOS/Android)
- Cloud transcription mode
- Multi-user / team features
- Custom wake word / always-on listening (privacy concern, battery)

---

## 3. Target User

**Primary persona:** Mich — developer, vibe coder, power user.
- Uses Windows daily
- Dictates long prompts to AI coding tools (Cursor, VS Code, ChatGPT, Claude)
- Wants speed: speaking is 3–4× faster than typing
- Is comfortable installing desktop apps and simple dev tooling
- Has no GPU (or an optional NVIDIA GPU) — must work on CPU

---

## 4. Feature Requirements

### 4.1 Core — Must Have (v1)

| ID | Feature | Description |
|----|---------|-------------|
| F-01 | **Global Push-to-Talk** | `Ctrl + Win` hold-to-record; release to transcribe & inject. Single press-and-hold interaction. |
| F-02 | **On-Device Transcription** | Audio never leaves the device. Uses whisper.cpp (GGML) or sherpa-onnx. No API keys required. |
| F-03 | **Universal Text Injection** | Transcribed text is inserted at the cursor position of the currently focused window in any app. |
| F-04 | **System Tray App** | Runs silently in the system tray. No taskbar clutter. Right-click menu for settings/quit. |
| F-05 | **Visual Recording Indicator** | Small overlay or tray icon animation shows when Jazz is actively recording. |
| F-06 | **Filler Word Removal** | Optional AI post-processing step removes "um", "uh", "like", "you know" etc. using a lightweight local LLM or rule-based approach. |
| F-07 | **Auto Punctuation** | Transcription includes punctuation (supported natively by Whisper medium/large models). |
| F-08 | **Model Selection** | User can choose STT model size (tiny/base/small/medium) in settings — trading speed for accuracy. |
| F-09 | **First-Run Setup** | Wizard downloads and verifies the chosen Whisper GGML model on first launch. |
| F-10 | **Settings UI** | Tray → Settings opens a simple configuration panel (hotkey, model, language, post-processing toggles). |

### 4.2 Enhanced — Should Have (v1.5)

| ID | Feature | Description |
|----|---------|-------------|
| F-11 | **Command Mode** | Hold a secondary hotkey (`Ctrl + Win + Alt`) + speak to issue AI editing commands on selected text: "make this shorter", "fix grammar", "translate to French". Uses a local LLM (Ollama) if available, falls back to rule-based. |
| F-12 | **Personal Dictionary** | User-defined list of words/phrases that are always recognized correctly (names, tech terms, brand names). Applied as post-processing substitution. |
| F-13 | **Snippets** | Voice-activated text macros. Say a trigger phrase → expands to saved long-form text (e.g., "insert my email" → full email address). |
| F-14 | **Hands-Free Mode** | VAD (Voice Activity Detection) mode — automatically starts/stops recording based on speech detection. Toggle on/off. |
| F-15 | **Language Auto-Detection** | Whisper detects language automatically; user can also pin a specific language. |
| F-16 | **Transcript History** | Last N transcriptions shown in tray popover. Click to copy. |
| F-17 | **IDE-Aware Paste** | Detects when a terminal is focused and uses `Ctrl+Shift+V` instead of `Ctrl+V`. |

### 4.3 Advanced — Nice to Have (v2+)

| ID | Feature | Description |
|----|---------|-------------|
| F-18 | **NVIDIA GPU Acceleration** | If CUDA is available, use it for faster inference. |
| F-19 | **Parakeet Engine** | Optional NVIDIA Parakeet-TDT 0.6B backend for English — fastest possible CPU inference. |
| F-20 | **Hotkey Customization** | User can rebind the push-to-talk hotkey to any combo. |
| F-21 | **Audio Feedback** | Soft click/chime sounds on record start/stop. |
| F-22 | **Ollama Integration** | Route Command Mode through local Ollama LLM for richer rewriting. |
| F-23 | **Speaker Notes / Meeting Mode** | Long-form transcription of a meeting with timestamps (future). |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Latency** | Transcription of a 10-second recording must complete in ≤ 2 seconds on a modern 4-core CPU (using whisper.cpp small.en q5 model) |
| **Privacy** | Zero network calls during recording or transcription. Audio is processed in memory and never written to disk beyond a temporary buffer. |
| **Resource Usage** | Idle memory footprint < 80 MB. Peak (during transcription) < 600 MB RAM. CPU usage < 5% at idle. |
| **Startup** | App launches and is ready to record within 3 seconds of system tray availability. |
| **Compatibility** | Windows 10 (21H2+) and Windows 11. Both x64. |
| **Distribution** | Single portable `.exe` installer or NSIS installer. No system-level driver installation required. |
| **Accessibility** | Overlay must be visually unobtrusive and closeable. |

---

## 6. User Stories

**As a developer using Cursor:**
> I want to press and hold `Ctrl+Win`, speak a long prompt, and release so that the transcribed text instantly appears in the Cursor chat — without me having to type at all.

**As a vibe coder:**
> I want filler words removed from my dictation so my prompts read cleanly and professionally, even when I speak casually.

**As a power user:**
> I want to create snippets so that saying "insert jazz header" automatically expands to my standard project boilerplate comment block.

**As a privacy-conscious user:**
> I want to be 100% sure my voice recordings never leave my computer, even when an internet connection is available.

**As a non-technical user (future):**
> I want to install Jazz with one click and have it work without any configuration.

---

## 7. Constraints & Risks

| Risk | Mitigation |
|------|-----------|
| Hotkey `Ctrl+Win` may conflict with Windows system shortcuts | Provide fallback/configurable hotkey; test on Win 10 & 11 |
| Text injection may fail in certain apps (elevated privileges, games, UWP) | Detect failure, fall back to clipboard-paste; surface error to user |
| First-time model download (whisper small ~244 MB) may frustrate users on slow connections | Show progress bar; allow model pre-bundling in installer for future |
| whisper.cpp latency on very old CPUs | Offer tiny.en model as fallback; document minimum requirements |
| Electron bundle size (~100–150 MB) | Acceptable for a desktop app; use electron-builder with compression |

---

## 8. Success Metrics (Personal Use)

- Hotkey fires reliably 100% of the time
- Transcription accuracy ≥ 95% for clear English speech
- End-to-end latency (key press → text in field) ≤ 2.5 seconds for 10s clip
- Zero data sent to any external server (verified via network monitor)
- Works in: VS Code, Cursor, ChatGPT (browser), Claude (browser), Notepad, Slack, Discord, Terminal

---

## 9. Out of Scope for v1

- macOS / Linux support
- Cloud transcription fallback
- Meeting transcription / diarization
- Mobile companion app
- Anything requiring a paid API

---

*End of PRD*
