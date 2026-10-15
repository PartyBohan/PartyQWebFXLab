import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIsPhone } from '../../lib/useIsPhone'

interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  /** Display formatter, e.g. (v) => `${v.toFixed(2)}s`. */
  format?: (v: number) => string
  onChange: (v: number) => void
  accent?: string
  /** Logarithmic mapping for wide ranges like filter cutoff. */
  log?: boolean
  disabled?: boolean
}

const SWEEP = 270 // degrees of travel
const START = -135
const DIAL = 48
const DIAL_PHONE = 32
const DIAL_ZOOM = 140

/** The knob face: track + value arc + indicator, drawn at any size. */
function Dial({ size, norm, accent }: { size: number; norm: number; accent: string }) {
  const r = 20
  const arc = (SWEEP / 360) * 2 * Math.PI * r
  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 50% 35%, #2a2a44, #121222)',
        boxShadow: `inset 0 2px 6px rgba(0,0,0,0.6), 0 0 12px -4px ${accent}`,
      }}
    >
      <svg className="absolute inset-0" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3"
          strokeDasharray={`${arc} ${2 * Math.PI * r}`} transform="rotate(135 24 24)" strokeLinecap="round" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={accent} strokeWidth="3"
          strokeDasharray={`${norm * arc} ${2 * Math.PI * r}`} transform="rotate(135 24 24)" strokeLinecap="round" />
      </svg>
      <span
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: Math.max(2, size / 24),
          height: size / 3,
          background: accent,
          transform: `translate(-50%, -100%) rotate(${START + norm * SWEEP}deg)`,
          transformOrigin: '50% 100%',
          boxShadow: `0 0 6px ${accent}`,
        }}
      />
    </div>
  )
}

/**
 * Draggable rotary knob (vertical drag). Pointer + keyboard accessible.
 * Phone: compact dial, and a magnified copy shows mid-screen while dragging so
 * the finger never hides the value (same pattern as partykeys-play-lab).
 */
export function Knob({
  label,
  value,
  min,
  max,
  format,
  onChange,
  accent = '#8b5cf6',
  log = false,
  disabled = false,
}: KnobProps) {
  const dragging = useRef<{ startY: number; startNorm: number } | null>(null)
  const [active, setActive] = useState(false)
  const isPhone = useIsPhone()

  const toNorm = useCallback(
    (v: number) => {
      if (log) {
        const lmin = Math.log(min)
        const lmax = Math.log(max)
        return (Math.log(Math.max(min, v)) - lmin) / (lmax - lmin)
      }
      return (v - min) / (max - min)
    },
    [min, max, log],
  )

  const fromNorm = useCallback(
    (n: number) => {
      const c = Math.max(0, Math.min(1, n))
      if (log) {
        const lmin = Math.log(min)
        const lmax = Math.log(max)
        return Math.exp(lmin + c * (lmax - lmin))
      }
      return min + c * (max - min)
    },
    [min, max, log],
  )

  const norm = toNorm(value)
  const shown = format ? format(value) : value.toFixed(2)

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = { startY: e.clientY, startNorm: norm }
    setActive(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || disabled) return
    const dy = dragging.current.startY - e.clientY
    const next = dragging.current.startNorm + dy / 160 // 160px = full sweep
    onChange(fromNorm(next))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = null
    setActive(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    const step = (max - min) / 50
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      onChange(Math.min(max, value + step))
      e.preventDefault()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      onChange(Math.max(min, value - step))
      e.preventDefault()
    }
  }

  return (
    <div className={`flex select-none flex-col items-center ${isPhone ? 'gap-1' : 'gap-1.5'} ${disabled ? 'opacity-40' : ''}`}>
      <div
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="cursor-ns-resize touch-none rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Dial size={isPhone ? DIAL_PHONE : DIAL} norm={norm} accent={accent} />
      </div>
      {isPhone ? (
        <span className="whitespace-nowrap font-mono text-[10px] text-white/70">
          <span className="font-sans font-semibold uppercase tracking-wider text-white/40">{label}</span> {shown}
        </span>
      ) : (
        <>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
            {label}
          </span>
          <span className="font-mono text-[11px] text-white/75">{shown}</span>
        </>
      )}
      {/* Portal: Card's backdrop-blur would otherwise trap position:fixed. */}
      {isPhone &&
        active &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-50 grid place-content-center justify-items-center gap-5 bg-ink-900/70" aria-hidden>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">{label}</span>
            <Dial size={DIAL_ZOOM} norm={norm} accent={accent} />
            <span className="font-mono text-3xl" style={{ color: accent }}>{shown}</span>
          </div>,
          document.body,
        )}
    </div>
  )
}
