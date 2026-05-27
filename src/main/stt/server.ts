import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { cpus } from 'os'
import { join } from 'path'
import net from 'net'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { pcmToWav } from './wav'
import { modelPath, vadPath, isVadInstalled, ensureVadInstalled } from './models'
import { getConfig } from '../store'
import type { ModelSize, JazzConfig } from '../../shared/types'
import log from '../logger'

const BINARY_CANDIDATES = process.platform === 'win32'
  ? ['whisper-server.exe']
  : ['whisper-server']

function whisperBinDir(): string {
  if (is.dev) return join(app.getAppPath(), 'resources', 'whisper-bin')
  return join(process.resourcesPath, 'whisper-bin')
}

function resolveBinary(): string | null {
  const dir = whisperBinDir()
  for (const name of BINARY_CANDIDATES) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return null
}

/** Ask the OS for a free TCP port so we never collide with other apps. */
function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        reject(new Error('No port assigned'))
      }
    })
  })
}

/** Compose the whisper initial prompt from user vocabulary + dictionary targets. */
function buildPrompt(config: JazzConfig): string {
  const terms = [
    config.vocabulary ?? '',
    ...(config.dictionary ?? []).map((d) => d.typed)
  ]
    .join(' ')
    .replace(/[,\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!terms) return ''
  return `Vocabulary: ${terms}`.slice(0, 600)
}

/**
 * Keeps a single whisper.cpp HTTP server alive with the active model preloaded
 * in RAM. Eliminates the per-request model-load cost (the reason the old
 * spawn-per-request engine ate ~1.2 GB and added a second of latency each
 * capture). Re-launches when the active model changes.
 */
export class WhisperServer {
  private proc: ChildProcessWithoutNullStreams | null = null
  private port = 0
  private currentModel: ModelSize | null = null
  private ready: Promise<void> = Promise.resolve()
  private starting = false

  /** Ensure the server is running with the configured model. Idempotent. */
  async ensureRunning(): Promise<void> {
    const target = getConfig().activeModel
    if (this.proc && this.currentModel === target) {
      return this.ready
    }
    if (this.starting) return this.ready
    return this.start(target)
  }

  private async start(model: ModelSize): Promise<void> {
    this.starting = true
    await this.stop()

    const bin = resolveBinary()
    if (!bin) throw new Error(`whisper-server.exe missing from ${whisperBinDir()}`)
    const mPath = modelPath(model)
    if (!existsSync(mPath)) throw new Error(`Model missing: ${mPath}`)

    // VAD is tiny — make sure it's local before we boot, then pass it in.
    if (getConfig().useVAD && !isVadInstalled()) {
      try { await ensureVadInstalled() } catch (err) { log.warn('VAD fetch failed', err) }
    }

    this.port = await pickFreePort()
    const config = getConfig()
    const threads = Math.max(2, Math.min(8, cpus().length || 4))

    const args = [
      '-m', mPath,
      '-t', String(threads),
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--no-timestamps',
      '-l', config.language === 'auto' ? 'auto' : config.language
    ]
    if (config.beamSearch) args.push('-bs', '5')
    if (config.useVAD && isVadInstalled()) {
      args.push('--vad', '--vad-model', vadPath())
    }
    if (!config.useGPU) {
      // User opted out of GPU — force CPU even on machines with CUDA bundled.
      args.push('--no-gpu')
    }

    log.info(`Launching whisper-server on :${this.port} with model ${model}`)
    this.proc = spawn(bin, args, { windowsHide: true })

    this.proc.stdout.on('data', (d) => log.debug('[whisper-server]', d.toString().trim()))
    this.proc.stderr.on('data', (d) => log.debug('[whisper-server]', d.toString().trim()))
    this.proc.on('exit', (code, signal) => {
      log.warn(`whisper-server exited (code=${code}, signal=${signal})`)
      this.proc = null
      this.currentModel = null
    })

    this.ready = this.waitUntilReady()
    this.currentModel = model
    this.starting = false
    return this.ready
  }

  /** Poll the server's root until it answers (model load can take a few seconds). */
  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/`, {
          signal: AbortSignal.timeout(500)
        })
        if (r.ok || r.status === 404) {
          log.info(`whisper-server ready on :${this.port}`)
          return
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('whisper-server did not become ready within 60s')
  }

  /** Transcribe a 16-bit mono PCM buffer by POSTing it to the running server. */
  async transcribe(pcm: Buffer): Promise<string> {
    if (pcm.length === 0) return ''
    await this.ensureRunning()
    await this.ready

    const config = getConfig()
    const wav = pcmToWav(pcm)

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
    form.append('response_format', 'json')
    form.append('temperature', '0.0')
    const prompt = buildPrompt(config)
    if (prompt) form.append('prompt', prompt)

    const t0 = Date.now()
    const res = await fetch(`http://127.0.0.1:${this.port}/inference`, {
      method: 'POST',
      body: form
    })
    if (!res.ok) throw new Error(`whisper-server HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    const json = (await res.json()) as { text?: string }
    const text = (json.text ?? '').trim()
    log.info(`Transcribed in ${Date.now() - t0}ms: "${text.slice(0, 80)}"`)
    return text
  }

  /** Force a fresh launch with the current config (used when VAD/beam/language change). */
  async restart(): Promise<void> {
    await this.stop()
    return this.ensureRunning()
  }

  async stop(): Promise<void> {
    if (!this.proc) return
    const p = this.proc
    this.proc = null
    this.currentModel = null
    return new Promise<void>((resolve) => {
      p.once('exit', () => resolve())
      try { p.kill() } catch { resolve() }
      // Hard-kill after 2s if it doesn't exit cleanly.
      setTimeout(() => {
        try { p.kill('SIGKILL') } catch { /* ignore */ }
        resolve()
      }, 2000)
    })
  }
}

export const whisperServer = new WhisperServer()
