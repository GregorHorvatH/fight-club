import { CRIT_CHANCE, CRIT_MULT, DAMAGE_MAX, DAMAGE_MIN, KICK_MULT, KICK_RECOIL, STREAK_BONUS, STREAK_CAP } from './config'
import type { Rng } from './rng'
import type { Move, Side, Weapon, Zone } from './types'

/** One strike thrown by one fighter. */
export interface Strike {
  zone: Zone
  weapon: Weapon
  /** the defender guarded exactly this zone: no damage */
  blocked: boolean
  damage: number
  crit: boolean
  /** health the striker loses itself: a guarded kick makes the kicker stumble */
  recoil: number
}

export interface RoundResult {
  round: number
  moves: Record<Side, Move>
  /** strikes[side] is the strike thrown BY that side (it lands on the other one) */
  strikes: Record<Side, Strike>
  /** health after the round */
  hp: Record<Side, number>
}

/**
 * Resolves one strike. Always consumes exactly two random numbers, so a scripted generator stays in step
 * whether or not the strike is guarded.
 * @param streak how many strikes in a row this fighter has already landed
 */
export function resolveStrike(attack: Zone, weapon: Weapon, defenderBlock: Zone, streak: number, rng: Rng): Strike {
  const roll = DAMAGE_MIN + Math.floor(rng() * (DAMAGE_MAX - DAMAGE_MIN + 1))
  const critRoll = rng() < CRIT_CHANCE
  const blocked = attack === defenderBlock
  const crit = critRoll && !blocked
  const base = roll + Math.min(streak, STREAK_CAP) * STREAK_BONUS
  const power = (weapon === 'foot' ? KICK_MULT : 1) * (crit ? CRIT_MULT : 1)
  return {
    zone: attack,
    weapon,
    blocked,
    crit,
    damage: blocked ? 0 : Math.round(base * power),
    recoil: blocked && weapon === 'foot' ? KICK_RECOIL : 0,
  }
}
