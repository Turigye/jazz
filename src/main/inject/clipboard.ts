import { clipboard } from 'electron'
import { foregroundProcessName, sendKeys, PASTE, PASTE_TERMINAL } from './winauto'
import log from '../logger'

// Foreground process names (lower-case) that need Ctrl+Shift+V to paste.
const TERMINAL_PROCESSES = new Set([
  'windowsterminal',
  'cmd',
  'powershell',
  'pwsh',
  'conhost',
  'wt',
  'mintty',
  'alacritty',
  'wezterm'
])

const RESTORE_DELAY_MS = 350

/**
 * Inject text by writing it to the clipboard, pasting into the foreground
 * window, then restoring the user's previous clipboard contents.
 */
export async function injectViaClipboard(text: string): Promise<void> {
  if (!text) return

  const previous = clipboard.readText()
  clipboard.writeText(text)

  const proc = await foregroundProcessName()
  const combo = TERMINAL_PROCESSES.has(proc) ? PASTE_TERMINAL : PASTE
  log.debug(`inject: foreground="${proc}" combo="${combo}"`)

  await sendKeys(combo)

  setTimeout(() => {
    // Only restore if our injected text is still on the clipboard
    // (don't clobber something the user copied in the meantime).
    if (clipboard.readText() === text) clipboard.writeText(previous)
  }, RESTORE_DELAY_MS)
}
