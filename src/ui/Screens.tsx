import { arenaUrl, NO_ARENA, pickArena, useArenas } from '../state/arenas'
import { useGame } from '../state/game'
import { useBest } from '../state/best'
import { useSettings } from '../state/settings'
import { DIFFICULTIES, type Difficulty } from '../sim'
import { NAMES } from './names'

const BLURB: Record<Difficulty, string> = {
  easy: 'The enemy guesses blindly.',
  normal: 'The enemy learns your habits.',
  hard: 'The enemy punishes your habits.',
}

function Record() {
  const { wins, losses, fastest, healthiest } = useBest()
  if (wins + losses === 0) return null
  return (
    <p className="record">
      Record against the enemy: {wins} won · {losses} lost{fastest !== null && ` · fastest win ${fastest} rounds`}
      {healthiest > 0 && ` · most health left ${healthiest}`}
    </p>
  )
}

/** The arena to fight in: a thumbnail for every picture, and the plain dark arena. Nothing shows if there are no pictures. */
function ArenaPicker() {
  const list = useArenas((s) => s.list)
  const choice = useSettings((s) => s.arena)
  const setArena = useSettings((s) => s.setArena)
  if (list.length === 0) return null
  const current = pickArena(list, choice)?.id ?? NO_ARENA
  return (
    <div className="arenas" role="radiogroup" aria-label="Arena">
      {list.map((a) => (
        <button key={a.id} role="radio" aria-checked={current === a.id} className={`arena-opt${current === a.id ? ' on' : ''}`} onClick={() => setArena(a.id)}>
          <img src={arenaUrl(a.thumb)} alt="" draggable={false} />
          <span>{a.name}</span>
        </button>
      ))}
      <button role="radio" aria-checked={current === NO_ARENA} className={`arena-opt${current === NO_ARENA ? ' on' : ''}`} onClick={() => setArena(NO_ARENA)}>
        <i className="plain" />
        <span>Plain</span>
      </button>
      <kbd title="B: the next arena">B</kbd>
    </div>
  )
}

export function Title() {
  const start = useGame((s) => s.start)
  const { difficulty, mode, view, setDifficulty, setMode, toggleView } = useSettings()
  return (
    <div className="screen" role="dialog" aria-label="Fight Club">
      <h1>Fight Club</h1>
      <p>
        Every round, both fighters secretly pick a zone to <b>strike</b> and a zone to <b>guard</b> - head, body or legs. Guard the
        zone your opponent strikes and you take nothing. Whoever runs out of health first loses.
      </p>
      <ul className="rules">
        <li>
          Strike with a <b>hand</b> (steady) or a <b>foot</b> (1.4x damage, but a guarded kick makes you stumble: -7 health).
        </li>
        <li>Strikes land at the same time. Both can fall in one round: a draw.</li>
        <li>Landing strikes in a row builds a combo. An unguarded strike may be a critical hit (double damage).</li>
      </ul>

      <div className="choose-row" role="radiogroup" aria-label="Players">
        <button role="radio" aria-checked={mode === 'solo'} className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>
          1 player
        </button>
        <button role="radio" aria-checked={mode === 'duo'} className={mode === 'duo' ? 'on' : ''} onClick={() => setMode('duo')}>
          2 players
        </button>
        <kbd title="P toggles">P</kbd>
      </div>
      {mode === 'solo' ? (
        <>
          <div className="choose-row" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((d, i) => (
              <button key={d} role="radio" aria-checked={difficulty === d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>
                {d} <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          <p className="blurb">{BLURB[difficulty]}</p>
        </>
      ) : (
        <p className="blurb">
          Two people, one screen. Each of you picks and locks in; the picks are hidden once you do, so look away while the other chooses.
        </p>
      )}
      <ArenaPicker />
      <div className="choose-row">
        <button className={view === '3d' ? 'on' : ''} onClick={toggleView} aria-pressed={view === '3d'}>
          3D view <kbd>V</kbd>
        </button>
      </div>

      <button className="go big" onClick={start} autoFocus>
        Start <kbd>Enter</kbd>
      </button>
      {mode === 'solo' && <Record />}
      {mode === 'solo' ? (
        <p className="keys">
          <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> punch head / body / legs · <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> kick · <kbd>A</kbd> <kbd>S</kbd>{' '}
          <kbd>D</kbd> guard · <kbd>M</kbd> mute
        </p>
      ) : (
        <p className="keys">
          Player 1: <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> punch · <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> kick · <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> guard ·{' '}
          <kbd>Space</kbd> lock in
          <br />
          Player 2: <kbd>I</kbd> <kbd>O</kbd> <kbd>P</kbd> punch · <kbd>,</kbd> <kbd>.</kbd> <kbd>/</kbd> kick · <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> guard ·{' '}
          <kbd>Enter</kbd> lock in
        </p>
      )}
    </div>
  )
}

export function End() {
  const { match, mode, start, toTitle } = useGame()
  const fresh = useBest((s) => s.fresh)
  const n = NAMES[mode]
  const duo = mode === 'duo'
  const title = match.status === 'draw' ? 'Draw' : duo ? `${match.status === 'won' ? n.player : n.enemy} wins` : match.status === 'won' ? 'Victory' : 'Defeat'
  const winnerHp = match.status === 'won' ? match.hp.player : match.hp.enemy
  const text =
    match.status === 'draw'
      ? `Both fighters fell in round ${match.round}.`
      : duo
        ? `${match.status === 'won' ? n.player : n.enemy} won in ${match.round} rounds with ${winnerHp} health left.`
        : match.status === 'won'
          ? `You won in ${match.round} rounds with ${match.hp.player} health left.`
          : `You went down in round ${match.round}. The enemy had ${match.hp.enemy} health left.`
  const cls = match.status === 'draw' ? 'draw' : duo || match.status === 'won' ? 'won' : 'lost'
  return (
    <div className={`screen end ${cls}`} role="dialog" aria-label={title}>
      <h1>{title}</h1>
      <p>{text}</p>
      {!duo && fresh && <p className="newbest">New personal best!</p>}
      <button className="go big" onClick={start} autoFocus>
        {duo ? 'Rematch' : 'Fight again'} <kbd>Enter</kbd>
      </button>
      <button className="link" onClick={toTitle}>
        Back to the menu
      </button>
      {!duo && <Record />}
    </div>
  )
}
