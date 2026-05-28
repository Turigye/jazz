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

/**
 * Windows/macOS resize the overlay window to match the actual pill DOM size.
 * Linux never runtime-resizes the overlay; fractional scaling on X11 can turn
 * resize feedback into a growing invisible click-trap.
 */
const PILL_PAD_PX = 4 // shadow halo on each side
// Hard ceiling on the orb window so a runaway resize can never balloon it into a
// giant invisible click-trap. The pill truncates its text at max-w-[180px], so a
// real pill never exceeds ~280×60; these caps leave margin without clipping.
const PILL_MAX_W = 320
const PILL_MAX_H = 80
// Sub-pixel jitter deadband. Under fractional display scaling, setContentSize ↔
// ResizeObserver can ping-pong by 1–2px and compound into unbounded growth (the
// window grew 127→416px during a 1s hold, which dragged the orb upward as the
// clamp's maxY−h shrank). Ignoring tiny deltas breaks that feedback loop.
const PILL_RESIZE_DEADBAND = 2

// ─── Linux: fixed-size window, no runtime resize ──────────────────────────────
// On Linux/X11 (especially with fractional display scaling) resizing the overlay
// to fit the pill is the *root cause* of every orb bug we've chased:
//   • setContentSize ↔ ResizeObserver ping-pong grows the window unboundedly,
//     turning the transparent surface into a screen-wide invisible click-trap.
//   • That same growth drags the orb UPWARD during a drag — a taller window
//     shrinks the clamp's maxY−h every frame, so y is pushed up even when the
//     cursor is perfectly still.
// A FIXED window size makes growth structurally impossible, so neither bug can
// occur regardless of scaling rounding. Linux intentionally does not call
// setContentSize() or setShape() at runtime; both can feed X11/fractional-scale
// geometry loops. Windows/macOS keep the exact fit-to-pill behavior below — it
// works perfectly there.
const IS_LINUX = process.platform === 'linux'
const LINUX_OVERLAY_W = 56
const LINUX_OVERLAY_H = 56

function enforceLinuxOverlayBounds(): void {
  if (!IS_LINUX) return
  const win = getOverlayWindow()
  if (!win) return
  try {
    const [x, y] = win.getPosition()
    win.setBounds({ x, y, width: LINUX_OVERLAY_W, height: LINUX_OVERLAY_H }, false)
  } catch (err) {
    log.warn('enforceLinuxOverlayBounds failed', err)
  }
}

export function setPillBounds(b: { x: number; y: number; w: number; h: number }): void {
  const win = overlayWindow
  if (!win || win.isDestroyed() || b.w <= 0 || b.h <= 0) return

  if (IS_LINUX) {
    // Never resize or reshape on Linux. Runtime geometry mutation is the bug.
    enforceLinuxOverlayBounds()
    return
  }

  // Windows/macOS: fit the window exactly to the pill.
  if (dragTimer) return
  const newW = Math.min(PILL_MAX_W, Math.round(b.w + PILL_PAD_PX * 2))
  const newH = Math.min(PILL_MAX_H, Math.round(b.h + PILL_PAD_PX * 2))
  const [cw, ch] = win.getContentSize()
  if (Math.abs(newW - cw) <= PILL_RESIZE_DEADBAND && Math.abs(newH - ch) <= PILL_RESIZE_DEADBAND) {
    return
  }
  try {
    win.setContentSize(newW, newH, false)
  } catch (err) {
    log.warn('setContentSize failed', err)
  }
}

function cursorDipPoint(): Electron.Point {
  const cursor = screen.getCursorScreenPoint()
  try {
    return screen.screenToDipPoint(cursor)
  } catch {
    return cursor
  }
}

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
 * off the entire virtual desktop). `w`/`h` are the live window size so the
 * clamp matches the actual (resized) orb, not the stale 220×48 constant.
 */
function clampToBounds(x: number, y: number, w: number, h: number): { x: number; y: number } {
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
  // Round to integers — Electron's setPosition rejects floats with a
  // "conversion failure" exception (which Linux fractional display scaling
  // can otherwise feed in).
  return {
    x: Math.round(Math.max(minX, Math.min(x, maxX - w))),
    y: Math.round(Math.max(minY, Math.min(y, maxY - h)))
  }
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const saved = getConfig().overlayPosition
  const pos = saved
    ? clampToBounds(saved.x, saved.y, OVERLAY.WIDTH, OVERLAY.HEIGHT)
    : defaultOverlayPos()

  overlayWindow = new BrowserWindow({
    // Linux: FIXED size — never resized (see setPillBounds). Windows/macOS start
    // at the configured size and the renderer's ResizeObserver shrinks the window
    // to exactly fit the pill via setPillBounds() on first paint.
    width: IS_LINUX ? LINUX_OVERLAY_W : OVERLAY.WIDTH,
    height: IS_LINUX ? LINUX_OVERLAY_H : OVERLAY.HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    useContentSize: true,
    resizable: !IS_LINUX,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Focus policy is platform-specific:
    //   • Windows/macOS: focusable:false still delivers mouse clicks while
    //     never stealing focus from the app being dictated into — ideal.
    //   • Linux/X11: a non-focusable window receives NO mouse input at all —
    //     clicks pass straight through to the window below (the "I click through
    //     the orb" bug). So on Linux the orb must be focusable to be usable.
    //     The resulting focus-theft on click is undone by restoring the prior
    //     active window before paste (see inject/focus tracker).
    focusable: process.platform === 'linux',
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
  if (IS_LINUX) overlayWindow.setResizable(false)
  enforceLinuxOverlayBounds()

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
  enforceLinuxOverlayBounds()
}

export function hideOverlay(): void {
  const win = getOverlayWindow()
  if (win?.isVisible()) win.hide()
}

// ─── Dragging (main-driven, absolute cursor positioning) ──────────────────────
// The renderer signals drag begin/end; main pins the window under the cursor at
// a fixed grab offset, polling the authoritative global cursor (DIP coords from
// getCursorScreenPoint). Two hard safety rails make this robust on Linux/X11:
//   1. The window can never balloon (setPillBounds caps + deadbands its size),
//      so the orb stays under the cursor and pointer-capture is never lost — the
//      earlier "drift up / chase the cursor forever" was a *symptom* of runaway
//      growth shrinking the clamp boundary, not the drag math itself.
//   2. A wall-clock guard auto-ends a drag that somehow outlives its pointer-up
//      (e.g. a missed X11 button-release), so the orb can never get stuck
//      following the cursor.
const DRAG_MAX_MS = 30_000
let dragTimer: ReturnType<typeof setInterval> | null = null
let dragGrab: { dx: number; dy: number } | null = null
let dragStartedAt = 0

export function beginOverlayDrag(): void {
  const win = getOverlayWindow()
  if (!win) return
  endOverlayDrag(false) // clear any stale drag
  try {
    const cursor = cursorDipPoint()
    const [wx, wy] = win.getPosition()
    dragGrab = { dx: cursor.x - wx, dy: cursor.y - wy }
    dragStartedAt = Date.now()
    dragTimer = setInterval(() => {
      const w = getOverlayWindow()
      if (!w || !dragGrab) return
      if (Date.now() - dragStartedAt > DRAG_MAX_MS) {
        endOverlayDrag() // safety: never chase the cursor indefinitely
        return
      }
      try {
        const c = cursorDipPoint()
        const [liveW, liveH] = w.getContentSize()
        const cw = IS_LINUX ? LINUX_OVERLAY_W : liveW
        const ch = IS_LINUX ? LINUX_OVERLAY_H : liveH
        const next = clampToBounds(c.x - dragGrab.dx, c.y - dragGrab.dy, cw, ch)
        if (IS_LINUX) {
          w.setBounds({ x: next.x, y: next.y, width: LINUX_OVERLAY_W, height: LINUX_OVERLAY_H }, false)
        } else {
          w.setPosition(next.x, next.y)
        }
      } catch (err) {
        log.warn('drag tick failed', err)
      }
    }, 16)
  } catch (err) {
    log.warn('beginOverlayDrag failed', err)
  }
}

export function endOverlayDrag(persist = true): void {
  if (dragTimer) {
    clearInterval(dragTimer)
    dragTimer = null
  }
  dragGrab = null
  if (persist) persistOverlayPosition()
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
