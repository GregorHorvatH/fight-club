import type { Difficulty } from '../sim'
import { FIGHTERS, type FighterId } from './roster'

/** How many opponents the tournament has, one after another, each tougher than the last. */
export const STAGES = 7

/**
 * The opponents of a tournament for `hero`: the fighters not unlocked yet come first (in the order of the roster, which is the order
 * of their strength); when fewer than STAGES are left, the strongest of the others fill the ladder. They fight from the weakest.
 */
export function ladderFor(hero: FighterId, isLocked: (id: FighterId) => boolean): FighterId[] {
  const others = FIGHTERS.filter((f) => f.id !== hero)
  const locked = others.filter((f) => isLocked(f.id))
  const open = others.filter((f) => !isLocked(f.id))
  const picks = [...locked.slice(0, STAGES), ...open.slice(Math.max(0, open.length - (STAGES - Math.min(locked.length, STAGES))))]
  return picks.sort((a, b) => FIGHTERS.indexOf(a) - FIGHTERS.indexOf(b)).map((f) => f.id)
}

/** How clever the enemy is at a stage (0-based) of a ladder of `n`: easy at first, then normal, then hard. */
export function difficultyAt(stage: number, n: number): Difficulty {
  if (stage < Math.ceil(n * 0.3)) return 'easy'
  if (stage < Math.ceil(n * 0.7)) return 'normal'
  return 'hard'
}

/** A tournament in progress. */
export interface Tournament {
  hero: FighterId
  ladder: readonly FighterId[]
  /** the stage being fought (0-based) */
  stage: number
  /** the fighter unlocked by the last win (shown on the end screen), if it was new */
  unlocked: FighterId | null
}
