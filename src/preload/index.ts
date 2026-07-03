import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { JazzConfig, ModelSize, TranscriptRecord, ModelStatus } from '../shared/types'

// ─── Jazz API exposed to renderer processes ───────────────────────────────────
// All communication with main process goes through here.
// nodeIntegration is OFF in all renderer windows.

const jazzAPI = {
  // Host platform ('darwin' | 'win32' | 'linux') so the UI can label hotkeys
  // and adapt copy without a round-trip to main.
  platform: process.platform,

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: (): Promise<JazzConfig> =>
    ipcRenderer.invoke(IPC.GET_CONFIG),

  setConfig: (partial: Partial<JazzConfig>): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_CONFIG, partial),

  // ── Transcripts ───────────────────────────────────────────────────────────
  getTranscripts: (): Promise<TranscriptRecord[]> =>
    ipcRenderer.invoke(IPC.GET_TRANSCRIPTS),

  clearTranscripts: (): Promise<void> =>
    ipcRenderer.invoke(IPC.CLEAR_TRANSCRIPTS),

  reinjectTranscript: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.REINJECT_TRANSCRIPT, id),

  // ── Model Download ────────────────────────────────────────────────────────
  startDownload: (modelId: ModelSize): Promise<void> =>
    ipcRenderer.invoke(IPC.START_DOWNLOAD, modelId),

  cancelDownload: (): Promise<void> =>
    ipcRenderer.invoke(IPC.CANCEL_DOWNLOAD),

  getModelsStatus: (): Promise<ModelStatus[]> =>
    ipcRenderer.invoke(IPC.GET_MODELS_STATUS),

  // ── Mic ───────────────────────────────────────────────────────────────────
  getMicDevices: (): Promise<{ id: number; name: string }[]> =>
    ipcRenderer.invoke(IPC.GET_MIC_DEVICES),

  // ── First run ─────────────────────────────────────────────────────────────
  getFirstRun: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GET_FIRST_RUN),

  completeFirstRun: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPLETE_FIRST_RUN),

  // ── App ───────────────────────────────────────────────────────────────────
  openSettings: (): Promise<void> =>
    ipcRenderer.invoke(IPC.OPEN_SETTINGS),

  openLogs: (): Promise<void> =>
    ipcRenderer.invoke(IPC.OPEN_LOGS),

  quitApp: (): void =>
    ipcRenderer.send(IPC.QUIT_APP),

  // ── Events (Main → Renderer) ──────────────────────────────────────────────
  onOverlayState: (
    cb: (state: string, text?: string) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: string, text?: string): void =>
      cb(state, text)
    ipcRenderer.on(IPC.OVERLAY_STATE, handler)
    return () => ipcRenderer.removeListener(IPC.OVERLAY_STATE, handler)
  },

  onDownloadProgress: (
    cb: (progress: import('../shared/types').DownloadProgress) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: import('../shared/types').DownloadProgress): void =>
      cb(p)
    ipcRenderer.on(IPC.DOWNLOAD_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.DOWNLOAD_PROGRESS, handler)
  },

  onTranscriptAdded: (
    cb: (record: TranscriptRecord) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, r: TranscriptRecord): void => cb(r)
    ipcRenderer.on(IPC.TRANSCRIPT_ADDED, handler)
    return () => ipcRenderer.removeListener(IPC.TRANSCRIPT_ADDED, handler)
  },

  // ── Recorder window (hidden mic-capture) ──────────────────────────────────
  onStartRecording: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.REC_START, handler)
    return () => ipcRenderer.removeListener(IPC.REC_START, handler)
  },

  onStopRecording: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.REC_STOP, handler)
    return () => ipcRenderer.removeListener(IPC.REC_STOP, handler)
  },

  sendAudioData: (pcm: ArrayBuffer): void =>
    ipcRenderer.send(IPC.REC_DATA, pcm),

  sendRecorderError: (message: string): void =>
    ipcRenderer.send(IPC.REC_ERROR, message),

  // ── Overlay orb ────────────────────────────────────────────────────────────
  toggleListening: (): void =>
    ipcRenderer.send(IPC.TOGGLE_LISTENING),

  startOverlayDrag: (): void =>
    ipcRenderer.send(IPC.OVERLAY_DRAG_START),

  endOverlayDrag: (): void =>
    ipcRenderer.send(IPC.OVERLAY_DRAG_END),

  setOverlayInteractive: (interactive: boolean): void =>
    ipcRenderer.send(IPC.OVERLAY_SET_INTERACTIVE, interactive),

  // ── Permissions (macOS) ────────────────────────────────────────────────────
  getPermissions: (): Promise<import('../shared/types').PermissionState> =>
    ipcRenderer.invoke(IPC.GET_PERMISSIONS),

  requestMicrophone: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.REQUEST_MIC),

  promptAccessibility: (): void =>
    ipcRenderer.send(IPC.PROMPT_ACCESSIBILITY),

  openAccessibilitySettings: (): void =>
    ipcRenderer.send(IPC.OPEN_ACCESSIBILITY_SETTINGS),

  openMicrophoneSettings: (): void =>
    ipcRenderer.send(IPC.OPEN_MIC_SETTINGS),

  // ── Hotkey capture ────────────────────────────────────────────────────────
  captureHotkey: (): Promise<string> =>
    ipcRenderer.invoke(IPC.CAPTURE_HOTKEY),

  cancelCaptureHotkey: (): void =>
    ipcRenderer.send(IPC.CANCEL_CAPTURE_HOTKEY),

  // ── Clipboard ─────────────────────────────────────────────────────────────
  writeClipboard: (text: string): void =>
    ipcRenderer.send(IPC.WRITE_CLIPBOARD, text)
}

contextBridge.exposeInMainWorld('jazz', jazzAPI)

// Type declaration for renderer TypeScript
export type JazzAPI = typeof jazzAPI
