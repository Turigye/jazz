import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { injectViaClipboard } from './clipboard'
import log from '../logger'

const execFileAsync = promisify(execFile)
const RESTORE_DELAY_MS = 350

// ─── Linux focus tracking ──────────────────────────────────────────────────────
// On Linux the orb window must be focusable to receive clicks (see windows.ts),
// which means clicking it steals X input focus from the app the user is
// dictating into. We continuously remember the last *non-Jazz* active window so
// that, right before pasting, we can re-activate it and ensure the text lands in
// the correct app rather than the orb. This is a no-op when the user drives Jazz
// via the global hotkey (the target never lost focus), so it's always safe.
let lastTargetWindow: string | null = null
let focusTimer: ReturnType<typeof setInterval> | null = null

export function startFocusTracking(): void {
  if (process.platform !== 'linux' || focusTimer) return
  focusTimer = setInterval(() => {
    void (async () => {
      try {
        const { stdout: id } = await execFileAsync('xdotool', ['getactivewindow'])
        const win = id.trim()
        if (!win) return
        const { stdout: name } = await execFileAsync('xdotool', ['getwindowname', win])
        const n = name.trim()
        // Ignore Jazz's own windows ("Jazz Overlay", "Jazz Settings",
        // "Jazz Recorder", "Welcome to Jazz").
        if (/^Jazz\b/.test(n) || n === 'Welcome to Jazz') return
        lastTargetWindow = win
      } catch {
        /* no active window / xdotool unavailable — ignore */
      }
    })()
  }, 600)
}

export function stopFocusTracking(): void {
  if (focusTimer) {
    clearInterval(focusTimer)
    focusTimer = null
  }
}

/**
 * Inject text into the currently focused window via clipboard + paste keystroke.
 * Per-platform paste mechanic; clipboard save/restore is common to all.
 */
export async function injectText(text: string): Promise<void> {
  if (!text.trim()) return

  if (process.platform === 'win32') {
    // Windows path preserves the terminal Ctrl+Shift+V detection.
    return injectViaClipboard(text)
  }

  const previous = clipboard.readText()
  clipboard.writeText(text)
  try {
    if (process.platform === 'darwin') await pasteMac()
    else await pasteLinux()
  } catch (err) {
    log.error('Paste keystroke failed', err)
  }
  setTimeout(() => {
    if (clipboard.readText() === text) clipboard.writeText(previous)
  }, RESTORE_DELAY_MS)
}

/** macOS: System Events keystroke v with command. */
async function pasteMac(): Promise<void> {
  await execFileAsync('osascript', [
    '-e', 'tell application "System Events" to keystroke "v" using command down'
  ])
}

/** Linux: xdotool (X11) preferred, ydotool fallback for Wayland. */
async function pasteLinux(): Promise<void> {
  try {
    // If the orb stole focus (clicked to toggle), hand focus back to the real
    // target window before pasting so the text lands there, not on the orb.
    if (lastTargetWindow) {
      try {
        await execFileAsync('xdotool', ['windowactivate', '--sync', lastTargetWindow])
      } catch (err) {
        log.debug('windowactivate target failed (window may be gone)', err)
      }
    }
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
    return
  } catch (err) {
    log.debug('xdotool unavailable, trying ydotool', err)
  }
  await execFileAsync('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']) // Ctrl+V
}
