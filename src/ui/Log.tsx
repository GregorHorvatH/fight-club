import { useGame } from '../state/game'
import { NAMES } from './names'
import type { RoundResult, Side, Strike } from '../sim'

const ICON = { hand: '✊', foot: '🦶' } as const

function describe(who: string, s: Strike): string {
  const what = `${who} ${ICON[s.weapon]} ${s.zone}`
  if (s.blocked) return `${what}: blocked${s.recoil ? ` (stumble -${s.recoil})` : ''}`
  return `${what}: ${s.damage}${s.crit ? ' CRIT' : ''}`
}

function Row({ r, mode }: { r: RoundResult; mode: 'solo' | 'duo' }) {
  const cls = (s: Side) => (r.strikes[s].blocked ? 'miss' : r.strikes[s].crit ? 'crit' : 'hit')
  const n = NAMES[mode]
  return (
    <li>
      <b>R{r.round}</b>
      <span className={cls('player')}>{describe(`${n.player} →`, r.strikes.player)}</span>
      <span className={cls('enemy')}>{describe(`${n.enemy} →`, r.strikes.enemy)}</span>
    </li>
  )
}

export function Log() {
  const log = useGame((s) => s.match.log)
  const mode = useGame((s) => s.mode)
  if (log.length === 0)
    return (
      <p className="hint">
        Pick a zone to strike (with a hand or a foot) and a zone to guard. If you guess where the enemy strikes, you take nothing.
      </p>
    )
  return (
    <ol className="log" aria-label="Fight log">
      {log
        .slice(-5)
        .reverse()
        .map((r) => (
          <Row key={r.round} r={r} mode={mode} />
        ))}
    </ol>
  )
}
