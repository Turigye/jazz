import { randomUUID } from 'crypto'
import type { TranscriptRecord } from '../shared/types'

const MAX_HISTORY = 50
const history: TranscriptRecord[] = []

export function addTranscript(text: string, raw: string, durationMs: number): TranscriptRecord {
  const record: TranscriptRecord = {
    id: randomUUID(),
    text,
    raw,
    timestamp: Date.now(),
    durationMs
  }
  history.unshift(record)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  return record
}

export function getTranscripts(): TranscriptRecord[] {
  return [...history]
}

export function getTranscript(id: string): TranscriptRecord | undefined {
  return history.find((t) => t.id === id)
}

export function clearTranscripts(): void {
  history.length = 0
}

export function lastTranscript(): TranscriptRecord | undefined {
  return history[0]
}
