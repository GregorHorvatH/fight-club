/**
 * A staged scene for the poster and the screenshots (dev only: `pnpm dev`, then open /poster.html). It draws the 3D arena with the
 * two characters frozen in the middle of a strike and with their faces turned to the camera, over an arena picture, filling the
 * window. Parameters (all optional):
 *   arena=sunset   the arena (an id from public/arenas/arenas.json)
 *   t=285          how many milliseconds into the round to freeze (the blows connect at 300)
 *   lag=0.28       seconds between the contact and the moment shown (the flash of the blow fades)
 *   yaw=30         how far the heads are turned toward the camera, in degrees
 *   p=head.hand    the strike of the left fighter (zone.weapon); the right fighter takes it
 *   cam=0,3.2,11.2,2.18   a camera of its own: x,y,z of the position, then the height it looks at
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { WEAPONS, ZONES, type Weapon, type Zone } from './sim'
import { arenaUrl, loadArenas, useArenas } from './state/arenas'
import { IMPACT } from './timing'
import Arena3D from './ui/Arena3D'
import type { FighterView, Stage } from './ui/arenaView'
import './index.css'

const q = new URLSearchParams(location.search)

function strike(param: string, fallback: string): { zone: Zone; weapon: Weapon } {
  const [zone, weapon] = (q.get(param) ?? fallback).split('.')
  return {
    zone: ZONES.find((z) => z === zone) ?? 'head',
    weapon: WEAPONS.find((w) => w === weapon) ?? 'hand',
  }
}

const left = strike('p', 'head.hand')
// one strike is staged: the left fighter strikes, the right one takes it (the strikes of a round come one after the other).
// The blow connected `lag` seconds before the moment that is shown: the white flash and the spark have faded and the faces can be seen.
const lag = Number(q.get('lag') ?? 0.28)
const shownAt = Number(q.get('t') ?? 285) / 1000
const times = { strikeAt: 0, hitAt: IMPACT, endAt: IMPACT }
const hitTimes = { strikeAt: 0, hitAt: shownAt - lag, endAt: shownAt - lag }
const striker = (mine: typeof left): FighterView => ({
  shield: null, incoming: null, aim: null, strike: mine, foe: null, times, stumble: false, ko: false, won: false, labels: [],
})
const struck = (theirs: typeof left): FighterView => ({
  shield: null, incoming: { zone: theirs.zone, blocked: false, weapon: theirs.weapon }, aim: null, strike: null, foe: theirs, times: hitTimes, stumble: false, ko: false, won: false, labels: [],
})

const cam = q.get('cam')?.split(',').map(Number)
const stage: Stage = {
  t: Number(q.get('t') ?? 285) / 1000,
  headYaw: (Number(q.get('yaw') ?? 30) * Math.PI) / 180,
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
