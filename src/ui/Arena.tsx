import { lazy, Suspense, type CSSProperties } from 'react'
import { arenaUrl, pickArena, useArenas } from '../state/arenas'
import { useGame } from '../state/game'
import { useSettings } from '../state/settings'
import { useFighterView } from './arenaView'
import { Floats, Scene2D } from './Fighter'

// three.js is ~250 kB gzipped: it is only downloaded when the 3D view is first opened
const Arena3D = lazy(() => import('./Arena3D'))

export function Arena() {
  const view = useSettings((s) => s.view)
  const arena = pickArena(useArenas((s) => s.list), useSettings((s) => s.arena))
  const phase = useGame((s) => s.phase)
  const round = useGame((s) => s.match.round)
  const player = useFighterView('player')
  const enemy = useFighterView('enemy')
  // a new key per round / phase restarts the animations
  const key = `${round}-${phase}`
  const settled = phase === 'over'
  return (
    <div
      className={`arena ${view === '3d' ? 'three' : 'flat'}${arena ? ' has-bg' : ''}`}
      aria-label="Arena"
      // the picture, under a dark veil so that the fighters, the numbers and the glow stay readable on a bright photo
      // `--stand`: how far down the frame the fighters are moved (the labels over their heads follow)
      style={arena ? { '--stand': arena.stand, backgroundImage: `linear-gradient(rgba(10, 9, 16, 0.18), rgba(10, 9, 16, 0.42)), url(${arenaUrl(arena.file)})` } as CSSProperties : undefined}
    >
      {view === '3d' ? (
        <>
          <Suspense fallback={<div className="loading">Loading 3D…</div>}>
            <Arena3D player={player} enemy={enemy} sceneKey={key} backdrop={arena !== null} stand={arena?.stand ?? 0} />
          </Suspense>
          <div className="slot player"><Floats labels={player.labels} /></div>
          <div className="slot enemy"><Floats labels={enemy.labels} /></div>
        </>
      ) : (
        <Scene2D key={key} player={player} enemy={enemy} settled={settled} far={arena !== null} stand={arena?.stand ?? 0} />
      )}
      <div className="vs" aria-hidden="true">
        {phase === 'choose' || phase === 'title' ? 'VS' : `R${round}`}
      </div>
    </div>
  )
}
