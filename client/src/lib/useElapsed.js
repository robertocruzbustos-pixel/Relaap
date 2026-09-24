import { useEffect, useState } from 'react'

/** Segundos transcurridos del partido, calculados con la hora del servidor (no se desfasa entre dispositivos). */
export function useElapsed(match, serverNow) {
  const [, tick] = useState(0)
  const running = Boolean(match.clock_started_at)

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])

  if (!running) return match.clock_seconds
  const started = new Date(match.clock_started_at).getTime()
  return match.clock_seconds + Math.max(0, Math.floor((serverNow() - started) / 1000))
}
