import { useEffect } from 'react'
import { bindKeys } from './input'
import { loadArenas } from './state/arenas'
import { timelineOf } from './timing'
import { useGame } from './state/game'
import { Arena } from './ui/Arena'
import { Dock } from './ui/Controls'
import { Hud } from './ui/Hud'
import { About, End, Menu, Pause, Select, Setup } from './ui/Screens'

/** A round is shown for as long as its strikes take (two beats, or one when the first knocked the other out); Enter skips it. A knockout lingers a little longer. */
const KO_EXTRA_MS = 400

export default function App() {
  const phase = useGame((s) => s.phase)
  const round = useGame((s) => s.match.round)
  const over = useGame((s) => s.match.status !== 'fighting')
  const last = useGame((s) => s.last)
  const paused = useGame((s) => s.paused)
  const replay = useGame((s) => s.replay)

  useEffect(bindKeys, [])
  useEffect(() => void loadArenas(), [])

  useEffect(() => {
    if (phase !== 'reveal' || !last || paused) return
    const t = setTimeout(() => useGame.getState().next(), timelineOf(last).duration * 1000 + (over ? KO_EXTRA_MS : 0))
    return () => clearTimeout(t)
  }, [phase, round, over, last, paused, replay])

  return (
    <main className="app">
      <Arena />
      <Hud />
      <Dock />
      {phase === 'menu' && <Menu />}
      {phase === 'about' && <About />}
      {phase === 'setup' && <Setup />}
      {phase === 'select' && <Select />}
      {phase === 'over' && <End />}
      {paused && <Pause />}
    </main>
  )
}
