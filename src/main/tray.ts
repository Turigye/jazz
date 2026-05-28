import { app, Menu, Tray, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { createSettingsWindow } from './windows'
import { getTranscripts } from './transcripts'
import { injectText } from './inject'
import { getConfig, setConfig } from './store'
import { modelsStatus } from './stt/models'
import { whisperServer } from './stt/server'
import { APP_NAME, MODELS } from '../shared/constants'
import type { ModelSize } from '../shared/types'
import log from './logger'

let tray: Tray | null = null

function iconPath(): string {
  const base = is.dev ? join(app.getAppPath(), 'resources') : process.resourcesPath
  // Per-platform tray icon resolution. Linux + macOS won't render .ico.
  const candidates =
    process.platform === 'win32' ? ['icon.ico', 'icon.png']
    : process.platform === 'darwin' ? ['iconTemplate.png', 'icon.png']
    : ['icon.png']
  for (const name of candidates) {
    const p = join(base, name)
    if (existsSync(p)) return p
  }
  return ''
}

function buildMenu(): Menu {
  const recent = getTranscripts().slice(0, 5)
  const recentItems =
    recent.length === 0
      ? [{ label: 'No transcripts yet', enabled: false }]
      : recent.map((t) => ({
          label: t.text.length > 40 ? t.text.slice(0, 40) + '…' : t.text,
          submenu: [
            { label: 'Copy', click: () => clipboard.writeText(t.text) },
            { label: 'Re-inject', click: () => void injectText(t.text) }
          ]
        }))

  // Tray model switcher: list only installed models so swapping is one click.
  const config = getConfig()
  const installed = modelsStatus().filter((s) => s.installed)
  const modelItems = installed.length === 0
    ? [{ label: 'No models installed — open Settings', enabled: false }]
    : installed.map((s) => ({
        label: MODELS[s.id].label.replace(' ★ Recommended', ''),
        type: 'radio' as const,
        checked: config.activeModel === s.id,
        click: () => {
          setConfig({ activeModel: s.id as ModelSize })
          void whisperServer.restart()
          refreshTrayMenu()
        }
      }))

  return Menu.buildFromTemplate([
    { label: `${APP_NAME} — Ctrl+Win to dictate · Ctrl+Alt to toggle`, enabled: false },
    { type: 'separator' },
    { label: 'Model', submenu: modelItems },
    { label: 'Recent transcripts', submenu: recentItems },
    { type: 'separator' },
    { label: 'Settings…', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit Jazz', click: () => app.quit() }
  ])
}

export function refreshTrayMenu(): void {
  if (tray) tray.setContextMenu(buildMenu())
}

export function createTray(): Tray {
  const p = iconPath()
  const image = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip(`${APP_NAME} — offline voice dictation`)
  tray.setContextMenu(buildMenu())
  tray.on('double-click', () => createSettingsWindow())
  log.info('Tray created', p ? `(icon: ${p})` : '(no icon found)')
  return tray
}
