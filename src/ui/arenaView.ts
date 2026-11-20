import { opponent, type Side, type Weapon, type Zone } from '../sim'
import { turnOf, useGame } from '../state/game'
import { IMPACT, timelineOf } from '../timing'
import type { PoseInput } from './pose'

export interface Incoming {
  zone: Zone
  blocked: boolean
  weapon: Weapon
}

export interface Label {
  text: string
  kind: 'hit' | 'crit' | 'block' | 'stumble' | 'ready'
  /** seconds into the replay when it appears (the moment the blow connects) */
  at: number
}

/** When things happen to a fighter in the replay of a round, in seconds from its start. */
export interface Times {
  /** this fighter's own strike begins */
  strikeAt: number
  /** the strike that comes in connects */
  hitAt: number
  /** the match was decided (a knockout) */
  endAt: number
}

/** Everything a fighter (2D or 3D) needs to know to draw itself. Both renderers take the same thing. */
export interface FighterView {
  /** the zone this fighter guards (drawn as a shield) */
  shield: Zone | null
  /** the strike that came in this round, if any */
  incoming: Incoming | null
  /** a crosshair on the zone the player is about to strike (on the enemy, while choosing; solo mode only) */
  aim: Zone | null
  /** the strike this fighter threw this round (a punch or a kick), or null when the fight was decided before its turn */
  strike: { zone: Zone; weapon: Weapon } | null
  /** the strike the opponent threw at this fighter: what hit (or was guarded by) it */
  foe: { zone: Zone; weapon: Weapon } | null
  times: Times
  /** this fighter's own kick was guarded: it stumbles */
  stumble: boolean
  /** this fighter is down */
  ko: boolean
  /** the opponent is down and this fighter is not: it celebrates */
  won: boolean
  /** floating labels ("-12", "BLOCK", "STUMBLE -7") */
  labels: Label[]
  /** while choosing: a tap on a zone of this fighter picks it (to guard, on the fighter of whoever is choosing; to strike, on the other) */
  pick?: (zone: Zone) => void
  /** the pointer is over / left a zone of this fighter (a preview of the pick) */
  over?: (zone: Zone | null) => void
}

/** Reads the game and works out how one fighter looks right now. */
export function useFighterView(side: Side): FighterView {
  const { phase, mode, match, choice, last, hover, tap, setHover } = useGame()
  const other = opponent(side)
  const reveal = phase === 'reveal' || phase === 'over' ? last : null
  const labels: Label[] = []
  const tl = reveal ? timelineOf(reveal) : null
  const incoming = reveal ? reveal.strikes[other] : null
  const own = reveal ? reveal.strikes[side] : null
  if (reveal && tl) {
    if (incoming) {
      const at = tl.hitAt[other]!
      labels.push(
        incoming.blocked
          ? { text: 'BLOCK', kind: 'block', at }
          : { text: `-${incoming.damage}${incoming.crit ? ' CRIT!' : ''}`, kind: incoming.crit ? 'crit' : 'hit', at },
      )
    }
    if (own?.recoil) labels.push({ text: `STUMBLE -${own.recoil}`, kind: 'stumble', at: tl.hitAt[side]! + 0.25 })
  }
  // the picks of the one who is choosing are shown on the field: the guard on their own fighter, the strike on the other. Between
  // two people nobody else's picks are ever shown (the other one is looking at the same screen).
  const choosing = phase === 'choose'
  const me = turnOf(choice, mode)
  // while the pointer is over a zone of a fighter, that zone is lit as a preview of what a tap would pick
  const hovered = choosing && hover?.side === side ? hover.zone : null
  return {
    pick: choosing ? (zone: Zone) => tap(side, zone) : undefined,
    over: choosing ? (zone: Zone | null) => setHover(zone ? { side, zone } : null) : undefined,
    shield: reveal ? reveal.moves[side].block : choosing && side === me ? (hovered ?? choice[me].block) : null,
    incoming: incoming ? { zone: incoming.zone, blocked: incoming.blocked, weapon: incoming.weapon } : null,
    aim: choosing && side !== me ? (hovered ?? choice[me].attack) : null,
    strike: own ? { zone: own.zone, weapon: own.weapon } : null,
    foe: incoming ? { zone: incoming.zone, weapon: incoming.weapon } : null,
    times: { strikeAt: tl?.strikeAt[side] ?? 0, hitAt: tl?.hitAt[other] ?? IMPACT, endAt: tl?.endAt ?? IMPACT },
    stumble: own !== null && own.recoil > 0,
    ko: (phase === 'reveal' || phase === 'over') && match.hp[side] === 0,
    won: (phase === 'reveal' || phase === 'over') && match.hp[side] > 0 && match.hp[other] === 0,
    labels,
  }
}

/**
 * A staged scene (for the poster and the screenshots): the fighters are frozen at `t` seconds into a round instead of running,
 * and their heads are turned toward the camera by `headYaw` radians, so that both faces can be seen in a shot from the side.
 */
export interface Stage {
  t: number
  headYaw: number
  /** the whole body is turned to face the camera, not only the head (the avatars of the selection screen) */
  front?: boolean
  /** the right fighter's own turn of the head, when it needs another one (it looks at the camera from the other side) */
  headYawRight?: number
  /** a camera of its own, instead of the usual one */
  camera?: { position: [number, number, number]; look: number }
}

/** What the pose function needs to know about a fighter's round. */
export const poseInput = (v: FighterView): PoseInput => ({
  strike: v.strike,
  strikeAt: v.times.strikeAt,
  incoming: v.incoming,
  hitAt: v.times.hitAt,
  stumble: v.stumble,
  ko: v.ko,
  won: v.won,
  endAt: v.times.endAt,
})
