import { chooseMove } from './ai'
import { MAX_HP } from './config'
import type { Rng } from './rng'
import { resolveStrike, type RoundResult } from './round'
import type { Difficulty, Move, Side } from './types'

export type MatchStatus = 'fighting' | 'won' | 'lost' | 'draw'

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

/** Resolves one round from both fighters' moves (two humans, or a human and an enemy move). Returns a new match. */
export function resolveRound(m: Match, moves: Record<Side, Move>, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  const strikes = {
    player: resolveStrike(moves.player.attack, moves.player.weapon, moves.enemy.block, m.streak.player, rng),
    enemy: resolveStrike(moves.enemy.attack, moves.enemy.weapon, moves.player.block, m.streak.enemy, rng),
  }
  // a strike hurts the other fighter; a guarded kick also hurts the kicker
  const hp = {
    player: Math.max(0, m.hp.player - strikes.enemy.damage - strikes.player.recoil),
    enemy: Math.max(0, m.hp.enemy - strikes.player.damage - strikes.enemy.recoil),
  }
  const streak = { ...m.streak }
  for (const side of ['player', 'enemy'] as const) {
    streak[side] = strikes[side].blocked ? 0 : m.streak[side] + 1
  }
  const round = m.round + 1
  const result: RoundResult = { round, moves, strikes, hp }
  const status: MatchStatus =
    hp.player === 0 && hp.enemy === 0 ? 'draw' : hp.enemy === 0 ? 'won' : hp.player === 0 ? 'lost' : 'fighting'
  return { match: { ...m, round, hp, streak, log: [...m.log, result], status }, result }
}

/** Plays one round against the enemy AI: it picks its move from your past rounds, then both strikes are resolved. */
export function playRound(m: Match, playerMove: Move, rng: Rng): { match: Match; result: RoundResult } {
  if (m.status !== 'fighting') throw new Error('the match is over')
  const enemy = chooseMove(
    m.log.map((r) => r.moves.player),
    m.difficulty,
    rng,
  )
  return resolveRound(m, { player: playerMove, enemy }, rng)
}

export const hpPercent = (hp: number): number => Math.round((hp / MAX_HP) * 100)
