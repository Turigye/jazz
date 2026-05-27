import { AUDIO } from '../../shared/constants'

// Hidden window: captures the microphone via Web Audio, downsamples to
// 16 kHz mono Int16 PCM, and ships the buffer to the main process on stop.

const TARGET_RATE = AUDIO.SAMPLE_RATE

let audioCtx: AudioContext | null = null
let source: MediaStreamAudioSourceNode | null = null
let processor: ScriptProcessorNode | null = null
let stream: MediaStream | null = null
let chunks: Float32Array[] = []
let sourceRate = 48000

async function start(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    audioCtx = new AudioContext()
    sourceRate = audioCtx.sampleRate
    source = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    chunks = []

    processor.onaudioprocess = (e): void => {
      const input = e.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(input))
    }

    source.connect(processor)
    processor.connect(audioCtx.destination)
  } catch (err) {
    window.jazz.sendRecorderError((err as Error).message)
  }
}

function downsampleToInt16(input: Float32Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return floatToInt16(input)
  const ratio = fromRate / toRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    // Average the source samples that map to this output sample.
    const startIdx = Math.floor(i * ratio)
    const endIdx = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    let count = 0
    for (let j = startIdx; j < endIdx; j++) {
      sum += input[j]
      count++
    }
    const s = count > 0 ? sum / count : 0
    out[i] = Math.max(-1, Math.min(1, s)) * 0x7fff
  }
  return out
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    out[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff
  }
  return out
}

function stop(): void {
  if (!audioCtx) {
    window.jazz.sendAudioData(new ArrayBuffer(0))
    return
  }

  const merged = mergeChunks(chunks)
  const pcm16 = downsampleToInt16(merged, sourceRate, TARGET_RATE)

  // Tear down the audio graph and release the mic.
  processor?.disconnect()
  source?.disconnect()
  stream?.getTracks().forEach((t) => t.stop())
  void audioCtx.close()
  audioCtx = null
  source = null
  processor = null
  stream = null
  chunks = []

  // Transfer the underlying buffer to main.
  window.jazz.sendAudioData(pcm16.buffer as ArrayBuffer)
}

function mergeChunks(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

window.jazz.onStartRecording(() => void start())
window.jazz.onStopRecording(() => stop())
