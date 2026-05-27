import React from 'react'
import { createRoot } from 'react-dom/client'
import Wizard from './Wizard'
import '../index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Wizard />
  </React.StrictMode>
)
