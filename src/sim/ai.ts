import { AI_MEMORY, AI_SUPER_CHANCE, EASY_MISREAD, HARD_CONFIDENCE, HARD_KICK_THRESHOLD, KICK_SAFE_HP } from './config'
import type { Rng } from './rng'
import { ZONES, type Difficulty, type Move, type Weapon, type Zone } from './types'

type Probs = Record<Zone, number>

const uniform = (): Probs => ({ head: 1 / 3, body: 1 / 3, legs: 1 / 3 })

/** How often the player used each zone, newest rounds weighing most (add-one smoothing, so nothing is ever 0). */
export function habits(history: readonly Move[], key: 'attack' | 'block'): Probs {
  const w: Probs = { head: 1, body: 1, legs: 1 }
  let weight = 1
  for (let i = history.length - 1; i >= 0; i--) {
    w[history[i]![key]] += weight
    weight *= AI_MEMORY
  }
  const total = w.head + w.body + w.legs
  return { head: w.head / total, body: w.body / total, legs: w.legs / total }
}

/** Draws a zone with the given probabilities. */
export function sample(p: Probs, rng: Rng): Zone {
  let r = rng() * (p.head + p.body + p.legs)
  for (const z of ZONES) {
    r -= p[z]
    if (r < 0) return z
  }
  return 'legs'
}

/** The most likely zone; a tie is broken by the generator. */
function top(p: Probs, rng: Rng): Zone {
  const best = Math.max(p.head, p.body, p.legs)
  const tied = ZONES.filter((z) => p[z] >= best - 1e-9)
  return tied[Math.floor(rng() * tied.length)]!
}

/** A kick pays off only when the strike is likely to land, so the smarter AIs kick when they expect the zone to be open. */
function weaponFor(difficulty: Difficulty, pHit: number, rng: Rng): Weapon {
  if (difficulty === 'normal') return rng() < pHit * 0.8 ? 'foot' : 'hand'
  return pHit > HARD_KICK_THRESHOLD ? 'foot' : 'hand'
}

/**
 * The enemy's move. It only ever looks at the player's PAST moves (never at the current one).
 *  - easy:   mostly wrong on purpose: it tends to guard where the player rarely strikes and to strike where the player tends to guard
 *            (otherwise it guesses); the weapon is a coin toss
 *  - normal: matches the player's habits (guards where the player tends to strike, strikes where the player tends not to guard)
 *  - hard:   same, but nearly always takes the most likely zone
 * The smarter AIs also choose between a punch and a kick: they kick when they expect the zone to be unguarded, unless they are nearly
 * out of health (`hp`): a kick is slow, and the other one's faster punch would land first. When it can (`superReady`) it sometimes
 * throws a super strike instead (never when it is nearly out of health: that is the slowest strike of all). A scripted generator is
 * not disturbed by this when the enemy cannot: nothing is drawn then.
 */
export function chooseMove(history: readonly Move[], difficulty: Difficulty, rng: Rng, hp = Infinity, superReady = false): Move {
  const move = pick(history, difficulty, rng, hp)
  if (superReady && hp > KICK_SAFE_HP && rng() < AI_SUPER_CHANCE[difficulty]) {
    // the second zone: one of the other two
    const others = ZONES.filter((z) => z !== move.attack)
    return { ...move, weapon: 'super', attack2: others[Math.floor(rng() * others.length)]! }
  }
  return move
}

function pick(history: readonly Move[], difficulty: Difficulty, rng: Rng, hp: number): Move {
  if (history.length === 0) {
    return { attack: sample(uniform(), rng), weapon: rng() < 0.5 ? 'hand' : 'foot', block: sample(uniform(), rng) }
  }
  if (difficulty === 'easy') {
    const strikes = habits(history, 'attack')
    const guards = habits(history, 'block')
    const rarely: Probs = { head: 1 - strikes.head, body: 1 - strikes.body, legs: 1 - strikes.legs } // where the player rarely strikes
    const block = sample(rng() < EASY_MISREAD ? rarely : uniform(), rng)
    const attack = sample(rng() < EASY_MISREAD ? guards : uniform(), rng)
    return { attack, weapon: rng() < 0.5 ? 'hand' : 'foot', block }
  }
  const likelyStrike = habits(history, 'attack')
  const likelyGuard = habits(history, 'block')
  // where the player is least likely to be guarding
  const weak: Probs = { head: 1 - likelyGuard.head, body: 1 - likelyGuard.body, legs: 1 - likelyGuard.legs }
  let attack: Zone
  let block: Zone
  if (difficulty === 'normal') {
    block = sample(likelyStrike, rng)
    attack = sample(weak, rng)
  } else {
    const sure = rng() < HARD_CONFIDENCE
    block = sure ? top(likelyStrike, rng) : sample(uniform(), rng)
    attack = sure ? top(weak, rng) : sample(uniform(), rng)
  }
  const weapon = hp <= KICK_SAFE_HP ? 'hand' : weaponFor(difficulty, 1 - likelyGuard[attack], rng)
  return { attack, weapon, block }
}
