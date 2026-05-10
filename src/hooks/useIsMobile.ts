import { useEffect, useState } from 'react'

/**
 * Reactive media query for mobile width. Defaults to <= 767px (Tailwind's md- boundary).
 */
export function useIsMobile(maxWidthPx: number = 767): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidthPx])

  return isMobile
}
