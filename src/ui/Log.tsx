import { turnOf, useGame } from '../state/game'
import { NAMES } from './names'
import type { RoundResult, Side, Strike } from '../sim'

const ICON = { hand: '✊', foot: '🦶' } as const

/** What one strike did: "✊ head: 12", "🦶 legs: blocked (stumble -7)". */
function describe(s: Strike): string {
  const what = `${ICON[s.weapon]} ${s.zone}`
  if (s.blocked) return `${what}: blocked${s.recoil ? ` (stumble -${s.recoil})` : ''}`
  return `${what}: ${s.damage}${s.crit ? ' CRIT' : ''}`
}

function Row({ r, side, opacity }: { r: RoundResult; side: Side; opacity?: number }) {
  const s = r.strikes[side]
  return (
    <li style={opacity === undefined ? undefined : { opacity }}>
      <b>R{r.round}</b>
      <span className={s.blocked ? 'miss' : s.crit ? 'crit' : 'hit'}>{describe(s)}</span>
    </li>
  )
}

/** How visible the newest rows of the log on the field are: the older a row, the fainter, and the fourth is gone. */
const FADE = [1, 0.55, 0.28, 0]

/** The same list, on the field behind the fighters (alone against the enemy): the last three strikes, the older ones fading away. */
export function LogOverlay({ side }: { side: Side }) {
  const log = useGame((s) => s.match.log)
  const mode = useGame((s) => s.mode)
  return (
    <section className={`olog ${side}`} aria-label={`${NAMES[mode][side]}'s strikes`}>
      <ol>
        {log
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
 * The hint under the fighters. Alone: how to choose, until the first round has been played. Between two people: whose turn it is
 * and what they do, every time (the other one is asked to look away).
 */
export function Hint() {
  const empty = useGame((s) => s.match.log.length === 0)
  const mode = useGame((s) => s.mode)
  const turn = useGame((s) => turnOf(s.choice, s.mode))
  if (mode === 'duo') {
    const me = NAMES.duo[turn]
    const other = NAMES.duo[turn === 'player' ? 'enemy' : 'player']
    return (
      <p className={`hint turn ${turn}`}>
        <b>{me}</b>, tap yourself to guard and {other} to strike, then {turn === 'player' ? 'lock in' : 'fight'}. <b>{other}</b>, look away!
      </p>
    )
  }
  if (!empty) return null
  return (
    <p className="hint">
      Tap James to guard a zone and Amy to strike one, with a punch or a kick. If the enemy strikes the zone you guard, you take nothing.
    </p>
  )
}
