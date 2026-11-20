import { opponent, type Side, type Weapon, type Zone } from '../sim'
import { turnOf, useGame } from '../state/game'
import type { PoseInput } from './pose'

export interface Incoming {
  zone: Zone
  blocked: boolean
}

export interface Label {
  text: string
  kind: 'hit' | 'crit' | 'block' | 'stumble' | 'ready'
}

/** Everything a fighter (2D or 3D) needs to know to draw itself. Both renderers take the same thing. */
export interface FighterView {
  /** the zone this fighter guards (drawn as a shield) */
  shield: Zone | null
  /** the strike that came in this round, if any */
  incoming: Incoming | null
  /** a crosshair on the zone the player is about to strike (on the enemy, while choosing; solo mode only) */
  aim: Zone | null
  /** the strike this fighter threw this round (a punch or a kick) */
  strike: { zone: Zone; weapon: Weapon } | null
  /** the strike the opponent threw: this is what it is aiming at, and what hit (or was guarded by) this fighter */
  foe: { zone: Zone; weapon: Weapon } | null
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
  if (reveal) {
    const incoming = reveal.strikes[other]
    labels.push(
      incoming.blocked
        ? { text: 'BLOCK', kind: 'block' }
        : { text: `-${incoming.damage}${incoming.crit ? ' CRIT!' : ''}`, kind: incoming.crit ? 'crit' : 'hit' },
    )
    const stumble = reveal.strikes[side].recoil
    if (stumble) labels.push({ text: `STUMBLE -${stumble}`, kind: 'stumble' })
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
    incoming: reveal ? { zone: reveal.strikes[other].zone, blocked: reveal.strikes[other].blocked } : null,
    aim: choosing && side !== me ? (hovered ?? choice[me].attack) : null,
    strike: reveal ? { zone: reveal.strikes[side].zone, weapon: reveal.strikes[side].weapon } : null,
    foe: reveal ? { zone: reveal.strikes[other].zone, weapon: reveal.strikes[other].weapon } : null,
    stumble: reveal !== null && reveal.strikes[side].recoil > 0,
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
  /** a camera of its own, instead of the usual one */
  camera?: { position: [number, number, number]; look: number }
}

/** What the pose function needs to know about a fighter's round. */
export const poseInput = (v: FighterView): PoseInput => ({
  strike: v.strike,
  foe: v.foe,
  incoming: v.incoming,
  stumble: v.stumble,
  ko: v.ko,
  won: v.won,
})
