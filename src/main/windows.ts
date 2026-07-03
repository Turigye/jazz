import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { OVERLAY } from '../shared/constants'
import { getConfig, setConfig } from './store'
import log from './logger'

/** Resolve the app icon for window chrome / taskbar (per platform). */
function appIcon(): string | undefined {
  const base = is.dev ? join(app.getAppPath(), 'resources') : process.resourcesPath
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const p = join(base, name)
  return existsSync(p) ? p : undefined
}

let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let wizardWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null

const preloadPath = join(__dirname, '../preload/index.js')

type RendererName = 'overlay' | 'settings' | 'wizard' | 'recorder'

/** Resolve a renderer entry — dev server URL or built HTML file. */
function rendererUrl(name: RendererName): { url?: string; file?: string } {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html` }
  }
  return { file: join(__dirname, `../renderer/${name}/index.html`) }
}

function loadRenderer(win: BrowserWindow, name: RendererName): void {
  const target = rendererUrl(name)
  if (target.url) void win.loadURL(target.url)
  else if (target.file) void win.loadFile(target.file)
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

/** Default bottom-right corner position on the primary display. */
function defaultOverlayPos(): { x: number; y: number } {
  const primary = screen.getPrimaryDisplay()
  const { width, height } = primary.workAreaSize
  return {
    x: primary.workArea.x + width - OVERLAY.WIDTH - OVERLAY.MARGIN_RIGHT,
    y: primary.workArea.y + height - OVERLAY.HEIGHT - OVERLAY.MARGIN_BOTTOM
  }
}

/**
 * Clamp a position to the union of ALL displays so the orb can be dragged
 * freely across a multi-monitor setup (only prevented from going fully
 * off the entire virtual desktop).
 */
function clampToBounds(x: number, y: number): { x: number; y: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const d of screen.getAllDisplays()) {
    const a = d.workArea
    minX = Math.min(minX, a.x)
    minY = Math.min(minY, a.y)
    maxX = Math.max(maxX, a.x + a.width)
    maxY = Math.max(maxY, a.y + a.height)
  }
  // Allow the window to hang partly off-screen by the empty margin on each side
  // of the visible pill, so the pill itself can reach the screen edge. The
  // transparent overhang is click-through, so it costs nothing.
  const padX = Math.max(0, (OVERLAY.WIDTH - OVERLAY.ORB_VISIBLE) / 2)
  // Round to integers — Electron's setPosition rejects floats with a
  // "conversion failure" exception (which Linux fractional display scaling
  // can otherwise feed in).
  return {
    x: Math.round(Math.max(minX - padX, Math.min(x, maxX - OVERLAY.WIDTH + padX))),
    y: Math.round(Math.max(minY, Math.min(y, maxY - OVERLAY.HEIGHT)))
  }
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const saved = getConfig().overlayPosition
  const pos = saved ? clampToBounds(saved.x, saved.y) : defaultOverlayPos()

  overlayWindow = new BrowserWindow({
    width: OVERLAY.WIDTH,
    height: OVERLAY.HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Non-focusable so clicking the orb never steals focus from the app the
    // user is dictating into — mouse events still fire.
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Start click-through: the transparent area around the pill passes clicks to
  // whatever is underneath. `forward: true` still delivers mousemove to the
  // renderer, which flips interactivity on when the cursor is over the pill
  // (see setOverlayInteractive). This stops the invisible window rectangle from
  // eating clicks meant for other apps.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  loadRenderer(overlayWindow, 'overlay')

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Honor the "show overlay" preference on first paint.
  overlayWindow.on('ready-to-show', () => {
    if (getConfig().showOverlay) overlayWindow?.showInactive()
  })

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

export function showOverlay(): void {
  const win = getOverlayWindow() ?? createOverlayWindow()
  if (!win.isVisible()) win.showInactive()
}

export function hideOverlay(): void {
  const win = getOverlayWindow()
  if (win?.isVisible()) win.hide()
}

/**
 * Toggle whether the overlay captures the mouse. The renderer calls this with
 * `true` when the cursor enters the pill (so clicks/drags land) and `false`
 * when it leaves (so clicks pass through to the app underneath).
 */
export function setOverlayInteractive(interactive: boolean): void {
  const win = getOverlayWindow()
  if (!win) return
  win.setIgnoreMouseEvents(!interactive, { forward: true })
}

// ─── Orb dragging (main-process cursor polling) ─────────────────────────────
// The old approach shipped a dx/dy IPC message per mousemove and called
// setPosition each time — laggy on macOS (~2 fps) and prone to a lost pointerup
// leaving the orb "stuck" to the cursor. Instead we run the whole drag in main:
// the renderer only signals start/stop, and a timer follows the OS cursor
// natively at ~120 fps with a fixed grab offset. Smooth, and it can't get stuck
// (a safety timeout and an explicit stop both end it).

let dragTimer: NodeJS.Timeout | null = null
let dragSafety: NodeJS.Timeout | null = null
let grabOffset = { x: 0, y: 0 }

/** Begin following the cursor. Grab offset keeps the pill under the pointer. */
export function startOverlayDrag(): void {
  const win = getOverlayWindow()
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = win.getPosition()
  grabOffset = { x: cursor.x - wx, y: cursor.y - wy }

  stopDragTimers()
  dragTimer = setInterval(() => {
    const w = getOverlayWindow()
    if (!w) return stopDragTimers()
    const c = screen.getCursorScreenPoint()
    const next = clampToBounds(c.x - grabOffset.x, c.y - grabOffset.y)
    w.setPosition(next.x, next.y)
  }, 8)
  // Safety: never let the follow-loop outlive a missed stop signal.
  dragSafety = setTimeout(() => endOverlayDrag(), 20_000)
}

/** Stop following the cursor and persist the final position. */
export function endOverlayDrag(): void {
  if (!dragTimer && !dragSafety) return
  stopDragTimers()
  persistOverlayPosition()
}

function stopDragTimers(): void {
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null }
  if (dragSafety) { clearTimeout(dragSafety); dragSafety = null }
}

/** Persist the orb's current position. */
export function persistOverlayPosition(): void {
  const win = getOverlayWindow()
  if (!win) return
  try {
    const [x, y] = win.getPosition()
    setConfig({ overlayPosition: { x: Math.round(x), y: Math.round(y) } })
  } catch (err) {
    log.warn('persistOverlayPosition failed', err)
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'Jazz Settings',
    autoHideMenuBar: true,
    show: false,
    icon: appIcon(),
    // Windows 11 acrylic = real frosted-glass behind the window.
    // The body CSS uses translucent surfaces so the acrylic shows through.
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  settingsWindow.on('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRenderer(settingsWindow, 'settings')
  if (is.dev) settingsWindow.webContents.openDevTools({ mode: 'detach' })

  return settingsWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
}

// ─── First-run wizard ─────────────────────────────────────────────────────────

export function createWizardWindow(): BrowserWindow {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.show()
    wizardWindow.focus()
    return wizardWindow
  }

  wizardWindow = new BrowserWindow({
    width: 600,
    height: 460,
    resizable: false,
    title: 'Welcome to Jazz',
    autoHideMenuBar: true,
    show: false,
    icon: appIcon(),
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  wizardWindow.on('ready-to-show', () => wizardWindow?.show())
  wizardWindow.on('closed', () => {
    wizardWindow = null
  })

  loadRenderer(wizardWindow, 'wizard')
  return wizardWindow
}

export function getWizardWindow(): BrowserWindow | null {
  return wizardWindow && !wizardWindow.isDestroyed() ? wizardWindow : null
}

// ─── Recorder (hidden mic-capture window) ──────────────────────────────────────

export function createRecorderWindow(): BrowserWindow {
  if (recorderWindow && !recorderWindow.isDestroyed()) return recorderWindow

  recorderWindow = new BrowserWindow({
    width: 200,
    height: 100,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the audio graph running even though the window is never shown.
      backgroundThrottling: false
    }
  })

  recorderWindow.on('closed', () => {
    recorderWindow = null
  })

  loadRenderer(recorderWindow, 'recorder')
  return recorderWindow
}

export function getRecorderWindow(): BrowserWindow | null {
  return recorderWindow && !recorderWindow.isDestroyed() ? recorderWindow : null
}

/** Broadcast a message to every live window. */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of [overlayWindow, settingsWindow, wizardWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
  log.debug(`broadcast ${channel}`, ...args)
}
