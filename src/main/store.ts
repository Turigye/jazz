import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import type { JazzConfig } from '../shared/types'
import { DEFAULT_MODEL } from '../shared/constants'
import { defaultHotkeys } from '../shared/hotkey'

const HOTKEYS = defaultHotkeys(process.platform)

const schema = {
  launchAtStartup: { type: 'boolean', default: false },
  removeFiller: { type: 'boolean', default: true },
  language: { type: 'string', default: 'auto' },
  showOverlay: { type: 'boolean', default: true },
  playSounds: { type: 'boolean', default: false },
  activeModel: { type: 'string', default: DEFAULT_MODEL },
  modelDirectory: {
    type: 'string',
    default: ''  // resolved below after app ready
  },
  pushToTalkHotkey: { type: 'string', default: HOTKEYS.pushToTalk },
  commandModeHotkey: { type: 'string', default: HOTKEYS.toggle },
  vocabulary: { type: 'string', default: '' },
  beamSearch: { type: 'boolean', default: true },
  useVAD: { type: 'boolean', default: true },
  useGPU: { type: 'boolean', default: true },
  muteWhileListening: { type: 'boolean', default: true },
  overlayPosition: { type: ['object', 'null'], default: null },
  dictionary: { type: 'array', default: [] },
  snippets: { type: 'array', default: [] },
  firstRunComplete: { type: 'boolean', default: false },
  version: { type: 'string', default: '1.0.0' },
} as const

// We use 'any' for schema to avoid complex electron-store generics
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store<JazzConfig>({ schema: schema as any })

/** Resolve model directory once app is ready */
export function initStore(): void {
  if (!store.get('modelDirectory')) {
    const modelsDir = path.join(app.getPath('userData'), 'models')
    store.set('modelDirectory', modelsDir)
  }
  migrateHotkeysForPlatform()
}

/**
 * A config created on Windows (or by an older build) stores 'Ctrl+Win' /
 * 'Ctrl+Win+Alt'. Those still function on macOS (Win==Cmd), but read wrong in
 * the UI. Relabel the known Windows defaults to their Mac equivalents once.
 */
function migrateHotkeysForPlatform(): void {
  if (process.platform !== 'darwin') return
  if (store.get('pushToTalkHotkey') === 'Ctrl+Win') {
    store.set('pushToTalkHotkey', HOTKEYS.pushToTalk)
  }
  const toggle = store.get('commandModeHotkey')
  if (toggle === 'Ctrl+Win+Alt' || toggle === 'Ctrl+Alt+Win') {
    store.set('commandModeHotkey', HOTKEYS.toggle)
  }
}

export function getConfig(): JazzConfig {
  return store.store as JazzConfig
}

export function setConfig(partial: Partial<JazzConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof JazzConfig, value)
  }
}

export function getModelDirectory(): string {
  return store.get('modelDirectory') as string
}

export function isFirstRun(): boolean {
  return !store.get('firstRunComplete')
}

export function completeFirstRun(): void {
  store.set('firstRunComplete', true)
}

export default store
