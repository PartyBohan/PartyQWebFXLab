import { useSyncExternalStore } from 'react'

// "Phone" = the touch layout, used on phones AND iPads. Touch devices are
// matched by a coarse primary pointer (iPad keeps it even with a trackpad
// attached); the size queries also catch phones in emulators without touch.
// Desktop (fine pointer, normal window) keeps the full layout.
const PHONE = window.matchMedia(
  '(pointer: coarse), (max-width: 767px), (orientation: landscape) and (max-height: 500px)',
)

const subscribe = (onChange: () => void) => {
  PHONE.addEventListener('change', onChange)
  return () => PHONE.removeEventListener('change', onChange)
}

export const useIsPhone = () => useSyncExternalStore(subscribe, () => PHONE.matches)
