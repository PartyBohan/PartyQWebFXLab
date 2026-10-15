import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store'
import {
  isBlackKey,
  noteName,
  octaveOf,
  PARTYKEYS_HIGH,
  PARTYKEYS_LOW,
  pitchClassName,
  scalePitchClasses,
} from '../../lib/music'
import { colorForKey, rgbToCss } from '../../lib/led/colors'
import { Card } from '../ui/Card'
import { Particles, type ParticlesHandle } from './Particles'

interface KeyLayout {
  midi: number
  black: boolean
  leftPct: number
  widthPct: number
  centerPct: number
}

const WHITE_W = 100 / 21 // 21 white keys across 36-key span
const BLACK_W = WHITE_W * 0.62

function buildLayout(): KeyLayout[] {
  const layout: KeyLayout[] = []
  let whiteCount = 0
  for (let midi = PARTYKEYS_LOW; midi <= PARTYKEYS_HIGH; midi++) {
    if (isBlackKey(midi)) {
      const left = whiteCount * WHITE_W - BLACK_W / 2
      layout.push({
        midi,
        black: true,
        leftPct: left,
        widthPct: BLACK_W,
        centerPct: left + BLACK_W / 2,
      })
    } else {
      const left = whiteCount * WHITE_W
      layout.push({
        midi,
        black: false,
        leftPct: left,
        widthPct: WHITE_W,
        centerPct: left + WHITE_W / 2,
      })
      whiteCount++
    }
  }
  return layout
}

/** The 36 playable keys + particles; sized by the caller (big card or mini strip). */
export function PianoKeys({ height }: { height: string }) {
  const layout = useMemo(buildLayout, [])
  const activeNotes = useStore((s) => s.activeNotes)
  const lastNote = useStore((s) => s.lastNote)
  const ledColor = useStore((s) => s.ledColor)
  const scaleRoot = useStore((s) => s.scaleRoot)
  const scaleId = useStore((s) => s.scaleId)
  const noteOn = useStore((s) => s.noteOn)
  const noteOff = useStore((s) => s.noteOff)

  const particlesRef = useRef<ParticlesHandle>(null)
  const pointerDown = useRef(false)
  const pointerNotes = useRef<Set<number>>(new Set())

  const scalePcs = useMemo(
    () => scalePitchClasses(scaleRoot, scaleId),
    [scaleRoot, scaleId],
  )

  // Emit a particle burst whenever a new note is triggered.
  useEffect(() => {
    if (!lastNote) return
    const key = layout.find((k) => k.midi === lastNote.note)
    if (!key) return
    const c = colorForKey(ledColor, lastNote.note)
    particlesRef.current?.burst(
      key.centerPct / 100,
      rgbToCss(c, 1),
      0.5 + lastNote.velocity,
    )
  }, [lastNote, layout, ledColor])

  // Global pointer-up releases all pointer-held notes (drag glissando support).
  useEffect(() => {
    const up = () => {
      pointerDown.current = false
      pointerNotes.current.forEach((n) => noteOff(n))
      pointerNotes.current.clear()
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [noteOff])

  const pressPointer = (midi: number) => {
    if (pointerNotes.current.has(midi)) return
    pointerNotes.current.add(midi)
    noteOn(midi, 0.8, 'pointer')
  }
  const releasePointer = (midi: number) => {
    if (!pointerNotes.current.has(midi)) return
    pointerNotes.current.delete(midi)
    noteOff(midi)
  }

  return (
      <div
        className="relative w-full touch-none select-none"
        style={{ height }}
        onPointerDown={() => (pointerDown.current = true)}
      >
        <Particles ref={particlesRef} />

        {/* white keys */}
        {layout
          .filter((k) => !k.black)
          .map((k) => {
            const active = k.midi in activeNotes
            const inScale = scalePcs.has(((k.midi % 12) + 12) % 12)
            const glow = colorForKey(ledColor, k.midi)
            return (
              <button
                key={k.midi}
                onPointerDown={() => pressPointer(k.midi)}
                onPointerEnter={() => pointerDown.current && pressPointer(k.midi)}
                onPointerUp={() => releasePointer(k.midi)}
                onPointerLeave={() => releasePointer(k.midi)}
                className="absolute bottom-0 top-0 rounded-b-md border border-black/40 transition-[box-shadow,transform] duration-75"
                style={{
                  left: `${k.leftPct}%`,
                  width: `${k.widthPct}%`,
                  background: active
                    ? `linear-gradient(to bottom, ${rgbToCss(glow, 0.95)}, ${rgbToCss(glow, 0.55)})`
                    : 'linear-gradient(to bottom, #f4f4f8, #d7d7e2)',
                  boxShadow: active
                    ? `0 0 22px -2px ${rgbToCss(glow, 0.9)}, inset 0 -6px 10px rgba(0,0,0,0.15)`
                    : 'inset 0 -6px 10px rgba(0,0,0,0.18)',
                  transform: active ? 'translateY(1px)' : 'none',
                  zIndex: 1,
                }}
              >
                <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-black/45">
                  {pitchClassName(k.midi) === 'C' ? noteName(k.midi) : ''}
                </span>
                {inScale && (
                  <span
                    className="pointer-events-none absolute bottom-5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                    style={{ background: rgbToCss(glow, 0.55) }}
                  />
                )}
              </button>
            )
          })}

        {/* black keys */}
        {layout
          .filter((k) => k.black)
          .map((k) => {
            const active = k.midi in activeNotes
            const inScale = scalePcs.has(((k.midi % 12) + 12) % 12)
            const glow = colorForKey(ledColor, k.midi)
            return (
              <button
                key={k.midi}
                onPointerDown={() => pressPointer(k.midi)}
                onPointerEnter={() => pointerDown.current && pressPointer(k.midi)}
                onPointerUp={() => releasePointer(k.midi)}
                onPointerLeave={() => releasePointer(k.midi)}
                className="absolute top-0 rounded-b-md border border-black/60 transition-[box-shadow,transform] duration-75"
                style={{
                  left: `${k.leftPct}%`,
                  width: `${k.widthPct}%`,
                  height: '62%',
                  background: active
                    ? `linear-gradient(to bottom, ${rgbToCss(glow, 1)}, ${rgbToCss(glow, 0.6)})`
                    : 'linear-gradient(to bottom, #2a2a3a, #0c0c16)',
                  boxShadow: active
                    ? `0 0 22px 0 ${rgbToCss(glow, 0.95)}, inset 0 -4px 8px rgba(0,0,0,0.5)`
                    : 'inset 0 -4px 8px rgba(0,0,0,0.6)',
                  transform: active ? 'translateY(1px)' : 'none',
                  zIndex: 2,
                }}
              >
                {inScale && (
                  <span
                    className="pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                    style={{ background: rgbToCss(glow, 0.8) }}
                  />
                )}
              </button>
            )
          })}
      </div>
  )
}

export function Keyboard() {
  const activeNotes = useStore((s) => s.activeNotes)
  const lastNote = useStore((s) => s.lastNote)
  const chord = useStore((s) => s.chord)

  const readout = lastNote
    ? {
        name: pitchClassName(lastNote.note),
        octave: octaveOf(lastNote.note),
        full: noteName(lastNote.note),
        vel: Math.round(lastNote.velocity * 127),
      }
    : null

  return (
    <Card title="Performance Keyboard" icon="⌨" accent="#a855f7">
      {/* Readout strip */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2">
          <span className="text-2xl font-bold text-gradient">
            {readout ? readout.full : '—'}
          </span>
          <span className="text-xs text-white/40">note</span>
        </div>
        <Stat label="Octave" value={readout ? `${readout.octave}` : '—'} />
        <Stat label="Velocity" value={readout ? `${readout.vel}` : '—'} />
        <div className="flex items-baseline gap-2 rounded-xl border border-brand-orange/30 bg-brand-orange/10 px-4 py-2">
          <span className="text-lg font-bold text-brand-amber">
            {chord ? chord.name : '—'}
          </span>
          <span className="text-xs text-white/40">chord</span>
        </div>
        <span className="ml-auto chip">
          {Object.keys(activeNotes).length} keys held
        </span>
      </div>

      {/* Keyboard — keys scale to the container width on any screen */}
      <PianoKeys height="clamp(110px, min(24vw, 40vh), 180px)" />

      <p className="mt-3 text-center text-[11px] text-white/35">
        Click / drag the keys to preview · 36 keys · C3–B5 · dots mark the selected scale
      </p>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2">
      <span className="text-lg font-bold text-white/85">{value}</span>
      <span className="text-xs text-white/40">{label}</span>
    </div>
  )
}
