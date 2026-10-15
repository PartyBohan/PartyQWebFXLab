// PopuMusic MIDI Browser WebView — native sampler client (integration doc §6).
// This page plays its own Tone.js/Web Audio sounds, so the native sampler must
// be explicitly DISABLED to avoid double-sounding hardware MIDI.

function createSamplerClient(timeoutMs = 2000) {
  const bridge = window.samplerBridge
  if (!bridge || typeof bridge.post !== 'function') return null

  let nextId = 1
  const pending = new Map<
    number,
    {
      resolve: (p: Record<string, unknown>) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  window.__samplerBridge = window.__samplerBridge || {}
  window.__samplerBridge._resolve = (response: { id?: number; ok?: boolean; payload?: { error?: string } & Record<string, unknown> }) => {
    const request = response?.id != null ? pending.get(response.id) : undefined
    if (!request) return
    pending.delete(response.id!)
    clearTimeout(request.timer)
    if (response.ok) request.resolve(response.payload || {})
    else request.reject(new Error(response?.payload?.error || 'Sampler request failed'))
  }

  function call(cmd: string, payload: Record<string, unknown> = {}) {
    const id = nextId++
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Sampler request timed out: ${cmd}`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      ;(window.samplerBridge as { post: (json: string) => void }).post(
        JSON.stringify({ id, cmd, payload }),
      )
    })
  }

  return { call }
}

/**
 * Probe the native sampler and explicitly switch it off — every audio page
 * must choose its sound source, and ours is Tone.js in the WebView.
 */
export async function disableNativeSampler(): Promise<boolean> {
  const sampler = createSamplerClient()
  if (!sampler) return false

  try {
    const capability = await sampler.call('hasSampler')
    if (!capability.available) return false
    await sampler.call('setEnabled', { enabled: false })
    return true
  } catch (err) {
    console.warn('[popu] native sampler unavailable', err)
    return false
  }
}
