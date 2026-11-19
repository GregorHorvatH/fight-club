import { describe, expect, it } from 'vitest'
import { chooseMove, habits, seeded, type Difficulty, type Move, type Weapon, type Zone } from '../src/sim'

const repeat = (move: Move, n: number): Move[] => Array.from({ length: n }, () => move)

function share<T extends Zone | Weapon>(difficulty: Difficulty, history: Move[], pick: (m: Move) => T, zone: T): number {
  const rng = seeded(42)
  let hits = 0
  const N = 2000
  for (let i = 0; i < N; i++) if (pick(chooseMove(history, difficulty, rng)) === zone) hits++
  return hits / N
}

describe('habits', () => {
  it('is a probability distribution, smoothed so nothing is impossible', () => {
    const p = habits(repeat({ attack: 'head', weapon: 'hand', block: 'body' }, 5), 'attack')
    expect(p.head + p.body + p.legs).toBeCloseTo(1)
    expect(p.head).toBeGreaterThan(p.body)
    expect(p.legs).toBeGreaterThan(0)
  })

  it('newer rounds weigh more than older ones', () => {
    const history: Move[] = [...repeat({ attack: 'head', weapon: 'hand', block: 'head' }, 4), ...repeat({ attack: 'legs', weapon: 'hand', block: 'head' }, 4)]
    const p = habits(history, 'attack')
    expect(p.legs).toBeGreaterThan(p.head)
  })
})

describe('chooseMove', () => {
  const stubborn = repeat({ attack: 'head', weapon: 'hand', block: 'legs' }, 10) // always strikes the head, always guards the legs

  it('easy is blind guesswork, about a third each', () => {
    for (const z of ['head', 'body', 'legs'] as const) {
      const s = share('easy', stubborn, (m) => m.block, z)
      expect(s).toBeGreaterThan(0.28)
      expect(s).toBeLessThan(0.39)
    }
  })

  it('normal leans toward a stubborn player, hard punishes them', () => {
    const normalBlock = share('normal', stubborn, (m) => m.block, 'head')
    const hardBlock = share('hard', stubborn, (m) => m.block, 'head')
    expect(normalBlock).toBeGreaterThan(0.4)
    expect(hardBlock).toBeGreaterThan(0.75)
    expect(hardBlock).toBeGreaterThan(normalBlock)
  })

  it('hard strikes where the player never guards', () => {
    // the player always guards the legs, so the hard AI almost never strikes there (only on its ~20% random guesses)
    expect(share('hard', stubborn, (m) => m.attack, 'legs')).toBeLessThan(0.1)
    expect(share('hard', stubborn, (m) => m.attack, 'head')).toBeGreaterThan(0.35)
    expect(share('hard', stubborn, (m) => m.attack, 'body')).toBeGreaterThan(0.35)
  })

  it('on the first round (no history) every difficulty just guesses', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = share(d, [], (m) => m.block, 'head')
      expect(s).toBeGreaterThan(0.28)
      expect(s).toBeLessThan(0.39)
    }
  })

  it('never reads anything but the history it is given (same history and seed, same move)', () => {
    expect(chooseMove(stubborn, 'hard', seeded(3))).toEqual(chooseMove(stubborn, 'hard', seeded(3)))
  })

  it('easy mixes punches and kicks at random', () => {
    const kicks = share('easy', stubborn, (m) => m.weapon, 'foot')
    expect(kicks).toBeGreaterThan(0.43)
    expect(kicks).toBeLessThan(0.57)
  })

  it('hard kicks when the zone it strikes is open, and punches when it is not', () => {
    // the player guards the legs every time, so the open zones are head and body: kick
    expect(share('hard', stubborn, (m) => m.weapon, 'foot')).toBeGreaterThan(0.85)
    // a player who guards all three zones about equally gives no clear opening: punch
    const wary: Move[] = ['head', 'body', 'legs', 'head', 'body', 'legs'].map((z) => ({ attack: 'head', weapon: 'hand', block: z as Zone }))
    expect(share('hard', wary, (m) => m.weapon, 'hand')).toBeGreaterThan(0.85)
  })

  it('normal kicks more often the more open the zone looks', () => {
    const open = share('normal', stubborn, (m) => m.weapon, 'foot')
    const wary: Move[] = ['head', 'body', 'legs', 'head', 'body', 'legs'].map((z) => ({ attack: 'head', weapon: 'hand', block: z as Zone }))
    expect(open).toBeGreaterThan(share('normal', wary, (m) => m.weapon, 'foot'))
  })
})
