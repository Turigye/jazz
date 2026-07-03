import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { TranscriptRecord } from '../shared/types'
import log from './logger'

const MAX_HISTORY = 50
let history: TranscriptRecord[] = []

// Persist history to userData so recent dictations survive an app restart.
// (Previously kept only in memory, so the Transcripts tab and tray were empty
// after every relaunch.)
function storePath(): string {
  return join(app.getPath('userData'), 'transcripts.json')
}

let loaded = false
function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = readFileSync(storePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) history = parsed.slice(0, MAX_HISTORY)
  } catch {
    // No file yet (first run) or unreadable — start empty.
  }
}

function persist(): void {
  try {
    writeFileSync(storePath(), JSON.stringify(history), 'utf-8')
  } catch (err) {
    log.warn('Failed to persist transcripts', err)
  }
}

export function addTranscript(text: string, raw: string, durationMs: number): TranscriptRecord {
  ensureLoaded()
  const record: TranscriptRecord = {
    id: randomUUID(),
    text,
    raw,
    timestamp: Date.now(),
    durationMs
  }
  history.unshift(record)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  persist()
  return record
}

export function getTranscripts(): TranscriptRecord[] {
  ensureLoaded()
  return [...history]
}

export function getTranscript(id: string): TranscriptRecord | undefined {
  ensureLoaded()
  return history.find((t) => t.id === id)
}

export function clearTranscripts(): void {
  ensureLoaded()
  history.length = 0
  persist()
}

export function lastTranscript(): TranscriptRecord | undefined {
  ensureLoaded()
  return history[0]
}
