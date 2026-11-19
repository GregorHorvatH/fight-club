import { create } from 'zustand'
import type { Match } from '../sim'

/** Your record, remembered between visits. */
interface Best {
  wins: number
  losses: number
  /** the fewest rounds of a win, null = never won */
  fastest: number | null
  /** the most health left after a win */
  healthiest: number
  /** the last recorded fight set a record (for the end screen) */
  fresh: boolean
  record: (m: Match) => void
}

const KEY = 'fightclub.best'

type Saved = Pick<Best, 'wins' | 'losses' | 'fastest' | 'healthiest'>

const num = (v: unknown, min: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null)

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null
    return {
      wins: num(v?.wins, 0) ?? 0,
      losses: num(v?.losses, 0) ?? 0,
      fastest: num(v?.fastest, 1),
      healthiest: num(v?.healthiest, 0) ?? 0,
    }
  } catch {
    return { wins: 0, losses: 0, fastest: null, healthiest: 0 } // storage can be blocked (private window)
  }
}

export const useBest = create<Best>((set, get) => ({
  ...load(),
  fresh: false,
  record: (m) => {
    const b = get()
    const won = m.status === 'won'
    const quicker = won && (b.fastest === null || m.round < b.fastest)
    const tougher = won && m.hp.player > b.healthiest
    const next: Saved = {
      wins: b.wins + (won ? 1 : 0),
      losses: b.losses + (m.status === 'lost' ? 1 : 0),
      fastest: quicker ? m.round : b.fastest,
      healthiest: tougher ? m.hp.player : b.healthiest,
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* not remembered: fine */
    }
    set({ ...next, fresh: quicker || tougher })
  },
}))
