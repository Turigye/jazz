import type { ModelInfo, ModelSize } from './types'

export const APP_NAME = 'Jazz'
export const APP_VERSION = '1.0.0'

// ─── Model Registry ───────────────────────────────────────────────────────────

export const MODELS: Record<ModelSize, ModelInfo> = {
  'tiny.en': {
    id: 'tiny.en',
    label: 'Tiny (Fast)',
    description: 'Fastest, lowest accuracy. Good for quick tests or slow hardware.',
    sizeMb: 75,
    ramMb: 273,
    latencyMs: 300,
    wer: 9,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    sha256: 'bd577a113a864445d4c299885e0cb97d4ba92b5f'
  },
  'base.en': {
    id: 'base.en',
    label: 'Base',
    description: 'Fast with decent accuracy. Good for older CPUs.',
    sizeMb: 142,
    ramMb: 380,
    latencyMs: 700,
    wer: 6,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    sha256: '137c40403d78fd54d454da0f9bd998f78703390c'
  },
  'small.en': {
    id: 'small.en',
    label: 'Small',
    description: 'Great balance of speed and accuracy.',
    sizeMb: 244,
    ramMb: 466,
    latencyMs: 1200,
    wer: 4,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    sha256: '55356645c2b361a969dfd0ef2c5a50d530afd8d5'
  },
  'small.en-q5_1': {
    id: 'small.en-q5_1',
    label: 'Small (Quantized)',
    description: 'Quantized small model — 20% faster, 20% less RAM, same accuracy.',
    sizeMb: 190,
    ramMb: 350,
    latencyMs: 900,
    wer: 4.5,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin',
    sha256: ''
  },
  'medium.en': {
    id: 'medium.en',
    label: 'Medium',
    description: 'Solid English accuracy, slower than turbo and larger on disk.',
    sizeMb: 769,
    ramMb: 1500,
    latencyMs: 3500,
    wer: 3,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    sha256: 'fd9727b6e1217c2f614f9b698455c4ffd82463b4'
  },
  'large-v3-turbo-q5_0': {
    id: 'large-v3-turbo-q5_0',
    label: 'Large v3 Turbo (Q5) — CPU pick',
    description: 'Quantized turbo. Best on CPU; on GPU, the full Turbo below is faster.',
    sizeMb: 547,
    ramMb: 1200,
    latencyMs: 1100,
    wer: 2.8,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    sha256: ''
  },
  'large-v3-turbo-q8_0': {
    id: 'large-v3-turbo-q8_0',
    label: 'Large v3 Turbo (Q8)',
    description: 'Same as Q5 but Q8 quantization — slightly more accurate, larger file. Niche choice.',
    sizeMb: 834,
    ramMb: 1500,
    latencyMs: 1300,
    wer: 2.6,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
    sha256: ''
  },
  'large-v3-turbo': {
    id: 'large-v3-turbo',
    label: 'Large v3 Turbo (fp16) ★ Recommended — NVIDIA GPU',
    description: 'Full-precision Turbo. On NVIDIA GPU (≥2 GB VRAM): the fastest AND most accurate option — ~200ms transcription, ~2.5% WER. Multilingual.',
    sizeMb: 1549,
    ramMb: 1700,
    latencyMs: 250,
    wer: 2.5,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    sha256: ''
  }
}

export const DEFAULT_MODEL: ModelSize = 'large-v3-turbo-q5_0'

// The model registry above is written for the Windows line (NVIDIA/CUDA/CPU
// framing). On macOS whisper.cpp runs on Metal, so strip the hardware tags and
// swap GPU-centric blurbs for Metal-accurate copy. Windows/Linux keep the
// original text unchanged.
export function modelLabel(id: ModelSize, platform: string): string {
  const label = MODELS[id].label
  if (platform !== 'darwin') return label
  return label
    .replace(' — CPU pick', '')
    .replace(' — NVIDIA GPU', '')
    .replace(' ★ Recommended', id === DEFAULT_MODEL ? ' ★ Recommended' : '')
}

export function modelDescription(id: ModelSize, platform: string): string {
  if (platform === 'darwin') {
    if (id === 'large-v3-turbo-q5_0')
      return 'Quantized turbo — the accuracy-per-MB sweet spot. Fast on Apple Silicon via Metal. Multilingual. Recommended.'
    if (id === 'large-v3-turbo')
      return 'Full-precision turbo — top accuracy but ~1.5 GB. On Apple Silicon the Q5 above is nearly as accurate for a third of the size.'
    if (id === 'large-v3-turbo-q8_0')
      return 'Turbo at Q8 — a hair more accurate than Q5 for ~290 MB more. Niche.'
  }
  return MODELS[id].description
}

// ─── VAD (Silero) ─────────────────────────────────────────────────────────────
// Voice activity detection model used by whisper.cpp's --vad option to trim
// silence/noise before the encoder runs. Hosted in a sibling HF repo.

export const VAD = {
  fileName: 'ggml-silero-v5.1.2.bin',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin',
  sizeMb: 0.84
}

// ─── Filler Words ─────────────────────────────────────────────────────────────

export const FILLER_PATTERNS = [
  // Common fillers as whole words
  /\b(um+|uh+|hmm+|mhm+)\b/gi,
  /\byou know\b/gi,
  /\blike,?\s/gi,           // "like " or "like, "
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bI mean,?\s/gi,
  /\bright\?,?\s/gi,
  /\byou see,?\s/gi,
  /\bso,\s/gi,              // leading "so, "
]

// ─── Terminal Window Classes (Windows) ────────────────────────────────────────

export const TERMINAL_WINDOW_CLASSES = [
  'ConsoleWindowClass',           // cmd.exe
  'VirtualTerminalClass',         // Windows Terminal (older)
  'CASCADIA_HOSTING_WINDOW_CLASS',// Windows Terminal
  'mintty',                       // Git Bash / MSYS2
  'PseudoConsoleWindow',
  'cygwin'
]

// ─── Audio Settings ───────────────────────────────────────────────────────────

export const AUDIO = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
  // Minimum RMS to consider audio non-silent (avoid transcribing quiet)
  SILENCE_THRESHOLD: 0.01,
  // Maximum recording duration in seconds
  MAX_DURATION_S: 60,
}

// ─── Pipeline safety nets ──────────────────────────────────────────────────────
// Defense against a stuck-recording hang: if the global hotkey's OS-level event
// tap is ever silently disabled (macOS does this to taps whose callback is
// judged too slow, more likely under system/GPU load) a key-up can be dropped
// entirely, leaving the mic open forever with nothing the user can press to
// stop it. These constants bound every stage so the app can always recover on
// its own instead of requiring a Force Quit.

export const PIPELINE = {
  // Hard ceiling on a single recording, in ms — auto-stops and transcribes
  // whatever was captured so far if no stop signal ever arrives.
  MAX_RECORDING_MS: AUDIO.MAX_DURATION_S * 1000,
  // Ceiling on a single whisper-server /inference request, in ms. A timeout
  // here means the server process is likely wedged, so it gets killed and
  // relaunched fresh on the next capture.
  INFERENCE_TIMEOUT_MS: 30_000,
  // Ceiling on the one-shot whisper-cli fallback process, in ms.
  CLI_TIMEOUT_MS: 30_000,
  // Last-resort backstop: if the whole capture→transcribe→inject pipeline
  // hasn't finished by this point (ms), force state back to idle rather than
  // leaving the app permanently stuck.
  WATCHDOG_MS: 45_000,
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

export const OVERLAY = {
  WIDTH: 220,
  HEIGHT: 48,
  MARGIN_RIGHT: 24,
  MARGIN_BOTTOM: 60,
  SUCCESS_VISIBLE_MS: 2000,
  // Pointer movement (px) beyond which a press is treated as a drag, not a click.
  DRAG_THRESHOLD: 5,
  // Approx width of the visible idle pill. The window is wider than the pill to
  // fit the recording text; clamping uses this so the *pill* (not the empty
  // window edge) can be dragged to the screen edge.
  ORB_VISIBLE: 92,
}
