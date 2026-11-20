import { useFrame, useLoader } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { Color, MeshStandardMaterial, Vector3, type MeshBasicMaterial, type Object3D, type SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { poseInput, type FighterView, type Stage } from './arenaView'
import {
  ANKLE, BASE_X, FORE, HEAD_R, HEAD_UP, HIP_Y, HIP_Z, NECK_UP, SHIN, SHOULDER_UP, SHOULDER_Z, THIGH, UPPER, WAIST,
  aimPoint, computePose,
} from './pose'
import { buildRig, poseRig, type Orient, type Rig } from './rig'
import { applyPose, type JointName, type Limb, type Reg } from './rigPose'
import { ZoneHits } from './ZoneHits'
import { addZoneAttribute, applyZoneFx, createHalo, createZoneFx, setZone, skinnedMeshes, tidyMaterial, writeStencil, type ZoneFx } from './zoneFx'

/** The characters: the left fighter and the right one (optimised Mixamo models, see scripts/prepare-models.mjs). */
const MODEL_URL = { player: 'models/james.glb', enemy: 'models/amy.glb' } as const
const TEAM = { player: '#2bb893', enemy: '#d9474c' } as const
/** How tall each character is, relative to the driver skeleton (1 = as tall as the primitive fighter): James is a little taller. */
const HEIGHT = { player: 1.07, enemy: 1 } as const

const AIM_COLOR = '#ffc857'
const SHIELD_COLOR = '#58b8ff'
/** where the foot's ball and the front of the sole are, from the ankle (the driver's foot marker) */
const TOE = { x: 0.24, y: -0.17 }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const Y_AXIS = new Vector3(0, 1, 0)

interface Model {
  root: Object3D
  rig: Rig
  fx: ZoneFx
  /** the glow copies of the meshes (shown while a zone glows) */
  halos: SkinnedMesh[]
  /** metres -> figure units */
  k: number
  /** the mesh is lifted by this much so the soles of its feet are on the floor */
  lift: number
  /** how far along the hips -> neck path each spine bone is (from the rest pose) */
  spineAt: Record<'Spine' | 'Spine1' | 'Spine2', number>
  /** the length of a hand from the wrist to the knuckles (metres) */
  hand: number
  /** the head is enlarged to about the size of the target we aim at, and placed by the centre of the skull */
  head: { scale: number; centre: Vector3; up: Vector3 }
}

/** Makes this fighter's own copy of a character: its own skeleton and materials, the zone effects, the size. */
function buildModel(scene: Object3D, team: string): Model {
  const root = clone(scene)
  const fx = createZoneFx()
  const tint = new Color('#ffffff').lerp(new Color(team), 0.22)
  const halos: SkinnedMesh[] = []
  for (const mesh of skinnedMeshes(root)) {
    addZoneAttribute(mesh)
    mesh.frustumCulled = false // its bounds are those of the bind pose, not of the posed mesh
    mesh.castShadow = true
    const own = (m: MeshStandardMaterial): MeshStandardMaterial => {
      const c = m.clone()
      tidyMaterial(c)
      c.color.copy(tint)
      writeStencil(c)
      applyZoneFx(c, fx)
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => own(m as MeshStandardMaterial)) : own(mesh.material as MeshStandardMaterial)
    const halo = createHalo(mesh, fx)
    mesh.parent!.add(halo)
    halos.push(halo)
  }
  const rig = buildRig(root)
  const at = (n: string): Vector3 => rig.byName.get(n)!.restPos
  const head = measureHead(skinnedMeshes(root)[0]!, at('Neck').y)
  // sized by the legs (the hips are at the same height as the driver's), not by the height: a character with long legs is not squashed
  const k = (HIP_Y + ANKLE) / at('Hips').y
  fx.thick.value = 0.03 / k // the outline stands 0.03 off the body: thin
  const along = (n: string): number => (at(n).y - at('Hips').y) / (at('Neck').y - at('Hips').y)
  return {
    root, rig, fx, halos, k,
    lift: at('LeftFoot').y * k - ANKLE,
    spineAt: { Spine: along('Spine'), Spine1: along('Spine1'), Spine2: along('Spine2') },
    hand: at('LeftHandMiddle1').distanceTo(at('LeftHand')),
    head: {
      // the aimed-at head is a sphere of HEAD_R; the real head is smaller, so it is enlarged to meet the fists, but not to a bobblehead
      scale: Math.min(1.25, Math.max(1, (HEAD_R * 0.8) / (head.radius * k))),
      centre: head.centre.clone().sub(at('Head')).applyQuaternion(rig.byName.get('Head')!.restQuat.clone().invert()),
      // which way the head's own "up" points in the rest pose: some characters' heads are bowed forward (James, by about 20 degrees);
      // standing the head up straight takes all of that out and leaves it looking at the sky, so only part of it is taken out
      up: new Vector3(0, 1, 0).lerp(at('HeadTop_End').clone().sub(at('Head')).normalize(), 0.4).normalize(),
    },
  }
}

/** The middle and the size of the head of a character (the vertices that belong to the head zone, above the neck), in its rest pose. */
function measureHead(mesh: SkinnedMesh, neckY: number): { centre: Vector3; radius: number } {
  const pos = mesh.geometry.getAttribute('position')
  const zone = mesh.geometry.getAttribute('zoneW')
  const lo = new Vector3(Infinity, Infinity, Infinity)
  const hi = new Vector3(-Infinity, -Infinity, -Infinity)
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    if (zone.getX(i) < 0.5) continue // not (mostly) the head
    v.fromBufferAttribute(pos, i)
    if (v.y < neckY + 0.015) continue
    lo.min(v)
    hi.max(v)
  }
  return { centre: lo.clone().add(hi).multiplyScalar(0.5), radius: (hi.x - lo.x + (hi.z - lo.z)) / 4 }
}

interface Props {
  side: 'player' | 'enemy'
  view: FighterView
  settled: boolean
  /** frozen in a staged pose, heads turned to the camera (the poster); the game itself does not use it */
  stage?: Stage
}

/**
 * A fighter with a real (Mixamo) character. The pose still comes from `computePose` and is applied to an invisible driver
 * skeleton exactly as for the primitive fighter; every frame the character's bones are then turned and placed to follow the
 * driver's joints (rig.ts), so every strike still lands on the zone that was chosen.
 */
export function ModelFighter3D({ side, view, settled, stage }: Props) {
  const dir = side === 'player' ? 1 : -1
  const near = dir
  const phase = side === 'player' ? 0 : 2.1
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${MODEL_URL[side]}`)
  const model = useMemo(() => buildModel(gltf.scene, TEAM[side]), [gltf, side])
  const time = useRef(settled ? 10 : 0)
  const joints = useRef<Partial<Record<JointName, Object3D>>>({})
  const reg: Reg = (name) => (o) => {
    if (o) joints.current[name] = o
  }
  const white = useMemo(() => new Color('#ffffff'), [])
  const blue = useMemo(() => new Color(SHIELD_COLOR), [])
  const gold = useMemo(() => new Color(AIM_COLOR), [])
  const spark = useMemo(() => {
    if (!view.foe) return null
    const a = aimPoint(view.foe)
    const p = computePose(view.times.hitAt, poseInput(view))
    return [2 * BASE_X - p.x - a[0], a[1] - p.y] as const
  }, [view])

  useFrame((state, dt) => {
    if (!stage) time.current += Math.min(dt, 0.05)
    const t = stage ? stage.t : time.current
    const J = joints.current
    const { rig, fx, k } = model
    const P = computePose(t, poseInput(view), stage ? 0 : state.clock.elapsedTime, phase)
    applyPose(J, P, dir, near)
    J.ring!.position.y = 0.02 - P.y
    J.root!.updateMatrixWorld(true)

    // where the driver's joints are, in the character's own space (metres, +z forward, +x to its left)
    const facing = J.facing!
    const point = (name: JointName): Vector3 => facing.worldToLocal(J[name]!.getWorldPosition(new Vector3())).applyAxisAngle(Y_AXIS, -Math.PI / 2).divideScalar(k)
    const limb = (s: 'Left' | 'Right'): Limb => ((s === 'Right') === near > 0 ? 'N' : 'F') // the figure's +z side is the character's right
    const hips = point('pelvis')
    const waist = point('chest')
    const neck = point('neck')
    const headC = point('head')
    const path = (f: number): Vector3 => {
      const split = WAIST / (WAIST + NECK_UP) // the waist is this far along the way from the hips to the neck
      return f <= split ? hips.clone().lerp(waist, f / split) : waist.clone().lerp(neck, (f - split) / (1 - split))
    }
    const up = neck.clone().sub(waist).normalize()
    const headDir = headC.clone().sub(neck).normalize()

    const driven: Record<string, Vector3> = {
      Hips: hips,
      Spine: path(model.spineAt.Spine),
      Spine1: path(model.spineAt.Spine1),
      Spine2: path(model.spineAt.Spine2),
      Neck: neck,
    }
    const orient: Record<string, Orient> = {}
    for (const s of ['Left', 'Right'] as const) {
      const l = limb(s)
      const arm = point(`shoulder${l}`)
      const elbow = point(`elbow${l}`)
      const fist = point(`fist${l}`)
      const aim = fist.clone().sub(elbow).normalize()
      driven[`${s}Arm`] = arm
      driven[`${s}ForeArm`] = elbow
      driven[`${s}Hand`] = fist.clone().addScaledVector(aim, -model.hand * 0.9) // the wrist: the fist's centre is in the middle of the hand
      driven[`${s}Shoulder`] = driven.Spine2!.clone().lerp(arm, 0.35).addScaledVector(up, 0.15 / k)
      driven[`${s}UpLeg`] = point(`hip${l}`)
      driven[`${s}Leg`] = point(`knee${l}`)
      driven[`${s}Foot`] = point(`ankle${l}`)
      driven[`${s}ToeBase`] = point(`toe${l}`)
      // the fist: in the guard the palm faces the face, thrown out it faces down (the rest pose has it down)
      const extended = clamp01(1 - (l === 'N' ? P.armN.e : P.armF.e) / 1.6)
      const palm = headC.clone().sub(fist).normalize().lerp(new Vector3(0, -1, 0), extended).normalize()
      orient[`${s}Hand`] = { dir: aim, lat: palm, restLat: new Vector3(0, -1, 0) }
    }
    const hipLat = driven.LeftUpLeg!.clone().sub(driven.RightUpLeg!).normalize()
    const chestLat = driven.LeftArm!.clone().sub(driven.RightArm!).normalize()
    orient.Hips = { lat: hipLat }
    for (const n of ['Spine', 'Spine1', 'Spine2']) orient[n] = { lat: chestLat }
    // staged: the face is turned toward the camera (the camera is on the figure's +z side for the left fighter, -z for the right one)
    const toward = (amount: number): Vector3 => chestLat.clone().applyAxisAngle(headDir, -(stage?.headYaw ?? 0) * amount * near)
    orient.Neck = { dir: headDir, lat: toward(0.4) } // the neck and the head stand upright, whatever way the rest pose bows them
    orient.Head = {
      dir: headDir, lat: toward(1), rest: model.head.up,
      scale: model.head.scale,
      anchor: { point: headC, local: model.head.centre.clone().multiplyScalar(model.head.scale) }, // the skull's centre is where the driver's head is
    }
    orient.LeftFoot = { lat: hipLat }
    orient.RightFoot = { lat: hipLat }
    poseRig(rig, driven, orient, 1)

    // the struck zone flashes (white for a hit, blue for a guarded strike); the aimed / guarded zone glows
    fx.time.value = state.clock.elapsedTime
    fx.flashColor.copy(view.incoming?.blocked ? blue : white)
    for (const z of ['head', 'body', 'legs'] as const) {
      setZone(fx.flash, z, view.incoming?.zone === z ? P.flash : 0)
      const lit = !view.ko && (view.shield === z || view.aim === z)
      setZone(fx.glow, z, lit ? 1 : 0)
    }
    fx.glowColor.copy(view.shield ? blue : gold)
    const glowing = fx.glow.x + fx.glow.y + fx.glow.z > 0
    for (const h of model.halos) h.visible = glowing

    // the spark where the blow lands
    const age = clamp01((t - view.times.hitAt) / 0.45)
    const sp = J.burst!
    sp.visible = view.incoming !== null && t > view.times.hitAt && age < 1
    if (sp.visible) {
      sp.scale.setScalar(0.3 + age * 1.4)
      ;(sp as unknown as { material: MeshBasicMaterial }).material.opacity = 0.9 * (1 - age)
    }
  })

  return (
    <group ref={reg('root')} position={[-dir * BASE_X, 0, 0]}>
      <ZoneHits view={view} scale={HEIGHT[side]} />
      <group ref={reg('facing')} rotation-y={side === 'enemy' ? Math.PI : 0}>
        {/* the invisible driver skeleton: empty groups, the pose is applied to them */}
        <group ref={reg('tilt')}>
          <group ref={reg('pelvis')} position={[0, HIP_Y, 0]}>
            <Leg limb="N" z={near * HIP_Z} reg={reg} />
            <Leg limb="F" z={-near * HIP_Z} reg={reg} />
            <group ref={reg('chest')} position={[0, WAIST, 0]}>
              <Arm limb="N" z={near * SHOULDER_Z} reg={reg} />
              <Arm limb="F" z={-near * SHOULDER_Z} reg={reg} />
              <group ref={reg('neck')} position={[0, NECK_UP, 0]}>
                <group ref={reg('head')} position={[0, HEAD_UP, 0]} />
              </group>
            </group>
          </group>
        </group>

        {/* the character: turned to face +x (it is modelled facing +z), scaled to the figure, lifted so its feet are on the floor */}
        <group rotation-y={Math.PI / 2} scale={model.k * HEIGHT[side]} position={[0, model.lift * HEIGHT[side], 0]}>
          <primitive object={model.root} />
        </group>

        {/* a ring on the floor in the fighter's colour, and the spark where a blow lands */}
        <mesh ref={reg('ring')} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.62, 0.78, 40]} />
          <meshBasicMaterial color={TEAM[side]} transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh ref={reg('burst')} visible={false} position={spark ? [spark[0], spark[1], 0] : [0.6, 2, 0]}>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshBasicMaterial color={view.incoming?.blocked ? SHIELD_COLOR : '#ffffff'} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/** The driver's leg: hip -> knee -> ankle, and a marker where the ball of the foot is. Nothing is drawn. */
function Leg({ limb, z, reg }: { limb: Limb; z: number; reg: Reg }): ReactNode {
  return (
    <group ref={reg(`hip${limb}`)} position={[0, 0, z]}>
      <group ref={reg(`knee${limb}`)} position={[0, -THIGH, 0]}>
        <group ref={reg(`ankle${limb}`)} position={[0, -SHIN, 0]}>
          <group ref={reg(`toe${limb}`)} position={[TOE.x, TOE.y, 0]} />
        </group>
      </group>
    </group>
  )
}

/** The driver's arm: shoulder -> elbow -> the centre of the fist. Nothing is drawn. */
function Arm({ limb, z, reg }: { limb: Limb; z: number; reg: Reg }): ReactNode {
  return (
    <group ref={reg(`shoulder${limb}`)} position={[0, SHOULDER_UP, z]}>
      <group ref={reg(`elbow${limb}`)} position={[0, -UPPER, 0]}>
        <group ref={reg(`fist${limb}`)} position={[0, -FORE, 0]} />
      </group>
    </group>
  )
}

