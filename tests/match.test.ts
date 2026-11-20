import { describe, expect, it } from 'vitest'
import {
  KICK_RECOIL,
  MAX_HP,
  ZONES,
  WEAPONS,
  createMatch,
  playRound,
  resolveRound,
  seeded,
  whoFirst,
  type Match,
  type Move,
  type Rng,
  type Weapon,
  type Zone,
} from '../src/sim'

const NO_CRIT = 0.99 // above CRIT_CHANCE
const mv = (attack: Zone, block: Zone, weapon: Weapon = 'hand'): Move => ({ attack, weapon, block })
const withHp = (player: number, enemy: number, over: Partial<Match> = {}): Match => ({ ...createMatch('easy'), hp: { player, enemy }, ...over })
/** The dice of the strikes only: [damage roll, crit roll] for each strike, in the order they are thrown. */
const dice = (...n: number[]): Rng => () => n.shift() ?? 0
const MID = [0.5, NO_CRIT, 0.5, NO_CRIT]

describe('who strikes first', () => {
  const m = (a: Weapon, b: Weapon) => ({ player: mv('head', 'head', a), enemy: mv('head', 'head', b) })
  const never: Rng = () => {
    throw new Error('no dice should be drawn')
  }

  it('a punch is faster than a kick', () => {
    expect(whoFirst(m('hand', 'foot'), { player: 50, enemy: 50 }, never)).toEqual({ first: 'player', by: 'speed' })
    expect(whoFirst(m('foot', 'hand'), { player: 50, enemy: 50 }, never)).toEqual({ first: 'enemy', by: 'speed' })
  })

  it('speed beats health: a punch is first even against a more wounded kicker', () => {
    expect(whoFirst(m('hand', 'foot'), { player: 90, enemy: 10 }, never).first).toBe('player')
  })

  it('with the same weapon the more wounded fighter is quicker', () => {
    expect(whoFirst(m('hand', 'hand'), { player: 40, enemy: 70 }, never)).toEqual({ first: 'player', by: 'health' })
    expect(whoFirst(m('foot', 'foot'), { player: 70, enemy: 40 }, never)).toEqual({ first: 'enemy', by: 'health' })
  })

  it('only when everything is equal does a coin decide, and it is the only draw', () => {
    expect(whoFirst(m('hand', 'hand'), { player: 60, enemy: 60 }, () => 0.1)).toEqual({ first: 'player', by: 'luck' })
    expect(whoFirst(m('foot', 'foot'), { player: 60, enemy: 60 }, () => 0.9)).toEqual({ first: 'enemy', by: 'luck' })
  })

  it('is fair: over many coin tosses each fighter goes first about half of the time', () => {
    const rng = seeded(5)
    let player = 0
    for (let i = 0; i < 2000; i++) if (whoFirst(m('hand', 'hand'), { player: 60, enemy: 60 }, rng).first === 'player') player++
    expect(player / 2000).toBeGreaterThan(0.45)
    expect(player / 2000).toBeLessThan(0.55)
  })
})

describe('resolveRound: the strikes come one after the other', () => {
  it('both strike when nobody is knocked out, the faster one first', () => {
    // player kicks (slow), enemy punches (fast): the enemy strikes first
    const { result } = resolveRound(createMatch('easy'), { player: mv('head', 'body', 'foot'), enemy: mv('legs', 'legs') }, dice(...MID))
    expect(result.first).toBe('enemy')
    expect(result.firstBy).toBe('speed')
    expect(result.strikes.enemy).not.toBeNull()
    expect(result.strikes.player).not.toBeNull()
    // after the first strike only the first one's damage is on the board
    expect(result.hpAfterFirst.player).toBeLessThan(MAX_HP)
    expect(result.hpAfterFirst.enemy).toBe(MAX_HP)
    expect(result.hp.enemy).toBeLessThan(MAX_HP)
    expect(result.hpBefore).toEqual({ player: MAX_HP, enemy: MAX_HP })
  })

  it('guards are matched against the other fighter strike: a guess guards it', () => {
    const { result, match } = resolveRound(createMatch('easy'), { player: mv('head', 'body'), enemy: mv('legs', 'head') }, dice(0, 0, ...MID))
    expect(result.strikes.player!.blocked).toBe(true) // the player hit the head, the enemy guarded the head
    expect(result.strikes.enemy!.blocked).toBe(false) // the enemy hit the legs, the player guarded the body
    expect(match.hp.enemy).toBe(MAX_HP)
    expect(match.hp.player).toBeLessThan(MAX_HP)
  })

  it('a knockout by the first strike ends the round: the loser does not strike back', () => {
    const m = withHp(MAX_HP, 5)
    // player punches, enemy kicks: the player is first, and the enemy is at 5 health
    const { match, result } = resolveRound(m, { player: mv('legs', 'body'), enemy: mv('head', 'head', 'foot') }, dice(...MID))
    expect(result.first).toBe('player')
    expect(result.strikes.player).not.toBeNull()
    expect(result.strikes.enemy).toBeNull() // never thrown
    expect(match.hp).toEqual({ player: MAX_HP, enemy: 0 }) // the player takes nothing
    expect(match.status).toBe('won')
  })

  it('a critical hit on the first strike hurts a lot, but a fighter who survives it still answers', () => {
    const m = withHp(30, MAX_HP)
    // the player kicks (slow), the enemy punches the head (fast, so first) with the highest roll and a critical hit
    const { result } = resolveRound(m, { player: mv('legs', 'legs', 'foot'), enemy: mv('head', 'body') }, dice(0.9999, 0, ...MID))
    expect(result.first).toBe('enemy')
    expect(result.strikes.enemy!.crit).toBe(true)
    expect(result.strikes.enemy!.damage).toBeGreaterThanOrEqual(28)
    expect(result.hpAfterFirst.player).toBe(30 - result.strikes.enemy!.damage)
    expect(result.strikes.player).not.toBeNull() // 30 health was enough to stand: the kick follows
  })

  it('a fighter who is knocked out by the first strike of a round is out, even if he had the better strike', () => {
    const m = withHp(5, MAX_HP)
    const { match, result } = resolveRound(m, { player: mv('legs', 'legs', 'foot'), enemy: mv('head', 'body') }, dice(...MID))
    expect(result.first).toBe('enemy') // the punch is faster
    expect(result.strikes.player).toBeNull()
    expect(match.status).toBe('lost')
    expect(match.hp.enemy).toBe(MAX_HP) // the kick that would have landed never left
  })

  it('a guarded kick makes the kicker stumble, and that can knock him out: the round ends there', () => {
    const m = withHp(KICK_RECOIL, MAX_HP)
    // both kick, so the more wounded fighter (the player) is first; the enemy guards the head the player kicks
    const { match, result } = resolveRound(m, { player: mv('head', 'body', 'foot'), enemy: mv('legs', 'head', 'foot') }, dice(...MID))
    expect(result.first).toBe('player')
    expect(result.strikes.player!.recoil).toBe(KICK_RECOIL)
    expect(result.strikes.enemy).toBeNull() // the player fell, the round is over
    expect(match.status).toBe('lost')
  })

  it('there is no draw: whatever happens the match ends with a winner (the status is never "draw")', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const rng = seeded(11)
      for (let i = 0; i < 200; i++) {
        let m = createMatch(d)
        while (m.status === 'fighting') {
          const move: Move = { attack: ZONES[Math.floor(rng() * 3)]!, weapon: WEAPONS[Math.floor(rng() * 2)]!, block: ZONES[Math.floor(rng() * 3)]! }
          ;({ match: m } = playRound(m, move, rng))
        }
        expect(['won', 'lost']).toContain(m.status)
        expect(m.hp.player === 0 && m.hp.enemy === 0).toBe(false)
      }
    }
  })

  it('a landed strike builds a streak and a guarded one resets it', () => {
    let m = createMatch('easy')
    ;({ match: m } = resolveRound(m, { player: mv('legs', 'body'), enemy: mv('head', 'head', 'foot') }, dice(...MID)))
    expect(m.streak).toEqual({ player: 1, enemy: 1 }) // both landed
    // the player punches the head and the enemy guards the head; the enemy kicks the legs and the player guards the legs
    ;({ match: m } = resolveRound(m, { player: mv('head', 'legs'), enemy: mv('legs', 'head', 'foot') }, dice(...MID)))
    expect(m.streak).toEqual({ player: 0, enemy: 0 })
  })

  it('health never goes below zero, and a finished match refuses another round', () => {
    const { match } = resolveRound(withHp(MAX_HP, 1), { player: mv('legs', 'body'), enemy: mv('head', 'head') }, dice(0, 0, ...MID))
    expect(match.hp.enemy).toBe(0)
    expect(() => resolveRound(match, { player: mv('legs', 'body'), enemy: mv('head', 'head') }, seeded(1))).toThrow()
  })

  it('does not mutate the previous match', () => {
    const m = createMatch('easy')
    resolveRound(m, { player: mv('legs', 'body'), enemy: mv('head', 'head') }, dice(0, ...MID))
    expect(m.round).toBe(0)
    expect(m.log).toHaveLength(0)
    expect(m.hp).toEqual({ player: MAX_HP, enemy: MAX_HP })
  })
})

describe('playRound (against the enemy AI)', () => {
  it('every simulated match ends, and quickly (random players, every difficulty)', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const rng = seeded(7)
      let total = 0
      for (let i = 0; i < 200; i++) {
        let m = createMatch(d)
        while (m.status === 'fighting') {
          const move: Move = { attack: ZONES[Math.floor(rng() * 3)]!, weapon: WEAPONS[Math.floor(rng() * 2)]!, block: ZONES[Math.floor(rng() * 3)]! }
          ;({ match: m } = playRound(m, move, rng))
          expect(m.round).toBeLessThan(60)
        }
        total += m.round
      }
      const avg = total / 200
      expect(avg).toBeGreaterThan(4)
      expect(avg).toBeLessThan(16)
    }
  })

  it('the first fighter in a round is a fair mix of both: nobody is always first', () => {
    const rng = seeded(21)
    const firsts = { player: 0, enemy: 0 }
    let m = createMatch('easy')
    for (let i = 0; i < 400; i++) {
      if (m.status !== 'fighting') m = createMatch('easy')
      const move: Move = { attack: ZONES[Math.floor(rng() * 3)]!, weapon: WEAPONS[Math.floor(rng() * 2)]!, block: ZONES[Math.floor(rng() * 3)]! }
      const r = playRound(m, move, rng)
      firsts[r.result.first]++
      m = r.match
    }
    expect(firsts.player).toBeGreaterThan(140)
    expect(firsts.enemy).toBeGreaterThan(140)
  })
})
