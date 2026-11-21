import { useEffect } from 'react'
import { setMusic, setMusicDuck } from './audio/music'
import { bindKeys } from './input'
import { loadArenas } from './state/arenas'
import { timelineOf } from './timing'
import { useGame } from './state/game'
import { useSettings } from './state/settings'
import { fightTrack } from './state/soundtrack'
import { Arena } from './ui/Arena'
import { Dock } from './ui/Controls'
import { Hud } from './ui/Hud'
import { useCalm } from './ui/useCalm'
import { About, End, Options, Ladder, Menu, Pause, Select, Setup } from './ui/Screens'

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
  // the theme of the menus plays while no fight is going on, the theme of the fight while one is (quieter when it is paused)
  const alive = useCalm()
  const fighting = phase === 'choose' || phase === 'reveal'
  const themeOf = useGame((s) => s.themeOf)
  const soundtrack = useSettings((s) => s.soundtrack)
  // a soundtrack chosen in the options is heard at once, while the options are open (over the menu, or over the paused fight)
  const previewOf = useGame((s) => (s.phase === 'options' || (s.paused && s.pauseSettings) ? s.previewOf : null))
  const track = previewOf ?? (alive ? 'menu' : fighting ? fightTrack(soundtrack, themeOf) : null)
  useEffect(() => setMusic(track), [track])
  useEffect(() => setMusicDuck(paused && !previewOf), [paused, previewOf])

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
      {phase === 'options' && <Options />}
      {phase === 'setup' && <Setup />}
      {phase === 'select' && <Select />}
      {phase === 'ladder' && <Ladder />}
      {phase === 'over' && <End />}
      {paused && <Pause />}
    </main>
  )
}
