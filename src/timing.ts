import { opponent, type RoundResult, type Side } from './sim'

/** Seconds from the start of a strike to the moment it connects. The animation, the sounds and the flashes are timed to it. */
export const IMPACT = 0.3
/** Seconds each strike of a round is given: the caption, the strike, the reaction. The two strikes of a round follow each other. */
export const BEAT = 1.7
/** Seconds from the start of a beat (when its caption appears) to the moment the strike begins. */
export const LEAD = 0.45

/** When things happen in the replay of a round, in seconds from its start. */
export interface Timeline {
  /** the beats, in order: who strikes. There is one beat when the first strike ended the match, otherwise two. */
  order: Side[]
  /** when the strike of this fighter begins / connects (null when it was never thrown) */
  strikeAt: Record<Side, number | null>
  hitAt: Record<Side, number | null>
  /** when the match was decided (the moment a fighter was knocked out), or null */
  endAt: number | null
  /** how long the replay lasts */
  duration: number
}

export function timelineOf(r: RoundResult): Timeline {
  const order = [r.first, opponent(r.first)].filter((s) => r.strikes[s] !== null)
  const strikeAt: Record<Side, number | null> = { player: null, enemy: null }
  const hitAt: Record<Side, number | null> = { player: null, enemy: null }
  order.forEach((side, i) => {
    strikeAt[side] = i * BEAT + LEAD
    hitAt[side] = i * BEAT + LEAD + IMPACT
  })
  const decided = r.hp.player === 0 || r.hp.enemy === 0
  const last = order[order.length - 1]
  return { order, strikeAt, hitAt, endAt: decided && last ? hitAt[last]! : null, duration: order.length * BEAT }
}
