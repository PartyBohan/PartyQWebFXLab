import { useEffect, useState } from 'react'
import { isPopuWebview } from '../../lib/popu/display'

// Portal back button (integration doc §8.1).
// Shown when the page was entered cross-page from Portal (?popu-back=1), via
// a cross-origin referrer, or inside the PopuMusic WebView (which provides
// neither a referrer nor the portal param for this entry).
// Mounted inline in the title row, never fixed.

/** Returns a fallback URL when a cross-origin referrer is resolvable. */
function crossOriginReferrer(): string | null {
  if (!document.referrer) return null
  try {
    return new URL(document.referrer).origin === location.origin
      ? null
      : document.referrer
  } catch {
    return null
  }
}

function shouldShowBack(): boolean {
  const params = new URLSearchParams(location.search)
  if (params.has('popu-back')) return true
  if (isPopuWebview()) return true
  return crossOriginReferrer() != null
}

export function BackEntry() {
  const [visible, setVisible] = useState(shouldShowBack)

  // The WebView markers (popuDisplayInfo / samplerBridge / __webMIDIBridge)
  // are injected by the native side AFTER the page renders, so the initial
  // check can miss them. Re-check on the display-info event and poll briefly.
  useEffect(() => {
    if (visible) return
    const recheck = () => setVisible(shouldShowBack())
    window.addEventListener('popudisplaychange', recheck)
    let tries = 0
    const timer = window.setInterval(() => {
      recheck()
      if (++tries >= 20) window.clearInterval(timer)
    }, 500)
    return () => {
      window.removeEventListener('popudisplaychange', recheck)
      window.clearInterval(timer)
    }
  }, [visible])

  if (!visible) return null

  const goBack = () => {
    // Same policy as the reference back-entry: use history when there is an
    // entry to go back to, otherwise jump straight to the cross-site referrer.
    if (history.length > 1) history.back()
    else {
      const fallback = crossOriginReferrer()
      if (fallback) location.href = fallback
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="返回"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-base text-white/70 transition hover:bg-white/[0.12] hover:text-white"
    >
      ‹
    </button>
  )
}
