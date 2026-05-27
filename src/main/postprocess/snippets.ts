import type { SnippetEntry } from '../../shared/types'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.!?,]+$/g, '').trim()
}

/**
 * Expand a snippet when the transcript is (or ends with) a trigger phrase.
 * Example: "insert my email" → "mich@example.com".
 */
export function expandSnippets(text: string, snippets: SnippetEntry[]): string {
  const norm = normalize(text)
  // Longest trigger first so specific phrases win over short ones.
  const sorted = [...snippets].sort((a, b) => b.trigger.length - a.trigger.length)
  for (const { trigger, expansion } of sorted) {
    const t = normalize(trigger)
    if (!t) continue
    if (norm === t) return expansion
    if (norm.endsWith(` ${t}`)) {
      const head = text.slice(0, text.toLowerCase().lastIndexOf(t)).trimEnd()
      return `${head} ${expansion}`.trim()
    }
  }
  return text
}
