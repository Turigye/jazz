import { FILLER_PATTERNS } from '../../shared/constants'

/** Remove common filler words/phrases and tidy the resulting whitespace. */
export function removeFiller(text: string): string {
  let out = text
  for (const pattern of FILLER_PATTERNS) {
    out = out.replace(pattern, ' ')
  }
  return out
    .replace(/\s+([,.!?;:])/g, '$1') // no space before punctuation
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,.]\s*/, '') // leading stray punctuation
    .trim()
}
