# Jazz — Roadmap

Tracks features that are agreed-on but not yet implemented. Items move to
[CHANGELOG.md](../CHANGELOG.md) once shipped (when we start one).

---

## Up next (queued, in order)

### 🎨 UI Redesign — pending designs
- **Status**: waiting on Google Stitch design output from Mich.
- **Scope**: full visual refresh of the settings window, wizard, and orb.
- **Constraints to preserve**:
  - Orb must remain non-focusable (clicking it can't steal focus from the dictation target)
  - Orb must remain draggable across all monitors
  - Tray menu structure (Model submenu, Recent transcripts, Settings, Quit) should survive
  - Existing keyboard interactions (Ctrl+Win push-to-talk, Ctrl+Alt toggle) are sacrosanct

### 🧠 Post-LLM cleanup pass — Wispr-Flow-style polish
- **Status**: not started — explicitly requested by Mich, do not forget.
- **What it does**: after whisper transcribes raw text, route it through a local LLM
  (Ollama) that rewrites disfluencies and grammar before the text is injected. This is
  the actual gap between local Jazz and Wispr cloud — Wispr does this server-side with
  their own LLM. We can match it locally.
- **Implementation sketch**:
  - New `src/main/postprocess/llm.ts` module that POSTs the raw transcript to
    a local Ollama endpoint (`http://localhost:11434/api/generate`) with a tight
    cleanup prompt ("Rewrite this dictated text to fix grammar, capitalization,
    and remove disfluencies. Preserve meaning. Output only the cleaned text.")
  - Slot it between `postProcess()` and `injectText()` in [pipeline.ts](../src/main/pipeline.ts)
  - Settings → General toggle: "AI cleanup (requires Ollama)"
  - Settings → General dropdown: choose Ollama model (default: `llama3.2:3b` or `qwen2.5:3b` —
    small + fast; ~200–400ms inference on GPU, ~1s on CPU)
  - Graceful degradation: if Ollama isn't running, skip the pass and inject the raw
    whisper text. Don't error out the dictation flow.
  - Add a one-time check at app start: if Ollama detected → enable toggle by default,
    if not → toggle remains off + tooltip explains how to install Ollama.
- **Expected impact**: this is the single biggest perceived-quality upgrade left.
  Punctuation, capitalization, and removing "uh"s and false starts are exactly what
  makes Wispr feel polished.
- **Risk**: adds 200ms–1s of latency to each dictation. Should be off by default for
  "talk fast" users and on for "talk thoughtful" users.

---

## Later

### Phase 9 — AI Command Mode (from original PLAN.md)
Voice commands to transform selected text. Ctrl+Win+Alt → read selection → speak
command → transformed text replaces selection. Routes through the same Ollama
endpoint as the cleanup pass (free upgrade once that's wired).

### Phase 10 — GPU Acceleration ✅ DONE (May 2026)
Bundled CUDA 12.4 build. Auto-detects NVIDIA GPU. Tested working on RTX 3060.

### Cross-platform (macOS / Linux) — in progress
- ✅ Cross-platform code split in place (text injection dispatches by `process.platform`)
- ✅ Audio ducking is Windows-only at runtime; mac/linux skip gracefully (TODO: implement)
- ✅ electron-builder mac (dmg) and linux (AppImage, deb) targets configured
- ✅ Linux PNG icon generated; build script for whisper.cpp from source on Unix (`npm run setup:whisper:unix`)
- ⏳ Test on Linux Mint laptop
- ⏳ macOS .icns icon needs Mac with `iconutil`
- ⏳ Mac code signing + notarization ($99/yr Apple Developer) — defer until ready to distribute

### Idle model unload
After N minutes of no dictation, drop the whisper-server's loaded model to free
~1.3 GB RAM. Reload on next press (~1s startup). Defer unless memory becomes a
user complaint.

### Code signing for unsigned-installer SmartScreen
Only worth doing when distributing to non-technical users. ~$300/yr EV cert via
cloud signing. See conversation history (May 2026) for full breakdown.

---

## Shipped (recent)

- ✅ NVIDIA GPU acceleration (CUDA 12.4)
- ✅ whisper-server architecture (model stays loaded, no per-request spawn)
- ✅ Silero VAD pre-encoding
- ✅ Large v3 Turbo Q5 model + first-class quantized options
- ✅ Always-visible draggable orb with state badge + elapsed timer
- ✅ Ctrl+Alt toggle mode
- ✅ Audio ducking (mute system output during capture)
- ✅ Tray model switcher
- ✅ Unlimited recording duration (no more 60s auto-cutoff)
- ✅ NSIS installer with bundled CUDA runtime
