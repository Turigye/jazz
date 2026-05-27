/// <reference types="vite/client" />

import type { JazzAPI } from '../preload/index'

declare global {
  interface Window {
    jazz: JazzAPI
  }
}

export {}
