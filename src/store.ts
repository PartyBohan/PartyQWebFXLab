import { create } from 'zustand'
import type {
  ActiveNote,
  Adsr,
  ChordResult,
  FxState,
  LedColorMode,
  LedMode,
  MidiConnectionStatus,
  MidiDevice,
} from './lib/types'
import { audioEngine } from './lib/audio/AudioEngine'
import { midiEngine } from './lib/midi/MidiEngine'
import {
  allLedsOff,
  initLed,
  ledKeyOff,
  sendLedMessage,
} from './lib/led/sendLedMessage'
import { colorForKey } from './lib/led/colors'
import {
  detectChord,
  keyIndexToMidi,
  PARTYKEYS_HIGH,
  PARTYKEYS_LOW,
  scalePitchClasses,
} from './lib/music'
import { DEFAULT_PRESET_ID, getPreset } from './lib/presets/soundPresets'
import { cloneFx, DEFAULT_FX, getFxMode } from './lib/presets/fxPresets'
import { interpretPrompt, type PromptResult } from './lib/presets/aiKeywords'

// ---------------------------------------------------------------------------
// Central app store. Holds UI state and orchestrates the audio / MIDI / LED
// engines (which are imperative singletons). Components subscribe to slices.
// ---------------------------------------------------------------------------

interface AppState {
  // audio
  audioStarted: boolean
  masterVolume: number

  // midi
  midiStatus: MidiConnectionStatus
  inputs: MidiDevice[]
  outputs: MidiDevice[]
  selectedInputId: string | null
  selectedOutputId: string | null
  /** Running inside the native iOS/Android shell (vs a browser). */
  isNativeApp: boolean
  /** Running inside the PopuMusic MIDI Browser WebView. */
  isPopuWebview: boolean
  /** Native build can present the system Bluetooth-MIDI pairing sheet. */
  canPairBluetooth: boolean

  // performance
  activeNotes: Record<number, ActiveNote>
  lastNote: { note: number; velocity: number } | null
  chord: ChordResult | null

  // sound
  presetId: string
  adsr: Adsr

  // fx
  fx: FxState
  fxModeId: string

  // led
  ledEnabled: boolean
  ledMode: LedMode
  ledColor: LedColorMode
  ledBrightness: number
  scaleRoot: number // pitch class 0..11
  scaleId: string

  // ai
  lastPrompt: string
  lastPromptResult: PromptResult | null

  // actions
  startAudio: () => Promise<void>
  setMasterVolume: (v: number) => void
  connectMidi: () => Promise<void>
  pairBluetooth: () => Promise<void>
  selectInput: (id: string | null) => void
  selectOutput: (id: string | null) => void
  setPreset: (id: string) => void
  setAdsr: (patch: Partial<Adsr>) => void
  setFxMode: (id: string) => void
  setFxParam: (effect: keyof FxState, param: string, value: number) => void
  toggleFx: (effect: keyof FxState) => void
  toggleLed: () => void
  setLedMode: (m: LedMode) => void
  setLedColor: (c: LedColorMode) => void
  setLedBrightness: (b: number) => void
  setScale: (root: number, id: string) => void
  noteOn: (note: number, velocity: number, source: 'midi' | 'pointer') => void
  noteOff: (note: number) => void
  applyPrompt: (prompt: string) => void
  syncMidiState: () => void
}

export const useStore = create<AppState>((set, get) => {
  // ---- internal helpers (not part of public state) ----
  // LED output is routed through midiEngine.send() inside the led module, so
  // these helpers no longer need a MIDIOutput handle.

  /** Light scale tones (dim) across the whole keybed for Scale Guide mode. */
  const renderScaleLeds = () => {
    const { ledEnabled, ledMode, scaleRoot, scaleId, ledColor, ledBrightness } = get()
    if (!ledEnabled) return
    if (ledMode !== 'scale') return
    allLedsOff()
    const pcs = scalePitchClasses(scaleRoot, scaleId)
    for (let midi = PARTYKEYS_LOW; midi <= PARTYKEYS_HIGH; midi++) {
      if (pcs.has(((midi % 12) + 12) % 12)) {
        const isRoot = ((midi % 12) + 12) % 12 === scaleRoot
        sendLedMessage(midi, colorForKey(ledColor, midi), ledBrightness * (isRoot ? 1 : 0.45))
      }
    }
  }

  /** Reactive brightness derived from the wet FX (reverb + delay + filter). */
  const reactiveBrightness = () => {
    const { fx, ledBrightness } = get()
    const rev = fx.reverb.enabled ? fx.reverb.wet : 0
    const del = fx.delay.enabled ? fx.delay.wet : 0
    const energy = Math.min(1, 0.35 + rev * 0.5 + del * 0.4)
    return ledBrightness * energy
  }

  /** Light a single pressed key according to the current LED mode. */
  const ledNoteOn = (note: number) => {
    const { ledEnabled, ledMode, ledColor, ledBrightness } = get()
    if (!ledEnabled) return
    const rgb = colorForKey(ledColor, note)
    switch (ledMode) {
      case 'note':
        sendLedMessage(note, rgb, ledBrightness)
        break
      case 'trail':
        // fading trail: auto-off after a short duration handled by sendLedMessage
        sendLedMessage(note, rgb, ledBrightness, 800)
        break
      case 'reactive':
        sendLedMessage(note, rgb, reactiveBrightness())
        break
      case 'chord':
        // chord tones are repainted from the full active set below
        break
      case 'scale':
        // brighten the pressed key on top of the static scale
        sendLedMessage(note, rgb, Math.min(1, ledBrightness + 0.3))
        break
    }
  }

  const ledNoteOff = (note: number) => {
    const { ledEnabled, ledMode } = get()
    if (!ledEnabled) return
    if (ledMode === 'trail') return // fades on its own
    if (ledMode === 'scale') {
      // restore the dim scale color if this note is in scale, else off
      const { scaleRoot, scaleId, ledColor, ledBrightness } = get()
      const inScale = scalePitchClasses(scaleRoot, scaleId).has(((note % 12) + 12) % 12)
      if (inScale) {
        const isRoot = ((note % 12) + 12) % 12 === scaleRoot
        sendLedMessage(note, colorForKey(ledColor, note), ledBrightness * (isRoot ? 1 : 0.45))
      } else {
        ledKeyOff(note)
      }
      return
    }
    ledKeyOff(note)
  }

  /** Repaint chord-tone LEDs from the full active-note set. */
  const renderChordLeds = () => {
    const { ledEnabled, ledMode, ledColor, ledBrightness, activeNotes } = get()
    if (!ledEnabled || ledMode !== 'chord') return
    allLedsOff()
    const notes = Object.keys(activeNotes).map(Number)
    const pcs = new Set(notes.map((n) => ((n % 12) + 12) % 12))
    for (let midi = PARTYKEYS_LOW; midi <= PARTYKEYS_HIGH; midi++) {
      if (pcs.has(((midi % 12) + 12) % 12)) {
        sendLedMessage(midi, colorForKey(ledColor, midi), ledBrightness)
      }
    }
  }

  return {
    audioStarted: false,
    masterVolume: 0.85,

    midiStatus: midiEngine.status,
    inputs: [],
    outputs: [],
    selectedInputId: null,
    selectedOutputId: null,
    isNativeApp: midiEngine.kind === 'native',
    isPopuWebview: midiEngine.isPopuWebview,
    canPairBluetooth: midiEngine.canPairBluetooth,

    activeNotes: {},
    lastNote: null,
    chord: null,

    presetId: DEFAULT_PRESET_ID,
    adsr: { ...getPreset(DEFAULT_PRESET_ID).envelope },

    fx: cloneFx(DEFAULT_FX),
    fxModeId: 'clean',

    ledEnabled: true,
    ledMode: 'note',
    ledColor: 'gradient',
    ledBrightness: 0.85,
    scaleRoot: 0,
    scaleId: 'major',

    lastPrompt: '',
    lastPromptResult: null,

    // ---- actions ----

    startAudio: async () => {
      if (get().audioStarted) return
      await audioEngine.start()
      if (!audioEngine.isStarted) return // blocked until a user gesture
      const preset = getPreset(get().presetId)
      audioEngine.setPreset(preset, get().adsr)
      audioEngine.updateFx(get().fx)
      audioEngine.setMasterVolume(get().masterVolume)
      set({ audioStarted: true })
    },

    setMasterVolume: (v) => {
      audioEngine.setMasterVolume(v)
      set({ masterVolume: v })
    },

    connectMidi: async () => {
      midiEngine.setCallbacks({
        onNoteOn: (note, velocity) => get().noteOn(note, velocity, 'midi'),
        onNoteOff: (note) => get().noteOff(note),
        onStateChange: () => get().syncMidiState(),
      })
      await midiEngine.connect()
      get().syncMidiState()
      // Initialize LEDs on the freshly selected output.
      initLed()
      renderScaleLeds()
    },

    pairBluetooth: async () => {
      // iOS: open the system Bluetooth-MIDI sheet, then re-read devices.
      await midiEngine.presentBlePairing()
      get().syncMidiState()
      initLed()
      renderScaleLeds()
    },

    syncMidiState: () => {
      set({
        midiStatus: midiEngine.status,
        inputs: [...midiEngine.inputs],
        outputs: [...midiEngine.outputs],
        selectedInputId: midiEngine.selectedInputId,
        selectedOutputId: midiEngine.selectedOutputId,
      })
    },

    selectInput: (id) => {
      midiEngine.selectInput(id)
      get().syncMidiState()
    },

    selectOutput: (id) => {
      midiEngine.selectOutput(id)
      get().syncMidiState()
      initLed()
      renderScaleLeds()
    },

    setPreset: (id) => {
      const preset = getPreset(id)
      const adsr = { ...preset.envelope }
      audioEngine.setPreset(preset, adsr)
      set({ presetId: id, adsr })
    },

    setAdsr: (patch) => {
      const adsr = { ...get().adsr, ...patch }
      audioEngine.setAdsr(adsr)
      set({ adsr })
    },

    setFxMode: (id) => {
      const mode = getFxMode(id)
      if (!mode) return
      const fx = cloneFx(mode.fx)
      audioEngine.updateFx(fx)
      set({ fx, fxModeId: id })
      if (get().ledMode === 'reactive') {
        // no global repaint needed; reactive updates on next note
      }
    },

    setFxParam: (effect, param, value) => {
      const fx = cloneFx(get().fx)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(fx[effect] as any)[param] = value
      audioEngine.updateFx(fx)
      set({ fx, fxModeId: 'custom' })
    },

    toggleFx: (effect) => {
      const fx = cloneFx(get().fx)
      fx[effect].enabled = !fx[effect].enabled
      audioEngine.updateFx(fx)
      set({ fx, fxModeId: 'custom' })
    },

    toggleLed: () => {
      const next = !get().ledEnabled
      set({ ledEnabled: next })
      if (!next) allLedsOff()
      else {
        initLed()
        renderScaleLeds()
      }
    },

    setLedMode: (m) => {
      allLedsOff()
      set({ ledMode: m })
      renderScaleLeds()
      renderChordLeds()
    },

    setLedColor: (c) => {
      set({ ledColor: c })
      renderScaleLeds()
      renderChordLeds()
    },

    setLedBrightness: (b) => {
      set({ ledBrightness: b })
      renderScaleLeds()
    },

    setScale: (root, id) => {
      set({ scaleRoot: root, scaleId: id })
      renderScaleLeds()
    },

    noteOn: (note, velocity, source) => {
      // 1) AUDIO FIRST — lowest latency. Fire the synth before any React state
      //    work so sound is never gated on reconciliation/visuals.
      if (get().audioStarted) audioEngine.triggerAttack(note, velocity)

      // 2) State + visuals (keyboard glow, particles, chord readout).
      const active: Record<number, ActiveNote> = {
        ...get().activeNotes,
        [note]: { note, velocity, source },
      }
      const notes = Object.keys(active).map(Number)
      const chord = detectChord(notes)
      set({ activeNotes: active, lastNote: { note, velocity }, chord })

      // 3) LED (fire-and-forget; hardware LED latency ~200ms, never blocks audio).
      ledNoteOn(note)
      if (get().ledMode === 'chord') renderChordLeds()
    },

    noteOff: (note) => {
      // Audio release first, same rationale as noteOn.
      if (get().audioStarted) audioEngine.triggerRelease(note)

      const active = { ...get().activeNotes }
      delete active[note]
      const notes = Object.keys(active).map(Number)
      const chord = detectChord(notes)
      set({ activeNotes: active, chord })

      ledNoteOff(note)
      if (get().ledMode === 'chord') renderChordLeds()
    },

    applyPrompt: (prompt) => {
      const result = interpretPrompt(prompt)
      const preset = getPreset(result.presetId)
      const adsr = { ...preset.envelope }
      if (get().audioStarted) {
        audioEngine.setPreset(preset, adsr)
        audioEngine.updateFx(result.fx)
      }
      set({
        presetId: result.presetId,
        adsr,
        fx: result.fx,
        fxModeId: result.fxModeId,
        lastPrompt: prompt,
        lastPromptResult: result,
      })
    },
  }
})

// Convenience hook for the on-screen + hardware "this note is lit" check.
export function noteIsActive(note: number): boolean {
  return note in useStore.getState().activeNotes
}

// Re-export so UI can build the scale-tone overlay without importing music.ts.
export { keyIndexToMidi }
