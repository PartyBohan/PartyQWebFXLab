// PopuMusic MIDI Browser WebView — safe-area handling (integration doc §7).
// iOS injects window.popuDisplayInfo with the physical Dynamic-Island side;
// Android/HarmonyOS keep the conservative CSS env() values.

type PopuDisplayInfo = {
  islandSide?: 'top' | 'bottom' | 'left' | 'right' | 'unknown'
  safeAreaInsets?: { top?: number; right?: number; bottom?: number; left?: number }
}

declare global {
  interface Window {
    popuDisplayInfo?: PopuDisplayInfo
    samplerBridge?: { post: (json: string) => void }
    __samplerBridge?: Record<string, unknown>
    __webMIDIBridge?: unknown
    midiBridge?: unknown
    midiBrowser?: unknown
  }
}

/** True when running inside the PopuMusic MIDI Browser WebView. */
export function isPopuWebview(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(
      window.popuDisplayInfo ||
        window.samplerBridge ||
        window.__webMIDIBridge ||
        window.midiBridge ||
        window.midiBrowser,
    )
  )
}

export function applyDisplayInfo(info?: PopuDisplayInfo) {
  info = info ?? window.popuDisplayInfo
  if (!info?.safeAreaInsets) return

  const insets = {
    top: Number(info.safeAreaInsets.top) || 0,
    right: Number(info.safeAreaInsets.right) || 0,
    bottom: Number(info.safeAreaInsets.bottom) || 0,
    left: Number(info.safeAreaInsets.left) || 0,
  }

  // Landscape WebKit gives both sides the same inset (conservative rectangle).
  // Only keep the side the island is actually on.
  if (info.islandSide === 'left') insets.right = 0
  if (info.islandSide === 'right') insets.left = 0

  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    document.documentElement.style.setProperty(`--safe-${edge}`, `${insets[edge]}px`)
  }
}

export function initPopuDisplay() {
  window.addEventListener('popudisplaychange', (event: Event) =>
    applyDisplayInfo((event as CustomEvent<PopuDisplayInfo>).detail),
  )
  applyDisplayInfo()
}
