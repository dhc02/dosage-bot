import { useEffect, useState } from 'react'

/**
 * Returns Date.now() and re-renders every `intervalMs` (default 60s).
 * Use for "current time" displays that should auto-update without
 * triggering effects elsewhere.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
