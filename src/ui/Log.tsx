import { useEffect, useState } from 'react'
import { turnOf, useGame } from '../state/game'
import { NAMES } from './names'
import type { RoundResult, Side, Strike } from '../sim'
import { timelineOf } from '../timing'
import { useLanded } from './reveal'
import { IDLE_MS, idleHint, stepOf } from './steps'

const ICON = { hand: '✊', foot: '🦶' } as const

/** What one strike did: "✊ head: 12", "🦶 legs: blocked (stumble -7)". */
function describe(s: Strike): string {
  const what = `${ICON[s.weapon]} ${s.zone}`
  if (s.blocked) return `${what}: blocked${s.recoil ? ` (stumble -${s.recoil})` : ''}`
  return `${what}: ${s.damage}${s.crit ? ' CRIT' : ''}`
}

function Row({ r, side, opacity }: { r: RoundResult; side: Side; opacity?: number }) {
  const s = r.strikes[side]!
  return (
    <li style={opacity === undefined ? undefined : { opacity }}>
      <b>R{r.round}</b>
      <span className={s.blocked ? 'miss' : s.crit ? 'crit' : 'hit'}>{describe(s)}</span>
    </li>
  )
}

/** How visible the newest rows of the log on the field are: the older a row, the fainter, and a third is gone. */
const FADE = [1, 0.5]

/** The same list, on the field behind the fighters (alone against the enemy): the last two strikes, the older one fading. */
export function LogOverlay({ side }: { side: Side }) {
  const log = useGame((s) => s.match.log)
  const replaying = useGame((s) => s.phase === 'reveal')
  const mode = useGame((s) => s.mode)
  const landed = useLanded()
  // a fighter's row of the round being replayed shows up when its blow lands (and it has no row when the strike was never thrown)
  const rows = log.filter((r, i) => {
    if (!r.strikes[side]) return false
    if (!replaying || i !== log.length - 1) return true
    return landed >= timelineOf(r).order.indexOf(side) + 1
  })
  return (
    <section className={`olog ${side}`} aria-label={`${NAMES[mode][side]}'s strikes`}>
      <ol>
        {rows
          .slice(-FADE.length)
          .reverse()
          .map((r, i) => (
            <Row key={r.round} r={r} side={side} opacity={FADE[i]} />
          ))}
      </ol>
    </section>
  )
}

/**
 * Is the player who is choosing doing nothing? True when `key` (what they have picked, and whose turn it is) has not changed for
 * IDLE_MS. Any pick starts the count again. The timer only ever sets state when it fires.
 */
function useIdle(key: string): boolean {
  const [idleFor, setIdleFor] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setIdleFor(key), IDLE_MS)
    return () => clearTimeout(t)
  }, [key])
  return idleFor === key
}

/**
 * The hint under the health bars. Alone: how to choose, until the first round has been played; after that only when the player has
 * not chosen for a while (they may have forgotten what to do), saying what is still missing. Between two people: whose turn it is and
 * what they do, every time (the other one is asked to look away), and what is still missing once they have been idle.
 */
export function Hint() {
  const empty = useGame((s) => s.match.log.length === 0)
  const mode = useGame((s) => s.mode)
  const phase = useGame((s) => s.phase)
  const turn = useGame((s) => turnOf(s.choice, s.mode))
  const c = useGame((s) => s.choice[turnOf(s.choice, s.mode)])
  const matchId = useGame((s) => s.matchId)
  const round = useGame((s) => s.match.round)
  const idle = useIdle(`${matchId}/${round}/${phase}/${turn}/${c.attack}/${c.block}/${c.weapon}/${c.locked}`)
  const step = stepOf(c)
  const names = NAMES[mode]
  const me = names[turn]
  const other = names[turn === 'player' ? 'enemy' : 'player']
  const missing = phase === 'choose' && idle && (step === 'guard' || step === 'strike' || step === 'both') ? idleHint(step, mode === 'duo' ? 'yourself' : me, other) : ''
  if (mode === 'duo') {
    return (
      <p className={`hint turn ${turn}`}>
        <b>{me}</b>, {missing ? `${missing.charAt(0).toLowerCase()}${missing.slice(1)}` : `tap yourself to guard and ${other} to strike, then ${turn === 'player' ? 'lock in' : 'fight'}`}.{' '}
        <b>{other}</b>, look away!
      </p>
    )
  }
  if (empty)
    return (
      <p className="hint">
        Tap James to guard a zone and Amy to strike one, with a punch (fast) or a kick (slow, hits harder). If the enemy strikes the zone you guard, you take nothing.
      </p>
    )
  return missing ? <p className="hint nudge">{missing}</p> : null
}
