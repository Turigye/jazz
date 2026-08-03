import { app, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_NAME } from '../shared/constants'
import { initStore, isFirstRun, getConfig } from './store'
import { registerIpc } from './ipc'
import { createTray, refreshTrayMenu } from './tray'
import { hotkeyManager } from './hotkey'
import { onRecordingStart, onRecordingStop, onToggleListening } from './pipeline'
import { createOverlayWindow, createWizardWindow, createSettingsWindow, createRecorderWindow } from './windows'
import { sttEngine } from './stt/engine'
import { anyModelInstalled } from './stt/models'
import { whisperServer, killOrphanServers } from './stt/server'
import { ensureMicrophoneAccess, whenAccessibilityReady } from './permissions'
import { healStaleMute, restoreSystem, isDucked } from './audioduck'
import { formatChord } from '../shared/hotkey'
import log from './logger'

// ─── Crash safety: log uncaught errors but never block the user with a modal.
// Electron's default uncaughtException handler shows a modal that re-pops every
// time the user dismisses it. Registering our own handler suppresses that.
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', reason)
})

// ─── Single-instance lock ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  app.on('second-instance', () => {
    // Another launch attempt — surface settings instead of starting a 2nd app.
    createSettingsWindow()
  })

  // Keep running in the tray when all windows are closed. Registering any
  // listener here suppresses Electron's default quit-on-all-closed behavior.
  app.on('window-all-closed', () => {
    /* stay alive in the tray */
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.mich.jazz')
    app.setName(APP_NAME)

    initStore()

    // Clean up anything a previous crashed session left behind — a mute that
    // never got restored, and a whisper-server process that never got killed.
    void healStaleMute()
    killOrphanServers()

    // Allow the hidden recorder window to access the microphone.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media')
    })

    // macOS: proactively request the OS-level mic (TCC) grant now, so the first
    // dictation doesn't silently capture nothing. No-op on Windows/Linux.
    void ensureMicrophoneAccess()

    // Apply persisted login-item preference.
    app.setLoginItemSettings({ openAtLogin: getConfig().launchAtStartup })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpc()
    createTray()
    createOverlayWindow()
    createRecorderWindow()

    // Wire the hotkeys to the pipeline.
    hotkeyManager.on('start', () => onRecordingStart())
    hotkeyManager.on('stop', () => {
      onRecordingStop()
      refreshTrayMenu()
    })
    hotkeyManager.on('toggle', () => {
      onToggleListening()
      refreshTrayMenu()
    })

    // macOS needs Accessibility permission before uiohook can register a global
    // hotkey. Start immediately when it's already granted; otherwise prompt,
    // deep-link to Settings, and start the moment the user grants it. On
    // Windows/Linux this starts right away.
    whenAccessibilityReady(
      () => hotkeyManager.start(),
      formatChord(getConfig().pushToTalkHotkey, process.platform)
    )

    // First-run wizard if no model is installed yet.
    if (isFirstRun() || !anyModelInstalled()) {
      log.info('First run / no model — opening wizard')
      createWizardWindow()
    } else {
      // Pre-warm whisper to remove first-use latency.
      void sttEngine.prewarm()
    }

    log.info(`${APP_NAME} ready`)
  })

  app.on('will-quit', () => {
    hotkeyManager.stop()
    void whisperServer.stop()
    // Best-effort: covers a graceful quit while mid-recording. Only acts if
    // Jazz is the one currently holding the mute — otherwise this would wrongly
    // un-mute audio the user muted themselves outside of a recording. A Force
    // Quit (SIGKILL) bypasses this entirely, which is what healStaleMute() at
    // the top of bootstrap() is for.
    if (isDucked()) void restoreSystem()
  })
}
