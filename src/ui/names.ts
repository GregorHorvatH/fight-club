import type { Side } from '../sim'
import { useGame } from '../state/game'
import { fighterOf } from '../state/roster'

/** What to call a fighter: the name of its character. */
export function useName(side: Side): string {
  return useGame((s) => fighterOf(s.fighters[side]).name)
}

/** What to call both. */
export function useNames(): Record<Side, string> {
  const player = useName('player')
  const enemy = useName('enemy')
  return { player, enemy }
}
