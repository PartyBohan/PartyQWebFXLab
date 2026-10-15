import { useEffect } from 'react'
import { useStore } from './store'
import { audioEngine } from './lib/audio/AudioEngine'
import { allLedsOff } from './lib/led/sendLedMessage'
import { DevicePanel } from './components/DevicePanel/DevicePanel'
import { Keyboard } from './components/Keyboard/Keyboard'
import { SoundPanel } from './components/SoundPanel/SoundPanel'
import { FxRack } from './components/FxRack/FxRack'
import { LedPanel } from './components/LedPanel/LedPanel'
import { AiSoundPrompt } from './components/AiSoundPrompt/AiSoundPrompt'
import { Logo } from './components/ui/Logo'
import { BackEntry } from './components/BackEntry/BackEntry'
import { PhoneLayout } from './components/PhoneLayout/PhoneLayout'
import { useIsPhone } from './lib/useIsPhone'

// QWERTY -> MIDI note (starting at C4 = 60) for keyboard-less demoing.
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76,
}

function Header() {
  const audioStarted = useStore((s) => s.audioStarted)
  const startAudio = useStore((s) => s.startAudio)

  return (
    <header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <BackEntry />
        <Logo size={44} />
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            PartyKeys <span className="text-gradient">Web FX Lab</span>
          </h1>
          <p className="text-xs text-white/45">
            Performance · DSP · LED control center for PartyKeys
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="chip"
          style={{ color: audioStarted ? '#34d399' : '#fbbf24' }}
        >
          <span
            className={`h-2 w-2 rounded-full ${audioStarted ? '' : 'animate-pulse-glow'}`}
            style={{
              background: audioStarted ? '#34d399' : '#fbbf24',
              boxShadow: `0 0 8px ${audioStarted ? '#34d399' : '#fbbf24'}`,
            }}
          />
          {audioStarted ? 'Audio live' : 'Audio suspended'}
        </span>
        {!audioStarted && (
          <button type="button" onClick={startAudio} className="btn-brand">
            ▶ Enable Audio
          </button>
        )}
      </div>
    </header>
  )
}

export default function App() {
  const noteOn = useStore((s) => s.noteOn)
  const noteOff = useStore((s) => s.noteOff)
  const startAudio = useStore((s) => s.startAudio)
  const connectMidi = useStore((s) => s.connectMidi)
  const isPhone = useIsPhone()

  // Auto-detect MIDI devices on load (doc §5.3: every page re-requests access;
  // the backend auto-selects PartyKeys and rebinds on statechange).
  useEffect(() => {
    void connectMidi()
  }, [connectMidi])

  // No audio gate: try to start sound right away (works where the WebView allows
  // autoplay, e.g. Capacitor); otherwise the first tap / key press starts it.
  useEffect(() => {
    const start = () => {
      startAudio().catch((err) => console.warn('Audio start blocked:', err))
    }
    start()
    window.addEventListener('pointerup', start)
    window.addEventListener('keydown', start)
    return () => {
      window.removeEventListener('pointerup', start)
      window.removeEventListener('keydown', start)
    }
  }, [startAudio])

  // Drop the inline first-paint placeholder once React has committed.
  useEffect(() => {
    document.getElementById('boot')?.remove()
  }, [])

  // QWERTY fallback input — lets the app be demoed with no MIDI hardware.
  useEffect(() => {
    const pressed = new Set<string>()
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note == null || pressed.has(e.key)) return
      pressed.add(e.key)
      void startAudio()
      noteOn(note, 0.8, 'pointer')
    }
    const up = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note == null) return
      pressed.delete(e.key)
      noteOff(note)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [noteOn, noteOff, startAudio])

  // Page teardown (PopuMusic WebView keeps the BLE link; we only clean up
  // our own sound and LEDs so the next page starts from a blank slate).
  useEffect(() => {
    const cleanup = () => {
      audioEngine.releaseAll()
      allLedsOff()
    }
    window.addEventListener('pagehide', cleanup)
    return () => window.removeEventListener('pagehide', cleanup)
  }, [])

  if (isPhone) return <PhoneLayout />

  return (
  <div
      className="mx-auto max-w-[1500px]"
      style={{
        paddingTop: 'calc(var(--safe-top, 0px) + 24px)',
        paddingRight: 'calc(var(--safe-right, 0px) + 24px)',
        paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)',
        paddingLeft: 'calc(var(--safe-left, 0px) + 24px)',
      }}
    >
      <Header />

      {/* Keyboard takes the spotlight */}
      <div className="mb-5">
        <Keyboard />
      </div>

      {/* Control panels */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5">
          <DevicePanel />
          <AiSoundPrompt />
        </div>
        <div className="flex flex-col gap-5">
          <SoundPanel />
          <LedPanel />
        </div>
        <div className="flex flex-col gap-5">
          <FxRack />
        </div>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/30">
        <span>PartyKeys Web FX Lab · React · Tone.js · Web MIDI · no backend</span>
        <span className="font-mono">QWERTY: A–L = play · ⌘+Enter in AI box</span>
      </footer>
    </div>
  )
}
