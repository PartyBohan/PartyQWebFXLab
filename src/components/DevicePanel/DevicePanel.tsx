import { useStore } from '../../store'
import { Card } from '../ui/Card'
import type { MidiDevice } from '../../lib/types'

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  unsupported: { label: 'Web MIDI unavailable', color: '#f87171', dot: '#f87171' },
  idle: { label: 'Not connected', color: '#94a3b8', dot: '#64748b' },
  requesting: { label: 'Requesting access…', color: '#fbbf24', dot: '#fbbf24' },
  denied: { label: 'Access denied', color: '#f87171', dot: '#f87171' },
  ready: { label: 'Connected', color: '#34d399', dot: '#34d399' },
}

function DeviceSelect({
  devices,
  value,
  onChange,
  placeholder,
}: {
  devices: MidiDevice[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={devices.length === 0}
      className="w-full rounded-xl border border-white/10 bg-ink-700/80 px-3 py-2 text-sm text-white/85 outline-none transition focus:border-brand-violet/60 disabled:opacity-40"
    >
      <option value="">{devices.length ? placeholder : 'No devices'}</option>
      {devices.map((d) => (
        <option key={d.id} value={d.id}>
          {d.isPartyKeys ? '★ ' : ''}
          {d.name}
        </option>
      ))}
    </select>
  )
}

export function DevicePanel() {
  const status = useStore((s) => s.midiStatus)
  const inputs = useStore((s) => s.inputs)
  const outputs = useStore((s) => s.outputs)
  const selectedInputId = useStore((s) => s.selectedInputId)
  const selectedOutputId = useStore((s) => s.selectedOutputId)
  const connectMidi = useStore((s) => s.connectMidi)
  const selectInput = useStore((s) => s.selectInput)
  const selectOutput = useStore((s) => s.selectOutput)
  const isNativeApp = useStore((s) => s.isNativeApp)
  const isPopuWebview = useStore((s) => s.isPopuWebview)
  const canPairBluetooth = useStore((s) => s.canPairBluetooth)
  const pairBluetooth = useStore((s) => s.pairBluetooth)

  const meta = STATUS_META[status] ?? STATUS_META.idle
  const partyConnected =
    inputs.some((d) => d.isPartyKeys) || outputs.some((d) => d.isPartyKeys)

  return (
    <Card
      title="Device Connection"
      icon="◈"
      accent="#3b82f6"
      right={
        <span className="chip" style={{ color: meta.color }}>
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: meta.dot, boxShadow: `0 0 8px ${meta.dot}` }}
          />
          {meta.label}
        </span>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={connectMidi}
          disabled={status === 'requesting'}
          className="btn-brand w-full"
        >
          <span>◈</span>
          {status === 'ready' ? 'Reconnect PartyKeys' : 'Connect PartyKeys'}
        </button>

        <p className="-mt-1.5 text-center text-[11px] text-white/40">
          Any MIDI keyboard works
        </p>

        {/* Native iOS app: Bluetooth-MIDI pairing sheet (CoreMIDI). */}
        {canPairBluetooth && (
          <button
            type="button"
            onClick={pairBluetooth}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20"
          >
            <span></span> Pair via Bluetooth
          </button>
        )}

        {/* PopuMusic WebView: real link to the app's Bluetooth-MIDI page. */}
        {isPopuWebview && (
          <a
            href="popumidi://action/bluetooth"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20"
          >
            <span></span> Bluetooth MIDI in App
          </a>
        )}

        {/* Web only: explain the Web MIDI limitation. */}
        {status === 'unsupported' && !isNativeApp && !isPopuWebview && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200/80">
            This browser doesn't expose the Web MIDI API. Use Chrome (desktop) for
            hardware control — the on-screen keyboard below still works.
          </p>
        )}

        {status === 'ready' && partyConnected && (
          <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2.5 text-xs text-emerald-200/80">
            ★ PartyKeys hardware detected and selected automatically.
          </p>
        )}

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
              MIDI Input
            </label>
            <DeviceSelect
              devices={inputs}
              value={selectedInputId}
              onChange={selectInput}
              placeholder="Select input…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
              MIDI Output (LED)
            </label>
            <DeviceSelect
              devices={outputs}
              value={selectedOutputId}
              onChange={selectOutput}
              placeholder="Select output…"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-white/45">
          <span>{inputs.length} in · {outputs.length} out</span>
          <span className="font-mono">SysEx enabled</span>
        </div>
      </div>
    </Card>
  )
}
