import type { Choice } from '../state/game'

/** What the player still has to do to start the round. */
export type Step = 'both' | 'guard' | 'strike' | 'strike2' | 'ready' | 'locked'

/** One thing per moment: a guard and a strike are both needed; then the round can start (or, between two people, be locked in). */
export function stepOf(c: Choice): Step {
  if (c.locked) return 'locked'
  if (c.attack === null && c.block === null) return 'both'
  if (c.block === null) return 'guard'
  if (c.attack === null) return 'strike'
  if (c.weapon === 'super' && c.attack2 === null) return 'strike2' // a super strike hits two zones
  return 'ready'
}

/** The short instruction for a step, shown on the button that starts the round. */
export const STEP_TEXT: Record<Step, string> = {
  both: 'Pick a guard and a strike',
  guard: 'Now pick a guard',
  strike: 'Now pick a strike',
  strike2: 'Pick a second zone',
  ready: '',
  locked: '',
}

/** How long the player may do nothing before the hint comes up (they may have forgotten what to do, or why the fight button is grey). */
export const IDLE_MS = 3000

/**
 * What to tell a player who has not chosen for a while: what is still missing and where to tap. `me` is how to call the fighter who guards (the
 * player's own: "James", or "yourself" when two people are told) and `other` the one who is struck. Nothing when the choice is complete.
 */
export function idleHint(step: Step, me: string, other: string): string {
  if (step === 'both') return `Tap ${me} to guard a zone and ${other} to strike one`
  if (step === 'guard') return `You still have to guard: tap ${me},\non the zone you want to protect`
  if (step === 'strike') return `You still have to strike: tap ${other},\non the zone you want to hit`
  if (step === 'strike2') return `A super strike hits two zones: tap ${other},\non a second zone you want to hit`
  return ''
}
