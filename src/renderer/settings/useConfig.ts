import { create } from 'zustand'
import type { JazzConfig } from '../../shared/types'

interface ConfigStore {
  config: JazzConfig | null
  load: () => Promise<void>
  update: (partial: Partial<JazzConfig>) => Promise<void>
}

export const useConfig = create<ConfigStore>((set, get) => ({
  config: null,
  load: async () => {
    const config = await window.jazz.getConfig()
    set({ config })
  },
  update: async (partial) => {
    await window.jazz.setConfig(partial)
    const current = get().config
    set({ config: current ? { ...current, ...partial } : current })
  }
}))
