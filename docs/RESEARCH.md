# Jazz — Research Notes

**Date:** 2026-05-19

Research gathered to inform architecture and implementation decisions.

---

## 1. Wispr Flow Feature Analysis

### Core Feature Set (as of 2026)

| Feature | Wispr Flow | Jazz v1 | Jazz v1.5 |
|---------|-----------|---------|-----------|
| Push-to-talk hotkey | ✅ Ctrl+Win | ✅ | ✅ |
| Global (works in any app) | ✅ | ✅ | ✅ |
| Filler word removal | ✅ | ✅ | ✅ |
| Auto punctuation | ✅ | ✅ (Whisper native) | ✅ |
| Personal dictionary | ✅ | ✅ | ✅ |
| Snippet library | ✅ | 🔜 | ✅ |
| Command Mode | ✅ (Pro) | ❌ | ✅ |
| 100+ languages | ✅ | ✅ (Whisper) | ✅ |
| System tray | ✅ | ✅ | ✅ |
| Transcript history | ✅ | 🔜 | ✅ |
| Windows support | ✅ | ✅ | ✅ |
| 100% offline | ❌ (cloud) | ✅ | ✅ |
| Free | ❌ ($18/mo) | ✅ | ✅ |

### Wispr Flow Hotkey Details (Windows)
- Default: `Ctrl+Win` hold to record
- Command Mode: `Ctrl+Win+Alt`  
- Hands-free: `Ctrl+Win+Space`
- Press and release `Ctrl+Win` (tap) opens settings

### What Makes Wispr Flow Special
1. **Sub-second latency** — cloud-powered, extremely fast
2. **Context awareness** — learns your writing style
3. **Works everywhere** — hooks OS-level, not per-app
4. **Minimal UI** — stays out of the way

Jazz trades cloud speed for privacy and zero cost. On modern hardware with the small.en-q5_1 model, latency is ~1-2 seconds — acceptable for vibe coding.

---

## 2. Speech-to-Text Engine Comparison

### whisper.cpp
- **Source:** https://github.com/ggml-org/whisper.cpp
- C++ port of OpenAI Whisper, runs on CPU (and CUDA/Vulkan/Metal)
- GGML quantized models: 75MB (tiny) to 769MB (medium)
- Real-time streaming via `--stream` flag
- **Best for Jazz:** Pre-built Windows binary, no Python needed, Node.js addons available
- Accuracy: ~4% WER for small.en on clear speech

### faster-whisper
- **Source:** https://github.com/SYSTRAN/faster-whisper
- Python + CTranslate2 backend — 4x faster than original Whisper
- CPU and CUDA support
- **Not ideal for Jazz:** Requires Python runtime, heavier dependency for an Electron app

### sherpa-onnx
- **Source:** https://github.com/k2-fsa/sherpa-onnx
- Supports streaming/real-time recognition natively
- Has proper npm package (`sherpa-onnx`)
- Multiple model families (Whisper, Paraformer, Zipformer)
- **Good secondary option:** Native streaming, but model management is more complex

### NVIDIA Parakeet-TDT 0.6B v3
- **Source:** https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- 0.6B parameter model, English (v3 adds more languages)
- 6.05% WER, 50x faster than comparable models on NVIDIA hardware
- Requires NeMo framework (Python) or ONNX export
- **Best for Jazz v2:** If user has NVIDIA GPU, this is the fastest option

### Decision: whisper.cpp via binary (Phase 2), smart-whisper addon (Phase 7+)

---

## 3. Windows Text Injection Research

### Methods (ranked by compatibility)

**1. Clipboard + Ctrl+V (recommended)**
- Works in 99% of applications
- Fast, reliable, no elevated permissions needed
- Must restore clipboard after paste
- Terminal fix: use `Ctrl+Shift+V` in detected terminal windows

**2. Win32 SendInput (WM_CHAR)**
- Works where clipboard doesn't (some password managers, restricted fields)
- Slow for long strings (sends each character)
- Available via `node-ffi-napi` → `user32.dll!SendInput`
- Good fallback for short corrections

**3. UIAutomation SetValue**
- Works in Windows Forms, WPF, UIA-compliant apps
- Doesn't trigger input events in all apps
- Complex to implement — skip for v1

**Implementation plan:**
1. Save current HWND when hotkey pressed
2. On paste: `SetForegroundWindow(savedHWND)` then `SendInput(Ctrl+V)`
3. Detect terminals by window class name → use Ctrl+Shift+V

**Known terminal window class names:**
- `ConsoleWindowClass` — cmd.exe
- `VirtualTerminalClass` — Windows Terminal (newer)
- `mintty` — Git Bash
- `CASCADIA_HOSTING_WINDOW_CLASS` — Windows Terminal (older)
- `PseudoConsoleWindow` — Various

**OpenWhispr implementation reference:**
OpenWhispr ships a prebuilt `fast-paste.exe` Windows binary that handles all injection edge cases via Win32 SendInput with automatic terminal detection. This is a great reference for our `inject/` module.

---

## 4. Global Hotkey Libraries

### uiohook-napi
- **npm:** `uiohook-napi`
- Cross-platform, no root/admin required
- Prebuilt binaries for Windows
- Non-exclusive (doesn't block the keypress)
- **Best choice for Jazz**

### iohook
- Older, original library — uiohook-napi is the maintained fork
- Skip

### Electron's built-in globalShortcut
- `globalShortcut.register('CommandOrControl+Space', callback)`
- Easy but limited to Electron-supported combos
- `Win` key combinations are unreliable
- **Problem:** `Ctrl+Win` is not reliably supported — use uiohook-napi instead

### @nut-tree/nut-js
- Full desktop automation (mouse, keyboard, screen)
- Heavier dependency but powerful
- Can be used for text injection too (keyboard.type())
- Alternative if uiohook-napi has issues

---

## 5. Existing Open-Source References

### OpenWhispr
- **Repo:** https://github.com/OpenWhispr/openwhispr
- Stack: Electron 41, React 19, TypeScript, Tailwind v4, whisper.cpp, sherpa-onnx
- Features: local STT, NVIDIA Parakeet support, meeting transcription, speaker diarization
- **Closest to Jazz** — study this codebase carefully
- Has prebuilt Windows fast-paste binary — can borrow this approach

### SpeakType
- **Repo:** https://github.com/DrNightmare/speaktype
- Local-first, Windows-only, global hotkey, Whisper
- Lighter scope than Jazz — good reference for hotkey + injection

### whisper-typing
- **Repo:** https://github.com/rpfilomeno/whisper-typing
- "Free alternative to wisprflow" — Windows, Whisper, local
- Python-based

### Key lessons from these projects:
1. Ship a prebuilt `fast-paste.exe` for reliable Windows text injection
2. Pre-warm the whisper model on startup to eliminate cold-start latency
3. Store model in `%APPDATA%` not next to executable
4. Terminal detection by window class is reliable and sufficient

---

## 6. Electron Version Considerations

- **Recommended version:** Electron 34+ (ships with Node.js 22+, Chromium 132+)
- `electron-vite` significantly simplifies the build setup
- Use `contextBridge` + `preload.ts` — never `nodeIntegration: true`
- Native addon compatibility: must match Electron's Node.js ABI version
  - Use `electron-rebuild` or ship precompiled `.node` files per Electron version

---

## 7. Model Hosting

Models should be downloaded from:
- **Hugging Face:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/`
- Direct URLs:
  - `ggml-tiny.en.bin` — 74.8 MB
  - `ggml-base.en.bin` — 141.1 MB  
  - `ggml-small.en.bin` — 243.8 MB
  - `ggml-small.en-q5_1.bin` — ~189 MB (quantized, recommended default)
  - `ggml-medium.en.bin` — 769.1 MB

**SHA256 checksums** available from whisper.cpp repo — always verify after download.

---

## 8. Audio Format Requirements

whisper.cpp requires:
- Sample rate: **16,000 Hz**
- Channels: **1 (mono)**
- Bit depth: **16-bit signed PCM** (or 32-bit float)
- Format: WAV (if using CLI binary) or raw PCM Float32 buffer (if using Node addon)

naudiodon can capture in this format directly. No conversion step needed.

**Recording duration limits:**
- Practical max: 60 seconds (Whisper was designed for up to 30s chunks; longer clips work but accuracy may degrade)
- For vibe coding: most prompts are 5-30 seconds — perfect fit

---

*End of Research Notes*
