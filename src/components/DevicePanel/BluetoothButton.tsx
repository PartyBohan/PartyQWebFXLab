import { useState } from 'react'
import { useStore } from '../../store'
import { DevicePanel } from './DevicePanel'

// Phone top-bar entry for MIDI: the page auto-connects on load, so this is only
// a status light. Tap opens the full DevicePanel as a popover for the rare
// reconnect / device pick / PopuMusic Bluetooth page.

const STATUS_COLOR: Record<string, string> = {
  ready: '#34d399',
  requesting: '#fbbf24',
  denied: '#f87171',
  unsupported: '#f87171',
}

export function BluetoothButton() {
  const [open, setOpen] = useState(false)
  const status = useStore((s) => s.midiStatus)
  const inputs = useStore((s) => s.inputs)
  const partyKeys = inputs.find((d) => d.isPartyKeys)

  // Connected without any device still means "nothing to play" — keep it gray.
  const color = status === 'ready' && inputs.length === 0 ? '#94a3b8' : STATUS_COLOR[status] ?? '#94a3b8'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="MIDI device"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 text-xs font-medium"
        style={{ color }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
        </svg>
        <span className="max-w-[7rem] truncate">{partyKeys ? 'PartyKeys' : inputs[0]?.name ?? 'No device'}</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-11 z-50 max-h-[calc(100vh-4rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl bg-ink-800">
            <DevicePanel />
          </div>
        </>
      )}
    </div>
  )
}
