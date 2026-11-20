import { arenaUrl, NO_ARENA, pickArena, useArenas } from '../state/arenas'
import { useGame } from '../state/game'
import { useBest } from '../state/best'
import { useSettings } from '../state/settings'
import { buttonKey, zoneKey } from '../input'
import { DIFFICULTIES, type Difficulty, type Side } from '../sim'
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

/** The nine keys of a player, drawn like the screen: the guard figure, the three buttons, the strike figure. */
function KeyGrid({ side, label }: { side: Side; label?: string }) {
  const rows = [['head', 'Head', 'punch', '✊'], ['body', 'Body', 'kick', '🦶'], ['legs', 'Legs', 'fight', '▶']] as const
  return (
    <div className="kgrid">
      {label && <b className={`kname ${side}`}>{label}</b>}
      <span className="kh guard">Guard</span>
      <span />
      <span className="kh strike">Strike</span>
      <span />
      {rows.map(([zone, name, button, icon]) => (
        <div key={zone} className="krow">
          <kbd title={`guard the ${name.toLowerCase()}`}>{zoneKey(side, 'guard', zone)}</kbd>
          <span className="kmid">
            <i aria-hidden="true">{icon}</i>
            <kbd>{buttonKey(side, button)}</kbd>
          </span>
          <kbd title={`strike the ${name.toLowerCase()}`}>{zoneKey(side, 'strike', zone)}</kbd>
          <span className="kz">{name}</span>
        </div>
      ))}
    </div>
  )
}

export function Title() {
  const start = useGame((s) => s.start)
  const { difficulty, mode, view, setDifficulty, setMode, setView } = useSettings()
  return (
    <div className="screen" role="dialog" aria-label="Fight Club">
      <h1>Fight Club</h1>
      <p>
        Every round, both fighters secretly pick a zone to <b>strike</b> and a zone to <b>guard</b> - head, body or legs. Guard the
        zone your opponent strikes and you take nothing. Whoever runs out of health first loses.
      </p>
      <ul className="rules">
        <li>
          <b>Punch</b> (fast, steady) or <b>kick</b> (slow, 1.4x damage, and a guarded kick makes you stumble: -7 health).
        </li>
        <li>You both choose in secret, then the strikes come one after the other: a punch is fast and goes first, a kick is slow. A knockout ends the round.</li>
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
          Two people, one screen, one after the other: James picks and locks in (his picks disappear at once), then Amy picks and fights.
          Look away while the other one chooses.
        </p>
      )}
      <ArenaPicker />
      <div className="choose-row" role="radiogroup" aria-label="View">
        <button role="radio" aria-checked={view === '2d'} className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>
          2D
        </button>
        <button role="radio" aria-checked={view === '3d'} className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>
          3D
        </button>
        <kbd title="V toggles">V</kbd>
      </div>

      <button className="go big" onClick={start} autoFocus>
        Start <kbd>Enter</kbd>
      </button>
      {mode === 'solo' && <Record />}
      <div className="keymap" aria-label="Keys">
        {mode === 'solo' ? <KeyGrid side="player" /> : (
          <>
            <KeyGrid side="player" label="James" />
            <KeyGrid side="enemy" label="Amy" />
          </>
        )}
      </div>
      <p className="keys">
        Tap {mode === 'solo' ? 'James' : 'yourself'} to guard a zone and {mode === 'solo' ? 'Amy' : 'the other fighter'} to strike one, choose ✊ or 🦶, then ▶ (or{' '}
        <kbd>Enter</kbd>) · <kbd>M</kbd> mute
      </p>
    </div>
  )
}

export function End() {
  const { match, mode, start, toTitle } = useGame()
  const fresh = useBest((s) => s.fresh)
  const n = NAMES[mode]
  const duo = mode === 'duo'
  const title = duo ? `${match.status === 'won' ? n.player : n.enemy} wins` : match.status === 'won' ? 'Victory' : 'Defeat'
  const winnerHp = match.status === 'won' ? match.hp.player : match.hp.enemy
  const text = duo
    ? `${match.status === 'won' ? n.player : n.enemy} won in ${match.round} rounds with ${winnerHp} health left.`
    : match.status === 'won'
      ? `You won in ${match.round} rounds with ${match.hp.player} health left.`
      : `You went down in round ${match.round}. The enemy had ${match.hp.enemy} health left.`
  const cls = duo || match.status === 'won' ? 'won' : 'lost'
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
