import { useEffect } from 'react'
import { bindKeys } from './input'
import { loadArenas } from './state/arenas'
import { timelineOf } from './timing'
import { useGame } from './state/game'
import { Arena } from './ui/Arena'
import { Dock } from './ui/Controls'
import { Hud } from './ui/Hud'
import { End, Title } from './ui/Screens'

/** A round is shown for as long as its strikes take (two beats, or one when the first knocked the other out); Enter skips it. A knockout lingers a little longer. */
const KO_EXTRA_MS = 400

export default function App() {
  const phase = useGame((s) => s.phase)
  const round = useGame((s) => s.match.round)
  const over = useGame((s) => s.match.status !== 'fighting')
  const last = useGame((s) => s.last)

  useEffect(bindKeys, [])
  useEffect(() => void loadArenas(), [])

  useEffect(() => {
    if (phase !== 'reveal' || !last) return
    const t = setTimeout(() => useGame.getState().next(), timelineOf(last).duration * 1000 + (over ? KO_EXTRA_MS : 0))
    return () => clearTimeout(t)
  }, [phase, round, over, last])

  return (
    <main className="app">
      <Arena />
      <Hud />
      <Dock />
      {phase === 'title' && <Title />}
      {phase === 'over' && <End />}
    </main>
  )
}
