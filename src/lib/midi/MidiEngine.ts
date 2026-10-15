import { Capacitor } from '@capacitor/core'
import type { MidiConnectionStatus, MidiDevice } from '../types'
import type { MidiBackend, MidiBackendCallbacks } from './MidiBackend'
import { WebMidiBackend } from './WebMidiBackend'
import { NativeMidiBackend } from './NativeMidiBackend'
import { isPopuWebview } from '../popu/display'

// ---------------------------------------------------------------------------
// MIDI facade. Picks the right backend for the platform and exposes one stable
// surface to the store + LED layer. On iOS/Android (Capacitor native) it uses
// the CoreMIDI plugin; everywhere else it uses Web MIDI.
// ---------------------------------------------------------------------------

function createBackend(): MidiBackend {
  if (Capacitor.isNativePlatform()) {
    return new NativeMidiBackend()
  }
  return new WebMidiBackend()
}

class MidiFacade {
  private backend: MidiBackend = createBackend()

  get kind() {
    return this.backend.kind
  }
  get supported() {
    return this.backend.supported
  }
  /** True when running as a native app with the Bluetooth pairing sheet. */
  get canPairBluetooth() {
    return this.backend.kind === 'native' && !!this.backend.presentBlePairing
  }
  /** True inside the PopuMusic MIDI Browser WebView. */
  get isPopuWebview() {
    return isPopuWebview()
  }
  /** Popu WebView: open the app's Bluetooth-MIDI page via popumidi://action. */
  get canOpenAppBluetooth() {
    return this.backend.kind === 'web' && isPopuWebview()
  }
  get status(): MidiConnectionStatus {
    return this.backend.status
  }
  get inputs(): MidiDevice[] {
    return this.backend.inputs
  }
  get outputs(): MidiDevice[] {
    return this.backend.outputs
  }
  get selectedInputId(): string | null {
    return this.backend.selectedInputId
  }
  get selectedOutputId(): string | null {
    return this.backend.selectedOutputId
  }

  setCallbacks(cb: MidiBackendCallbacks) {
    this.backend.setCallbacks(cb)
  }
  connect() {
    return this.backend.connect()
  }
  selectInput(id: string | null) {
    this.backend.selectInput(id)
  }
  selectOutput(id: string | null) {
    this.backend.selectOutput(id)
  }
  /** Raw MIDI bytes to the selected output — the single LED send path. */
  send(bytes: number[]) {
    this.backend.send(bytes)
  }
  hasOutput() {
    return this.backend.hasOutput()
  }
  /** iOS only — present the Bluetooth MIDI pairing sheet. */
  async presentBlePairing() {
    await this.backend.presentBlePairing?.()
  }
}

// Module-level singleton — one MIDI connection per page/app.
export const midiEngine = new MidiFacade()
