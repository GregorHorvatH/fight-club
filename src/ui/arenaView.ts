import { opponent, type Side, type Weapon, type Zone } from '../sim'
import { useGame } from '../state/game'
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
}

/** Reads the game and works out how one fighter looks right now. */
export function useFighterView(side: Side): FighterView {
  const { phase, mode, match, choice, last } = useGame()
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
  } else if (phase === 'choose' && mode === 'duo' && choice[side].locked) {
    labels.push({ text: 'READY', kind: 'ready' })
  }
  // in solo mode your own picks are shown on the arena; between two people on one screen they would give you away
  const peek = phase === 'choose' && mode === 'solo'
  return {
    shield: reveal ? reveal.moves[side].block : peek && side === 'player' ? choice.player.block : null,
    incoming: reveal ? { zone: reveal.strikes[other].zone, blocked: reveal.strikes[other].blocked } : null,
    aim: peek && side === 'enemy' ? choice.player.attack : null,
    strike: reveal ? { zone: reveal.strikes[side].zone, weapon: reveal.strikes[side].weapon } : null,
    foe: reveal ? { zone: reveal.strikes[other].zone, weapon: reveal.strikes[other].weapon } : null,
    stumble: reveal !== null && reveal.strikes[side].recoil > 0,
    ko: (phase === 'reveal' || phase === 'over') && match.hp[side] === 0,
    won: (phase === 'reveal' || phase === 'over') && match.hp[side] > 0 && match.hp[other] === 0,
    labels,
  }
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
