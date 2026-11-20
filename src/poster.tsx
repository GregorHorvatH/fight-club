/**
 * A staged scene for the poster and the screenshots (dev only: `pnpm dev`, then open /poster.html). It draws the 3D arena with the
 * two characters frozen in the middle of a strike and with their faces turned to the camera, over an arena picture, filling the
 * window. Parameters (all optional):
 *   arena=sunset   the arena (an id from public/arenas/arenas.json)
 *   t=285          how many milliseconds into the round to freeze (the blows connect at 300)
 *   lag=0.28       seconds between the contact and the moment shown (the flash of the blow fades)
 *   yaw=30         how far the heads are turned toward the camera, in degrees
 *   left=pete      who stands on the left, and  right=brute  on the right (ids from state/roster.ts; default: james and amy)
 *   fidget=scratch:1.2  the left fighter is idling and doing this fidget (kind:seconds-into-it; see FIDGET_KINDS in ui/pose.ts)
 *   won=L          the left fighter is the winner (it jumps for joy), or won=R the right one; with clock=0.2 at the moment 0.2 s into the cycle
 *   clock=0.2      the free-running clock (seconds) frozen at this value
 *   front=1        the whole body faces the camera, not only the head (for the avatars; use with a camera right in front of the fighter)
 *   yawR=95        the same for the right fighter, when it needs another one (default: the same as yaw)
 *   p=head.hand    the strike of the left fighter (zone.weapon, or zone.super.zone2 for a super strike in its style); the right fighter takes it
 *   cam=0,3.2,11.2,2.18   a camera of its own: x,y,z of the position, then the height it looks at
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { SECOND_ZONE, WEAPONS, ZONES, type Weapon } from './sim'
import { arenaUrl, loadArenas, useArenas } from './state/arenas'
import { useGame } from './state/game'
import { FIGHTERS, fighterOf } from './state/roster'
import { IMPACT } from './timing'
import Arena3D from './ui/Arena3D'
import type { FighterView, Stage, Thrown } from './ui/arenaView'
import { FIDGET_KINDS, type Fidget, type FidgetKind } from './ui/pose'
import './index.css'

const q = new URLSearchParams(location.search)

/** The strike staged: `zone.weapon`, or `zone.super.zone2` for a super strike (in the style of the fighter on the left). */
function strike(param: string, fallback: string): Thrown {
  const [zone, weapon, zone2] = (q.get(param) ?? fallback).split('.')
  const z = ZONES.find((x) => x === zone) ?? 'head'
  const w: Weapon = WEAPONS.find((x) => x === weapon) ?? 'hand'
  if (w !== 'super') return { zone: z, weapon: w }
  return { zone: z, weapon: w, zone2: ZONES.find((x) => x === zone2) ?? SECOND_ZONE[z], style: fighterOf(who('left', FIGHTERS[0]).id).super }
}

const who = (param: string, fallback: (typeof FIGHTERS)[number]) => FIGHTERS.find((f) => f.id === q.get(param)) ?? fallback
useGame.setState({ fighters: { player: who('left', FIGHTERS[0]).id, enemy: who('right', FIGHTERS[1]).id } })

const left = strike('p', 'head.hand')
// one strike is staged: the left fighter strikes, the right one takes it (the strikes of a round come one after the other).
// The blow connected `lag` seconds before the moment that is shown: the white flash and the spark have faded and the faces can be seen.
const lag = Number(q.get('lag') ?? 0.28)
const shownAt = Number(q.get('t') ?? 285) / 1000
const times = { strikeAt: 0, hitAt: IMPACT, endAt: IMPACT }
const hitTimes = { strikeAt: 0, hitAt: shownAt - lag, endAt: shownAt - lag }
const [fk, fu] = (q.get('fidget') ?? '').split(':')
const fidgetForced: Fidget | undefined = FIDGET_KINDS.includes(fk as FidgetKind) ? { kind: fk as FidgetKind, u: Number(fu ?? 1) } : undefined
const striker = (mine: typeof left): FighterView => ({
  idleSeed: fidgetForced ? 1 : undefined, idleForce: fidgetForced,
  shield: null, incoming: null, aim: null, aim2: null, strike: q.get('won') === 'L' || fidgetForced ? null : mine, foe: null, times, stumble: false, ko: false, won: q.get('won') === 'L', labels: [],
})
const struck = (theirs: typeof left): FighterView => ({
  shield: null, incoming: { zone: theirs.zone, blocked: false, weapon: theirs.weapon, also: null, delay: 0 }, aim: null, aim2: null, strike: null, foe: theirs, times: q.get('won') === 'R' ? { ...hitTimes, endAt: 0 } : hitTimes, stumble: false, ko: false, won: q.get('won') === 'R', labels: [],
})

const cam = q.get('cam')?.split(',').map(Number)
const stage: Stage = {
  t: Number(q.get('t') ?? 285) / 1000,
  clock: Number(q.get('clock') ?? 0),
  headYaw: (Number(q.get('yaw') ?? 30) * Math.PI) / 180,
  front: q.get('front') === '1',
  headYawRight: q.has('yawR') ? (Number(q.get('yawR')) * Math.PI) / 180 : undefined,
  camera: cam && cam.length === 4 && cam.every(Number.isFinite) ? { position: [cam[0]!, cam[1]!, cam[2]!], look: cam[3]! } : undefined,
}

export function Poster() {
  const list = useArenas((s) => s.list)
  const [ready, setReady] = useState(false)
  useEffect(() => void loadArenas().then(() => setReady(true)), [])
  const arena = list.find((a) => a.id === (q.get('arena') ?? 'sunset')) ?? list[0] ?? null
  if (!ready) return null
  return (
    <div
      className="arena three has-bg"
      style={{
        position: 'fixed', inset: 0, border: 0, borderRadius: 0,
        backgroundImage: arena ? `linear-gradient(rgba(10, 9, 16, 0.18), rgba(10, 9, 16, 0.42)), url(${arenaUrl(arena.file)})` : undefined,
      }}
    >
      <Arena3D player={striker(left)} enemy={struck(left)} sceneKey="poster" backdrop={arena !== null} stand={arena?.stand ?? 0} stage={stage} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Poster />)
