import { CRIT_CHANCE, CRIT_MULT, DAMAGE_MAX, DAMAGE_MIN, KICK_MULT, KICK_RECOIL, STREAK_BONUS, STREAK_CAP, SUPER_MULT } from './config'
import type { Rng } from './rng'
import { opponent, SECOND_ZONE, type Move, type Side, type Weapon, type Zone } from './types'

/** The second part of a super strike: it hits the zone next to the one aimed at, and is guarded or not by itself. */
export interface Hit {
  zone: Zone
  blocked: boolean
  damage: number
}

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
  /** a super strike hits a second zone as well (null for a punch and a kick) */
  extra: Hit | null
}

/** All the health a strike takes from the one who is struck (both parts of a super strike). */
export const damageOf = (s: Strike): number => s.damage + (s.extra?.damage ?? 0)
/** Did any of it land? (A super strike cannot be guarded altogether: a guard covers one zone, it hits two.) */
export const landed = (s: Strike): boolean => !s.blocked || (s.extra !== null && !s.extra.blocked)

/** Why this fighter strikes first: a punch is faster than a kick, and a super strike is slower than both; with the same weapon the more wounded one is quicker; then luck. */
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
  /** the super meters before the round */
  meterBefore: Record<Side, number>
  hpAfterFirst: Record<Side, number>
  hp: Record<Side, number>
}

/**
 * Who strikes first. A punch is fast and a kick is slow, so a punch lands before a kick (this is what a kick pays for its extra
 * damage). With the same weapon the fighter with less health is quicker (the underdog is given the chance), and when that is equal
 * too, a coin decides: only then is a random number drawn.
 */
export function whoFirst(moves: Record<Side, Move>, hp: Record<Side, number>, rng: Rng): { first: Side; by: Initiative } {
  const slow = (s: Side): number => SLOWNESS[moves[s].weapon]
  if (slow('player') !== slow('enemy')) return { first: slow('player') < slow('enemy') ? 'player' : 'enemy', by: 'speed' }
  if (hp.player !== hp.enemy) return { first: hp.player < hp.enemy ? 'player' : 'enemy', by: 'health' }
  return { first: rng() < 0.5 ? 'player' : 'enemy', by: 'luck' }
}

/** How slow each weapon is (the slower one strikes later). */
export const SLOWNESS: Record<Weapon, number> = { hand: 0, foot: 1, super: 2 }

/** The other fighter (the one who has to guard). */
export const defender = opponent

/**
 * Resolves one strike. Always consumes exactly two random numbers, so a scripted generator stays in step
 * whether or not the strike is guarded.
 * @param streak how many strikes in a row this fighter has already landed
 */
export function resolveStrike(attack: Zone, weapon: Weapon, defenderBlock: Zone, streak: number, rng: Rng, attack2?: Zone): Strike {
  const roll = DAMAGE_MIN + Math.floor(rng() * (DAMAGE_MAX - DAMAGE_MIN + 1))
  const critRoll = rng() < CRIT_CHANCE
  const base = roll + Math.min(streak, STREAK_CAP) * STREAK_BONUS
  const part = (zone: Zone): { blocked: boolean; crit: boolean; damage: number } => {
    const blocked = zone === defenderBlock
    // every part of a super strike that lands is a critical hit; of the others, one in a while
    const crit = weapon === 'super' ? !blocked : critRoll && !blocked
    const mult = weapon === 'foot' ? KICK_MULT : weapon === 'super' ? SUPER_MULT : 1
    return { blocked, crit, damage: blocked ? 0 : Math.round(base * mult * (crit ? CRIT_MULT : 1)) }
  }
  const first = part(attack)
  const zone2 = attack2 !== undefined && attack2 !== attack ? attack2 : SECOND_ZONE[attack]
  const second = weapon === 'super' ? part(zone2) : null
  return {
    zone: attack,
    weapon,
    blocked: first.blocked,
    crit: first.crit || (second?.crit ?? false),
    damage: first.damage,
    recoil: first.blocked && weapon === 'foot' ? KICK_RECOIL : 0,
    extra: second ? { zone: zone2, blocked: second.blocked, damage: second.damage } : null,
  }
}
