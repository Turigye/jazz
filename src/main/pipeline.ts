import { Notification } from 'electron'
import type { JazzState } from '../shared/types'
import { IPC } from '../shared/types'
import { AUDIO, OVERLAY } from '../shared/constants'
import { audioCapture, pcmRms } from './audio'
import { sttEngine } from './stt/engine'
import { postProcess } from './postprocess'
import { injectText } from './inject'
import { addTranscript } from './transcripts'
import { getConfig } from './store'
import { broadcast } from './windows'
import { muteSystem, restoreSystem } from './audioduck'
import log from './logger'

type Mode = 'idle' | 'ptt' | 'toggle'

let mode: Mode = 'idle'
let busy = false
let recordStartTs = 0

function setState(state: JazzState, text?: string): void {
  broadcast(IPC.OVERLAY_STATE, state, text)
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

/** Begin capturing audio in the given mode. */
function beginCapture(newMode: Exclude<Mode, 'idle'>): void {
  if (mode !== 'idle' || busy) return

  setState('recording')
  recordStartTs = Date.now()

  try {
    audioCapture.start()
  } catch (err) {
    log.error('Failed to start audio capture', err)
    setState('error', 'Mic unavailable')
    notify('Jazz', 'Microphone unavailable. Check Settings → Model → Test microphone.')
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
    return
  }

  mode = newMode

  // Mute background audio so whisper hears the mic clearly (fire-and-forget).
  if (getConfig().muteWhileListening) void muteSystem()

  // No auto-stop: recording continues until the user releases Ctrl+Win
  // (push-to-talk) or presses Ctrl+Alt / clicks the orb again (toggle mode).
}

/** Stop capturing, transcribe, post-process, and inject. */
async function finishCapture(): Promise<void> {
  if (mode === 'idle' || !audioCapture.isCapturing || busy) return
  busy = true
  mode = 'idle'

  const durationMs = Date.now() - recordStartTs

  try {
    const pcm = await audioCapture.stop()
    if (getConfig().muteWhileListening) void restoreSystem()

    if (pcm.length === 0 || pcmRms(pcm) < AUDIO.SILENCE_THRESHOLD) {
      log.info('No audio detected — skipping transcription')
      setState('error', 'No audio detected')
      flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
      return
    }

    setState('transcribing')
    const raw = await sttEngine.transcribe(pcm)
    if (!raw.trim()) {
      setState('error', 'No speech recognized')
      flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
      return
    }

    const config = getConfig()
    const clean = postProcess(raw, config)

    setState('injecting', clean)
    await injectText(clean)

    const record = addTranscript(clean, raw, durationMs)
    broadcast(IPC.TRANSCRIPT_ADDED, record)

    setState('success', clean)
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
  } catch (err) {
    log.error('Pipeline error', err)
    if (getConfig().muteWhileListening) void restoreSystem()
    setState('error', (err as Error).message?.slice(0, 60))
    notify('Jazz', `Transcription failed: ${(err as Error).message}`)
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
  } finally {
    busy = false
  }
}

// ─── Push-to-talk (Ctrl+Win held) ──────────────────────────────────────────────

export function onRecordingStart(): void {
  beginCapture('ptt')
}

export function onRecordingStop(): void {
  if (mode === 'ptt') void finishCapture()
}

// ─── Toggle / hands-free (Ctrl+Alt or orb click) ────────────────────────────────

export function onToggleListening(): void {
  if (mode === 'idle') {
    if (busy) return
    beginCapture('toggle')
  } else if (mode === 'toggle') {
    void finishCapture()
  }
  // If a push-to-talk session is active, ignore the toggle.
}

/** After a brief success/error flash, return the orb to its idle state. */
function flashIdle(ms: number): void {
  setTimeout(() => setState('idle'), ms)
}
