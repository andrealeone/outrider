import { useEffect, useState } from 'react'

/**
 * One shared frame clock: spinners, row transition animations, and live
 * uptime counters all tick on the same beat, so a busy dashboard renders
 * once per frame instead of once per widget.
 */
export const useFrameClock = (intervalMs = 250): number => {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => f + 1)
    }, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [intervalMs])
  return frame
}
