import { ipcMain } from 'electron'
import { IPC } from '../shared/types'
import { getRecorderWindow } from './windows'
import log from './logger'

export interface MicDevice {
  id: number
  name: string
}

/**
 * Coordinates microphone capture, which runs in a hidden renderer window using
 * the Web Audio API. The renderer streams nothing during capture; on stop it
 * posts a single 16 kHz mono Int16 PCM buffer back to the main process.
 */
export class AudioCapture {
  private capturing = false
  private pending: ((pcm: Buffer) => void) | null = null

  constructor() {
    ipcMain.on(IPC.REC_DATA, (_e, arrayBuffer: ArrayBuffer) => {
      const pcm = Buffer.from(arrayBuffer)
      log.info(`Recorder returned ${pcm.length} bytes PCM`)
      this.resolve(pcm)
    })
    ipcMain.on(IPC.REC_ERROR, (_e, message: string) => {
      log.error('Recorder error', message)
      this.resolve(Buffer.alloc(0))
    })
  }

  private resolve(pcm: Buffer): void {
    this.capturing = false
    const cb = this.pending
    this.pending = null
    cb?.(pcm)
  }

  start(): void {
    const rec = getRecorderWindow()
    if (!rec) {
      log.error('Recorder window not available')
      return
    }
    this.capturing = true
    rec.webContents.send(IPC.REC_START)
    log.debug('AudioCapture: start sent to recorder')
  }

  /** Stop capture and resolve with the concatenated 16-bit mono PCM buffer. */
  stop(): Promise<Buffer> {
    if (!this.capturing) return Promise.resolve(Buffer.alloc(0))
    const rec = getRecorderWindow()
    if (!rec) {
      this.capturing = false
      return Promise.resolve(Buffer.alloc(0))
    }
    return new Promise<Buffer>((resolve) => {
      this.pending = resolve
      rec.webContents.send(IPC.REC_STOP)
      // Safety timeout so the pipeline never hangs on a lost reply.
      setTimeout(() => this.pending && this.resolve(Buffer.alloc(0)), 5000)
    })
  }

  get isCapturing(): boolean {
    return this.capturing
  }
}

/** Compute RMS of 16-bit signed PCM, normalized to 0..1. */
export function pcmRms(pcm: Buffer): number {
  if (pcm.length < 2) return 0
  const samples = pcm.length / 2
  let sum = 0
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i) / 32768
    sum += s * s
  }
  return Math.sqrt(sum / samples)
}

export const audioCapture = new AudioCapture()
