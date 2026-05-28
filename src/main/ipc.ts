import { app, ipcMain, shell, clipboard } from 'electron'
import { IPC } from '../shared/types'
import type { ModelSize, JazzConfig } from '../shared/types'
import { getConfig, setConfig, completeFirstRun, isFirstRun } from './store'
import { downloadModel, cancelDownload, modelsStatus } from './stt/models'
import { whisperServer } from './stt/server'
import { getTranscripts, clearTranscripts, getTranscript } from './transcripts'
import { injectText } from './inject'
import { broadcast, createSettingsWindow, getWizardWindow, getRecorderWindow, beginOverlayDrag, endOverlayDrag, setPillBounds, showOverlay, hideOverlay } from './windows'
import { onToggleListening } from './pipeline'
import { hotkeyManager } from './hotkey'
import log from './logger'

async function listMicDevices(): Promise<{ id: number; name: string }[]> {
  const rec = getRecorderWindow()
  if (!rec) return []
  try {
    const devices = (await rec.webContents.executeJavaScript(
      `navigator.mediaDevices.enumerateDevices().then(ds =>
        ds.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: i, name: d.label || ('Microphone ' + (i + 1)) })))`
    )) as { id: number; name: string }[]
    return devices
  } catch (err) {
    log.error('listMicDevices failed', err)
    return []
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.GET_CONFIG, () => getConfig())

  ipcMain.handle(IPC.SET_CONFIG, (_e, partial: Partial<JazzConfig>) => {
    setConfig(partial)
    if (typeof partial.launchAtStartup === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: partial.launchAtStartup })
    }
    if (typeof partial.showOverlay === 'boolean') {
      if (partial.showOverlay) showOverlay()
      else hideOverlay()
    }
    // Server-affecting settings → restart whisper-server with the new params.
    if (
      partial.activeModel !== undefined ||
      partial.beamSearch !== undefined ||
      partial.useVAD !== undefined ||
      partial.useGPU !== undefined ||
      partial.language !== undefined
    ) {
      log.info('Server-affecting config changed; restarting whisper-server')
      void whisperServer.restart().catch((err) => log.error('server restart failed', err))
    }
    // Hotkey config changed → re-parse chords.
    if (partial.pushToTalkHotkey !== undefined || partial.commandModeHotkey !== undefined) {
      hotkeyManager.reload()
    }
    broadcast(IPC.GET_CONFIG, getConfig())
  })

  // Orb interactions
  ipcMain.on(IPC.TOGGLE_LISTENING, () => onToggleListening())
  ipcMain.on(IPC.OVERLAY_DRAG_BEGIN, () => beginOverlayDrag())
  ipcMain.on(IPC.OVERLAY_DRAG_END, () => endOverlayDrag())
  ipcMain.on(IPC.OVERLAY_PILL_BOUNDS, (_e, b: { x: number; y: number; w: number; h: number }) => {
    setPillBounds(b)
  })

  ipcMain.handle(IPC.GET_TRANSCRIPTS, () => getTranscripts())
  ipcMain.handle(IPC.CLEAR_TRANSCRIPTS, () => clearTranscripts())

  ipcMain.handle(IPC.REINJECT_TRANSCRIPT, async (_e, id: string) => {
    const t = getTranscript(id)
    if (t) await injectText(t.text)
  })

  ipcMain.handle(IPC.START_DOWNLOAD, async (_e, modelId: ModelSize) => {
    await downloadModel(modelId, (p) => broadcast(IPC.DOWNLOAD_PROGRESS, p))
  })
  ipcMain.handle(IPC.CANCEL_DOWNLOAD, () => cancelDownload())

  ipcMain.handle(IPC.GET_MODELS_STATUS, () => modelsStatus())
  ipcMain.handle(IPC.GET_MIC_DEVICES, () => listMicDevices())

  ipcMain.handle(IPC.GET_FIRST_RUN, () => isFirstRun())
  ipcMain.handle(IPC.COMPLETE_FIRST_RUN, () => {
    completeFirstRun()
    getWizardWindow()?.close()
  })

  ipcMain.handle(IPC.OPEN_SETTINGS, () => createSettingsWindow())

  ipcMain.handle(IPC.OPEN_LOGS, () => {
    void shell.openPath(app.getPath('logs'))
  })

  ipcMain.on(IPC.QUIT_APP, () => {
    log.info('Quit requested from renderer')
    app.quit()
  })

  // Hotkey capture: record the next chord the user presses and return it as a string.
  ipcMain.handle(IPC.CAPTURE_HOTKEY, async () => {
    return hotkeyManager.captureNextChord()
  })
  ipcMain.on(IPC.CANCEL_CAPTURE_HOTKEY, () => hotkeyManager.cancelCapture())

  // Clipboard write via main — bypasses navigator.clipboard permission issues.
  ipcMain.on(IPC.WRITE_CLIPBOARD, (_e, text: string) => clipboard.writeText(text))
}
