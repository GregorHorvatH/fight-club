import { useEffect } from 'react'
import { bindKeys } from './input'
import { loadArenas } from './state/arenas'
import { useGame } from './state/game'
import { Arena } from './ui/Arena'
import { Dock } from './ui/Controls'
import { Hud } from './ui/Hud'
import { End, Title } from './ui/Screens'

/** How long a round is shown before the next one (Enter skips it). A knockout lingers a little longer. */
const REVEAL_MS = 1500
const KO_MS = 1900

export default function App() {
  const phase = useGame((s) => s.phase)
  const round = useGame((s) => s.match.round)
  const over = useGame((s) => s.match.status !== 'fighting')

  useEffect(bindKeys, [])
  useEffect(() => void loadArenas(), [])

  useEffect(() => {
    if (phase !== 'reveal') return
    const t = setTimeout(() => useGame.getState().next(), over ? KO_MS : REVEAL_MS)
    return () => clearTimeout(t)
  }, [phase, round, over])

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
