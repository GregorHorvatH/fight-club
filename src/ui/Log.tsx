import { useEffect, useState } from 'react'
import { turnOf, useGame } from '../state/game'
import { useNames } from './names'
import type { TFunction } from 'i18next'
import { Trans, useTranslation } from 'react-i18next'
import { landed, type RoundResult, type Side, type Strike, type Zone } from '../sim'
import { timelineOf } from '../timing'
import { useLanded } from './reveal'
import { IDLE_MS, idleHint, stepOf } from './steps'

const ICON = { hand: '✊', foot: '🦶', super: '✦' } as const

/** What one strike did: "✊ head: 12", "🦶 legs: blocked (stumble -7)", "✦ head: 14 + body: blocked". */
function describe(s: Strike, t: TFunction): string {
  const part = (zone: Zone, blocked: boolean, damage: number, crit: boolean): string => `${t(`zone.${zone}`)}: ${blocked ? t('log.blocked') : `${damage}${crit ? ` ${t('log.crit')}` : ''}`}`
  const first = part(s.zone, s.blocked, s.damage, s.crit)
  if (s.extra) return `${ICON.super} ${first} + ${part(s.extra.zone, s.extra.blocked, s.extra.damage, s.crit)}`
  return `${ICON[s.weapon]} ${first}${s.blocked && s.recoil ? ` ${t('log.stumble', { n: s.recoil })}` : ''}`
}

function Row({ r, side, opacity }: { r: RoundResult; side: Side; opacity?: number }) {
  const { t } = useTranslation()
  const s = r.strikes[side]!
  return (
    <li style={opacity === undefined ? undefined : { opacity }}>
      <b>{t('log.round', { n: r.round })}</b>
      <span className={!landed(s) ? 'miss' : s.crit ? 'crit' : 'hit'}>{describe(s, t)}</span>
    </li>
  )
}

/** How visible the newest rows of the log on the field are: the older a row, the fainter, and a third is gone. */
const FADE = [1, 0.5]

/** The same list, on the field behind the fighters (alone against the enemy): the last two strikes, the older one fading. */
export function LogOverlay({ side }: { side: Side }) {
  const { t } = useTranslation()
  const log = useGame((s) => s.match.log)
  const replaying = useGame((s) => s.phase === 'reveal')
  const names = useNames()
  const landed = useLanded()
  // a fighter's row of the round being replayed shows up when its blow lands (and it has no row when the strike was never thrown)
  const rows = log.filter((r, i) => {
    if (!r.strikes[side]) return false
    if (!replaying || i !== log.length - 1) return true
    return landed >= timelineOf(r).order.indexOf(side) + 1
  })
  return (
    <section className={`olog ${side}`} aria-label={t('log.aria', { name: names[side] })}>
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
  const { t } = useTranslation()
  const empty = useGame((s) => s.match.log.length === 0)
  const mode = useGame((s) => s.mode)
  const phase = useGame((s) => s.phase)
  const turn = useGame((s) => turnOf(s.choice, s.mode))
  const c = useGame((s) => s.choice[turnOf(s.choice, s.mode)])
  const matchId = useGame((s) => s.matchId)
  const round = useGame((s) => s.match.round)
  const idle = useIdle(`${matchId}/${round}/${phase}/${turn}/${c.attack}/${c.attack2}/${c.block}/${c.weapon}/${c.locked}`)
  const step = stepOf(c)
  const names = useNames()
  const me = names[turn]
  const other = names[turn === 'player' ? 'enemy' : 'player']
  if (phase === 'menu' || phase === 'about' || phase === 'options' || phase === 'setup' || phase === 'select' || phase === 'ladder' || phase === 'leave') return null // no fight yet: nothing to explain
  const missing = phase === 'choose' && idle && (step === 'guard' || step === 'strike' || step === 'strike2' || step === 'both') ? idleHint(step, mode === 'duo' ? t('idle.yourself') : me, other, t) : ''
  if (mode === 'duo') {
    const how = missing ? `${missing.charAt(0).toLowerCase()}${missing.slice(1)}` : t('hint.duoHow', { other, action: turn === 'player' ? t('hint.lockIn') : t('hint.fight') })
    return (
      <p className={`hint turn ${turn}`}>
        <Trans i18nKey="hint.duo" values={{ me, other, how }} components={{ b: <b /> }} />
      </p>
    )
  }
  if (empty) return <p className="hint">{t('hint.first', { me: names.player, other: names.enemy })}</p>
  return missing ? <p className="hint nudge">{missing}</p> : null
}
