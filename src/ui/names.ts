import type { Side } from '../sim'
import { useGame } from '../state/game'

/** The fighters have the names of their characters (the models are James and Amy). */
export const NAMES = {
  solo: { player: 'James', enemy: 'Amy' },
  duo: { player: 'James', enemy: 'Amy' },
} as const

/** What to call a fighter. */
export function useName(side: Side): string {
  return useGame((s) => NAMES[s.mode][side])
}
