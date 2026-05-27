import { EventEmitter } from 'events'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { getConfig } from './store'
import log from './logger'

/**
 * A chord is a list of slots; each slot is a set of acceptable keycodes
 * (e.g. left-Ctrl and right-Ctrl both satisfy the "Ctrl" slot).
 * A chord is "engaged" when at least one keycode in EVERY slot is held.
 */
type Chord = Array<Set<number>>

// ─── Token → keycode-set mapping ──────────────────────────────────────────────
// Modifier tokens map to both left/right variants. Letter/F-key/space map to single codes.

const F_KEYS = [
  UiohookKey.F1, UiohookKey.F2, UiohookKey.F3, UiohookKey.F4,
  UiohookKey.F5, UiohookKey.F6, UiohookKey.F7, UiohookKey.F8,
  UiohookKey.F9, UiohookKey.F10, UiohookKey.F11, UiohookKey.F12
]

/** Keys that are not valid as a SOLO hotkey (must be paired with at least one other key). */
const MODIFIER_CODES = new Set<number>([
  UiohookKey.Ctrl, UiohookKey.CtrlRight,
  UiohookKey.Shift, UiohookKey.ShiftRight,
  UiohookKey.Alt, UiohookKey.AltRight,
  UiohookKey.Meta, UiohookKey.MetaRight
])

function tokenToKeycodes(token: string): Set<number> {
  const t = token.trim().toLowerCase()
  if (!t) return new Set()
  if (t === 'ctrl' || t === 'control')         return new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight])
  if (t === 'shift')                            return new Set([UiohookKey.Shift, UiohookKey.ShiftRight])
  if (t === 'alt' || t === 'option')           return new Set([UiohookKey.Alt, UiohookKey.AltRight])
  if (t === 'win' || t === 'meta' || t === 'super' || t === 'cmd') return new Set([UiohookKey.Meta, UiohookKey.MetaRight])
  if (t === 'space')                            return new Set([UiohookKey.Space])
  const fMatch = /^f([1-9]|1[0-2])$/.exec(t)
  if (fMatch) {
    const idx = parseInt(fMatch[1], 10) - 1
    return new Set([F_KEYS[idx]])
  }
  // Single letters A–Z
  if (/^[a-z]$/.test(t)) {
    const upper = t.toUpperCase() as keyof typeof UiohookKey
    const code = UiohookKey[upper]
    if (typeof code === 'number') return new Set([code])
  }
  // Digits 0–9
  if (/^[0-9]$/.test(t)) {
    const code = (UiohookKey as Record<string, number>)[t]
    if (typeof code === 'number') return new Set([code])
  }
  log.warn(`hotkey: unknown token "${token}"`)
  return new Set()
}

function keycodeToToken(code: number): string {
  if (code === UiohookKey.Ctrl || code === UiohookKey.CtrlRight)   return 'Ctrl'
  if (code === UiohookKey.Shift || code === UiohookKey.ShiftRight) return 'Shift'
  if (code === UiohookKey.Alt || code === UiohookKey.AltRight)     return 'Alt'
  if (code === UiohookKey.Meta || code === UiohookKey.MetaRight)   return 'Win'
  if (code === UiohookKey.Space)                                    return 'Space'
  const fIdx = (F_KEYS as number[]).indexOf(code)
  if (fIdx >= 0) return `F${fIdx + 1}`
  // Letters / digits — look up in UiohookKey
  for (const [name, value] of Object.entries(UiohookKey)) {
    if (value === code && /^[A-Z0-9]$/.test(name)) return name
  }
  return ''
}

/** Canonical order: Ctrl, Shift, Alt, Win, then non-modifier key. */
const TOKEN_ORDER = ['Ctrl', 'Shift', 'Alt', 'Win']

function serializeHeldChord(held: Set<number>): string {
  const tokens = new Set<string>()
  for (const code of held) {
    const t = keycodeToToken(code)
    if (t) tokens.add(t)
  }
  const mods = TOKEN_ORDER.filter((t) => tokens.has(t))
  const others = [...tokens].filter((t) => !TOKEN_ORDER.includes(t)).sort()
  return [...mods, ...others].join('+')
}

function parseChord(str: string | undefined | null): Chord | null {
  if (!str) return null
  const tokens = str.split('+').map((s) => s.trim()).filter(Boolean)
  if (tokens.length === 0) return null
  const slots: Chord = []
  for (const t of tokens) {
    const set = tokenToKeycodes(t)
    if (set.size === 0) return null
    slots.push(set)
  }
  return slots
}

/** A chord is engaged when every slot has at least one currently-held key. */
function chordActive(chord: Chord, held: Set<number>): boolean {
  return chord.every((slot) => {
    for (const code of slot) if (held.has(code)) return true
    return false
  })
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class HotkeyManager extends EventEmitter {
  private ptt: Chord | null = null
  private toggle: Chord | null = null
  private held = new Set<number>()
  private pttActive = false
  private toggleArmed = false
  private isCapturing = false
  private captureFns: { down: (e: { keycode: number }) => void; up: (e: { keycode: number }) => void } | null = null
  private started = false

  /** (Re)read hotkey config and update chord definitions. */
  reload(): void {
    const config = getConfig()
    this.ptt = parseChord(config.pushToTalkHotkey) ?? parseChord('Ctrl+Win')
    this.toggle = parseChord(config.commandModeHotkey) ?? parseChord('Ctrl+Alt')
    log.info(`hotkey: PTT=${config.pushToTalkHotkey} · toggle=${config.commandModeHotkey}`)
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.reload()

    uIOhook.on('keydown', (e) => {
      if (this.isCapturing) { this.captureFns?.down(e); return }
      this.held.add(e.keycode)
      this.evaluate()
    })
    uIOhook.on('keyup', (e) => {
      if (this.isCapturing) { this.captureFns?.up(e); return }
      this.held.delete(e.keycode)
      this.evaluate()
    })

    try {
      uIOhook.start()
      log.info('Global hotkey hook started')
    } catch (err) {
      log.error('Failed to start uiohook', err)
    }
  }

  private evaluate(): void {
    // Push-to-talk: chord must be held; we also require Alt NOT to be involved
    // unless the configured chord uses Alt — so the toggle chord doesn't trigger PTT.
    const pttOn = this.ptt ? chordActive(this.ptt, this.held) : false
    const toggleOn = this.toggle ? chordActive(this.toggle, this.held) : false

    // If both chords share modifier slots (e.g. both start with Ctrl), prefer the more-specific.
    const pttSize = this.ptt?.length ?? 0
    const toggleSize = this.toggle?.length ?? 0
    const pttWins = pttOn && (!toggleOn || pttSize >= toggleSize)
    const toggleWins = toggleOn && !pttWins

    if (pttWins && !this.pttActive) {
      this.pttActive = true
      this.emit('start')
    } else if (!pttWins && this.pttActive) {
      this.pttActive = false
      this.emit('stop')
    }

    if (toggleWins && !this.toggleArmed) {
      this.toggleArmed = true
      this.emit('toggle')
    } else if (!toggleWins && this.toggleArmed) {
      this.toggleArmed = false
    }
  }

  /**
   * Record the next chord the user presses.
   * Resolves once all keys are released, with the peak-simultaneous chord seen.
   * Cancels on Escape, single-key chords, or 15s timeout.
   */
  captureNextChord(timeoutMs = 15_000): Promise<string> {
    if (this.isCapturing) return Promise.reject(new Error('already capturing'))
    return new Promise<string>((resolve, reject) => {
      const held = new Set<number>()
      let peak = new Set<number>()
      let timer: NodeJS.Timeout

      const cleanup = (): void => {
        clearTimeout(timer)
        this.isCapturing = false
        this.captureFns = null
        // Drop any stuck "held" state from before capture.
        this.held.clear()
        this.pttActive = false
        this.toggleArmed = false
      }

      this.captureFns = {
        down: (e) => {
          if (e.keycode === UiohookKey.Escape) {
            cleanup(); reject(new Error('cancelled'))
            return
          }
          held.add(e.keycode)
          if (held.size > peak.size) peak = new Set(held)
        },
        up: (e) => {
          held.delete(e.keycode)
          if (held.size > 0) return

          // All keys released — decide whether the peak we captured is a valid hotkey.
          if (peak.size >= 2) {
            // Multi-key chord — always valid.
            const str = serializeHeldChord(peak)
            cleanup()
            if (!str) reject(new Error('could not serialize chord'))
            else resolve(str)
            return
          }
          if (peak.size === 1) {
            const only = [...peak][0]
            if (!MODIFIER_CODES.has(only)) {
              // Single non-modifier key (e.g. F8, Space, letter) — accept.
              const str = serializeHeldChord(peak)
              cleanup()
              if (!str) reject(new Error('could not serialize chord'))
              else resolve(str)
              return
            }
            // Single modifier alone (e.g. just Ctrl) — wait for another attempt.
          }
          peak = new Set()
        }
      }

      timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, timeoutMs)
      this.isCapturing = true
    })
  }

  cancelCapture(): void {
    if (!this.isCapturing) return
    this.isCapturing = false
    this.captureFns = null
  }

  stop(): void {
    if (!this.started) return
    try { uIOhook.stop() } catch (err) { log.error('Failed to stop uiohook', err) }
    this.removeAllListeners()
    this.started = false
  }
}

export const hotkeyManager = new HotkeyManager()
