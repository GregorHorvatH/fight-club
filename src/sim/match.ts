import { chooseMove } from './ai'
import { MAX_HP, SUPER_GUARD, SUPER_HURT, SUPER_LAND, SUPER_METER } from './config'
import type { Rng } from './rng'
import { damageOf, landed, resolveStrike, whoFirst, type RoundResult, type Strike } from './round'
import { opponent, type Difficulty, type Move, type Side } from './types'

/** Can this fighter throw a super strike now? */
export const superReady = (m: Match, side: Side): boolean => m.meter[side] >= SUPER_METER

/** There is no draw: the strikes come one after the other, and a knockout stops the round. */
export type MatchStatus = 'fighting' | 'won' | 'lost'

export interface Match {
  difficulty: Difficulty
  round: number
  hp: Record<Side, number>
  /** strikes landed in a row, per fighter */
  streak: Record<Side, number>
  /** the super meter of each fighter (0 to SUPER_METER) */
  meter: Record<Side, number>
  log: readonly RoundResult[]
  status: MatchStatus
}

export function createMatch(difficulty: Difficulty): Match {
  return {
    difficulty,
    round: 0,
    hp: { player: MAX_HP, enemy: MAX_HP },
    streak: { player: 0, enemy: 0 },
    meter: { player: 0, enemy: 0 },
    log: [],
    status: 'fighting',
  }
}

/**
 * Resolves one round from both fighters' moves (two people, or a person and an enemy move). Both have chosen secretly and at once;
 * the strikes then come one after the other: the faster one first. A strike that knocks the other fighter out (or a kick whose
 * stumble does) ends the round: the loser does not strike back. Returns a new match.
 */
export function resolveRound(m: Match, asked: Record<Side, Move>, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  // a super strike needs the meter to be full: without it the fighter punches instead
  const moves: Record<Side, Move> = {
    player: asked.player.weapon === 'super' && !superReady(m, 'player') ? { ...asked.player, weapon: 'hand' } : asked.player,
    enemy: asked.enemy.weapon === 'super' && !superReady(m, 'enemy') ? { ...asked.enemy, weapon: 'hand' } : asked.enemy,
  }
  const { first, by } = whoFirst(moves, m.hp, rng)
  const hp = { ...m.hp }
  const strikes: Record<Side, Strike | null> = { player: null, enemy: null }
  const streak = { ...m.streak }
  // a super strike empties the meter of the one who throws it
  const meter: Record<Side, number> = {
    player: moves.player.weapon === 'super' ? 0 : m.meter.player,
    enemy: moves.enemy.weapon === 'super' ? 0 : m.meter.enemy,
  }
  const gain = (side: Side, by: number): void => {
    meter[side] = Math.min(SUPER_METER, meter[side] + by)
  }
  const strike = (a: Side): void => {
    const d = opponent(a)
    const s = resolveStrike(moves[a].attack, moves[a].weapon, moves[d].block, m.streak[a], rng, moves[a].attack2)
    strikes[a] = s
    streak[a] = landed(s) ? m.streak[a] + 1 : 0
    // a strike hurts the other fighter; a guarded kick also hurts the kicker
    hp[d] = Math.max(0, hp[d] - damageOf(s))
    hp[a] = Math.max(0, hp[a] - s.recoil)
    // the meters: reading the other one right fills them (a blow that lands, a guard that holds), being hurt fills a little
    if (landed(s)) gain(a, SUPER_LAND)
    if (s.blocked || (s.extra?.blocked ?? false)) gain(d, SUPER_GUARD)
    if (damageOf(s) > 0) gain(d, SUPER_HURT)
  }
  strike(first)
  const hpAfterFirst = { ...hp }
  if (hp.player > 0 && hp.enemy > 0) strike(opponent(first))
  const round = m.round + 1
  const result: RoundResult = { round, moves, first, firstBy: by, strikes, hpBefore: m.hp, streakBefore: m.streak, meterBefore: m.meter, hpAfterFirst, hp }
  const status: MatchStatus = hp.enemy === 0 ? 'won' : hp.player === 0 ? 'lost' : 'fighting'
  return { match: { ...m, round, hp, streak, meter, log: [...m.log, result], status }, result }
}

/** Plays one round against the enemy AI: it picks its move from your past rounds, then the strikes are resolved. */
export function playRound(m: Match, playerMove: Move, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  const enemy = chooseMove(
    m.log.map((r) => r.moves.player),
    m.difficulty,
    rng,
    m.hp.enemy,
    superReady(m, 'enemy'),
  )
  return resolveRound(m, { player: playerMove, enemy }, rng)
}

export const hpPercent = (hp: number): number => Math.round((hp / MAX_HP) * 100)
