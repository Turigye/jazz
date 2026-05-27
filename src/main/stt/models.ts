import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import axios from 'axios'
import type { ModelSize, ModelStatus, DownloadProgress } from '../../shared/types'
import { MODELS, VAD } from '../../shared/constants'
import { getModelDirectory } from '../store'
import log from '../logger'

let cancelRequested = false

export function modelFileName(id: ModelSize): string {
  return `ggml-${id}.bin`
}

export function modelPath(id: ModelSize): string {
  return join(getModelDirectory(), modelFileName(id))
}

export function isModelInstalled(id: ModelSize): boolean {
  const p = modelPath(id)
  if (!existsSync(p)) return false
  // Guard against truncated/partial downloads.
  const minBytes = MODELS[id].sizeMb * 1024 * 1024 * 0.85
  return statSync(p).size >= minBytes
}

export function modelsStatus(): ModelStatus[] {
  return (Object.keys(MODELS) as ModelSize[]).map((id) => ({
    id,
    installed: isModelInstalled(id),
    path: modelPath(id)
  }))
}

export function anyModelInstalled(): boolean {
  return (Object.keys(MODELS) as ModelSize[]).some(isModelInstalled)
}

// ─── VAD model (Silero) ────────────────────────────────────────────────────────

export function vadPath(): string {
  return join(getModelDirectory(), VAD.fileName)
}

export function isVadInstalled(): boolean {
  return existsSync(vadPath()) && statSync(vadPath()).size > 100_000
}

/** Download the Silero VAD model. ~840 KB, no progress UI needed. */
export async function ensureVadInstalled(): Promise<void> {
  if (isVadInstalled()) return
  const dir = getModelDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dest = vadPath()
  const tmp = `${dest}.part`
  log.info(`Downloading Silero VAD from ${VAD.url}`)
  const response = await axios.get(VAD.url, { responseType: 'stream', maxRedirects: 5 })
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(tmp)
    response.data.pipe(out)
    out.on('finish', () => out.close(() => resolve()))
    out.on('error', reject)
    response.data.on('error', reject)
  })
  const { renameSync } = await import('fs')
  renameSync(tmp, dest)
  log.info(`VAD ready at ${dest}`)
}

async function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export function cancelDownload(): void {
  cancelRequested = true
}

/**
 * Download a model from Hugging Face with progress callbacks.
 * Verifies SHA256 when a known hash is configured.
 */
export async function downloadModel(
  id: ModelSize,
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  cancelRequested = false
  const info = MODELS[id]
  const dir = getModelDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const dest = modelPath(id)
  const tmp = `${dest}.part`

  log.info(`Downloading model ${id} from ${info.url}`)

  const response = await axios.get(info.url, {
    responseType: 'stream',
    maxRedirects: 5
  })

  const total = Number(response.headers['content-length'] ?? info.sizeMb * 1024 * 1024)
  let downloaded = 0

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(tmp)
    response.data.on('data', (chunk: Buffer) => {
      if (cancelRequested) {
        response.data.destroy()
        out.destroy()
        reject(new Error('cancelled'))
        return
      }
      downloaded += chunk.length
      onProgress({
        modelId: id,
        bytesDownloaded: downloaded,
        totalBytes: total,
        percent: Math.min(100, Math.round((downloaded / total) * 100)),
        phase: 'downloading'
      })
    })
    response.data.pipe(out)
    out.on('finish', () => out.close(() => resolve()))
    out.on('error', reject)
    response.data.on('error', reject)
  })

  // Verify checksum if we have a full-length hash on record.
  if (info.sha256 && info.sha256.length === 64) {
    onProgress({ modelId: id, bytesDownloaded: total, totalBytes: total, percent: 100, phase: 'verifying' })
    const actual = await sha256(tmp)
    if (actual !== info.sha256) {
      log.error(`Checksum mismatch for ${id}: expected ${info.sha256}, got ${actual}`)
      throw new Error('Checksum verification failed')
    }
  }

  // Atomic-ish swap.
  const { renameSync } = await import('fs')
  renameSync(tmp, dest)

  // Auto-fetch the tiny Silero VAD model alongside any STT model so it's
  // ready the first time a recording starts.
  try {
    await ensureVadInstalled()
  } catch (err) {
    log.warn('VAD auto-download failed (non-fatal)', err)
  }

  onProgress({ modelId: id, bytesDownloaded: total, totalBytes: total, percent: 100, phase: 'complete' })
  log.info(`Model ${id} ready at ${dest}`)
}
