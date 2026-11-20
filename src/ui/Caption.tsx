import type { TFunction } from 'i18next'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { Initiative, RoundResult, Side } from '../sim'
import { useGame } from '../state/game'
import { BEAT, timelineOf } from '../timing'
import { fighterOf } from '../state/roster'
import { useNames } from './names'


/** Why the first fighter is first (said under the first caption). */
function reason(r: RoundResult, by: Initiative, name: string, t: TFunction): string {
  if (by === 'speed') {
    const w = r.moves[r.first].weapon
    return w === 'hand' ? t('caption.speedPunch', { name }) : w === 'foot' ? t('caption.speedKick', { name }) : ''
  }
  return by === 'health' ? t('caption.speedHealth', { name }) : t('caption.speedLuck', { name })
}

/**
 * While a round is replayed: a caption for each strike, at the top of the field, saying who strikes where with what and where the
 * other one is guarding, and why this one goes first. The result of the blow is the "-12" / "BLOCK" over the head.
 */
export function Captions() {
  const { t } = useTranslation()
  const last = useGame((s) => s.last)
  const phase = useGame((s) => s.phase)
  const replay = useGame((s) => s.replay)
  const names = useNames()
  const fighters = useGame((s) => s.fighters)
  if (phase !== 'reveal' || !last) return null
  const tl = timelineOf(last)
  return (
    <div className="captions" aria-live="polite" key={`${last.round}-${replay}`}>
      {tl.order.map((side: Side, i) => {
        const s = last.strikes[side]!
        const other: Side = side === 'player' ? 'enemy' : 'player'
        const why = i === 0 ? reason(last, last.firstBy, names[side], t) : ''
        return (
          <div key={side} className={`caption ${side}`} style={{ '--b': i * BEAT, '--d': BEAT } as CSSProperties}>
            <b>
              {s.weapon === 'super'
                ? t('caption.super', { name: names[side], style: fighterOf(fighters[side]).super.name.toUpperCase(), zone1: t(`zoneTo.${s.zone}`), zone2: t(`zoneTo.${s.extra!.zone}`) })
                : t(s.weapon === 'hand' ? 'caption.punch' : 'caption.kick', { name: names[side], zone: t(`zoneTo.${s.zone}`) })}
            </b>
            <span>{t('caption.guards', { name: names[other], zone: t(`zoneObj.${last.moves[other].block}`) })}</span>
            {why && <em>{why}</em>}
          </div>
        )
      })}
    </div>
  )
}
