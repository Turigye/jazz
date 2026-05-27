import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { injectViaClipboard } from './clipboard'
import log from '../logger'

const execFileAsync = promisify(execFile)
const RESTORE_DELAY_MS = 350

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
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
    return
  } catch (err) {
    log.debug('xdotool unavailable, trying ydotool', err)
  }
  await execFileAsync('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']) // Ctrl+V
}
