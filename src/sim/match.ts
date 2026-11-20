import { chooseMove } from './ai'
import { MAX_HP } from './config'
import type { Rng } from './rng'
import { resolveStrike, whoFirst, type RoundResult, type Strike } from './round'
import { opponent, type Difficulty, type Move, type Side } from './types'

/** There is no draw: the strikes come one after the other, and a knockout stops the round. */
export type MatchStatus = 'fighting' | 'won' | 'lost'

export interface Match {
  difficulty: Difficulty
  round: number
  hp: Record<Side, number>
  /** strikes landed in a row, per fighter */
  streak: Record<Side, number>
  log: readonly RoundResult[]
  status: MatchStatus
}

export function createMatch(difficulty: Difficulty): Match {
  return {
    difficulty,
    round: 0,
    hp: { player: MAX_HP, enemy: MAX_HP },
    streak: { player: 0, enemy: 0 },
    log: [],
    status: 'fighting',
  }
}

/**
 * Resolves one round from both fighters' moves (two people, or a person and an enemy move). Both have chosen secretly and at once;
 * the strikes then come one after the other: the faster one first. A strike that knocks the other fighter out (or a kick whose
 * stumble does) ends the round: the loser does not strike back. Returns a new match.
 */
export function resolveRound(m: Match, moves: Record<Side, Move>, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  const { first, by } = whoFirst(moves, m.hp, rng)
  const hp = { ...m.hp }
  const strikes: Record<Side, Strike | null> = { player: null, enemy: null }
  const streak = { ...m.streak }
  const strike = (a: Side): void => {
    const d = opponent(a)
    const s = resolveStrike(moves[a].attack, moves[a].weapon, moves[d].block, m.streak[a], rng)
    strikes[a] = s
    streak[a] = s.blocked ? 0 : m.streak[a] + 1
    // a strike hurts the other fighter; a guarded kick also hurts the kicker
    hp[d] = Math.max(0, hp[d] - s.damage)
    hp[a] = Math.max(0, hp[a] - s.recoil)
  }
  strike(first)
  const hpAfterFirst = { ...hp }
  if (hp.player > 0 && hp.enemy > 0) strike(opponent(first))
  const round = m.round + 1
  const result: RoundResult = { round, moves, first, firstBy: by, strikes, hpBefore: m.hp, streakBefore: m.streak, hpAfterFirst, hp }
  const status: MatchStatus = hp.enemy === 0 ? 'won' : hp.player === 0 ? 'lost' : 'fighting'
  return { match: { ...m, round, hp, streak, log: [...m.log, result], status }, result }
}

/** Plays one round against the enemy AI: it picks its move from your past rounds, then the strikes are resolved. */
export function playRound(m: Match, playerMove: Move, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  const enemy = chooseMove(
    m.log.map((r) => r.moves.player),
    m.difficulty,
    rng,
    m.hp.enemy,
  )
  return resolveRound(m, { player: playerMove, enemy }, rng)
}

export const hpPercent = (hp: number): number => Math.round((hp / MAX_HP) * 100)
