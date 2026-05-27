import type { DictionaryEntry } from '../../shared/types'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Apply the user's personal dictionary as case-insensitive whole-word replacements. */
export function applyDictionary(text: string, entries: DictionaryEntry[]): string {
  let out = text
  for (const { spoken, typed } of entries) {
    if (!spoken) continue
    const re = new RegExp(`\\b${escapeRegExp(spoken)}\\b`, 'gi')
    out = out.replace(re, typed)
  }
  return out
}
