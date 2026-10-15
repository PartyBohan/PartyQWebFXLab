import type { MidiConnectionStatus, MidiDevice } from '../types'
import {
  isPartyKeysName,
  type MidiBackend,
  type MidiBackendCallbacks,
} from './MidiBackend'

// ---------------------------------------------------------------------------
// Web MIDI API backend (browser / desktop Chrome). Note routing + SysEx out.
// Degrades to status 'unsupported' where Web MIDI is absent (Safari/iOS/FF).
// ---------------------------------------------------------------------------

const NOTE_ON = 0x90
const NOTE_OFF = 0x80

function toDevice(port: MIDIInput | MIDIOutput): MidiDevice {
  const name = port.name ?? 'Unknown device'
  return {
    id: port.id,
    name,
    manufacturer: port.manufacturer ?? '',
    isPartyKeys: isPartyKeysName(name),
  }
}

export class WebMidiBackend implements MidiBackend {
  readonly kind = 'web' as const

  private access: MIDIAccess | null = null
  private callbacks: MidiBackendCallbacks = {}

  status: MidiConnectionStatus = 'idle'
  /** False when access was granted without SysEx (LED SysEx silently skipped). */
  sysexEnabled = false
  inputs: MidiDevice[] = []
  outputs: MidiDevice[] = []
  selectedInputId: string | null = null
  selectedOutputId: string | null = null

  constructor() {
    // Support is NOT latched here: the PopuMusic WebView injects its Web MIDI
    // polyfill from the native side, which may happen after page scripts run
    // (older Android WebViews skip document-start injection entirely). Always
    // re-probe at connect() time instead of locking in 'unsupported' once.
  }

  get supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.requestMIDIAccess === 'function'
    )
  }

  setCallbacks(cb: MidiBackendCallbacks) {
    this.callbacks = cb
  }

  async connect(): Promise<MidiConnectionStatus> {
    if (this.status === 'denied') return this.status
    // Wait briefly for the WebView-injected polyfill to appear before giving up.
    const waitMs = 10000
    const startedAt = Date.now()
    while (!this.supported) {
      if (Date.now() - startedAt >= waitMs) {
        this.status = 'unsupported'
        this.callbacks.onStateChange?.()
        return this.status
      }
      await new Promise((r) => setTimeout(r, 150))
    }
    this.status = 'requesting'
    this.callbacks.onStateChange?.()
    try {
      // LED control needs SysEx; degrade to plain notes if the host refuses.
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: true })
        this.sysexEnabled = true
      } catch (sysexErr) {
        // eslint-disable-next-line no-console
        console.warn('[MIDI/web] sysex refused, retrying without', sysexErr)
        this.access = await navigator.requestMIDIAccess({ sysex: false })
        this.sysexEnabled = false
      }
      this.status = 'ready'
      this.access.onstatechange = () => this.refresh()
      this.refresh()
      this.autoSelect()
      return this.status
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[MIDI/web] access denied / failed', err)
      this.status = 'denied'
      this.callbacks.onStateChange?.()
      return this.status
    }
  }

  private refresh() {
    if (!this.access) return
    this.inputs = Array.from(this.access.inputs.values()).map(toDevice)
    this.outputs = Array.from(this.access.outputs.values()).map(toDevice)
    if (this.selectedInputId && !this.inputs.some((d) => d.id === this.selectedInputId)) {
      this.selectedInputId = null
    }
    if (this.selectedOutputId && !this.outputs.some((d) => d.id === this.selectedOutputId)) {
      this.selectedOutputId = null
    }
    this.rebindInput()
    this.callbacks.onStateChange?.()
    // Devices may appear after connect() (BLE established later by the App);
    // re-run auto-select on every state change like the reference impl.
    this.autoSelect()
  }

  private autoSelect() {
    if (!this.selectedInputId) {
      const pq = this.inputs.find((d) => d.isPartyKeys) ?? this.inputs[0]
      if (pq) this.selectInput(pq.id)
    }
    if (!this.selectedOutputId) {
      const pq = this.outputs.find((d) => d.isPartyKeys) ?? this.outputs[0]
      if (pq) this.selectOutput(pq.id)
    }
  }

  selectInput(id: string | null) {
    this.selectedInputId = id
    this.rebindInput()
    this.callbacks.onStateChange?.()
  }

  selectOutput(id: string | null) {
    this.selectedOutputId = id
    this.callbacks.onStateChange?.()
  }

  private rebindInput() {
    if (!this.access) return
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = input.id === this.selectedInputId ? this.handleMessage : null
    }
  }

  private handleMessage = (e: MIDIMessageEvent) => {
    // Some hosts (Android/older WebViews) hand back plain arrays — normalize.
    const data = new Uint8Array(e.data ?? [])
    if (data.length < 2) return
    const status = data[0] & 0xf0
    const note = data[1]
    const velocity = data.length > 2 ? data[2] : 0
    if (status === NOTE_ON && velocity > 0) {
      this.callbacks.onNoteOn?.(note, velocity / 127)
    } else if (status === NOTE_OFF || (status === NOTE_ON && velocity === 0)) {
      this.callbacks.onNoteOff?.(note)
    }
  }

  hasOutput(): boolean {
    return !!this.getOutput()
  }

  send(bytes: number[]): void {
    if (bytes[0] === 0xf0 && !this.sysexEnabled) return // LED SysEx unavailable
    const out = this.getOutput()
    if (!out) return
    try {
      out.send(bytes)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[MIDI/web] send failed', err)
    }
  }

  private getOutput(): MIDIOutput | null {
    if (!this.access || !this.selectedOutputId) return null
    return this.access.outputs.get(this.selectedOutputId) ?? null
  }
}
