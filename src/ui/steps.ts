import type { TFunction } from 'i18next'
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

/** The short instruction for a step, shown on the button that starts the round (nothing once the choice is complete). */
export function stepText(step: Step, t: TFunction): string {
  return step === 'both' || step === 'guard' || step === 'strike' || step === 'strike2' ? t(`step.${step}`) : ''
}

/** How long the player may do nothing before the hint comes up (they may have forgotten what to do, or why the fight button is grey). */
export const IDLE_MS = 3000

/**
 * What to tell a player who has not chosen for a while: what is still missing and where to tap. `me` is how to call the fighter who guards (the
 * player's own: "James", or "yourself" when two people are told) and `other` the one who is struck. Nothing when the choice is complete.
 */
export function idleHint(step: Step, me: string, other: string, t: TFunction): string {
  return step === 'both' || step === 'guard' || step === 'strike' || step === 'strike2' ? t(`idle.${step}`, { me, other }) : ''
}
