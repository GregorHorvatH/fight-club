import { useEffect, useState } from 'react'
import { useGame } from '../state/game'
import { CALM_DELAY_MS, isCalm } from './ambience'

/**
 * Whether the menus are "alive" (the picture moves, the music plays). It goes off at once when a fight begins or the fighters walk
 * out, and comes on only a moment after the menu is there: first the fighters leave, then the menu shows, and only then the life
 * comes back, gently. Moving between the menus themselves does not interrupt it (the effect runs only when "calm" changes).
 */
export function useCalm(): boolean {
  const calm = useGame((s) => isCalm(s.phase))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!calm) return
    const t = setTimeout(() => setReady(true), CALM_DELAY_MS)
    return () => {
      clearTimeout(t)
      setReady(false)
    }
  }, [calm])
  return calm && ready
}
