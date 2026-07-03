// ─── Jazz Shared Types ────────────────────────────────────────────────────────
// Used by both main process and renderer(s) via contextBridge

export type JazzState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'injecting'
  | 'success'
  | 'error'

export type ModelSize =
  | 'tiny.en'
  | 'base.en'
  | 'small.en'
  | 'small.en-q5_1'
  | 'medium.en'
  | 'large-v3-turbo-q5_0'
  | 'large-v3-turbo-q8_0'
  | 'large-v3-turbo'

export interface ModelInfo {
  id: ModelSize
  label: string
  description: string
  sizeMb: number
  ramMb: number
  latencyMs: number // approximate, 10s audio, 6-core CPU
  wer: number       // approximate word error rate %
  url: string
  sha256: string
}

export interface JazzConfig {
  // General
  launchAtStartup: boolean
  removeFiller: boolean
  language: string              // 'auto' or BCP-47 code
  showOverlay: boolean
  playSounds: boolean

  // Model
  activeModel: ModelSize
  modelDirectory: string        // resolved at runtime to %APPDATA%\Jazz\models

  // Hotkeys (display only in v1 — hardcoded Ctrl+Win)
  pushToTalkHotkey: string      // display string e.g. "Ctrl+Win"
  commandModeHotkey: string

  // Recognition tuning
  vocabulary: string            // comma/space separated terms to bias whisper toward
  beamSearch: boolean           // higher accuracy, slightly slower
  useVAD: boolean               // run Silero VAD to trim silence/noise before encoding
  useGPU: boolean               // enable CUDA inference on NVIDIA GPUs (auto-fallback to CPU if unavailable)
  muteWhileListening: boolean   // mute system audio output during capture

  // Overlay orb
  overlayPosition: { x: number; y: number } | null  // persisted orb position

  // Post-processing
  dictionary: DictionaryEntry[]
  snippets: SnippetEntry[]

  // Internal
  firstRunComplete: boolean
  version: string
}

export interface DictionaryEntry {
  id: string
  spoken: string      // what user says
  typed: string       // what gets typed
}

export interface SnippetEntry {
  id: string
  trigger: string     // spoken phrase
  expansion: string   // text to inject
}

export interface TranscriptRecord {
  id: string
  text: string
  raw: string
  timestamp: number
  durationMs: number
}

export interface DownloadProgress {
  modelId: ModelSize
  bytesDownloaded: number
  totalBytes: number
  percent: number
  phase: 'downloading' | 'verifying' | 'complete' | 'error'
  error?: string
}

// macOS permission snapshot for the onboarding wizard / settings UI.
export interface PermissionState {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  accessibility: boolean
  /** Whether these gates apply on this OS at all (false on Windows/Linux). */
  applicable: boolean
}

// ─── IPC Channel Names ────────────────────────────────────────────────────────

export const IPC = {
  // Main → Renderer (overlay)
  OVERLAY_STATE: 'jazz:overlay:state',
  OVERLAY_TEXT: 'jazz:overlay:text',

  // Main → Renderer (any)
  DOWNLOAD_PROGRESS: 'jazz:download:progress',
  TRANSCRIPT_ADDED: 'jazz:transcript:added',

  // Renderer → Main
  GET_CONFIG: 'jazz:config:get',
  SET_CONFIG: 'jazz:config:set',
  GET_TRANSCRIPTS: 'jazz:transcripts:get',
  CLEAR_TRANSCRIPTS: 'jazz:transcripts:clear',
  START_DOWNLOAD: 'jazz:download:start',
  CANCEL_DOWNLOAD: 'jazz:download:cancel',
  REINJECT_TRANSCRIPT: 'jazz:transcript:reinject',
  GET_MIC_DEVICES: 'jazz:mic:devices',
  TEST_MIC: 'jazz:mic:test',
  OPEN_LOGS: 'jazz:logs:open',
  QUIT_APP: 'jazz:app:quit',

  // Model state
  GET_MODELS_STATUS: 'jazz:models:status',

  // First-run wizard
  GET_FIRST_RUN: 'jazz:firstrun:get',
  COMPLETE_FIRST_RUN: 'jazz:firstrun:complete',
  OPEN_SETTINGS: 'jazz:settings:open',

  // Recorder window (renderer-side mic capture via Web Audio)
  REC_START: 'jazz:rec:start',
  REC_STOP: 'jazz:rec:stop',
  REC_DATA: 'jazz:rec:data',
  REC_ERROR: 'jazz:rec:error',

  // Overlay orb interactions (renderer → main)
  TOGGLE_LISTENING: 'jazz:listen:toggle',
  OVERLAY_DRAG_START: 'jazz:overlay:dragstart',
  OVERLAY_DRAG_END: 'jazz:overlay:dragend',
  OVERLAY_SET_INTERACTIVE: 'jazz:overlay:interactive',

  // Hotkey capture (renderer asks main to record the next chord)
  CAPTURE_HOTKEY: 'jazz:hotkey:capture',
  CANCEL_CAPTURE_HOTKEY: 'jazz:hotkey:capture:cancel',

  // Permissions (macOS mic + Accessibility onboarding)
  GET_PERMISSIONS: 'jazz:perm:get',
  REQUEST_MIC: 'jazz:perm:mic',
  PROMPT_ACCESSIBILITY: 'jazz:perm:accessibility',
  OPEN_ACCESSIBILITY_SETTINGS: 'jazz:perm:accessibility:open',
  OPEN_MIC_SETTINGS: 'jazz:perm:mic:open',

  // Clipboard — bypass the renderer's clipboard API permission gate
  WRITE_CLIPBOARD: 'jazz:clipboard:write',
} as const

export interface ModelStatus {
  id: ModelSize
  installed: boolean
  path: string
}
