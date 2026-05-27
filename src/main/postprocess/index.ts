import type { JazzConfig } from '../../shared/types'
import { removeFiller } from './filler'
import { applyDictionary } from './dictionary'
import { expandSnippets } from './snippets'

/** Compose the post-processing pipeline: filler → dictionary → snippets → tidy. */
export function postProcess(raw: string, config: JazzConfig): string {
  let text = raw.trim()
  if (!text) return ''

  if (config.removeFiller) text = removeFiller(text)
  text = applyDictionary(text, config.dictionary ?? [])
  text = expandSnippets(text, config.snippets ?? [])

  // Capitalize first letter for a clean injection.
  text = text.replace(/^\s*([a-z])/, (_, c) => c.toUpperCase())
  return text.trim()
}
