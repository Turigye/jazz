import { spawn } from 'child_process'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir, cpus } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { pcmToWav } from './wav'
import { modelPath, vadPath, isVadInstalled, ensureVadInstalled } from './models'
import { getConfig } from '../store'
import { whisperServer } from './server'
import { transcribeTimeoutMs, pcmDurationMs } from '../../shared/constants'
import type { ModelSize, JazzConfig } from '../../shared/types'
import log from '../logger'

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
  // Keep it short — long prompts hurt more than help.
  return `Vocabulary: ${terms}`.slice(0, 600)
}

// whisper.cpp release binaries have used different names over time.
const BINARY_CANDIDATES = process.platform === 'win32'
  ? ['whisper-cli.exe', 'main.exe', 'whisper.exe']
  : ['whisper-cli', 'main', 'whisper']

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

/** Strip whisper.cpp log noise and bracketed timestamps from a transcript. */
function cleanWhisperOutput(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\[[0-9:.\s>-]+\]/g, '').trim())
    .filter((line) => line && !line.startsWith('whisper_') && !line.startsWith('['))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class STTEngine {
  private binary: string | null = null

  available(): boolean {
    this.binary ??= resolveBinary()
    return this.binary !== null
  }

  /** Transcribe 16-bit mono PCM to text. Resolves to '' on empty/failed input. */
  async transcribe(pcm: Buffer, modelId?: ModelSize): Promise<string> {
    if (pcm.length === 0) return ''

    // Preferred path: keep-model-loaded HTTP server (Wispr-style).
    try {
      return await whisperServer.transcribe(pcm)
    } catch (err) {
      log.warn('whisper-server transcribe failed; falling back to one-shot CLI', err)
    }

    // Fallback: spawn whisper-cli per request (slower, ~1.2 GB RAM spike).
    this.binary ??= resolveBinary()
    if (!this.binary) {
      throw new Error(
        `whisper binary not found in ${whisperBinDir()} (expected one of ${BINARY_CANDIDATES.join(', ')})`
      )
    }

    const model = modelId ?? getConfig().activeModel
    const modelFile = modelPath(model)
    if (!existsSync(modelFile)) {
      throw new Error(`Model file missing: ${modelFile}`)
    }

    const dir = await mkdtemp(join(tmpdir(), 'jazz-'))
    const wavPath = join(dir, 'audio.wav')
    await writeFile(wavPath, pcmToWav(pcm))

    const config = getConfig()
    const language = config.language === 'auto' ? 'auto' : config.language
    const args = [
      '-m', modelFile,
      '-f', wavPath,
      '--no-timestamps',
      '-l', language,
      '-t', String(Math.max(2, Math.min(8, cpus().length || 4)))
    ]

    // Beam search: better accuracy at a modest latency cost.
    if (config.beamSearch) args.push('-bs', '5')

    // VAD: trim silence/noise before encoding (big real-world quality win).
    if (config.useVAD && isVadInstalled()) {
      args.push('--vad', '--vad-model', vadPath())
    } else if (config.useVAD) {
      // First-run case: kick off VAD download in the background so the next
      // capture has it. Don't block this transcription on it.
      void ensureVadInstalled().catch(() => undefined)
    }

    // Vocabulary biasing: an initial prompt nudges whisper toward the user's
    // own names/jargon plus any dictionary target terms. Capped to stay well
    // under whisper's prompt token budget.
    const prompt = buildPrompt(config)
    if (prompt) args.push('--prompt', prompt)

    log.debug('whisper spawn', this.binary, args.join(' '))
    const t0 = Date.now()

    try {
      const libDir = whisperBinDir()
      const env = {
        ...process.env,
        LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
        DYLD_LIBRARY_PATH: [libDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':')
      }
      const text = await new Promise<string>((resolve, reject) => {
        const proc = spawn(this.binary as string, args, { windowsHide: true, env })
        let stdout = ''
        let stderr = ''
        let settled = false

        // Never let a wedged whisper-cli process hang the pipeline forever.
        const cliTimeoutMs = transcribeTimeoutMs(pcmDurationMs(pcm.length))
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          log.error(`whisper-cli did not exit within ${cliTimeoutMs}ms — killing`)
          proc.kill('SIGKILL')
          reject(new Error('whisper-cli timed out'))
        }, cliTimeoutMs)

        proc.stdout.on('data', (d) => (stdout += d.toString()))
        proc.stderr.on('data', (d) => (stderr += d.toString()))
        proc.on('error', (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(err)
        })
        proc.on('close', (code) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code === 0) resolve(cleanWhisperOutput(stdout))
          else reject(new Error(`whisper exited ${code}: ${stderr.slice(-400)}`))
        })
      })
      log.info(`Transcribed in ${Date.now() - t0}ms: "${text.slice(0, 80)}"`)
      return text
    } finally {
      await unlink(wavPath).catch(() => undefined)
    }
  }

  /** Boot whisper-server so the model is loaded in RAM before the first capture. */
  async prewarm(): Promise<void> {
    try {
      await whisperServer.ensureRunning()
      log.info('STT engine pre-warmed (server up, model loaded)')
    } catch (err) {
      log.warn('STT prewarm skipped', err)
    }
  }
}

export const sttEngine = new STTEngine()
