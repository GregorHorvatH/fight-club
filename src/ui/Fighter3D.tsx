import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { AdditiveBlending, BackSide, Color, MeshStandardMaterial, type MeshBasicMaterial, type Object3D } from 'three'
import type { Zone } from '../sim'
import { poseInput, type FighterView } from './arenaView'
import { ZoneHits } from './ZoneHits'
import { applyPose, type JointName, type Limb, type Reg } from './rigPose'
import { BASE_X, CHEST_C, FORE, HEAD_R, HEAD_UP, HIP_Y, HIP_Z, NECK_UP, SHIN, SHOULDER_UP, SHOULDER_Z, THIGH, UPPER, WAIST, aimPoint, computePose } from './pose'

/** The glow around a zone: gold on the zone you are about to strike, blue on a zone that is guarded. */
const AIM_COLOR = '#ffc857'
const SHIELD_COLOR = '#58b8ff'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

interface Props {
  side: 'player' | 'enemy'
  view: FighterView
  /** the fight is already over when this scene is built: the loser starts on the floor */
  settled: boolean
}

/**
 * A jointed fighter: pelvis, waist, neck, shoulders and elbows, hips, knees and ankles, each a group that is rotated every
 * frame to the angles `computePose` gives (nothing here is React state). A new `key` restarts the animation.
 */
export function Fighter3D({ side, view, settled }: Props) {
  const dir = side === 'player' ? 1 : -1 // which way it faces along x
  const near = dir // the limbs on the camera's side: local +z for the left fighter, local -z for the mirrored one
  const base = side === 'player' ? '#2bb893' : '#d9474c'
  const phase = side === 'player' ? 0 : 2.1
  const time = useRef(settled ? 10 : 0)
  const joints = useRef<Partial<Record<JointName, Object3D>>>({})
  const reg: Reg = (name) => (o) => {
    if (o) joints.current[name] = o
  }

  // a material for each zone, and a lighter one for its joints; they flash when the zone is struck
  const mats = useMemo(() => {
    const body = new Color(base)
    const joint = body.clone().lerp(new Color('#ffffff'), 0.4)
    const make = (c: Color) => new MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.08, emissive: new Color('#000') })
    return {
      head: make(body), body: make(body), legs: make(body),
      jhead: make(joint), jbody: make(joint), jlegs: make(joint),
    }
  }, [base])
  const white = useMemo(() => new Color('#ffffff'), [])
  const blue = useMemo(() => new Color(SHIELD_COLOR), [])
  // where the opponent's blow lands on this fighter, relative to this fighter's root and in the direction it faces (for the spark)
  const spark = useMemo(() => {
    if (!view.foe) return null
    const a = aimPoint(view.foe)
    const p = computePose(view.times.hitAt, poseInput(view))
    return [2 * BASE_X - p.x - a[0], a[1] - p.y] as const
  }, [view])

  useFrame((state, dt) => {
    time.current += Math.min(dt, 0.05)
    const t = time.current
    const J = joints.current
    const P = computePose(t, poseInput(view), state.clock.elapsedTime, phase)

    applyPose(J, P, dir, near)

    // the struck zone flashes: white for a hit, blue for a guarded strike
    const color = view.incoming?.blocked ? blue : white
    for (const z of ['head', 'body', 'legs'] as const) {
      const struck = view.incoming?.zone === z || (view.incoming?.also?.zone === z && !view.incoming.also.blocked)
      const f = struck ? P.flash : 0
      for (const m of [mats[z], mats[`j${z}`]]) {
        m.emissive.copy(color)
        m.emissiveIntensity = f * 0.9
      }
    }

    // the spark where the blow lands
    const age = clamp01((t - view.times.hitAt) / 0.45)
    const sparkMesh = J.burst!
    sparkMesh.visible = view.incoming !== null && t > view.times.hitAt && age < 1
    if (sparkMesh.visible) {
      sparkMesh.scale.setScalar(0.3 + age * 1.4)
      ;((sparkMesh as unknown as { material: MeshBasicMaterial }).material).opacity = 0.9 * (1 - age)
    }
  })

  // the zone that glows, and in which colour (nothing glows on a fighter who is down)
  const glow: { zone: Zone; color: string } | null = view.ko
    ? null
    : view.shield
      ? { zone: view.shield, color: SHIELD_COLOR }
      : view.aim
        ? { zone: view.aim, color: AIM_COLOR }
        : null
  // a super strike that is being chosen has a second zone: it glows too
  const lit = (zone: Zone): string | null => (glow?.zone === zone ? glow.color : !view.ko && !view.shield && view.aim2 === zone ? AIM_COLOR : null)

  return (
    <group ref={reg('root')} position={[-dir * BASE_X, 0, 0]}>
      <ZoneHits view={view} />
      <group ref={reg('facing')} rotation-y={side === 'enemy' ? Math.PI : 0}>
        <group ref={reg('tilt')}>
          <group ref={reg('pelvis')} position={[0, HIP_Y, 0]}>
            <mesh material={mats.legs} scale={[0.8, 0.9, 1.15]} castShadow>
              <sphereGeometry args={[0.32, 16, 12]} />
            </mesh>
            <Leg limb="N" z={near * HIP_Z} mats={mats} glow={lit('legs')} reg={reg} />
            <Leg limb="F" z={-near * HIP_Z} mats={mats} glow={lit('legs')} reg={reg} />

            <group ref={reg('chest')} position={[0, WAIST, 0]}>
              <mesh material={mats.jbody} castShadow>
                <sphereGeometry args={[0.2, 14, 10]} />
              </mesh>
              {/* a chest that is wide across the shoulders and thin front to back */}
              <Part mat={mats.body} position={[0, CHEST_C, 0]} scale={[0.85, 1, 1.15]} glow={lit('body')} halo={[1.3, 1.12, 1.3]}>
                <capsuleGeometry args={[0.34, 0.39, 6, 16]} />
              </Part>
              <Arm limb="N" z={near * SHOULDER_Z} mats={mats} glow={lit('body')} reg={reg} />
              <Arm limb="F" z={-near * SHOULDER_Z} mats={mats} glow={lit('body')} reg={reg} />

              <group ref={reg('neck')} position={[0, NECK_UP, 0]}>
                <mesh material={mats.jhead} castShadow>
                  <sphereGeometry args={[0.14, 12, 10]} />
                </mesh>
                <group position={[0, HEAD_UP, 0]}>
                  <Part mat={mats.head} glow={lit('head')} halo={[1.25, 1.25, 1.25]}>
                    <sphereGeometry args={[HEAD_R, 24, 16]} />
                  </Part>
                  <mesh position={[0.3, 0.04, 0]}>
                    <boxGeometry args={[0.14, 0.09, 0.34]} />
                    <meshBasicMaterial color="#0b0a10" />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* the spark where a blow lands (it is placed where the opponent's fist or foot arrives) */}
        <mesh ref={reg('burst')} visible={false} position={spark ? [spark[0], spark[1], 0] : [0.6, 2, 0]}>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshBasicMaterial color={view.incoming?.blocked ? SHIELD_COLOR : '#ffffff'} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

type Mats = Record<'head' | 'body' | 'legs' | 'jhead' | 'jbody' | 'jlegs', MeshStandardMaterial>

/** A body part (its geometry is the child) that can be wrapped in the glow of the zone it belongs to. */
function Part({
  mat, position, scale, glow, halo = [1.3, 1.1, 1.3], children,
}: {
  mat: MeshStandardMaterial
  position?: [number, number, number]
  scale?: [number, number, number]
  glow?: string | null
  halo?: [number, number, number]
  children: ReactNode
}) {
  return (
    <mesh material={mat} position={position} scale={scale} castShadow>
      {children}
      {glow && (
        <group scale={halo}>
          <Aura color={glow}>{children}</Aura>
        </group>
      )}
    </mesh>
  )
}

/** A glowing shell in the shape of its child geometry: a soft filled body and a wider halo behind it, pulsing. */
function Aura({ color, children }: { color: string; children: ReactNode }) {
  const fill = useRef<MeshBasicMaterial>(null!)
  const halo = useRef<MeshBasicMaterial>(null!)
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)
    fill.current.opacity = 0.22 + 0.2 * pulse
    halo.current.opacity = 0.1 + 0.12 * pulse
  })
  return (
    <>
      <mesh>
        {children}
        <meshBasicMaterial ref={fill} color={color} transparent blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={1.14}>
        {children}
        <meshBasicMaterial ref={halo} color={color} transparent blending={AdditiveBlending} depthWrite={false} side={BackSide} />
      </mesh>
    </>
  )
}

/** hip -> thigh -> knee -> shin -> ankle -> foot. The hip is at the pelvis; each joint is a ball on top of the next group. */
function Leg({ limb, z, mats, glow, reg }: { limb: Limb; z: number; mats: Mats; glow: string | null; reg: Reg }) {
  return (
    <group ref={reg(`hip${limb}`)} position={[0, 0, z]}>
      <mesh material={mats.jlegs} castShadow>
        <sphereGeometry args={[0.19, 14, 10]} />
      </mesh>
      <Part mat={mats.legs} position={[0, -THIGH / 2, 0]} glow={glow} halo={[1.5, 1.08, 1.5]}>
        <capsuleGeometry args={[0.15, THIGH - 0.3, 6, 12]} />
      </Part>
      <group ref={reg(`knee${limb}`)} position={[0, -THIGH, 0]}>
        <mesh material={mats.jlegs} castShadow>
          <sphereGeometry args={[0.17, 14, 10]} />
        </mesh>
        <Part mat={mats.legs} position={[0, -SHIN / 2, 0]} glow={glow} halo={[1.55, 1.08, 1.55]}>
          <capsuleGeometry args={[0.13, SHIN - 0.26, 6, 12]} />
        </Part>
        <group ref={reg(`ankle${limb}`)} position={[0, -SHIN, 0]}>
          <mesh material={mats.jlegs} castShadow>
            <sphereGeometry args={[0.12, 12, 8]} />
          </mesh>
          <Part mat={mats.legs} position={[0.14, -0.075, 0]} glow={glow} halo={[1.25, 1.9, 1.5]}>
            <boxGeometry args={[0.42, 0.15, 0.28]} />
          </Part>
        </group>
      </group>
    </group>
  )
}

/** shoulder -> upper arm -> elbow -> forearm -> fist. */
function Arm({ limb, z, mats, glow, reg }: { limb: Limb; z: number; mats: Mats; glow: string | null; reg: Reg }) {
  return (
    <group ref={reg(`shoulder${limb}`)} position={[0, SHOULDER_UP, z]}>
      <mesh material={mats.jbody} castShadow>
        <sphereGeometry args={[0.16, 14, 10]} />
      </mesh>
      <Part mat={mats.body} position={[0, -UPPER / 2, 0]} glow={glow} halo={[1.9, 1.06, 1.9]}>
        <capsuleGeometry args={[0.1, UPPER - 0.2, 6, 12]} />
      </Part>
      <group ref={reg(`elbow${limb}`)} position={[0, -UPPER, 0]}>
        <mesh material={mats.jbody} castShadow>
          <sphereGeometry args={[0.13, 14, 10]} />
        </mesh>
        <Part mat={mats.body} position={[0, -FORE / 2, 0]} glow={glow} halo={[2, 1.06, 2]}>
          <capsuleGeometry args={[0.09, FORE - 0.18, 6, 12]} />
        </Part>
        <Part mat={mats.body} position={[0, -FORE, 0]} glow={glow} halo={[1.4, 1.4, 1.4]}>
          <sphereGeometry args={[0.17, 16, 12]} />
        </Part>
      </group>
    </group>
  )
}
