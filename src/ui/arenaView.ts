import { useTranslation } from 'react-i18next'
import { opponent, type Side, type Weapon, type Zone } from '../sim'
import { turnOf, useGame, type Choice } from '../state/game'
import { fighterOf } from '../state/roster'
import { IMPACT, SUPER_GAP, timelineOf } from '../timing'
import type { Fidget, PoseInput, SuperStyle } from './pose'

export interface Incoming {
  /** the part of the blow the fighter reacts to: the first one that landed (a super strike has two parts) */
  zone: Zone
  blocked: boolean
  weapon: Weapon
  /** the other part of a super strike: it flashes too (when it landed), SUPER_GAP after the first */
  also: { zone: Zone; blocked: boolean } | null
  /** seconds after the first blow that the part reacted to connects (0, or SUPER_GAP when it is the second part of a super strike) */
  delay: number
}

/** A strike as a fighter throws it: the second zone and the style are those of a super strike. */
export interface Thrown {
  zone: Zone
  weapon: Weapon
  zone2?: Zone
  style?: SuperStyle
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
  /** the second zone of a super strike that is being chosen */
  aim2: Zone | null
  /** the strike this fighter threw this round (a punch, a kick or a super strike), or null when the fight was decided before its turn */
  strike: Thrown | null
  /** the strike the opponent threw at this fighter: what hit (or was guarded by) it */
  foe: Thrown | null
  times: Times
  /** this fighter's own kick was guarded: it stumbles */
  stumble: boolean
  /** while the player is choosing the fighter fidgets now and then (the seed makes the two different) */
  idleSeed?: number
  /** a given fidget (the poster scene) */
  idleForce?: Fidget
  /** walking onto the arena (the start of a match), or waiting off the frame (while the ladder of a tournament is shown) */
  entrance?: 'walk' | 'wait' | 'leave'
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

/** A strike as thrown by this fighter: a super strike has its second zone, and the style of the character that throws it. */
const thrown = (s: { zone: Zone; weapon: Weapon; extra: { zone: Zone } | null }, id: Parameters<typeof fighterOf>[0]): Thrown => ({
  zone: s.zone,
  weapon: s.weapon,
  ...(s.weapon === 'super' ? { zone2: s.extra?.zone, style: fighterOf(id).super } : {}),
})

/**
 * The zones that glow on the enemy while choosing: what is chosen, and the zone under the pointer as a preview of what a tap would
 * pick. A super strike hits two: the one chosen stays lit while the second is chosen (a tap on a third replaces the first one chosen).
 */
export function aimed(c: Pick<Choice, 'attack' | 'attack2' | 'weapon'>, hovered: Zone | null): [Zone | null, Zone | null] {
  if (c.weapon !== 'super') return [hovered ?? c.attack, null]
  if (hovered === null || hovered === c.attack || hovered === c.attack2) return [c.attack, c.attack2]
  if (c.attack === null) return [hovered, null]
  if (c.attack2 === null) return [c.attack, hovered]
  return [c.attack2, hovered]
}

/** Reads the game and works out how one fighter looks right now. */
export function useFighterView(side: Side): FighterView {
  const { t } = useTranslation()
  const { phase, mode, match, choice, last, hover, tap, setHover, fighters } = useGame()
  const other = opponent(side)
  const reveal = phase === 'reveal' || phase === 'over' ? last : null
  const labels: Label[] = []
  const tl = reveal ? timelineOf(reveal) : null
  const incoming = reveal ? reveal.strikes[other] : null
  const parts = incoming ? [{ zone: incoming.zone, blocked: incoming.blocked, damage: incoming.damage }, ...(incoming.extra ? [incoming.extra] : [])] : []
  const react = parts.find((p) => !p.blocked) ?? parts[0]
  const rest = parts.find((p) => p !== react)
  const own = reveal ? reveal.strikes[side] : null
  if (reveal && tl) {
    if (incoming) {
      const at = tl.hitAt[other]!
      // a super strike has two parts: each says what became of it, one just after the other
      parts.forEach((p, i) => {
        labels.push(
          p.blocked
            ? { text: t('float.block'), kind: 'block', at: at + i * SUPER_GAP }
            : { text: `-${p.damage}${incoming.crit ? ` ${t('float.crit')}` : ''}`, kind: incoming.crit ? 'crit' : 'hit', at: at + i * SUPER_GAP },
        )
      })
    }
    if (own?.recoil) labels.push({ text: t('float.stumble', { n: own.recoil }), kind: 'stumble', at: tl.hitAt[side]! + 0.25 })
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
    incoming:
      incoming && react
        ? { zone: react.zone, blocked: react.blocked, weapon: incoming.weapon, also: rest ? { zone: rest.zone, blocked: rest.blocked } : null, delay: parts.indexOf(react) * SUPER_GAP }
        : null,
    aim: choosing && side !== me ? aimed(choice[me], hovered)[0] : null,
    aim2: choosing && side !== me ? aimed(choice[me], hovered)[1] : null,
    strike: own ? thrown(own, fighters[side]) : null,
    foe: incoming ? thrown(incoming, fighters[other]) : null,
    times: { strikeAt: tl?.strikeAt[side] ?? 0, hitAt: tl?.hitAt[other] ?? IMPACT, endAt: tl?.endAt ?? IMPACT },
    stumble: own !== null && own.recoil > 0,
    ko: (phase === 'reveal' || phase === 'over') && match.hp[side] === 0,
    won: (phase === 'reveal' || phase === 'over') && match.hp[side] > 0 && match.hp[other] === 0,
    labels,
    idleSeed: phase === 'choose' ? (side === 'player' ? 1 : 2.7) : undefined,
    // at the start of a match the fighters walk in from both sides; until then (the menus, the choice of the fighter, the ladder of
    // a tournament) they are still outside the frame
    entrance: phase === 'leave' ? 'leave' : phase === 'menu' || phase === 'about' || phase === 'options' || phase === 'setup' || phase === 'select' || phase === 'ladder' ? 'wait' : phase === 'choose' && match.round === 0 ? 'walk' : undefined,
  }
}

/**
 * A staged scene (for the poster and the screenshots): the fighters are frozen at `t` seconds into a round instead of running,
 * and their heads are turned toward the camera by `headYaw` radians, so that both faces can be seen in a shot from the side.
 */
export interface Stage {
  t: number
  /** the free-running clock of the idle bounce and of the winner's jumps, frozen at this many seconds (0 when not given) */
  clock?: number
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
  hitAt: v.times.hitAt + (v.incoming?.delay ?? 0), // when the part of the blow that it reacts to connects
  stumble: v.stumble,
  ko: v.ko,
  won: v.won,
  endAt: v.times.endAt,
  entrance: v.entrance,
  idle: v.idleSeed === undefined ? undefined : { seed: v.idleSeed, force: v.idleForce },
})
