import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'
import { arenaUrl, NO_ARENA, pickArena, useArenas } from '../state/arenas'
import { END_ITEMS, PAUSE_ITEMS, SETUP_ITEMS, useGame } from '../state/game'
import { MENU, MENU_INFO, useMenu } from '../state/menu'
import { difficultyAt } from '../state/tournament'
import { usePortrait } from './usePortrait'
import { columnsFor, fighterOf, isUnlocked, slotFighter, SLOTS } from '../state/roster'
import { useBest } from '../state/best'
import { useSettings } from '../state/settings'
import { buttonKey, superKey, zoneKey } from '../input'
import { DIFFICULTIES, type Side } from '../sim'
import { useNames } from './names'

function Record() {
  const { t } = useTranslation()
  const { wins, losses, fastest, healthiest } = useBest()
  if (wins + losses === 0) return null
  return (
    <p className="record">
      {t('record.text', { wins, losses })}
      {fastest !== null && t('record.fastest', { count: fastest })}
      {healthiest > 0 && t('record.healthiest', { count: healthiest })}
    </p>
  )
}

/**
 * The arena to fight in: a thumbnail for every picture, and the plain dark arena, in one row that scrolls sideways (swipe, wheel or
 * the arrows) instead of wrapping, so the window keeps its shape. The chosen one is kept in view. Nothing shows if there are no pictures.
 */
function ArenaPicker() {
  const { t } = useTranslation()
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
      <button className="nudge" aria-label={t('setup.scrollLeft')} onClick={() => by(-1)}>
        ‹
      </button>
      <div className="arenas" role="radiogroup" aria-label={t('setup.arena')} ref={row}>
        {list.map((a) => (
          <button key={a.id} role="radio" aria-checked={current === a.id} className={`arena-opt${current === a.id ? ' on' : ''}`} onClick={() => setArena(a.id)}>
            <img src={arenaUrl(a.thumb)} alt="" draggable={false} />
            <span>{a.name}</span>
          </button>
        ))}
        <button role="radio" aria-checked={current === NO_ARENA} className={`arena-opt${current === NO_ARENA ? ' on' : ''}`} onClick={() => setArena(NO_ARENA)}>
          <i className="plain" />
          <span>{t('setup.plain')}</span>
        </button>
      </div>
      <button className="nudge" aria-label={t('setup.scrollRight')} onClick={() => by(1)}>
        ›
      </button>
      <kbd title={t('keys.nextArena')}>B</kbd>
    </div>
  )
}

/** The nine keys of a player, drawn like the screen: the guard figure, the three buttons, the strike figure. */
function KeyGrid({ side, label }: { side: Side; label?: string }) {
  const { t } = useTranslation()
  const rows = [['head', 'punch', '✊'], ['body', 'kick', '🦶'], ['legs', 'fight', '▶']] as const
  return (
    <div className="kgrid">
      {label && <b className={`kname ${side}`}>{label}</b>}
      <span className="kh guard">{t('keymap.guard')}</span>
      <span />
      <span className="kh strike">{t('keymap.strike')}</span>
      <span />
      {rows.map(([zone, button, icon]) => (
        <div key={zone} className="krow">
          <kbd title={t('keymap.guardZone', { zone: t(`zone.${zone}`) })}>{zoneKey(side, 'guard', zone)}</kbd>
          <span className="kmid">
            <i aria-hidden="true">{icon}</i>
            <kbd>{buttonKey(side, button)}</kbd>
          </span>
          <kbd title={t('keymap.strikeZone', { zone: t(`zone.${zone}`) })}>{zoneKey(side, 'strike', zone)}</kbd>
          <span className="kz">{t(`zone.${zone}`)}</span>
        </div>
      ))}
      <div className="krow ksuper">
        <span />
        <span className="kmid">
          <i aria-hidden="true">✦</i>
          <kbd>{superKey(side)}</kbd>
        </span>
        <span />
        <span className="kz">{t('keymap.super')}</span>
      </div>
    </div>
  )
}

/** The main menu: a list, the cursor on one item (arrows and Enter, or the pointer). */
export function Menu() {
  const { t } = useTranslation()
  const { cursor, soon, point, choose } = useMenu()
  return (
    <div className="screen menu" role="dialog" aria-label={t('menu.aria')}>
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
              {t(`menu.${item}.label`)}
              {MENU_INFO[item].soon && <small>{t('menu.soon')}</small>}
            </button>
          </li>
        ))}
      </ul>
      {/* every description (and every "coming soon") sits in the same cell, so the cell is as tall as the longest one and the window does not jump */}
      <div className="blurbs">
        {MENU.map((item) => (
          <p key={item} className="blurb" aria-hidden={cursor !== item || soon === item} style={{ visibility: cursor === item && soon !== item ? 'visible' : 'hidden' }}>
            {t(`menu.${item}.blurb`)}
          </p>
        ))}
        {MENU.filter((item) => MENU_INFO[item].soon).map((item) => (
          <p key={`${item}-soon`} className="blurb" aria-hidden={soon !== item} style={{ visibility: soon === item ? 'visible' : 'hidden' }}>
            {t('menu.comingSoon', { label: t(`menu.${item}.label`) })}
          </p>
        ))}
      </div>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>M</kbd> {t('keys.mute')}
      </p>
    </div>
  )
}

/** The options: for now the language. A list like the menus (arrows and Enter, or the pointer); a language takes effect at once. */
export function Options() {
  const { t } = useTranslation()
  const { optionsCursor, pointOptions, chooseOptions } = useGame()
  const current = useSettings((s) => s.language)
  return (
    <div className="screen menu" role="dialog" aria-label={t('options.title')}>
      <h1>{t('options.title')}</h1>
      <h2>{t('options.language')}</h2>
      <ul role="menu" className="items">
        {LANGUAGES.map((l, i) => (
          <li key={l.id} role="none">
            <button
              role="menuitemradio"
              aria-checked={current === l.id}
              className={`item${optionsCursor === i ? ' on' : ''}${current === l.id ? ' current' : ''}`}
              onMouseEnter={() => pointOptions(i)}
              onFocus={() => pointOptions(i)}
              onClick={() => chooseOptions(i)}
              lang={l.id}
            >
              {l.name}
              {current === l.id && <small>✓</small>}
            </button>
          </li>
        ))}
        <li role="none">
          <button
            role="menuitem"
            className={`item${optionsCursor === LANGUAGES.length ? ' on' : ''}`}
            onMouseEnter={() => pointOptions(LANGUAGES.length)}
            onFocus={() => pointOptions(LANGUAGES.length)}
            onClick={() => chooseOptions(LANGUAGES.length)}
          >
            {t('common.back')}
          </button>
        </li>
      </ul>
      <p className="blurb">{t('options.languageBlurb')}</p>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>Esc</kbd> {t('keys.back')}
      </p>
    </div>
  )
}

/** What the game is and how it is played. */
export function About() {
  const { t } = useTranslation()
  const toMenu = useGame((s) => s.toMenu)
  const b = { b: <b /> }
  return (
    <div className="screen" role="dialog" aria-label={t('about.title')}>
      <h1>{t('about.title')}</h1>
      <p>
        <Trans i18nKey="about.intro" components={b} />
      </p>
      <ul className="rules">
        <li>
          <Trans i18nKey="about.rule1" components={b} />
        </li>
        <li>{t('about.rule2')}</li>
        <li>{t('about.rule3')}</li>
        <li>
          <Trans i18nKey="about.rule4" components={b} />
        </li>
      </ul>

      <h2>{t('about.controlsTitle')}</h2>
      <p>
        <Trans i18nKey="about.controls" components={b} />
      </p>
      <div className="keymap" aria-label="Keys">
        <KeyGrid side="player" label={t('keymap.player1')} />
        <KeyGrid side="enemy" label={t('keymap.player2vs')} />
      </div>
      <p className="keys">
        <Trans i18nKey="keymap.footer" components={{ kbd: <kbd /> }} />
      </p>
      <ul role="menu" className="items">
        <li role="none">
          <button role="menuitem" className="item on" onClick={toMenu}>
            {t('common.back')}
          </button>
        </li>
      </ul>
    </div>
  )
}

/** One tile of the selection screen: a fighter's face (or a "?" for one that is not there yet, or not unlocked). */
function Tile({ slot, tag }: { slot: number; tag: '1P' | '2P' | null }) {
  const { t } = useTranslation()
  const { selectCursor, selectFor, fighters, pointSelect, chooseSelect } = useGame()
  const f = slotFighter(slot)
  const open = f !== null && isUnlocked(f)
  const taken = open && selectFor === 'enemy' && fighters.player === f.id
  const [broken, setBroken] = useState(false) // no portrait made: the first letter stands in
  return (
    <button
      role="option"
      aria-selected={selectCursor === slot}
      aria-label={open ? f.name : t('select.locked')}
      aria-disabled={!open || taken}
      className={`tile${selectCursor === slot ? ' on' : ''}${open ? '' : ' locked'}${taken ? ' taken' : ''}`}
      onMouseEnter={() => pointSelect(slot)}
      onFocus={() => pointSelect(slot)}
      onClick={() => chooseSelect(slot)}
    >
      {open ? (
        broken ? (
          <b className="letter">{f.name[0]}</b>
        ) : (
          <img src={`${import.meta.env.BASE_URL}${f.portrait}`} alt="" draggable={false} onError={() => setBroken(true)} />
        )
      ) : (
        <b className="qm">?</b>
      )}
      {tag && <em className={`tag ${tag === '1P' ? 'player' : 'enemy'}`}>{tag}</em>}
    </button>
  )
}

/** A fighter's face (the avatar of the tile), or its first letter when there is no picture. */
function Face({ id }: { id: Parameters<typeof fighterOf>[0] }) {
  const f = fighterOf(id)
  const [broken, setBroken] = useState(false)
  return broken ? <b className="letter">{f.name[0]}</b> : <img src={`${import.meta.env.BASE_URL}${f.portrait}`} alt="" draggable={false} onError={() => setBroken(true)} />
}

/**
 * The timings of the ladder screen (they match the animation `ladderTour` in index.css). At the start of a tournament the ladder is
 * shown enlarged and scrolls from the hardest opponent at the bottom up to the easiest at the top, then zooms out (LADDER_TOUR_MS);
 * then the first opponent is lit for LADDER_SHOW_MS before the fight. After a win the highlight rests on the opponent just beaten for
 * LADDER_REST_MS, moves to the next one, which is shown for LADDER_NEXT_MS before the fight.
 */
export const LADDER_TOUR_MS = 5000
export const LADDER_SHOW_MS = 2400
export const LADDER_REST_MS = 1400
export const LADDER_NEXT_MS = 2800

/**
 * The opponents of the tournament, in the order they will be fought: the ones beaten are ticked, the next one is lit. At the start the
 * first is lit; after a win the highlight moves from the one just beaten to the next, and only then does the fight begin (Enter skips).
 */
export function Ladder() {
  const { t } = useTranslation()
  const { tournament, ladderFrom, startFromLadder } = useGame()
  // nobody is lit during the tour at the start; after a win the one just beaten is the highlight, until it moves on
  const touring = ladderFrom === null
  const [shown, setShown] = useState(touring ? -1 : ladderFrom)
  useEffect(() => {
    if (!tournament) return
    const lit = touring ? LADDER_TOUR_MS : LADDER_REST_MS // when the highlight arrives on the opponent of this stage
    const timers = [setTimeout(() => setShown(tournament.stage), lit), setTimeout(startFromLadder, lit + (touring ? LADDER_SHOW_MS : LADDER_NEXT_MS))]
    return () => timers.forEach(clearTimeout)
  }, [tournament, touring, startFromLadder])
  if (!tournament) return null
  const hero = fighterOf(tournament.hero)
  return (
    <div className="screen ladder" role="dialog" aria-label={t('ladder.aria')}>
      <h1>{t('ladder.title')}</h1>
      <p className="blurb who">{t('ladder.vs', { name: hero.name })}</p>
      <div className="rungs-view">
      <ol className={`rungs${touring ? ' tour' : ''}`}>
        {tournament.ladder.map((id, i) => {
          const f = fighterOf(id)
          const state = i < shown ? 'beaten' : i === shown ? 'now' : 'next'
          return (
            <li key={id} className={`rung ${state}`} aria-current={state === 'now'}>
              <span className="n">{i + 1}</span>
              <span className="face">
                <Face id={id} />
              </span>
              <span className="nm">{f.name}</span>
              <span className="lv">{t(`difficulty.${difficultyAt(i, tournament.ladder.length)}`)}</span>
              {state === 'beaten' && <span className="tick">✓</span>}
            </li>
          )
        })}
      </ol>
      </div>
      <p className="keys">
        <kbd>Enter</kbd> {t('keys.fightNow')} · <kbd>Esc</kbd> {t('keys.menu')}
      </p>
    </div>
  )
}

/** Choosing the fighter, like in an old fighting game: a grid of faces, the ones not unlocked yet are "?". */
export function Select() {
  const { t } = useTranslation()
  const { mode, selectCursor, selectFor, fighters, pointSelect, chooseSelect, setSelectColumns } = useGame()
  const columns = columnsFor(usePortrait())
  useEffect(() => setSelectColumns(columns), [columns, setSelectColumns]) // the keys move over the tiles as they are laid out
  const f = slotFighter(selectCursor)
  const who = mode === 'solo' ? t('select.you') : selectFor === 'player' ? t('select.player1') : t('select.player2')
  return (
    <div className="screen select" role="dialog" aria-label={t('select.title')}>
      <h1>{t('select.title')}</h1>
      <p className={`blurb who ${mode === 'duo' ? (selectFor === 'player' ? 'player' : 'enemy') : ''}`}>{who}</p>
      <div className="roster" role="listbox" aria-label={t('select.fighters')} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: SLOTS }, (_, slot) => {
          const o = slotFighter(slot)
          const tag = mode === 'duo' && selectFor === 'enemy' && o?.id === fighters.player ? '1P' : null
          return <Tile key={slot} slot={slot} tag={tag} />
        })}
      </div>
      <p className="pick-name">{f && isUnlocked(f) ? f.name : t('select.unknown')}</p>
      <ul role="menu" className="items">
        <li role="none">
          <button
            role="menuitem"
            className={`item${selectCursor === SLOTS ? ' on' : ''}`}
            onMouseEnter={() => pointSelect(SLOTS)}
            onFocus={() => pointSelect(SLOTS)}
            onClick={() => chooseSelect(SLOTS)}
          >
            {t('common.back')}
          </button>
        </li>
      </ul>
      <p className="keys">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>Esc</kbd> {t('keys.back')}
      </p>
    </div>
  )
}

/** The setup of a game: the mode was chosen in the menu (arcade or versus); here the difficulty, the arena and the view. */
export function Setup() {
  const { t } = useTranslation()
  const { setupItem, pointSetup, chooseSetup, inTournament } = useGame()
  const { difficulty, mode, view, setDifficulty, setView } = useSettings()
  const kind = inTournament ? 'tournament' : mode === 'solo' ? 'arcade' : 'versus'
  return (
    <div className="screen" role="dialog" aria-label={t(`menu.${kind}.label`)}>
      <h1>{t(`menu.${kind}.label`)}</h1>
      {inTournament ? (
        <p className="blurb">{t('setup.tournament')}</p>
      ) : mode === 'solo' ? (
        <>
          <div className="choose-row" role="radiogroup" aria-label={t('difficulty.label')}>
            {DIFFICULTIES.map((d, i) => (
              <button key={d} role="radio" aria-checked={difficulty === d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>
                {t(`difficulty.${d}`)} <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          <p className="blurb">{t(`difficulty.${difficulty}Blurb`)}</p>
        </>
      ) : (
        <p className="blurb">{t('setup.versus')}</p>
      )}
      <ArenaPicker />
      <div className="choose-row" role="radiogroup" aria-label={t('setup.view')}>
        <button role="radio" aria-checked={view === '2d'} className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>
          2D
        </button>
        <button role="radio" aria-checked={view === '3d'} className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>
          3D
        </button>
        <kbd title={t('keys.toggleView')}>V</kbd>
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
              {item === 'select' ? t('setup.selectFighter') : t('common.back')}
            </button>
          </li>
        ))}
      </ul>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>Esc</kbd> {t('keys.back')}
      </p>
      {mode === 'solo' && <Record />}
    </div>
  )
}

/** The pause window: over the fight, which cannot be touched meanwhile. A list like the main menu (arrows and Enter, or the pointer). */
export function Pause() {
  const { t } = useTranslation()
  const { pauseItem, pointPause, choosePause, pauseControls, closeControls, mode } = useGame()
  if (pauseControls) {
    return (
      <>
        <div className="scrim" aria-hidden="true" />
        <div className="screen" role="dialog" aria-label={t('keymap.title')}>
          <h1>{t('keymap.title')}</h1>
          <div className="keymap" aria-label="Keys">
            {mode === 'duo' ? (
              <>
                <KeyGrid side="player" label={t('keymap.player1')} />
                <KeyGrid side="enemy" label={t('keymap.player2')} />
              </>
            ) : (
              <KeyGrid side="player" />
            )}
          </div>
          <p className="keys">
            <Trans i18nKey="keymap.footer" components={{ kbd: <kbd /> }} />
          </p>
          <ul role="menu" className="items">
            <li role="none">
              <button role="menuitem" className="item on" onClick={closeControls} autoFocus>
                {t('common.back')}
              </button>
            </li>
          </ul>
        </div>
      </>
    )
  }
  return (
    <>
      <div className="scrim" aria-hidden="true" />
      <div className="screen menu" role="dialog" aria-label={t('pause.title')}>
        <h1>{t('pause.title')}</h1>
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
                {t(`pause.${item}`)}
              </button>
            </li>
          ))}
        </ul>
        <p className="keys">
          <kbd>↑</kbd> <kbd>↓</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>Esc</kbd> {t('keys.continue')}
        </p>
      </div>
    </>
  )
}

export function End() {
  const { t } = useTranslation()
  const { match, mode, endItem, pointEnd, chooseEnd, tournament } = useGame()
  const fresh = useBest((s) => s.fresh)
  const n = useNames()
  const duo = mode === 'duo'
  const won = match.status === 'won'
  const last = tournament !== null && tournament.stage + 1 >= tournament.ladder.length
  const champion = tournament !== null && won && last
  const title = champion ? t('end.champion') : duo ? t('end.wins', { name: won ? n.player : n.enemy }) : won ? t('end.victory') : t('end.defeat')
  const winnerHp = won ? match.hp.player : match.hp.enemy
  const text = duo
    ? t('end.textDuo', { name: won ? n.player : n.enemy, count: match.round, hp: winnerHp })
    : won
      ? t('end.textWon', { count: match.round, hp: match.hp.player })
      : t('end.textLost', { round: match.round, hp: match.hp.enemy })
  const cls = duo || won ? 'won' : 'lost'
  const unlockedName = tournament?.unlocked ? fighterOf(tournament.unlocked).name : null
  const nextName = tournament && won && !last ? fighterOf(tournament.ladder[tournament.stage + 1]!).name : null
  const again = tournament ? (!won ? t('end.retry') : last ? t('end.newTournament') : t('end.next', { name: nextName })) : duo ? t('end.rematch') : t('end.again')
  return (
    <div className={`screen end ${cls}`} role="dialog" aria-label={title}>
      <h1>{title}</h1>
      <p>{text}</p>
      {tournament && (
        <p className="blurb">
          {champion ? t('end.allBeaten', { total: tournament.ladder.length }) : t('end.stage', { n: tournament.stage + 1, total: tournament.ladder.length })}
        </p>
      )}
      {unlockedName && <p className="newbest">{t('end.unlocked', { name: unlockedName })}</p>}
      {!duo && !tournament && fresh && <p className="newbest">{t('end.newBest')}</p>}
      <ul role="menu" className="items">
        {END_ITEMS.map((item) => (
          <li key={item} role="none">
            <button
              role="menuitem"
              className={`item${endItem === item ? ' on' : ''}`}
              onMouseEnter={() => pointEnd(item)}
              onFocus={() => pointEnd(item)}
              onClick={() => chooseEnd(item)}
            >
              {item === 'again' ? again : t('end.backMenu')}
            </button>
          </li>
        ))}
      </ul>
      <p className="keys">
        <kbd>↑</kbd> <kbd>↓</kbd> {t('keys.choose')} · <kbd>Enter</kbd> {t('keys.confirm')} · <kbd>Esc</kbd> {t('keys.menu')}
      </p>
      {!duo && !tournament && <Record />}
    </div>
  )
}
