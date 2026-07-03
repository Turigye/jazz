// Cross-platform hotkey display + defaults. Shared by main (tray, notifications)
// and renderer (settings, wizard) so a chord is shown the same everywhere.
//
// Internally chords are stored as '+'-joined tokens ('Ctrl+Cmd'). The Meta key
// is 'Win' on Windows and 'Cmd' on macOS; both parse to the same keycode, so an
// old 'Ctrl+Win' config keeps working on a Mac — we just relabel it.

const MAC_SYMBOLS: Record<string, string> = {
  ctrl: '⌃', control: '⌃',
  shift: '⇧',
  alt: '⌥', option: '⌥',
  win: '⌘', meta: '⌘', cmd: '⌘', command: '⌘', super: '⌘'
}

/** Display label for a single token, per platform (⌘ on Mac, 'Win' on Windows). */
export function keyLabel(token: string, platform: string): string {
  const t = token.trim()
  if (platform === 'darwin') return MAC_SYMBOLS[t.toLowerCase()] ?? t
  return t
}

/** Full chord label: '⌃⌘' on macOS, 'Ctrl+Win' elsewhere. */
export function formatChord(chord: string, platform: string): string {
  const parts = chord.split('+').map((s) => s.trim()).filter(Boolean).map((t) => keyLabel(t, platform))
  return platform === 'darwin' ? parts.join('') : parts.join('+')
}

/** Platform-appropriate default chords. */
export function defaultHotkeys(platform: string): { pushToTalk: string; toggle: string } {
  return {
    pushToTalk: platform === 'darwin' ? 'Ctrl+Cmd' : 'Ctrl+Win',
    toggle: 'Ctrl+Alt'
  }
}
