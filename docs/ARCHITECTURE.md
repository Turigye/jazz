# Jazz — Technical Architecture Document

**Version:** 1.0  
**Date:** 2026-05-19  
**Status:** Approved for implementation

---

## 1. System Overview

Jazz is an **Electron-based Windows desktop application** that:
1. Listens for a global hotkey (`Ctrl+Win` by default)
2. Captures microphone audio while the key is held
3. Transcribes the audio on-device using **whisper.cpp** via a native Node.js addon
4. Post-processes the transcript (filler word removal, punctuation cleanup)
5. Injects the final text into the currently focused input field

```
┌────────────────────────────────────────────────────────────┐
│                     Jazz Electron App                       │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Main Process│    │  IPC Bridge  │    │ Renderer     │  │
│  │  (Node.js)   │◄──►│  (ipcMain/   │◄──►│  (Settings   │  │
│  │              │    │   ipcRenderer│    │   UI / Tray  │  │
│  └──────┬───────┘    └──────────────┘    │   Overlay)   │  │
│         │                                └──────────────┘  │
│  ┌──────▼───────────────────────────────────────────────┐  │
│  │                 Core Services (Main Process)          │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Hotkey     │  │   Audio     │  │  STT Engine │  │  │
│  │  │  Manager    │  │  Capture    │  │  (whisper   │  │  │
│  │  │  (iohook /  │  │  Service    │  │   .cpp via  │  │  │
│  │  │  uIOhook)   │  │  (naudiodon)│  │   addon)    │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │  │
│  │         │                │                 │          │  │
│  │  ┌──────▼────────────────▼─────────────────▼──────┐  │  │
│  │  │              Pipeline Orchestrator              │  │  │
│  │  └─────────────────────────┬───────────────────────┘  │  │
│  │                            │                           │  │
│  │  ┌─────────────────────────▼───────────────────────┐  │  │
│  │  │  Post-Processing Service                         │  │  │
│  │  │  (filler removal, dictionary, snippets)          │  │  │
│  │  └─────────────────────────┬───────────────────────┘  │  │
│  │                            │                           │  │
│  │  ┌─────────────────────────▼───────────────────────┐  │  │
│  │  │  Text Injection Service                          │  │  │
│  │  │  (clipboard+SendInput / UIAutomation)            │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Core Runtime

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| App Shell | **Electron 34+** | Cross-platform desktop, system tray, global hotkeys, native addons, good Windows support |
| Language | **TypeScript** (main + renderer) | Type safety, better DX, easier maintenance |
| Build | **electron-builder** | NSIS installer, auto-update hooks, code signing |
| Package Manager | **npm** (or pnpm) | Standard; pnpm preferred for disk efficiency |

### 2.2 Speech-to-Text Engine

**Primary:** `whisper.cpp` via `@lumen-labs-dev/whisper-node` or `smart-whisper` npm package  
**Fallback / Alternative:** `sherpa-onnx` (npm: `sherpa-onnx`) — lighter, faster for streaming

#### Model Selection Strategy

| Model | File Size | RAM | Speed (4-core CPU) | WER | Recommended For |
|-------|-----------|-----|-------------------|-----|-----------------|
| `ggml-tiny.en.bin` | 75 MB | ~273 MB | ~0.3s / 10s audio | ~9% | Fast hardware check, fallback |
| `ggml-base.en.bin` | 142 MB | ~380 MB | ~0.7s / 10s audio | ~6% | Low-end CPUs |
| `ggml-small.en.bin` | 244 MB | ~466 MB | ~1.2s / 10s audio | ~4% | **Default — best balance** |
| `ggml-small.en-q5_1.bin` | 190 MB | ~350 MB | ~0.9s / 10s audio | ~4.5% | Quantized, slightly faster |
| `ggml-medium.en.bin` | 769 MB | ~1.5 GB | ~3.5s / 10s audio | ~3% | High-accuracy option |

**Default recommendation: `ggml-small.en-q5_1` (quantized small English)**  
- 190 MB download, ~350 MB RAM, ~1s latency on a 6-core CPU, excellent accuracy for coding prompts

### 2.3 Audio Capture

**Implemented:** Web Audio API in a hidden renderer window (`getUserMedia` +
`ScriptProcessorNode`), downsampled to 16 kHz mono Int16 PCM and posted to the
main process over IPC on stop.

> **Note:** The original design specified the native `naudiodon` (PortAudio)
> addon. It has no prebuilt binaries for current Node/Electron and fails to
> compile from source on Windows + Node 24. The Web Audio approach is fully
> offline, requires no native build, and yields the exact 16 kHz mono PCM that
> whisper.cpp expects. Mic device enumeration uses `enumerateDevices()`.

### 2.4 Global Hotkey

**Library:** `uiohook-napi` (cross-platform, no root needed on Windows)

- Intercepts `Ctrl+Win` key-down and key-up events at OS level
- Does NOT block the keypress from the OS (non-exclusive hook)
- Runs in a separate worker thread to avoid blocking the main loop

**Important:** `Ctrl+Win` on Windows — `Win` alone triggers the Start menu, but held with `Ctrl` does not on Windows 10/11. Tested safe.

### 2.5 Text Injection

Two-tier injection strategy:

**Tier 1 — Clipboard + Paste (primary, works everywhere):**
```
1. Save current clipboard content
2. Write transcribed text to clipboard
3. Send Ctrl+V (or Ctrl+Shift+V for terminals) to focused window
4. Restore original clipboard after 300ms
```

**Tier 2 — UIAutomation / SendInput (fallback for clipboard-hostile apps):**
- Uses `node-ffi-napi` to call Win32 `SendInput()` with WM_CHAR messages
- Slower for long texts but works where clipboard is locked

**Terminal Detection:**
- Detect window class names: `ConsoleWindowClass` (cmd.exe), `VirtualTerminalClass` (Windows Terminal), common terminal emulators
- For terminals: use `Ctrl+Shift+V`

### 2.6 UI Framework (Renderer)

| Component | Technology |
|-----------|-----------|
| Framework | React 18 + TypeScript |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui |
| State | Zustand (lightweight, no Redux overhead) |
| Storage | `electron-store` (JSON config, persisted to AppData) |

### 2.7 Overlay / Feedback

A small **always-on-top transparent overlay window** (Electron `BrowserWindow` with `transparent: true, frame: false, alwaysOnTop: true`) displays:
- 🔴 Red pulsing dot when recording
- ⚡ Spinner when transcribing
- ✓ Green checkmark on success (fades after 1.5s)

Positioned in the bottom-right corner by default.

---

## 3. Process Architecture

### Main Process (`main/`)
Responsible for:
- App lifecycle (ready, quit, second-instance prevention)
- System tray icon + context menu
- Global hotkey registration (uiohook-napi)
- Audio capture coordination
- STT engine calls
- Text injection
- IPC message routing to renderer

### Renderer Process (`renderer/`)
Responsible for:
- Settings window (React app)
- Overlay window (minimal React component)
- Communicates with main via `contextBridge` (no nodeIntegration in renderer)

### IPC Contract

```typescript
// Main → Renderer
'jazz:recording-started'    // overlay: show recording state
'jazz:transcribing'         // overlay: show processing state
'jazz:injected'             // overlay: show success + text preview
'jazz:error'                // overlay: show error

// Renderer → Main
'jazz:settings-changed'     // update runtime config
'jazz:model-download-start' // trigger model download
'jazz:snippet-added'        // update snippet store
```

---

## 4. Data Flow

```
User holds Ctrl+Win
        │
        ▼
HotkeyManager fires 'keydown'
        │
        ▼
AudioCapture.start()
  → naudiodon stream → PCM buffer accumulates
        │
User releases Ctrl+Win
        │
        ▼
AudioCapture.stop() → returns Float32Array (16kHz mono PCM)
        │
        ▼
STTEngine.transcribe(pcmBuffer)
  → whisper.cpp processes audio
  → returns raw text string
        │
        ▼
PostProcessor.process(rawText, config)
  → FillerWordFilter.clean()
  → DictionaryCorrector.apply()
  → SnippetExpander.expand()
  → returns cleaned text
        │
        ▼
TextInjector.inject(cleanedText)
  → detect focused window type
  → choose injection method (clipboard / SendInput)
  → inject text
        │
        ▼
Overlay shows success, fades out
```

---

## 5. File & Folder Structure

```
jazz/
├── electron.vite.config.ts        # Vite config for Electron
├── package.json
├── tsconfig.json
│
├── src/
│   ├── main/                      # Main process (Node.js)
│   │   ├── index.ts               # Entry point, app lifecycle
│   │   ├── tray.ts                # System tray setup
│   │   ├── hotkey.ts              # uiohook-napi hotkey manager
│   │   ├── audio.ts               # naudiodon audio capture
│   │   ├── stt/
│   │   │   ├── engine.ts          # STT engine abstraction
│   │   │   ├── whisper.ts         # whisper.cpp adapter
│   │   │   └── models.ts          # Model download / verify
│   │   ├── postprocess/
│   │   │   ├── index.ts           # Post-processing pipeline
│   │   │   ├── filler.ts          # Filler word removal
│   │   │   ├── dictionary.ts      # Personal dictionary
│   │   │   └── snippets.ts        # Snippet expansion
│   │   ├── inject/
│   │   │   ├── index.ts           # Injection strategy selector
│   │   │   ├── clipboard.ts       # Clipboard + paste method
│   │   │   └── sendinput.ts       # Win32 SendInput method
│   │   ├── ipc.ts                 # IPC handlers
│   │   └── store.ts               # electron-store config
│   │
│   ├── renderer/
│   │   ├── overlay/               # Recording overlay window
│   │   │   ├── index.html
│   │   │   └── Overlay.tsx
│   │   └── settings/              # Settings window
│   │       ├── index.html
│   │       └── App.tsx
│   │
│   └── shared/
│       ├── types.ts               # Shared TypeScript types
│       └── constants.ts           # Hotkey codes, defaults
│
├── models/                        # Downloaded GGML model files (gitignored)
│   └── .gitkeep
│
├── resources/
│   ├── icon.ico                   # Tray icon
│   ├── icon-recording.ico         # Tray icon when recording
│   └── sounds/                    # Optional audio feedback
│
└── docs/                          # Documentation
    ├── PRD.md
    ├── ARCHITECTURE.md
    └── PLAN.md
```

---

## 6. Model Download & Storage

Models are stored in:
```
%APPDATA%\Jazz\models\
```

Download flow:
1. On first launch, detect no models present → open First Run wizard
2. User selects preferred model (default: small.en-q5_1)
3. Download from Hugging Face (`https://huggingface.co/ggerganov/whisper.cpp`) with progress bar
4. SHA256 verify after download
5. Store model path in `electron-store`

---

## 7. Security Considerations

- **nodeIntegration: false** in all renderer BrowserWindows
- **contextIsolation: true** everywhere
- All IPC calls are type-checked; no eval, no shell.openExternal with arbitrary URLs
- No network access post-setup except for optional Ollama (localhost only)
- Model files stored in user AppData, not Program Files (no admin elevation needed)
- Clipboard content is read then immediately restored — no logging of clipboard

---

## 8. Build & Distribution

```
# Development
npm run dev              # Electron + Vite HMR

# Production build
npm run build            # TypeScript compile + Vite bundle
npm run dist             # electron-builder → dist/Jazz-Setup-x.x.x.exe
```

**electron-builder config** (in `package.json`):
- Target: NSIS installer (Windows)
- Architecture: x64
- Icons: `resources/icon.ico`
- extraResources: native addons (whisper node addon `.node` file), prebuilt Windows fast-paste binary

---

## 9. Native Addon Strategy

whisper.cpp is a C++ library. We integrate it via:

**Option A (Preferred): `smart-whisper` npm package**
- Wraps whisper.cpp as a Node.js native addon
- Precompiled binaries available for Windows x64
- Supports passing PCM Float32 data directly (no temp file needed)
- Install: `npm install smart-whisper`

**Option B: `@kutalia/whisper-node-addon`**
- Also precompiled, supports real-time PCM input
- Requires `node-gyp` / Visual C++ Build Tools if recompiling
- Install: `npm install @kutalia/whisper-node-addon`

**Option C: Child process whisper.cpp binary**
- Ship precompiled `whisper.exe` (from whisper.cpp releases)
- Call via `child_process.spawn` with PCM audio piped in
- Most portable, no rebuild needed for Electron version bumps
- Slight overhead from process spawn (~50ms)

**Recommendation:** Start with **Option C** (binary + child process) for reliability during development, then migrate to Option A for a cleaner production build.

---

## 10. Key Third-Party Packages

```json
{
  "dependencies": {
    "electron": "^34.0.0",
    "electron-store": "^10.0.0",
    "uiohook-napi": "^1.5.5",
    "naudiodon": "^2.4.0",
    "smart-whisper": "^1.x",
    "zustand": "^5.x",
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "electron-builder": "^25.x",
    "electron-vite": "^2.x",
    "typescript": "^5.x",
    "@types/node": "^22.x",
    "tailwindcss": "^4.x",
    "vite": "^6.x"
  }
}
```

---

## 11. Performance Targets & Benchmarks

| Scenario | Target | Method |
|---------|--------|--------|
| Idle CPU | < 1% | Electron main process, no polling |
| Idle RAM | < 80 MB | Renderer not loaded when hidden |
| Audio capture start | < 50ms | Pre-warm naudiodon |
| Transcription (10s audio, small.en-q5_1, 6-core CPU) | < 1.5s | whisper.cpp threaded |
| Total end-to-end (key release → text injected) | < 2.5s | Pipeline fully async |
| Cold start to ready | < 3s | Model loaded lazily |

---

*End of Architecture Document*
