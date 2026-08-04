import { Notification } from 'electron'
import type { JazzState } from '../shared/types'
import { IPC } from '../shared/types'
import { AUDIO, OVERLAY, PIPELINE, watchdogMs } from '../shared/constants'
import { audioCapture, pcmRms } from './audio'
import { sttEngine } from './stt/engine'
import { postProcess } from './postprocess'
import { injectText } from './inject'
import { addTranscript } from './transcripts'
import { getConfig } from './store'
import { broadcast } from './windows'
import { refreshTrayMenu } from './tray'
import { muteSystem, restoreSystem } from './audioduck'
import log from './logger'

type Mode = 'idle' | 'ptt' | 'toggle'

let mode: Mode = 'idle'
let busy = false
let recordStartTs = 0

// Safety-net timers — see PIPELINE constants for why these exist. Both are
// belt-and-suspenders: they should rarely fire, but when the normal stop
// signal or the STT call gets lost, these are what let the app recover on
// its own instead of requiring the user to Force Quit.
let autoStopTimer: NodeJS.Timeout | null = null
let watchdogTimer: NodeJS.Timeout | null = null

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
  log.info(`Capture started (mode=${newMode})`)

  // Mute background audio so whisper hears the mic clearly (fire-and-forget).
  if (getConfig().muteWhileListening) void muteSystem()

  // Recording normally continues until the user releases Ctrl+Win (push-to-talk)
  // or presses Ctrl+Alt / clicks the orb again (toggle mode). This timer is a
  // safety net for when that stop signal never arrives — e.g. macOS silently
  // disabling uiohook's global event tap under system load, which drops the
  // key-up entirely and would otherwise leave the mic recording forever with
  // nothing the user can press to stop it.
  autoStopTimer = setTimeout(() => {
    log.warn(`Recording exceeded ${PIPELINE.MAX_RECORDING_MS}ms with no stop signal — auto-stopping`)
    void finishCapture()
  }, PIPELINE.MAX_RECORDING_MS)
}

let captureGen = 0

/** Stop capturing, transcribe, post-process, and inject. */
async function finishCapture(): Promise<void> {
  if (mode === 'idle' || !audioCapture.isCapturing || busy) return
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
  busy = true
  mode = 'idle'
  const myGen = ++captureGen

  const durationMs = Date.now() - recordStartTs
  log.info(`Capture stopped after ${durationMs}ms (gen=${myGen}) — stopping audio`)

  // Last-resort backstop: every await below is already individually bounded
  // (audioCapture.stop has a 5s internal timeout, transcribe is bounded by
  // PIPELINE.INFERENCE_TIMEOUT_MS / CLI_TIMEOUT_MS), but if something we
  // haven't anticipated still hangs, this forces the app back to idle instead
  // of leaving it stuck until the user force-quits. Guarded by myGen so a late
  // watchdog fire from a superseded call can't clobber a newer capture.
  const wdMs = watchdogMs(durationMs)
  watchdogTimer = setTimeout(() => {
    if (myGen !== captureGen) return
    log.error(`Pipeline watchdog: still busy after ${wdMs}ms — forcing recovery to idle`)
    busy = false
    watchdogTimer = null
    setState('error', 'Recovered from a stuck state')
    notify('Jazz', 'Jazz recovered from a stuck state. If this keeps happening, check Settings → Open Logs.')
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
  }, wdMs)

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

    // Save the transcript before attempting injection: a paste failure (e.g.
    // a permission the user hasn't re-granted after a rebuild) shouldn't lose
    // the transcript — it's still on the clipboard and in Recent transcripts
    // either way.
    const record = addTranscript(clean, raw, durationMs)
    broadcast(IPC.TRANSCRIPT_ADDED, record)
    refreshTrayMenu() // keep the tray's Recent submenu in sync

    setState('injecting', clean)
    try {
      await injectText(clean)
      setState('success', clean)
    } catch (err) {
      log.error('Injection failed (transcript saved, text is on the clipboard)', err)
      setState('error', (err as Error).message?.slice(0, 60))
      notify('Jazz', (err as Error).message)
    }
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
  } catch (err) {
    log.error('Pipeline error', err)
    if (getConfig().muteWhileListening) void restoreSystem()
    setState('error', (err as Error).message?.slice(0, 60))
    notify('Jazz', `Transcription failed: ${(err as Error).message}`)
    flashIdle(OVERLAY.SUCCESS_VISIBLE_MS)
  } finally {
    if (myGen === captureGen) busy = false
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null }
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
