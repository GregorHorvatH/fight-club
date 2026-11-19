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
  type Match,
  type Move,
  type Rng,
  type Weapon,
  type Zone,
} from '../src/sim'

const NO_CRIT = 0.99 // above CRIT_CHANCE
const HAND: Weapon = 'hand'
const mv = (attack: Zone, block: Zone, weapon: Weapon = HAND): Move => ({ attack, weapon, block })

/**
 * Easy AI draws, in order: its attack zone, its weapon (< 0.5 = hand), its block zone - then the player's strike
 * (2 numbers) and the enemy's strike (2). sample(): 0 -> head, 0.4 -> body, 0.9 -> legs.
 */
const scripted = (attackDraw: number, blockDraw: number, damageRoll = 0.5): Rng => {
  const seq = [attackDraw, 0.1, blockDraw, damageRoll, NO_CRIT, damageRoll, NO_CRIT]
  return () => seq.shift() ?? 0
}
/** Only the two strikes' dice (for resolveRound, where nobody draws a move). */
const dice = (damageRoll = 0.5): Rng => {
  const seq = [damageRoll, NO_CRIT, damageRoll, NO_CRIT]
  return () => seq.shift() ?? 0
}

describe('playRound (against the enemy AI)', () => {
  it('starts with full health', () => {
    const m = createMatch('easy')
    expect(m.hp).toEqual({ player: MAX_HP, enemy: MAX_HP })
    expect(m.status).toBe('fighting')
  })

  it('both strikes land at the same time when nobody guards the right zone', () => {
    // enemy: attack head, block head. player: attack legs, block body.
    const { match, result } = playRound(createMatch('easy'), mv('legs', 'body'), scripted(0, 0))
    expect(result.strikes.player.blocked).toBe(false)
    expect(result.strikes.enemy.blocked).toBe(false)
    expect(match.hp.enemy).toBeLessThan(MAX_HP)
    expect(match.hp.player).toBeLessThan(MAX_HP)
    expect(match.round).toBe(1)
    expect(match.log).toHaveLength(1)
  })

  it('a correct guess guards the strike', () => {
    // enemy: attack legs, block head. player: attack head (guarded), block legs (guarded)
    const { match } = playRound(createMatch('easy'), mv('head', 'legs'), scripted(0.9, 0))
    expect(match.hp).toEqual({ player: MAX_HP, enemy: MAX_HP })
  })

  it('a landed strike builds a streak, a guarded one resets it', () => {
    let m = createMatch('easy')
    ;({ match: m } = playRound(m, mv('legs', 'body'), scripted(0, 0))) // both land
    expect(m.streak).toEqual({ player: 1, enemy: 1 })
    ;({ match: m } = playRound(m, mv('head', 'legs'), scripted(0.9, 0))) // both guarded
    expect(m.streak).toEqual({ player: 0, enemy: 0 })
  })

  it('the loser is the one who runs out of health first', () => {
    const m: Match = { ...createMatch('easy'), hp: { player: MAX_HP, enemy: 5 } }
    const { match } = playRound(m, mv('legs', 'body'), scripted(0, 0))
    expect(match.hp.enemy).toBe(0)
    expect(match.status).toBe('won')

    const m2: Match = { ...createMatch('easy'), hp: { player: 5, enemy: MAX_HP } }
    expect(playRound(m2, mv('legs', 'body'), scripted(0, 0)).match.status).toBe('lost')
  })

  it('both at zero in the same round is a draw', () => {
    const m: Match = { ...createMatch('easy'), hp: { player: 5, enemy: 5 } }
    const { match } = playRound(m, mv('legs', 'body'), scripted(0, 0))
    expect(match.status).toBe('draw')
  })

  it('health never goes below zero, and a finished match refuses another round', () => {
    const m: Match = { ...createMatch('easy'), hp: { player: MAX_HP, enemy: 1 } }
    const { match } = playRound(m, mv('legs', 'body'), scripted(0, 0))
    expect(match.hp.enemy).toBe(0)
    expect(() => playRound(match, mv('legs', 'body'), seeded(1))).toThrow()
  })

  it('does not mutate the previous match', () => {
    const m = createMatch('easy')
    playRound(m, mv('legs', 'body'), scripted(0, 0))
    expect(m.round).toBe(0)
    expect(m.log).toHaveLength(0)
  })

  it('every simulated match ends, and quickly (random players, every difficulty)', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const rng = seeded(7)
      let total = 0
      for (let i = 0; i < 200; i++) {
        let m = createMatch(d)
        while (m.status === 'fighting') {
          const move: Move = {
            attack: ZONES[Math.floor(rng() * 3)]!,
            weapon: WEAPONS[Math.floor(rng() * 2)]!,
            block: ZONES[Math.floor(rng() * 3)]!,
          }
          ;({ match: m } = playRound(m, move, rng))
          expect(m.round).toBeLessThan(60)
        }
        total += m.round
      }
      const avg = total / 200
      expect(avg).toBeGreaterThan(5)
      expect(avg).toBeLessThan(16)
    }
  })
})

describe('resolveRound (two humans, no AI)', () => {
  it('uses exactly the two moves it is given and draws only the strikes dice', () => {
    let calls = 0
    const rng: Rng = () => (calls++, 0.5)
    const { result } = resolveRound(createMatch('easy'), { player: mv('head', 'body'), enemy: mv('legs', 'head') }, rng)
    expect(calls).toBe(4)
    expect(result.moves.player.attack).toBe('head')
    expect(result.moves.enemy.attack).toBe('legs')
  })

  it('guards are matched against the other fighter strike', () => {
    const { result } = resolveRound(createMatch('easy'), { player: mv('head', 'body'), enemy: mv('legs', 'head') }, dice())
    expect(result.strikes.player.blocked).toBe(true) // player hit the head, enemy guarded the head
    expect(result.strikes.enemy.blocked).toBe(false) // enemy hit the legs, player guarded the body
    expect(result.hp.enemy).toBe(MAX_HP)
    expect(result.hp.player).toBeLessThan(MAX_HP)
  })

  it('a guarded kick hurts the kicker: the stumble is subtracted from their health', () => {
    // player kicks the head and the enemy guards it; the enemy punches the body and the player guards the body: nothing lands
    const { match, result } = resolveRound(
      createMatch('easy'),
      { player: mv('head', 'body', 'foot'), enemy: mv('body', 'head') },
      dice(),
    )
    expect(result.strikes.player.recoil).toBe(KICK_RECOIL)
    expect(match.hp.player).toBe(MAX_HP - KICK_RECOIL)
    expect(match.hp.enemy).toBe(MAX_HP)
    expect(match.streak.player).toBe(0)
  })

  it('a landed kick hits harder than a punch and costs nothing', () => {
    const punch = resolveRound(createMatch('easy'), { player: mv('head', 'body'), enemy: mv('body', 'legs') }, dice()).match
    const kick = resolveRound(createMatch('easy'), { player: mv('head', 'body', 'foot'), enemy: mv('body', 'legs') }, dice()).match
    expect(kick.hp.enemy).toBeLessThan(punch.hp.enemy)
    expect(kick.hp.player).toBe(punch.hp.player)
  })

  it('a stumble can be fatal: a fighter at 5 health who gets a kick guarded loses', () => {
    const m: Match = { ...createMatch('easy'), hp: { player: 5, enemy: MAX_HP } }
    const { match } = resolveRound(m, { player: mv('head', 'body', 'foot'), enemy: mv('body', 'head') }, dice())
    expect(match.hp.player).toBe(0)
    expect(match.status).toBe('lost')
  })

  it('both stumbling to zero is a draw', () => {
    const m: Match = { ...createMatch('easy'), hp: { player: 5, enemy: 5 } }
    const { match } = resolveRound(m, { player: mv('head', 'head', 'foot'), enemy: mv('head', 'head', 'foot') }, dice())
    expect(match.status).toBe('draw')
  })

  it('refuses another round once the match is over', () => {
    const m: Match = { ...createMatch('easy'), status: 'won' }
    expect(() => resolveRound(m, { player: mv('head', 'head'), enemy: mv('head', 'head') }, dice())).toThrow()
  })
})
