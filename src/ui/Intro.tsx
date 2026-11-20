import { useEffect, useState } from 'react'
import { play } from '../audio/synth'
import { useGame } from '../state/game'
import { NAMES } from './names'

/** How long the intro lasts (the CSS animations in index.css add up to this), and when the bell rings: at "FIGHT!". */
export const INTRO_MS = 2300
const BELL_AT_MS = 1150

/**
 * A short intro when a match starts: the names slide in from the sides, "VS" slams down between the fighters and is gone, then
 * "FIGHT!" and the bell. It plays once per match, covers nothing that can be clicked (the choosing can start at once), and
 * nothing of it stays on the screen afterwards.
 */
export function Intro() {
  const matchId = useGame((s) => s.matchId)
  const [done, setDone] = useState(0) // the last match whose intro has played
  useEffect(() => {
    if (matchId === 0) return
    const bell = setTimeout(() => play('bell'), BELL_AT_MS)
    const end = setTimeout(() => setDone(matchId), INTRO_MS)
    return () => {
      clearTimeout(bell)
      clearTimeout(end)
    }
  }, [matchId])
  if (matchId === 0 || done === matchId) return null
  return (
    <div className="intro" key={matchId} aria-hidden="true">
      <span className="nm player">{NAMES.solo.player}</span>
      <span className="vs">VS</span>
      <span className="nm enemy">{NAMES.solo.enemy}</span>
      <span className="fight">FIGHT!</span>
    </div>
  )
}
