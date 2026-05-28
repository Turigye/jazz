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
import { whisperServer } from './stt/server'
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

    // Allow the hidden recorder window to access the microphone.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media')
    })

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
    hotkeyManager.start()

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
  })
}
