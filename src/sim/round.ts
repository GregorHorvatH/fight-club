import { CRIT_CHANCE, CRIT_MULT, DAMAGE_MAX, DAMAGE_MIN, KICK_MULT, KICK_RECOIL, STREAK_BONUS, STREAK_CAP } from './config'
import type { Rng } from './rng'
import { opponent, type Move, type Side, type Weapon, type Zone } from './types'

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

/** Why this fighter strikes first: a punch is faster than a kick; with the same weapon the more wounded one is quicker; then luck. */
export type Initiative = 'speed' | 'health' | 'luck'

export interface RoundResult {
  round: number
  moves: Record<Side, Move>
  /** the fighter who strikes first, and why */
  first: Side
  firstBy: Initiative
  /** strikes[side] is the strike thrown BY that side (it lands on the other one); null when the fight was decided before its turn */
  strikes: Record<Side, Strike | null>
  /** health before the round, after the first strike, and after the round */
  hpBefore: Record<Side, number>
  /** strikes landed in a row, per fighter, before the round (the combo shown while the round is replayed) */
  streakBefore: Record<Side, number>
  hpAfterFirst: Record<Side, number>
  hp: Record<Side, number>
}

/**
 * Who strikes first. A punch is fast and a kick is slow, so a punch lands before a kick (this is what a kick pays for its extra
 * damage). With the same weapon the fighter with less health is quicker (the underdog is given the chance), and when that is equal
 * too, a coin decides: only then is a random number drawn.
 */
export function whoFirst(moves: Record<Side, Move>, hp: Record<Side, number>, rng: Rng): { first: Side; by: Initiative } {
  const slow = (s: Side): number => (moves[s].weapon === 'foot' ? 1 : 0)
  if (slow('player') !== slow('enemy')) return { first: slow('player') < slow('enemy') ? 'player' : 'enemy', by: 'speed' }
  if (hp.player !== hp.enemy) return { first: hp.player < hp.enemy ? 'player' : 'enemy', by: 'health' }
  return { first: rng() < 0.5 ? 'player' : 'enemy', by: 'luck' }
}

/** The other fighter (the one who has to guard). */
export const defender = opponent

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
