import { useEffect, useState } from 'react'
import type { RoundResult, Side } from '../sim'
import { useGame } from '../state/game'
import { timelineOf } from '../timing'

/**
 * How many strikes of the round that is being replayed have landed so far (0, 1 or 2). It counts up at the moment each blow connects,
 * so the health bars, the combo and the log can follow the picture instead of giving the result away. When nothing is being replayed
 * every strike has landed.
 */
export function useLanded(): number {
  const phase = useGame((s) => s.phase)
  const last = useGame((s) => s.last)
  const paused = useGame((s) => s.paused)
  const replay = useGame((s) => s.replay)
  const replaying = phase === 'reveal' && last !== null
  // the count belongs to the round it was counted for: for any other round it starts again from 0
  const [counted, setCounted] = useState<{ round: RoundResult | null; replay: number; n: number }>({ round: null, replay: 0, n: 0 })
  useEffect(() => {
    if (!replaying || !last || paused) return // while paused the count stands where it is; Continue starts the replay over
    const tl = timelineOf(last)
    const timers = tl.order.map((side, i) => setTimeout(() => setCounted({ round: last, replay, n: i + 1 }), tl.hitAt[side]! * 1000))
    return () => timers.forEach(clearTimeout)
  }, [replaying, last, paused, replay])
  if (!replaying) return Infinity
  return counted.round === last && counted.replay === replay ? counted.n : 0
}

/** The health of a fighter as it is on the screen: it drops when each blow lands. */
export function shownHp(r: RoundResult | null, side: Side, landed: number, hp: number): number {
  if (!r || landed >= timelineOf(r).order.length) return hp
  return landed <= 0 ? r.hpBefore[side] : r.hpAfterFirst[side]
}

/** The combo of a fighter as it is on the screen: the one from before the round, until all the strikes of the round have landed. */
export function shownStreak(r: RoundResult | null, side: Side, landed: number, streak: number): number {
  if (!r || landed >= timelineOf(r).order.length) return streak
  return r.streakBefore[side]
}
