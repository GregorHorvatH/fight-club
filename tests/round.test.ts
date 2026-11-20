import { describe, expect, it } from 'vitest'
import {
  CRIT_MULT,
  DAMAGE_MAX,
  DAMAGE_MIN,
  KICK_MULT,
  KICK_RECOIL,
  STREAK_BONUS,
  STREAK_CAP,
  resolveStrike,
  type Rng,
} from '../src/sim'

/** A generator that returns the given numbers in order. */
const script =
  (...n: number[]): Rng =>
  () =>
    n.shift() ?? 0

describe('resolveStrike (punch)', () => {
  it('a guarded strike does no damage and is never critical', () => {
    const s = resolveStrike('head', 'hand', 'head', 0, script(0.99, 0))
    expect(s).toEqual({ zone: 'head', weapon: 'hand', blocked: true, crit: false, damage: 0, recoil: 0, extra: null })
  })

  it('an unguarded strike lands: the roll maps onto the damage range', () => {
    expect(resolveStrike('body', 'hand', 'legs', 0, script(0, 0.99)).damage).toBe(DAMAGE_MIN)
    expect(resolveStrike('body', 'hand', 'legs', 0, script(0.9999, 0.99)).damage).toBe(DAMAGE_MAX)
  })

  it('a critical hit multiplies the damage', () => {
    const s = resolveStrike('legs', 'hand', 'head', 0, script(0, 0)) // crit roll 0 < CRIT_CHANCE
    expect(s.crit).toBe(true)
    expect(s.damage).toBe(DAMAGE_MIN * CRIT_MULT)
  })

  it('a streak adds damage, capped', () => {
    expect(resolveStrike('legs', 'hand', 'head', 2, script(0, 0.99)).damage).toBe(DAMAGE_MIN + 2 * STREAK_BONUS)
    expect(resolveStrike('legs', 'hand', 'head', 99, script(0, 0.99)).damage).toBe(DAMAGE_MIN + STREAK_CAP * STREAK_BONUS)
  })

  it('always consumes two random numbers', () => {
    let calls = 0
    const rng: Rng = () => (calls++, 0.5)
    resolveStrike('head', 'hand', 'head', 0, rng)
    resolveStrike('head', 'foot', 'body', 0, rng)
    expect(calls).toBe(4)
  })

  it('a punch never costs the puncher anything, guarded or not', () => {
    expect(resolveStrike('head', 'hand', 'head', 0, script(0.5, 0.99)).recoil).toBe(0)
    expect(resolveStrike('head', 'hand', 'body', 0, script(0.5, 0.99)).recoil).toBe(0)
  })
})

describe('resolveStrike (kick)', () => {
  it('hits harder than a punch with the same roll', () => {
    const punch = resolveStrike('body', 'hand', 'legs', 0, script(0.5, 0.99)).damage
    const kick = resolveStrike('body', 'foot', 'legs', 0, script(0.5, 0.99)).damage
    expect(kick).toBe(Math.round(punch * KICK_MULT))
    expect(kick).toBeGreaterThan(punch)
  })

  it('a guarded kick does no damage but makes the kicker stumble', () => {
    const s = resolveStrike('legs', 'foot', 'legs', 0, script(0.5, 0.99))
    expect(s.blocked).toBe(true)
    expect(s.damage).toBe(0)
    expect(s.recoil).toBe(KICK_RECOIL)
  })

  it('a landed kick has no recoil', () => {
    expect(resolveStrike('legs', 'foot', 'head', 0, script(0.5, 0.99)).recoil).toBe(0)
  })

  it('the kick multiplier stacks with a critical hit and a streak', () => {
    const s = resolveStrike('legs', 'foot', 'head', 1, script(0, 0)) // min roll, crit
    expect(s.damage).toBe(Math.round((DAMAGE_MIN + STREAK_BONUS) * KICK_MULT * CRIT_MULT))
  })

  it('is worth it only when the zone is likely open (the break-even is between guessing and being read)', () => {
    const avg = (DAMAGE_MIN + DAMAGE_MAX) / 2
    const ev = (p: number, kick: boolean) => (kick ? p * avg * KICK_MULT - (1 - p) * KICK_RECOIL : p * avg)
    expect(ev(2 / 3, true)).toBeGreaterThan(ev(2 / 3, false)) // against a random guard a kick is better
    expect(ev(0.4, true)).toBeLessThan(ev(0.4, false)) // against a guard that reads you, a punch is
  })
})
