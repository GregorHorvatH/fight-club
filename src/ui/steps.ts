import type { Choice } from '../state/game'

/** What the player still has to do to start the round. */
export type Step = 'both' | 'guard' | 'strike' | 'ready' | 'locked'

/** One thing per moment: a guard and a strike are both needed; then the round can start (or, between two people, be locked in). */
export function stepOf(c: Choice): Step {
  if (c.locked) return 'locked'
  if (c.attack === null && c.block === null) return 'both'
  if (c.block === null) return 'guard'
  if (c.attack === null) return 'strike'
  return 'ready'
}

/** The short instruction for a step, shown on the button that starts the round. */
export const STEP_TEXT: Record<Step, string> = {
  both: 'Pick a guard and a strike',
  guard: 'Now pick a guard',
  strike: 'Now pick a strike',
  ready: '',
  locked: '',
}
