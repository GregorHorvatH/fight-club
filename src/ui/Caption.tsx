import type { CSSProperties } from 'react'
import type { Initiative, RoundResult, Side, Weapon } from '../sim'
import { useGame } from '../state/game'
import { BEAT, timelineOf } from '../timing'
import { fighterOf } from '../state/roster'
import { useNames } from './names'

const ICON: Record<Weapon, string> = { hand: '✊', foot: '🦶', super: '✦' }
const VERB: Record<Exclude<Weapon, 'super'>, string> = { hand: 'punches', foot: 'kicks' }

/** Why the first fighter is first (said under the first caption). */
function reason(r: RoundResult, by: Initiative, name: string): string {
  if (by === 'speed') {
    const w = r.moves[r.first].weapon
    return w === 'hand' ? `${name}'s punch is faster than a kick` : w === 'foot' ? `${name}'s kick is faster than a super strike` : ''
  }
  if (by === 'health') return `same speed: the more wounded ${name} is quicker`
  return `same speed, same health: a coin toss, ${name} first`
}

/**
 * While a round is replayed: a caption for each strike, at the top of the field, saying who strikes where with what and where the
 * other one is guarding, and why this one goes first. The result of the blow is the "-12" / "BLOCK" over the head.
 */
export function Captions() {
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
        const why = i === 0 ? reason(last, last.firstBy, names[side]) : ''
        return (
          <div key={side} className={`caption ${side}`} style={{ '--b': i * BEAT, '--d': BEAT } as CSSProperties}>
            <b>
              {s.weapon === 'super'
                ? `${names[side]} unleashes ${ICON.super} ${fighterOf(fighters[side]).super.name.toUpperCase()} at the ${s.zone} and the ${s.extra!.zone}`
                : `${names[side]} ${VERB[s.weapon]} ${ICON[s.weapon]} the ${s.zone}`}
            </b>
            <span>
              {names[other]} guards the {last.moves[other].block}
            </span>
            {why && <em>{why}</em>}
          </div>
        )
      })}
    </div>
  )
}
