import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPopuDisplay } from './lib/popu/display'
import { disableNativeSampler } from './lib/popu/sampler'

// PopuMusic MIDI Browser WebView: safe-area wiring + turn OFF the native
// sampler (this page sounds through Tone.js — avoid double-sounding).
initPopuDisplay()
void disableNativeSampler()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
