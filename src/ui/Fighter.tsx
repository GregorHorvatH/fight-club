import { stepSounds } from './footsteps'
import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Zone } from '../sim'
import { usePortrait } from './usePortrait'
import { useLayout } from '../state/layout'
import { HALF_WIDTH } from './camera'

/** A tall frame shows the same width as the 3D camera does (so the fighters are the same size in both views), and this much ground under the feet. */
/** The top of the head of a fighter in his guard, in units above the floor. */
const HEAD_TOP = HIP_Y + ANKLE + WAIST + NECK_UP + HEAD_UP + HEAD_R
const TALL_H = (2 * HALF_WIDTH * 3.984) / 5.2 // the shape of the frame stays 5.2 : 3.984, whatever its width
const TALL_BELOW = 0.4
import { poseInput, type FighterView, type Label } from './arenaView'
import { ANKLE, BASE_X, FORE, HEAD_R, HEAD_UP, HIP_Y, NECK_UP, SHIN, SHOULDER_UP, THIGH, UPPER, WAIST, aimPoint, computePose, type Pose } from './pose'

export function Floats({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null
  return (
    <div className="floats" aria-live="polite">
      {labels.map((l) => (
        <span key={l.kind} className={`float ${l.kind}`} style={{ '--at': l.at } as CSSProperties}>
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
function apply(J: Partial<Record<JointName, SVGGElement>>, P: Pose, t: number, spark: readonly [number, number] | null, hitAt: number | null): void {
  const set = (n: JointName, v: string) => J[n]?.setAttribute('transform', v)
  // (turned round, the flat figure is seen from the other side: it is squeezed through nothing and mirrored)
  set('root', `translate(${P.x.toFixed(3)} ${P.y.toFixed(3)}) scale(${Math.cos((P.turn ?? 0) * Math.PI).toFixed(3)} 1) ${rot(P.fall * 1.5)}`)
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
    const age = Math.min(1, Math.max(0, (t - (hitAt ?? 0)) / 0.45))
    sp.setAttribute('transform', `translate(${spark[0].toFixed(3)} ${spark[1].toFixed(3)}) scale(${(0.3 + age * 1.4).toFixed(3)})`)
    sp.setAttribute('opacity', hitAt !== null && t > hitAt && age < 1 ? String(0.9 * (1 - age)) : '0')
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
    const spark = view.foe ? ((a) => [2 * BASE_X - a[0], a[1]] as const)(aimPoint(view.foe)) : null
    const hitAt = view.incoming ? view.times.hitAt : null
    const draw = (t: number, clock: number) => apply(joints.current, computePose(t, poseInput(view), clock, phase), t, spark, hitAt)
    draw(lastT.current, lastT.current) // the first frame is set before the browser paints
    let raf = 0
    const frame = (now: number) => {
      start.current ??= now - lastT.current * 1000
      const before = lastT.current
      lastT.current = (now - start.current) / 1000
      stepSounds(side, before, lastT.current, view.entrance)
      draw(lastT.current, now / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [view, phase, side])

  const state = (z: Zone): string => {
    const i = view.incoming
    if (i?.zone === z) return i.blocked ? 'blocked' : 'hit'
    return i?.also?.zone === z ? (i.also.blocked ? 'blocked' : 'hit') : ''
  }
  /** the zone glows gold while you aim at it (on the enemy) and blue while it is guarded */
  const glow = (z: Zone): string | undefined => (view.shield === z ? `url(#glow-shield-${side})` : view.aim === z || view.aim2 === z ? `url(#glow-aim-${side})` : undefined)

  /** a tap / click on a zone of the fighter picks it (solo, while choosing); the pointer over it lights it up as a preview */
  const tap = (z: Zone) =>
    view.pick
      ? {
          onClick: () => view.pick!(z),
          onPointerEnter: (e: ReactPointerEvent) => void (e.pointerType === 'mouse' && view.over?.(z)),
          onPointerLeave: (e: ReactPointerEvent) => void (e.pointerType === 'mouse' && view.over?.(null)),
        }
      : {}
  const hit = (z: Zone, x: number, y: number, w: number, h: number) => view.pick && <rect className="hit" x={x} y={y} width={w} height={h} data-zone={z} />

  return (
    <g className={`figure ${side}${view.ko ? ' ko' : ''}${view.pick ? ' pickable' : ''}`} transform={`translate(${-dir * BASE_X} 0)${dir < 0 ? ' scale(-1 1)' : ''}`}>
      <defs>
        <Glow id={`glow-aim-${side}`} color="#ffc857" />
        <Glow id={`glow-shield-${side}`} color="#58b8ff" />
      </defs>
      <g ref={reg('shadow')}>
        <ellipse cx="0" cy="0" rx="0.75" ry="0.09" className="shadow" />
      </g>
      <g ref={reg('root')}>
        <g className={`part legs ${state('legs')}`} filter={glow('legs')} {...tap('legs')}>
          {hit('legs', -0.55, 0, 1.1, HIP_Y - 0.05)}
          <Leg limb="F" reg={reg} />
          <Leg limb="N" reg={reg} />
        </g>
        <g ref={reg('chest')}>
          <g className={`part body ${state('body')}`} filter={glow('body')} {...tap('body')}>
            {hit('body', -0.6, -0.3, 1.2, NECK_UP + 0.07)}
            <Arm limb="F" reg={reg} />
            <rect x="-0.29" y="-0.215" width="0.58" height="1.07" rx="0.29" />
            <circle className="joint" r="0.2" />
            <Arm limb="N" reg={reg} />
          </g>
          <g ref={reg('neck')} transform={`translate(0 ${NECK_UP})`}>
            <g className={`part head ${state('head')}`} filter={glow('head')} {...tap('head')}>
              <circle className="joint" r="0.14" />
              <g transform={`translate(0 ${HEAD_UP})`}>
                {hit('head', -0.5, -0.5, 1, 1)}
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
  const { t } = useTranslation()
  const portrait = usePortrait()
  // in a tall window the frame is narrow: it is cut down to the two fighters, so that they fill the width as big as they can be
  const box = portrait ? { x: -HALF_WIDTH, y: -(TALL_H - TALL_BELOW), w: 2 * HALF_WIDTH, h: TALL_H } : far ? { x: -5.5, y: -5.63, w: 11, h: 6.62 } : { x: -3.8, y: -4.1, w: 7.6, h: 4.5 }
  const svgRef = useRef<SVGSVGElement>(null)
  const setHeadsTop = useLayout((s) => s.setHeadsTop)
  const flipped = box.y - (far || portrait ? stand * box.h : 0)
  // tell the hint where the heads are: the top of a head in its guard, from the frame (it does not move when the fighters do)
  useLayoutEffect(() => {
    const svg = svgRef.current
    const arena = svg?.closest('.arena')
    if (!svg || !arena) return
    const measure = () => {
      const r = svg.getBoundingClientRect()
      const a = arena.getBoundingClientRect()
      setHeadsTop(r.top - a.top + (-HEAD_TOP - flipped) * (r.height / box.h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => {
      ro.disconnect()
      setHeadsTop(null)
    }
  }, [flipped, box.h, setHeadsTop])
  return (
    <div className={`scene${far ? ' far' : ''}${portrait ? ' tall' : ''}`}>
      {/* the fighters fill most of the frame; in front of an arena picture the frame is wider, so they stand in it, small, and the arena is big */}
      <svg ref={svgRef} viewBox={`${box.x} ${flipped.toFixed(3)} ${box.w} ${box.h}`} role="img" aria-label={t('arena.fighters')}>
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
