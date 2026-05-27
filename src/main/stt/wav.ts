import { AUDIO } from '../../shared/constants'

/** Wrap raw 16-bit mono PCM in a WAV container that whisper.cpp can read. */
export function pcmToWav(pcm: Buffer): Buffer {
  const sampleRate = AUDIO.SAMPLE_RATE
  const channels = AUDIO.CHANNELS
  const bitsPerSample = AUDIO.BIT_DEPTH
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM fmt chunk size
  header.writeUInt16LE(1, 20) // audio format = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}
