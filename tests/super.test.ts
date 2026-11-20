import { describe, expect, it } from 'vitest'
import {
  CRIT_MULT,
  DAMAGE_MIN,
  MAX_HP,
  SECOND_ZONE,
  SUPER_GUARD,
  SUPER_HURT,
  SUPER_LAND,
  SUPER_METER,
  STREAK_BONUS,
  SUPER_MULT,
  ZONES,
  chooseMove,
  createMatch,
  damageOf,
  landed,
  resolveRound,
  resolveStrike,
  superReady,
  whoFirst,
  type Move,
  type Rng,
  type Zone,
} from '../src/sim'

const script =
  (...n: number[]): Rng =>
  () =>
    n.shift() ?? 0

describe('a super strike hits two zones', () => {
  const part = Math.round(DAMAGE_MIN * SUPER_MULT * CRIT_MULT) // the damage of a part that lands (it is always a critical hit)

  it('the second zone is the one chosen; when none was, the next one down the body (for the legs, the one above)', () => {
    expect(SECOND_ZONE).toEqual({ head: 'body', body: 'legs', legs: 'body' })
    expect(resolveStrike('head', 'super', 'legs', 0, script(0, 0.99)).extra!.zone).toBe('body')
    expect(resolveStrike('head', 'super', 'body', 0, script(0, 0.99), 'legs').extra!.zone).toBe('legs')
    // two of the same zone is not two: the usual second one
    expect(resolveStrike('head', 'super', 'legs', 0, script(0, 0.99), 'head').extra!.zone).toBe('body')
  })

  it('both parts land when the guard is somewhere else, each a critical hit', () => {
    const s = resolveStrike('head', 'super', 'legs', 0, script(0, 0.99), 'body') // the lowest roll, and the roll for a crit is a miss
    expect(s.blocked).toBe(false)
    expect(s.crit).toBe(true)
    expect(s.extra).toEqual({ zone: 'body', blocked: false, damage: part })
    expect(s.damage).toBe(part)
    expect(damageOf(s)).toBe(2 * part)
    expect(landed(s)).toBe(true)
  })

  it('a guard covers one of the two (either): the other part still lands, as a critical hit', () => {
    const first = resolveStrike('head', 'super', 'head', 0, script(0, 0.99), 'legs')
    expect(first.blocked).toBe(true)
    expect(first.damage).toBe(0)
    expect(first.extra).toEqual({ zone: 'legs', blocked: false, damage: part })
    expect(first.crit).toBe(true)
    expect(landed(first)).toBe(true)
    const third = resolveStrike('head', 'super', 'legs', 0, script(0, 0.99), 'body')
    expect(third.extra!.blocked).toBe(false)
    const fourth = resolveStrike('body', 'super', 'legs', 0, script(0, 0.99), 'legs')
    expect(fourth.blocked).toBe(false)
    expect(fourth.extra).toEqual({ zone: 'legs', blocked: true, damage: 0 })
    expect(damageOf(fourth)).toBe(part)
  })

  it('it can never be guarded altogether, whatever two zones are chosen and whatever is guarded', () => {
    for (const a of ZONES) for (const b of ZONES) for (const guard of ZONES) expect(landed(resolveStrike(a, 'super', guard, 0, script(0.5, 0.99), b)), `${a}+${b} / ${guard}`).toBe(true)
  })

  it('what lands is a critical hit even when the dice would not make it one; the combo bonus is in it', () => {
    const plain = resolveStrike('body', 'super', 'head', 0, script(0, 0.99), 'legs')
    expect(plain.crit).toBe(true)
    const combo = resolveStrike('body', 'super', 'head', 2, script(0, 0.99), 'legs')
    expect(combo.damage).toBe(Math.round((DAMAGE_MIN + 2 * STREAK_BONUS) * SUPER_MULT * CRIT_MULT))
  })

  it('a punch and a kick have no second part, and a guarded kick still costs the stumble', () => {
    expect(resolveStrike('head', 'hand', 'legs', 0, script(0.5, 0.99)).extra).toBeNull()
    expect(resolveStrike('head', 'foot', 'head', 0, script(0.5, 0.99)).extra).toBeNull()
  })

  it('it draws two random numbers, like any other strike (a scripted generator stays in step)', () => {
    let n = 0
    resolveStrike('head', 'super', 'head', 0, () => (n++, 0.5), 'legs')
    expect(n).toBe(2)
  })
})

describe('the order of strikes', () => {
  const move = (weapon: Move['weapon']): Move => ({ attack: 'head', weapon, block: 'head' })
  const hp = { player: 50, enemy: 50 }

  it('a punch strikes before a kick, a kick before a super strike', () => {
    expect(whoFirst({ player: move('hand'), enemy: move('foot') }, hp, () => 0.9)).toEqual({ first: 'player', by: 'speed' })
    expect(whoFirst({ player: move('super'), enemy: move('foot') }, hp, () => 0.1)).toEqual({ first: 'enemy', by: 'speed' })
    expect(whoFirst({ player: move('super'), enemy: move('hand') }, hp, () => 0.1)).toEqual({ first: 'enemy', by: 'speed' })
  })

  it('two super strikes: the more wounded one is quicker', () => {
    expect(whoFirst({ player: move('super'), enemy: move('super') }, { player: 20, enemy: 60 }, () => 0.9)).toEqual({ first: 'player', by: 'health' })
  })
})

describe('the super meter', () => {
  const punch = (attack: Zone, block: Zone): Move => ({ attack, weapon: 'hand', block })

  it('starts empty, and there is no more than SUPER_METER', () => {
    const m = createMatch('normal')
    expect(m.meter).toEqual({ player: 0, enemy: 0 })
    let match = m
    for (let i = 0; i < 6 && match.status === 'fighting'; i++) match = resolveRound(match, { player: punch('head', 'legs'), enemy: punch('body', 'legs') }, () => 0.5).match
    expect(match.meter.player).toBeLessThanOrEqual(SUPER_METER)
    expect(match.meter.enemy).toBeLessThanOrEqual(SUPER_METER)
  })

  it('a blow that lands fills the meter of the striker, being hurt fills the other one a little', () => {
    // the player strikes the head and guards the legs, the enemy strikes the body and guards the legs: both land
    const { match } = resolveRound(createMatch('normal'), { player: punch('head', 'legs'), enemy: punch('body', 'legs') }, () => 0.5)
    expect(match.meter.player).toBe(SUPER_LAND + SUPER_HURT)
    expect(match.meter.enemy).toBe(SUPER_LAND + SUPER_HURT)
  })

  it('a guard that holds fills the meter of the one who guarded', () => {
    // the player strikes the head and the enemy guards it; the enemy strikes the body and the player guards it
    const { match } = resolveRound(createMatch('normal'), { player: punch('head', 'body'), enemy: punch('body', 'head') }, () => 0.5)
    expect(match.meter).toEqual({ player: SUPER_GUARD, enemy: SUPER_GUARD })
  })

  it('a super strike empties the meter of the one who throws it, and what the round does fills it again', () => {
    const full = { ...createMatch('normal'), meter: { player: SUPER_METER, enemy: 0 } }
    const { match } = resolveRound(full, { player: { attack: 'head', weapon: 'super', block: 'legs' }, enemy: punch('legs', 'legs') }, () => 0.5)
    // the enemy's punch is guarded by nobody on the legs? it is: the player guards the legs. The super lands (+LAND), the guard holds (+GUARD)
    expect(match.meter.player).toBe(SUPER_LAND + SUPER_GUARD)
  })

  it('is ready only when the meter is full', () => {
    const m = createMatch('normal')
    expect(superReady(m, 'player')).toBe(false)
    expect(superReady({ ...m, meter: { player: SUPER_METER - 1, enemy: 0 } }, 'player')).toBe(false)
    expect(superReady({ ...m, meter: { player: SUPER_METER, enemy: 0 } }, 'player')).toBe(true)
  })

  it('without a full meter a super strike is thrown as a punch', () => {
    const { result } = resolveRound(createMatch('normal'), { player: { attack: 'head', weapon: 'super', block: 'legs' }, enemy: punch('body', 'legs') }, () => 0.5)
    expect(result.moves.player.weapon).toBe('hand')
  })

  it('the strikes of a round add up in the health: both parts hurt', () => {
    const { match, result } = resolveRound(
      { ...createMatch('normal'), meter: { player: SUPER_METER, enemy: 0 } },
      { player: { attack: 'head', weapon: 'super', block: 'legs' }, enemy: punch('legs', 'legs') },
      () => 0,
    )
    const s = result.strikes.player!
    expect(match.hp.enemy).toBe(MAX_HP - damageOf(s))
  })
})

describe('the enemy and the super strike', () => {
  it('never throws one when it cannot (and draws nothing for it: a scripted generator is not disturbed)', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const a = chooseMove([], d, script(0.1, 0.2, 0.3, 0.4, 0.5), 100, false)
      expect(a.weapon).not.toBe('super')
    }
  })

  it('throws one now and then when it can, but not when it is nearly out of health', () => {
    // (with no history the move takes three numbers: where to strike, with what, where to guard; the fourth is the chance of a super strike)
    const move = chooseMove([], 'hard', script(0.1, 0.2, 0.3, 0, 0.4), 100, true)
    expect(move.weapon).toBe('super')
    expect(move.attack2).toBeDefined()
    expect(move.attack2).not.toBe(move.attack) // two different zones
    expect(chooseMove([], 'hard', script(0.1, 0.2, 0.3, 0), 20, true).weapon).not.toBe('super')
    expect(chooseMove([], 'hard', script(0.1, 0.2, 0.3, 0.99), 100, true).weapon).not.toBe('super')
  })
})
