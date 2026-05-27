# Jazz — Execution Plan

**Version:** 1.0  
**Date:** 2026-05-19

This document is the **step-by-step implementation roadmap** for Jazz. Follow phases in order. Each phase produces a working, testable milestone.

---

## Phase 0 — Project Bootstrap (Day 1)

**Goal:** Get a runnable Electron + TypeScript app with system tray, global hotkey firing, and a "hello world" transcript.

### Tasks

- [ ] 0.1 Initialize project: `npm create electron-vite@latest jazz -- --template react-ts`
- [ ] 0.2 Install core deps:
  ```
  npm install uiohook-napi naudiodon electron-store zustand
  npm install -D electron-builder @types/node
  ```
- [ ] 0.3 Configure `electron-builder` in `package.json` — NSIS target, Windows x64, icon
- [ ] 0.4 Create system tray (`src/main/tray.ts`):
  - Load `icon.ico` from `resources/`
  - Context menu: "Settings", "Quit"
  - App stays alive when window closed (`app.dock.hide()` equivalent for Windows)
- [ ] 0.5 Prevent multiple instances (`app.requestSingleInstanceLock()`)
- [ ] 0.6 Register global hotkey (`src/main/hotkey.ts`):
  - `Ctrl+Win` keydown → emit `recording:start`
  - `Ctrl+Win` keyup → emit `recording:stop`
  - Console log both events
- [ ] 0.7 Wire up `electron-store` for config persistence (`src/main/store.ts`)
- [ ] 0.8 Create minimal overlay window (`src/renderer/overlay/`):
  - Transparent, frameless, always-on-top
  - Bottom-right corner
  - Shows "●REC" text when recording, hidden otherwise

**Milestone:** App launches to tray. Pressing `Ctrl+Win` shows "●REC" in corner, releasing hides it.

---

## Phase 1 — Audio Capture (Day 1–2)

**Goal:** Capture microphone audio while key is held and save to a PCM buffer.

### Tasks

- [ ] 1.1 Create `src/main/audio.ts`:
  - `AudioCapture` class with `start()`, `stop()` methods
  - Use `naudiodon` to open default microphone at 16000 Hz, 16-bit, mono
  - Accumulate PCM chunks into a `Buffer` array
  - `stop()` returns concatenated `Buffer`
- [ ] 1.2 Wire `recording:start` → `AudioCapture.start()`
- [ ] 1.3 Wire `recording:stop` → `AudioCapture.stop()` → log buffer size
- [ ] 1.4 Add mic device listing to settings store
- [ ] 1.5 Handle `naudiodon` errors gracefully (no mic, permission denied)

**Milestone:** Holding hotkey captures audio, releasing logs "Captured X bytes of audio".

---

## Phase 2 — STT Engine Integration (Day 2–4)

**Goal:** Transcribe captured audio using whisper.cpp running locally.

### Tasks

- [ ] 2.1 Download precompiled `whisper.cpp` Windows binary:
  - Get `main.exe` and `whisper.dll` from whisper.cpp releases
  - Place in `resources/whisper-bin/`
- [ ] 2.2 Implement model download (`src/main/stt/models.ts`):
  - Target dir: `%APPDATA%\Jazz\models\`
  - Download `ggml-small.en-q5_1.bin` from Hugging Face on first run
  - SHA256 verification
  - Progress events sent to renderer via IPC
- [ ] 2.3 Create `src/main/stt/engine.ts`:
  - `STTEngine` class with `transcribe(pcmBuffer: Buffer): Promise<string>`
  - Saves PCM buffer to temp `.wav` file
  - Spawns `whisper.exe -m <model> -f <wav> --no-timestamps -l en`
  - Parses stdout → returns text string
  - Cleans up temp file
- [ ] 2.4 Wire pipeline: `recording:stop` → `AudioCapture.stop()` → `STTEngine.transcribe()` → `console.log(transcript)`
- [ ] 2.5 Add overlay state: spinner while transcribing

**Milestone:** Hold hotkey, say "Hello, this is a test of Jazz dictation", release → transcript printed to console within 2 seconds.

---

## Phase 3 — Text Injection (Day 4–5)

**Goal:** Insert transcribed text at the cursor in the previously focused window.

### Tasks

- [ ] 3.1 Create `src/main/inject/clipboard.ts`:
  - Before starting recording: snapshot `clipboard.readText()`
  - After transcription: `clipboard.writeText(cleanText)`
  - Send `Ctrl+V` to OS via `uiohook-napi` or `robotjs` / `@nut-tree/nut-js`
  - After 300ms: restore original clipboard
- [ ] 3.2 Detect terminal windows (`src/main/inject/index.ts`):
  - Call `GetForegroundWindow()` + `GetClassName()` via `node-ffi-napi`
  - Map known terminal class names → use `Ctrl+Shift+V`
- [ ] 3.3 Ensure focus is returned to target window before paste:
  - Record the foreground HWND when hotkey is pressed
  - Before paste, `SetForegroundWindow(savedHWND)`
- [ ] 3.4 Handle injection errors (window closed, focus lost) → surface notification

**Milestone:** Hold hotkey in a Notepad window, speak, release → text appears in Notepad. Hold in Windows Terminal, speak, release → text appears in terminal prompt.

---

## Phase 4 — Post-Processing (Day 5–6)

**Goal:** Clean up transcripts before injection — remove fillers, apply dictionary, expand snippets.

### Tasks

- [ ] 4.1 Create `src/main/postprocess/filler.ts`:
  - Regex-based removal of: um, uh, like, you know, kind of, sort of, basically, actually (as standalone words)
  - Configurable: can be toggled off in settings
- [ ] 4.2 Create `src/main/postprocess/dictionary.ts`:
  - Load user's personal dictionary from `electron-store`
  - Case-insensitive find-and-replace (e.g., "cursor" → "Cursor", "jaz" → "Jazz")
- [ ] 4.3 Create `src/main/postprocess/snippets.ts`:
  - Load snippet triggers + expansions from store
  - If transcript ends with a trigger phrase, expand it
  - Example: "insert my email" → "mich@example.com"
- [ ] 4.4 Create `src/main/postprocess/index.ts`:
  - Compose filler → dictionary → snippets pipeline
  - Returns final clean string

**Milestone:** Speak "um, basically I want to, uh, create a new function that like does the thing" → injected as "I want to create a new function that does the thing".

---

## Phase 5 — Settings UI (Day 6–8)

**Goal:** A proper settings window accessible from the tray.

### Tasks

- [ ] 5.1 Create React settings app (`src/renderer/settings/`):
  - Sections: General, Model, Hotkeys, Dictionary, Snippets, Advanced
- [ ] 5.2 **General tab:**
  - Toggle: Launch at Windows startup
  - Toggle: Filler word removal
  - Toggle: Auto punctuation
  - Language selector (auto-detect, en, fr, es, de, etc.)
- [ ] 5.3 **Model tab:**
  - Model size selector (tiny/base/small/medium) with speed/accuracy info
  - Download progress bar
  - "Test microphone" button
- [ ] 5.4 **Hotkeys tab:**
  - Push-to-talk hotkey display (currently Ctrl+Win — hardcoded in v1)
  - Command Mode hotkey
- [ ] 5.5 **Dictionary tab:**
  - Add/remove custom words
  - "Word I say" → "What Jazz types" mapping
- [ ] 5.6 **Snippets tab:**
  - Add/remove voice shortcuts
  - Trigger phrase → expansion text
- [ ] 5.7 Wire all settings changes to `electron-store` via IPC
- [ ] 5.8 Add "About Jazz" section with version, model info, open-source credits

**Milestone:** Clicking "Settings" in tray opens a clean React settings window. All tabs functional.

---

## Phase 6 — First-Run Experience (Day 8–9)

**Goal:** New users are guided to download a model before their first dictation.

### Tasks

- [ ] 6.1 On app start, check if any model exists in `%APPDATA%\Jazz\models\`
- [ ] 6.2 If no model: open First Run wizard window (separate BrowserWindow)
- [ ] 6.3 First Run wizard steps:
  1. Welcome screen — "Meet Jazz"
  2. Model picker — show 3 options (Fast/Balanced/Accurate) with GB/MB sizes
  3. Download screen — progress bar, estimated time
  4. Mic test — "Press Ctrl+Win and say 'Hello Jazz' to test"
  5. Done — "You're ready!"
- [ ] 6.4 Store `firstRunComplete: true` in electron-store on finish

**Milestone:** Fresh install → First Run wizard → model downloaded → hotkey works.

---

## Phase 7 — Polish & Reliability (Day 9–11)

**Goal:** Make it production-quality for daily use.

### Tasks

- [ ] 7.1 **Overlay improvements:**
  - Animated waveform during recording (Canvas, simple bars)
  - Show last N transcribed words in overlay while processing
  - Click overlay to copy last transcript
- [ ] 7.2 **Error handling:**
  - Mic not found → tray notification + settings opens to model tab
  - Transcription failed → tray notification with retry option
  - Hotkey conflict detected → warn in settings
- [ ] 7.3 **Tray history:**
  - Right-click tray → "Recent transcripts" submenu (last 5)
  - Click any item → re-injects or copies to clipboard
- [ ] 7.4 **Windows startup:**
  - `app.setLoginItemSettings({ openAtLogin: true })` toggle
- [ ] 7.5 **Silent audio detection:**
  - If audio RMS is below threshold after release, don't run transcription
  - Show "No audio detected" briefly on overlay
- [ ] 7.6 **Performance:**
  - Pre-warm whisper.cpp binary on app start (run a 0.5s silence through it)
  - This eliminates first-use latency spike
- [ ] 7.7 **Logging:**
  - Use `electron-log` for debug logging to `%APPDATA%\Jazz\logs\`

**Milestone:** Daily driver quality — reliable, no crashes, good UX feedback.

---

## Phase 8 — Installer & Distribution (Day 11–12)

**Goal:** A real `.exe` installer anyone can run.

### Tasks

- [ ] 8.1 Design `icon.ico` (256×256 + multi-size ICO) — music note + microphone motif
- [ ] 8.2 Configure `electron-builder`:
  ```json
  {
    "win": {
      "target": "nsis",
      "icon": "resources/icon.ico",
      "requestedExecutionLevel": "asUser"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": false,
      "createStartMenuShortcut": true
    }
  }
  ```
- [ ] 8.3 `npm run dist` → generates `dist/Jazz-Setup-1.0.0.exe`
- [ ] 8.4 Test install on clean Windows VM
- [ ] 8.5 Test app persists across reboot (startup item)

**Milestone:** Double-click installer → Jazz in tray within 30 seconds.

---

## Phase 9 — Command Mode (v1.5, Week 3+)

**Goal:** Voice commands to transform selected text using local AI.

### Tasks

- [ ] 9.1 Register secondary hotkey: `Ctrl+Win+Alt`
- [ ] 9.2 On trigger: read selected text from clipboard (Ctrl+C first)
- [ ] 9.3 Record user's spoken command
- [ ] 9.4 Route through local Ollama (if running) or built-in rule engine:
  - "make this shorter" → truncate / summarize
  - "fix grammar" → local grammar rules
  - "translate to French" → Ollama `llama3.2` model
  - "make this professional" → tone adjustment
- [ ] 9.5 Replace selection with transformed text

---

## Phase 10 — GPU Acceleration (v2, Optional)

**Goal:** Dramatically faster transcription for users with NVIDIA GPUs.

### Tasks

- [ ] 10.1 Detect CUDA availability at runtime
- [ ] 10.2 Download CUDA-enabled whisper.cpp binary if CUDA found
- [ ] 10.3 Update STT engine to use CUDA binary path
- [ ] 10.4 Surface GPU status in Settings → Model tab

---

## Development Environment Setup

```bash
# Prerequisites
# - Node.js 20+
# - Git
# - Windows 10/11 x64
# - Visual C++ Build Tools (for native addons, if recompiling)

git clone <your-repo>
cd jazz
npm install
npm run dev       # Start Electron in development mode

# To build installer:
npm run build
npm run dist
```

### Environment Variables (dev only)
```
JAZZ_DEV=true                 # enables DevTools in windows
JAZZ_MODEL_PATH=./models/     # override model directory
JAZZ_SKIP_FIRST_RUN=true      # skip first-run wizard
```

---

## Testing Checklist (per phase)

- [ ] Hotkey fires in: VS Code, Chrome, Notepad, Windows Terminal, Discord, Slack (browser), Cursor
- [ ] Text injects correctly in all above
- [ ] Clipboard is restored after injection
- [ ] Overlay appears and disappears correctly
- [ ] No audio sent to network (verify with Wireshark or Windows Firewall block)
- [ ] Settings persist across restarts
- [ ] Works after system sleep/wake
- [ ] Works with multiple monitors

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `naudiodon` native build fails on user machine | Medium | Ship precompiled `.node` binary; use portaudio.dll alongside |
| `uiohook-napi` hotkey conflict with other apps | Low | Detect and warn; make hotkey configurable |
| Whisper.cpp temp WAV file leaves disk artifacts | Low | Always clean up in `finally` block; use OS temp dir |
| Windows Defender flags whisper binary | Medium | Sign binaries; add to VirusTotal; provide build-from-source option |
| Electron upgrade breaks native addons | Medium | Pin Electron version; rebuild addons for each Electron version in CI |

---

*End of Execution Plan*
