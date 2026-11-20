import { useEffect, useRef } from 'react'
import { arenaUrl, NO_ARENA, pickArena, useArenas } from '../state/arenas'
import { PAUSE_ITEMS, SETUP_ITEMS, useGame, type PauseItem } from '../state/game'
import { MENU, MENU_INFO, useMenu } from '../state/menu'
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

/**
 * The arena to fight in: a thumbnail for every picture, and the plain dark arena, in one row that scrolls sideways (swipe, wheel or
 * the arrows) instead of wrapping, so the window keeps its shape. The chosen one is kept in view. Nothing shows if there are no pictures.
 */
function ArenaPicker() {
  const list = useArenas((s) => s.list)
  const choice = useSettings((s) => s.arena)
  const setArena = useSettings((s) => s.setArena)
  const row = useRef<HTMLDivElement>(null)
  const current = pickArena(list, choice)?.id ?? NO_ARENA
  useEffect(() => {
    const r = row.current
    const on = r?.querySelector<HTMLElement>('.arena-opt.on')
    if (!r || !on) return
    // centre the chosen one by moving the row itself (scrollIntoView would also scroll the window)
    r.scrollTo({ left: on.offsetLeft - (r.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' })
  }, [current, list.length])
  if (list.length === 0) return null
  const by = (dir: number) => row.current?.scrollBy({ left: dir * 190, behavior: 'smooth' })
  return (
    <div className="arena-row">
      <button className="nudge" aria-label="Scroll the arenas left" onClick={() => by(-1)}>
        ‹
      </button>
      <div className="arenas" role="radiogroup" aria-label="Arena" ref={row}>
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
      </div>
      <button className="nudge" aria-label="Scroll the arenas right" onClick={() => by(1)}>
        ›
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

/** The main menu: a list, the cursor on one item (arrows and Enter, or the pointer). */
export function Menu() {
  const { cursor, soon, point, choose } = useMenu()
  return (
    <div className="screen menu" role="dialog" aria-label="Main menu">
      <h1>Fight Club</h1>
      <ul role="menu" className="items">
        {MENU.map((item) => (
          <li key={item} role="none">
            <button
              role="menuitem"
              className={`item${cursor === item ? ' on' : ''}${MENU_INFO[item].soon ? ' soon' : ''}`}
              onMouseEnter={() => point(item)}
              onFocus={() => point(item)}
              onClick={() => choose(item)}
              autoFocus={item === 'arcade'}
            >
              {MENU_INFO[item].label}
              {MENU_INFO[item].soon && <small>soon</small>}
            </button>
          </li>
        ))}
      </ul>
      {/* every description (and every "coming soon") sits in the same cell, so the cell is as tall as the longest one and the window does not jump */}
      <div className="blurbs">
        {MENU.map((item) => (
          <p key={item} className="blurb" aria-hidden={cursor !== item || soon === item} style={{ visibility: cursor === item && soon !== item ? 'visible' : 'hidden' }}>
            {MENU_INFO[item].blurb}
          </p>
        ))}
        {MENU.filter((item) => MENU_INFO[item].soon).map((item) => (
          <p key={`${item}-soon`} className="blurb" aria-hidden={soon !== item} style={{ visibility: soon === item ? 'visible' : 'hidden' }}>
            {MENU_INFO[item].label} is coming soon.
          </p>
        ))}
      </div>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> confirm · <kbd>M</kbd> mute
      </p>
    </div>
  )
}

/** What the game is and how it is played. */
export function About() {
  const toMenu = useGame((s) => s.toMenu)
  return (
    <div className="screen" role="dialog" aria-label="About">
      <h1>About</h1>
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

      <h2>Controls</h2>
      <p>
        Tap <b>James</b> to guard a zone and <b>Amy</b> to strike one (between two people: yourself to guard, the other fighter to strike), choose ✊ or 🦶, then
        press ▶. On a keyboard the nine keys are laid out like the screen. In VS Mode the second player uses the right-hand keys, after the first has locked in.
      </p>
      <div className="keymap" aria-label="Keys">
        <KeyGrid side="player" label="James" />
        <KeyGrid side="enemy" label="Amy (VS Mode)" />
      </div>
      <p className="keys">
        <kbd>Enter</kbd> / <kbd>Space</kbd> confirm · <kbd>V</kbd> 2D / 3D · <kbd>M</kbd> mute · <kbd>Esc</kbd> back
      </p>
      <ul role="menu" className="items">
        <li role="none">
          <button role="menuitem" className="item on" onClick={toMenu}>
            Back
          </button>
        </li>
      </ul>
    </div>
  )
}

/** The setup of a game: the mode was chosen in the menu (arcade or versus); here the difficulty, the arena and the view. */
export function Setup() {
  const { setupItem, pointSetup, chooseSetup } = useGame()
  const { difficulty, mode, view, setDifficulty, setView } = useSettings()
  return (
    <div className="screen" role="dialog" aria-label={MENU_INFO[mode === 'solo' ? 'arcade' : 'versus'].label}>
      <h1>{MENU_INFO[mode === 'solo' ? 'arcade' : 'versus'].label}</h1>
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

      <ul role="menu" className="items">
        {SETUP_ITEMS.map((item) => (
          <li key={item} role="none">
            <button
              role="menuitem"
              className={`item${setupItem === item ? ' on' : ''}`}
              onMouseEnter={() => pointSetup(item)}
              onFocus={() => pointSetup(item)}
              onClick={() => chooseSetup(item)}
            >
              {item === 'start' ? 'Start' : 'Back'}
            </button>
          </li>
        ))}
      </ul>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> confirm · <kbd>Esc</kbd> back
      </p>
      {mode === 'solo' && <Record />}
    </div>
  )
}

/** The pause window: over the fight, which cannot be touched meanwhile. A list like the main menu (arrows and Enter, or the pointer). */
export function Pause() {
  const { pauseItem, pointPause, choosePause } = useGame()
  const label: Record<PauseItem, string> = { continue: 'Continue', reset: 'Reset' }
  return (
    <>
      <div className="scrim" aria-hidden="true" />
      <div className="screen menu" role="dialog" aria-label="Paused">
        <h1>Paused</h1>
        <ul role="menu" className="items">
          {PAUSE_ITEMS.map((item) => (
            <li key={item} role="none">
              <button
                role="menuitem"
                className={`item${pauseItem === item ? ' on' : ''}`}
                onMouseEnter={() => pointPause(item)}
                onFocus={() => pointPause(item)}
                onClick={() => choosePause(item)}
                autoFocus={item === 'continue'}
              >
                {label[item]}
              </button>
            </li>
          ))}
        </ul>
        <p className="keys">
          <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> confirm · <kbd>Esc</kbd> continue
        </p>
      </div>
    </>
  )
}

export function End() {
  const { match, mode, start, toMenu } = useGame()
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
      <button className="link" onClick={toMenu}>
        Back to the menu <kbd>Esc</kbd>
      </button>
      {!duo && <Record />}
    </div>
  )
}
