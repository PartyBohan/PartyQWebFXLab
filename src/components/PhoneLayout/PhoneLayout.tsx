import { useState } from 'react'
import { useStore } from '../../store'
import { noteName } from '../../lib/music'
import { BackEntry } from '../BackEntry/BackEntry'
import { BluetoothButton } from '../DevicePanel/BluetoothButton'
import { PianoKeys } from '../Keyboard/Keyboard'
import { SoundPanel } from '../SoundPanel/SoundPanel'
import { FxRack } from '../FxRack/FxRack'
import { LedPanel } from '../LedPanel/LedPanel'
import { AiSoundPrompt } from '../AiSoundPrompt/AiSoundPrompt'
import { Logo } from '../ui/Logo'
import { Segmented } from '../ui/Segmented'

// Phone layout: the real PartyKeys is the instrument, the phone is its control
// surface. Slim top bar (note readout, sound hint, Bluetooth), one panel at a
// time via tabs, and a mini keyboard pinned at the bottom as live feedback.

type Tab = 'sound' | 'fx' | 'led' | 'ai'

const TABS: { value: Tab; label: string }[] = [
  { value: 'sound', label: 'Sound' },
  { value: 'fx', label: 'FX' },
  { value: 'led', label: 'LED' },
  { value: 'ai', label: 'AI' },
]

const PANELS: Record<Tab, () => JSX.Element> = {
  sound: SoundPanel,
  fx: FxRack,
  led: LedPanel,
  ai: AiSoundPrompt,
}

// 48px on a landscape iPhone, up to ~80-110px on an iPad.
const MINI_KEYS_HEIGHT = 'clamp(48px, 8vh, 120px)'

function NoteChip() {
  const lastNote = useStore((s) => s.lastNote)
  const chord = useStore((s) => s.chord)
  return (
    <span className="chip font-semibold">
      <span className="text-gradient">{lastNote ? noteName(lastNote.note) : '—'}</span>
      {chord && <span className="text-brand-amber">{chord.name}</span>}
    </span>
  )
}

function SoundHint() {
  const audioStarted = useStore((s) => s.audioStarted)
  const startAudio = useStore((s) => s.startAudio)
  if (audioStarted) return null
  return (
    <button
      type="button"
      onClick={startAudio}
      className="chip animate-pulse-glow border-amber-400/30 text-amber-300"
    >
      Tap to enable sound
    </button>
  )
}

export function PhoneLayout() {
  const [tab, setTab] = useState<Tab>('sound')
  const Panel = PANELS[tab]

  return (
    <div
      className="flex h-full flex-col"
      style={{
        paddingLeft: 'calc(var(--safe-left, 0px) + 12px)',
        paddingRight: 'calc(var(--safe-right, 0px) + 12px)',
      }}
    >
      {/* Portrait: tabs wrap to their own row. Landscape: everything on one row. */}
      <header
        className="flex flex-wrap items-center gap-2 pb-2"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 8px)' }}
      >
        <BackEntry />
        <Logo size={28} rounded="rounded-lg" />
        <div className="order-last w-full landscape:order-none landscape:w-auto">
          <Segmented options={TABS} value={tab} onChange={setTab} size="sm" />
        </div>
        <NoteChip />
        <div className="ml-auto flex items-center gap-2">
          <SoundHint />
          <BluetoothButton />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-2">
        <Panel />
      </main>

      <div style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 8px)' }}>
        <PianoKeys height={MINI_KEYS_HEIGHT} />
      </div>
    </div>
  )
}
