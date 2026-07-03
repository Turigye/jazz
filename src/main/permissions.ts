import { systemPreferences, shell, Notification } from 'electron'
import type { PermissionState } from '../shared/types'
import log from './logger'

// macOS gates two things Jazz depends on behind user-granted permissions:
//   • Microphone (TCC)      — needed to capture audio at all.
//   • Accessibility (AXIsProcessTrusted) — needed for the global hotkey
//     (uiohook) and for the paste keystroke (System Events).
// On Windows/Linux these APIs are no-ops, so every function short-circuits to a
// permissive result off-darwin.

const isMac = process.platform === 'darwin'

/** Deep-link straight to the relevant System Settings > Privacy pane. */
export function openAccessibilitySettings(): void {
  void shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  )
}

export function openMicrophoneSettings(): void {
  void shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
  )
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  if (onClick) n.on('click', onClick)
  n.show()
}

/**
 * Ensure microphone access. Prompts the OS dialog when the state is still
 * undecided; guides the user to Settings when it's been denied. Returns whether
 * we ended up with access. Never throws.
 */
export async function ensureMicrophoneAccess(): Promise<boolean> {
  if (!isMac) return true
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    log.info(`Microphone access status: ${status}`)
    if (status === 'granted') return true
    if (status === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      log.info(`Microphone access after prompt: ${granted}`)
      if (!granted) {
        notify('Jazz needs your microphone', 'Click to open Privacy settings.', openMicrophoneSettings)
      }
      return granted
    }
    // denied | restricted — can only be changed by the user in Settings.
    notify(
      'Microphone access is off',
      'Jazz can’t hear you. Click to open Privacy > Microphone.',
      openMicrophoneSettings
    )
    return false
  } catch (err) {
    log.warn('Microphone access check failed', err)
    return true // don't block; let the capture path surface any real failure
  }
}

/** Snapshot of both permissions, for the onboarding wizard / settings UI. */
export function getPermissions(): PermissionState {
  if (!isMac) return { microphone: 'granted', accessibility: true, applicable: false }
  let microphone: PermissionState['microphone'] = 'unknown'
  try {
    microphone = systemPreferences.getMediaAccessStatus('microphone') as PermissionState['microphone']
  } catch (err) {
    log.warn('mic status read failed', err)
  }
  return { microphone, accessibility: hasAccessibilityAccess(false), applicable: true }
}

/** Request microphone access (prompts if undecided). Returns whether granted. */
export function requestMicrophone(): Promise<boolean> {
  return ensureMicrophoneAccess()
}

/** Trigger the macOS Accessibility prompt and open the Settings pane. */
export function promptAccessibility(): void {
  if (!isMac) return
  hasAccessibilityAccess(true) // shows the system dialog + lists the app
  openAccessibilitySettings()
}

/**
 * Is the app a trusted Accessibility client? Passing prompt=true makes macOS
 * show its "grant access" dialog the first time (and only the first time).
 */
export function hasAccessibilityAccess(prompt: boolean): boolean {
  if (!isMac) return true
  try {
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  } catch (err) {
    log.warn('Accessibility trust check failed', err)
    return true
  }
}

/**
 * Start the global hotkey once Accessibility is granted. If it isn't yet, prompt
 * the user, deep-link to Settings, and poll until they grant it — then start and
 * confirm. This replaces the old behavior of calling uiohook.start() once,
 * having it throw "assistive devices" on macOS, and never recovering.
 */
export function whenAccessibilityReady(start: () => void, hotkeyLabel: string): void {
  if (hasAccessibilityAccess(false)) {
    start()
    return
  }

  // Trigger the system prompt once, and point the user at the exact pane.
  hasAccessibilityAccess(true)
  log.warn('Accessibility not granted — global hotkey disabled until the user grants it')
  notify(
    'Enable the Jazz hotkey',
    'Grant Accessibility so Jazz can listen for its shortcut. Click to open Settings.',
    openAccessibilitySettings
  )
  openAccessibilitySettings()

  const timer = setInterval(() => {
    if (!hasAccessibilityAccess(false)) return
    clearInterval(timer)
    log.info('Accessibility granted — starting global hotkey')
    start()
    notify('Jazz is ready', `Hold ${hotkeyLabel} to dictate.`)
  }, 2000)
  timer.unref?.()
}
