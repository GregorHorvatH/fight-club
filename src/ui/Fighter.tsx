import { useLayoutEffect, useRef } from 'react'
import type { Zone } from '../sim'
import { IMPACT } from '../timing'
import { poseInput, type FighterView, type Label } from './arenaView'
import { BASE_X, FORE, HEAD_R, HEAD_UP, HIP_Y, NECK_UP, SHIN, SHOULDER_UP, THIGH, UPPER, WAIST, aimPoint, computePose, type Pose } from './pose'

export function Floats({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null
  return (
    <div className="floats" aria-live="polite">
      {labels.map((l) => (
        <span key={l.kind} className={`float ${l.kind}`}>
          {l.text}
        </span>
      ))}
    </div>
  )
}

/** A glow that hugs the silhouette it is applied to: the shape's outline, blurred, tinted and boosted, drawn behind it. The blur breathes. */
function Glow({ id, color }: { id: string; color: string }) {
  return (
    <filter id={id} x="-60%" y="-40%" width="220%" height="180%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.07" result="blur">
        <animate attributeName="stdDeviation" values="0.045;0.11;0.045" dur="1.3s" repeatCount="indefinite" />
      </feGaussianBlur>
      <feComponentTransfer in="blur" result="strong">
        <feFuncA type="linear" slope="2.6" />
      </feComponentTransfer>
      <feFlood floodColor={color} result="tint" />
      <feComposite in="tint" in2="strong" operator="in" result="halo" />
      <feMerge>
        <feMergeNode in="halo" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

type Limb = 'N' | 'F'
type JointName = 'root' | 'shadow' | 'chest' | 'neck' | 'spark' | `${'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle'}${Limb}`
type Reg = (name: JointName) => (el: SVGGElement | null) => void

const deg = (rad: number): number => (rad * 180) / Math.PI
const rot = (rad: number): string => `rotate(${deg(rad).toFixed(2)})`

/**
 * Puts a pose on the skeleton. The scene is drawn with y up (the whole scene is flipped), the same units and the same angle
 * conventions as the 3D fighter, so a positive angle is a counter-clockwise turn.
 */
function apply(J: Partial<Record<JointName, SVGGElement>>, P: Pose, t: number, spark: readonly [number, number] | null, hit: boolean): void {
  const set = (n: JointName, v: string) => J[n]?.setAttribute('transform', v)
  set('root', `translate(${P.x.toFixed(3)} ${P.y.toFixed(3)}) ${rot(P.fall * 1.5)}`)
  set('shadow', `translate(${P.x.toFixed(3)} 0)`)
  set('chest', `translate(0 ${HIP_Y + WAIST}) ${rot(-P.lean)}`)
  set('neck', `translate(0 ${NECK_UP}) ${rot(P.head)}`)
  for (const [l, arm, leg] of [['N', P.armN, P.legN], ['F', P.armF, P.legF]] as const) {
    set(`shoulder${l}`, `translate(0 ${SHOULDER_UP}) ${rot(arm.s)}`)
    set(`elbow${l}`, `translate(0 ${-UPPER}) ${rot(arm.e)}`)
    set(`hip${l}`, `translate(0 ${HIP_Y}) ${rot(leg.h)}`)
    set(`knee${l}`, `translate(0 ${-THIGH}) ${rot(leg.k)}`)
    set(`ankle${l}`, `translate(0 ${-SHIN}) ${rot(leg.a)}`)
  }
  // the spark where the opponent's blow lands: a ring that swells and fades
  const sp = J.spark
  if (sp && spark) {
    const age = Math.min(1, Math.max(0, (t - IMPACT) / 0.45))
    sp.setAttribute('transform', `translate(${spark[0].toFixed(3)} ${spark[1].toFixed(3)}) scale(${(0.3 + age * 1.4).toFixed(3)})`)
    sp.setAttribute('opacity', hit && t > IMPACT && age < 1 ? String(0.9 * (1 - age)) : '0')
  }
}

interface FigureProps {
  side: 'player' | 'enemy'
  view: FighterView
  /** the fight is already over when this scene is built: the loser starts on the floor */
  settled: boolean
}

/** One jointed fighter as SVG. Every frame it asks `computePose` for the angles and sets them on its joints. */
function Figure({ side, view, settled }: FigureProps) {
  const dir = side === 'player' ? 1 : -1
  const phase = side === 'player' ? 0 : 2.1
  const joints = useRef<Partial<Record<JointName, SVGGElement>>>({})
  const reg: Reg = (name) => (el) => {
    if (el) joints.current[name] = el
  }
  const start = useRef<number | null>(null) // the animation clock reading at the start of this scene (set on the first frame)
  const lastT = useRef(settled ? 10 : 0) // seconds into the replay at the last frame

  useLayoutEffect(() => {
    // where the opponent's blow lands on this fighter, from the defender's own base position
    const spark = view.foe ? ((a) => [2 * BASE_X - a[0], a[1]] as const)(aimPoint(view.foe, view.strike)) : null
    const hit = view.incoming !== null
    const draw = (t: number, clock: number) => apply(joints.current, computePose(t, poseInput(view), clock, phase), t, spark, hit)
    draw(lastT.current, lastT.current) // the first frame is set before the browser paints
    let raf = 0
    const frame = (now: number) => {
      start.current ??= now - lastT.current * 1000
      lastT.current = (now - start.current) / 1000
      draw(lastT.current, now / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [view, phase])

  const state = (z: Zone): string => (view.incoming?.zone === z ? (view.incoming.blocked ? 'blocked' : 'hit') : '')
  /** the zone glows gold while you aim at it (on the enemy) and blue while it is guarded */
  const glow = (z: Zone): string | undefined => (view.shield === z ? `url(#glow-shield-${side})` : view.aim === z ? `url(#glow-aim-${side})` : undefined)

  return (
    <g className={`figure ${side}${view.ko ? ' ko' : ''}`} transform={`translate(${-dir * BASE_X} 0)${dir < 0 ? ' scale(-1 1)' : ''}`}>
      <defs>
        <Glow id={`glow-aim-${side}`} color="#ffc857" />
        <Glow id={`glow-shield-${side}`} color="#58b8ff" />
      </defs>
      <g ref={reg('shadow')}>
        <ellipse cx="0" cy="0" rx="0.75" ry="0.09" className="shadow" />
      </g>
      <g ref={reg('root')}>
        <g className={`part legs ${state('legs')}`} filter={glow('legs')}>
          <Leg limb="F" reg={reg} />
          <Leg limb="N" reg={reg} />
        </g>
        <g ref={reg('chest')}>
          <g className={`part body ${state('body')}`} filter={glow('body')}>
            <Arm limb="F" reg={reg} />
            <rect x="-0.29" y="-0.215" width="0.58" height="1.07" rx="0.29" />
            <circle className="joint" r="0.2" />
            <Arm limb="N" reg={reg} />
          </g>
          <g ref={reg('neck')} transform={`translate(0 ${NECK_UP})`}>
            <g className={`part head ${state('head')}`} filter={glow('head')}>
              <circle className="joint" r="0.14" />
              <g transform={`translate(0 ${HEAD_UP})`}>
                <circle r={HEAD_R} />
                <rect className="eye" x="0.17" y="0" width="0.22" height="0.09" rx="0.045" />
              </g>
            </g>
          </g>
        </g>
      </g>
      {/* the spark: outside the moving parts, where the blow lands (placed every frame) */}
      <g ref={reg('spark')} opacity="0">
        <circle r="0.5" className={view.incoming?.blocked ? 'spark blocked' : 'spark'} />
      </g>
    </g>
  )
}

/** hip -> thigh -> knee -> shin -> ankle -> foot. The far leg is drawn darker. */
function Leg({ limb, reg }: { limb: Limb; reg: Reg }) {
  return (
    <g ref={reg(`hip${limb}`)} className={limb === 'F' ? 'far' : undefined}>
      <rect x="-0.15" y={-THIGH} width="0.3" height={THIGH} rx="0.15" />
      <circle className="joint" r="0.19" />
      <g ref={reg(`knee${limb}`)}>
        <rect x="-0.13" y={-SHIN} width="0.26" height={SHIN} rx="0.13" />
        <circle className="joint" r="0.17" />
        <g ref={reg(`ankle${limb}`)}>
          <rect x="-0.1" y="-0.15" width="0.48" height="0.17" rx="0.08" />
          <circle className="joint" r="0.12" />
        </g>
      </g>
    </g>
  )
}

/** shoulder -> upper arm -> elbow -> forearm -> fist. The far arm is drawn darker. */
function Arm({ limb, reg }: { limb: Limb; reg: Reg }) {
  return (
    <g ref={reg(`shoulder${limb}`)} className={limb === 'F' ? 'far' : undefined}>
      <rect x="-0.1" y={-UPPER} width="0.2" height={UPPER} rx="0.1" />
      <circle className="joint" r="0.16" />
      <g ref={reg(`elbow${limb}`)}>
        <rect x="-0.09" y={-FORE} width="0.18" height={FORE} rx="0.09" />
        <circle className="joint" r="0.13" />
        <circle cx="0" cy={-FORE} r="0.17" />
      </g>
    </g>
  )
}

/** The whole 2D ring as one SVG scene, so a fist that is aimed at the opponent's head really arrives at it. */
export function Scene2D({ player, enemy, settled, far, stand }: { player: FighterView; enemy: FighterView; settled: boolean; far: boolean; stand: number }) {
  return (
    <div className={`scene${far ? ' far' : ''}`}>
      {/* the fighters fill most of the frame; in front of an arena picture the frame is wider, so they stand in it, small, and the arena is big */}
      <svg viewBox={far ? `-5.5 ${(-5.63 - stand * 6.62).toFixed(3)} 11 6.62` : '-3.8 -4.1 7.6 4.5'} role="img" aria-label="Two fighters">
        <g transform="scale(1 -1)">
          <rect className="floor" x="-30" y="-0.5" width="60" height="0.5" />
          <line className="floor-line" x1="-30" y1="0" x2="30" y2="0" />
          <Figure side="player" view={player} settled={settled} />
          <Figure side="enemy" view={enemy} settled={settled} />
        </g>
      </svg>
      <div className="slot player">
        <Floats labels={player.labels} />
      </div>
      <div className="slot enemy">
        <Floats labels={enemy.labels} />
      </div>
    </div>
  )
}
