import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Color, MeshStandardMaterial, Quaternion, Vector3, type MeshBasicMaterial, type Object3D, type SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useGame } from '../state/game'
import { fighterOf } from '../state/roster'
import { poseInput, type FighterView, type Stage } from './arenaView'
import { buildOf, useBuilds } from '../state/builds'
import { SUPER_GAP } from '../timing'
import { BASE_X, BODY_DEPTH, CHEST_C, FIST, FORE, NECK_UP, SHOULDER_Z, UPPER, WAIST, aimPoint, computePose, heightOf, STANDARD, type Build } from './pose'
import { buildRig, poseRig, type Orient, type Rig } from './rig'
import { applyPose, type JointName, type Limb, type Reg } from './rigPose'
import { ZoneHits } from './ZoneHits'
import { addZoneAttribute, applyZoneFx, createHalo, createZoneFx, setZone, skinnedMeshes, tidyMaterial, writeStencil, type ZoneFx } from './zoneFx'

/** The characters are the ones chosen (optimised Mixamo models, see scripts/prepare-models.mjs and state/roster.ts). */
const TEAM = { player: '#2bb893', enemy: '#d9474c' } as const

/** how much of the turn of the palm the forearm takes over (0 = none, 1 = all of it) */
const FOREARM_ROLL = 0.7

/** how far each fist is turned in toward the other, about the forearm (radians) */
const FIST_TURN = 0.4

const OVERLAY = /eyes?_?spec|tear_?line|occlusion/i

const AIM_COLOR = '#ffc857'
const SHIELD_COLOR = '#58b8ff'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const Y_AXIS = new Vector3(0, 1, 0)

interface Model {
  root: Object3D
  rig: Rig
  fx: ZoneFx
  /** the glow copies of the meshes (shown while a zone glows) */
  halos: SkinnedMesh[]
  /** model units (metres) -> figure units */
  k: number
  /** the character's own lengths, in figure units: the driver skeleton is made to the same measure, so nothing is stretched */
  build: Build
  /** how far the collar bone is above the point between the spine and the shoulder (model units): the shoulders sit as high as the character's own do */
  clavicle: number
  /** where the ball of the foot is, from the ankle, forward and up (figure units; negative = down): the foot is not stretched or shrunk */
  toe: { x: number; y: number }
  /** how far along the hips -> neck path each spine bone is (from the rest pose) */
  spineAt: Record<'Spine' | 'Spine1' | 'Spine2', number>
  /** the length of a hand from the wrist to the knuckles (metres) */
  hand: number
  /** which way the head's own "up" points in the rest pose, partly taken out */
  head: { up: Vector3 }
}

/**
 * Makes this fighter's own copy of a character: its own skeleton and materials, the zone effects, and its build: the lengths of
 * its bones, measured in the rest pose and scaled so that the character is `height` times as tall as the standard figure.
 */
function buildModel(scene: Object3D, team: string, hide: readonly string[], id: string, height: number): Model {
  const root = clone(scene)
  // parts that are left out: the ones the fighter's entry names, and the see-through overlays of the eyes (the specular shell of the
  // eyes, a tear line), which are drawn opaque here and would make the eyes black
  for (const mesh of skinnedMeshes(root)) if (OVERLAY.test(mesh.name) || hide.some((h) => mesh.name.startsWith(h))) mesh.removeFromParent()
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
  const dist = (a: string, b: string): number => at(a).distanceTo(at(b))
  const meshes = skinnedMeshes(root)
  const head = measureHead(meshes, at('Neck').y)
  // the top of the head: its own bone, or (a few characters have none) the top of the head's vertices
  const headTop = rig.byName.get('HeadTop_End')?.restPos ?? head.centre
  // figure units per metre: the character, from the soles to the top of its head, is as tall as the standard figure (times `height`)
  const k = (heightOf(STANDARD) * height) / (head.top - floorOf(meshes))
  fx.thick.value = 0.03 / k // the outline stands 0.03 off the body: thin
  const along = (n: string): number => (at(n).y - at('Hips').y) / (at('Neck').y - at('Hips').y)
  const hand = at('LeftHandMiddle1').distanceTo(at('LeftHand'))
  const torso = at('Neck').y - at('Hips').y
  const waist = (torso * WAIST) / (WAIST + NECK_UP) // the driver's waist is at the same share of the way from the hips to the neck
  const upper = dist('LeftArm', 'LeftForeArm') * k
  const fore = (dist('LeftForeArm', 'LeftHand') + hand * 0.9) * k // to the middle of the fist
  const shoulderZ = (Math.abs(at('LeftArm').x - at('RightArm').x) / 2) * k
  const neckUp = (torso - waist) * k
  const build: Build = {
    id,
    hipY: (at('LeftUpLeg').y - at('LeftFoot').y) * k,
    thigh: dist('LeftUpLeg', 'LeftLeg') * k,
    shin: dist('LeftLeg', 'LeftFoot') * k,
    foot: dist('LeftFoot', rig.byName.has('LeftToe_End') ? 'LeftToe_End' : 'LeftToeBase') * k,
    ankle: (at('LeftFoot').y - floorOf(meshes)) * k,
    upper,
    fore,
    fist: (FIST * (upper + fore)) / (UPPER + FORE),
    waist: waist * k,
    shoulderUp: (at('LeftArm').y - at('Hips').y - waist) * k,
    neckUp,
    headUp: head.centre.distanceTo(at('Neck')) * k,
    headR: head.radius * k,
    bodyDepth: (BODY_DEPTH / SHOULDER_Z) * shoulderZ,
    chestC: (CHEST_C / NECK_UP) * neckUp,
    shoulderZ,
    hipZ: (Math.abs(at('LeftUpLeg').x - at('RightUpLeg').x) / 2) * k,
  }
  return {
    root, rig, fx, halos, k, build,
    clavicle: at('LeftShoulder').y - (at('Spine2').y * 0.65 + at('LeftArm').y * 0.35),
    toe: { x: Math.abs(at('LeftToeBase').z - at('LeftFoot').z) * k, y: (at('LeftToeBase').y - at('LeftFoot').y) * k },
    spineAt: { Spine: along('Spine'), Spine1: along('Spine1'), Spine2: along('Spine2') },
    hand,
    head: {
      // which way the head's own "up" points in the rest pose: some characters' heads are bowed forward (James, by about 20 degrees);
      // standing the head up straight takes all of that out and leaves it looking at the sky, so only part of it is taken out
      up: new Vector3(0, 1, 0).lerp(headTop.clone().sub(at('Head')).normalize(), 0.4).normalize(),
    },
  }
}

/** The floor the character stands on: the lowest vertex of any of its parts, in its rest pose. */
function floorOf(meshes: SkinnedMesh[]): number {
  let low = Infinity
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) low = Math.min(low, pos.getY(i))
  }
  return low
}

/** The middle, the size and the top of the head of a character (the vertices that belong to the head zone, above the neck), in its rest pose. */
function measureHead(meshes: SkinnedMesh[], neckY: number): { centre: Vector3; radius: number; top: number } {
  const lo = new Vector3(Infinity, Infinity, Infinity)
  const hi = new Vector3(-Infinity, -Infinity, -Infinity)
  const v = new Vector3()
  // a character can be made of several pieces (a face, a helmet, a weapon): the head is whatever of them belongs to the head zone
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position')
    const zone = mesh.geometry.getAttribute('zoneW')
    for (let i = 0; i < pos.count; i++) {
      if (zone.getX(i) < 0.5) continue // not (mostly) the head
      v.fromBufferAttribute(pos, i)
      if (v.y < neckY + 0.015) continue
      lo.min(v)
      hi.max(v)
    }
  }
  return { centre: lo.clone().add(hi).multiplyScalar(0.5), radius: (hi.x - lo.x + (hi.z - lo.z)) / 4, top: hi.y }
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
  const character = fighterOf(useGame((s) => s.fighters[side]))
  const foeId = useGame((s) => s.fighters[side === 'player' ? 'enemy' : 'player'])
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}${character.model}`)
  const model = useMemo(() => buildModel(gltf.scene, TEAM[side], character.hide, character.id, character.height), [gltf, side, character])
  const bd = model.build
  // the opponent's blows and ours are worked out for the two builds: the opponent's is known once its model is loaded
  const registerBuild = useBuilds((s) => s.set)
  useEffect(() => registerBuild(bd), [bd, registerBuild])
  const foeBuild = useBuilds((s) => s.builds[foeId]) ?? STANDARD
  const input = (): ReturnType<typeof poseInput> => ({ ...poseInput(view), build: bd, foeBuild: buildOf(foeId) })
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
    const a = aimPoint(view.foe, foeBuild, bd)
    const p = computePose(view.times.hitAt, { ...poseInput(view), build: bd, foeBuild })
    return [2 * BASE_X - p.x - a[0], a[1] - p.y] as const
  }, [view, bd, foeBuild])

  useFrame((state, dt) => {
    if (!stage) time.current += Math.min(dt, 0.05)
    const t = stage ? stage.t : time.current
    const J = joints.current
    const { rig, fx, k } = model
    const P = computePose(t, input(), stage ? (stage.clock ?? 0) : state.clock.elapsedTime, phase)
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
      const split = bd.waist / (bd.waist + bd.neckUp) // the waist is this far along the way from the hips to the neck
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
      driven[`${s}Shoulder`] = driven.Spine2!.clone().lerp(arm, 0.35).addScaledVector(up, model.clavicle + character.shoulders / k)
      driven[`${s}UpLeg`] = point(`hip${l}`)
      driven[`${s}Leg`] = point(`knee${l}`)
      driven[`${s}Foot`] = point(`ankle${l}`)
      driven[`${s}ToeBase`] = point(`toe${l}`)
      // the fist: in the guard the palm faces the face, thrown out it faces down (the rest pose has it down)
      const extended = clamp01(1 - (l === 'N' ? P.armN.e : P.armF.e) / 1.6)
      const palm = headC.clone().sub(fist).normalize().lerp(new Vector3(0, -1, 0), extended).normalize()
      // the fists are turned toward each other a little: the fingers do not point straight up
      palm.applyAxisAngle(aim, (s === 'Left' ? 1 : -1) * FIST_TURN)
      orient[`${s}Hand`] = { dir: aim, lat: palm, restLat: new Vector3(0, -1, 0) }
      // the forearm turns with the hand, most of the way (there is no twist bone, and a hand that turned alone would wring the wrist):
      // from the roll it has with no help (the shortest turn from the T-pose) toward the roll of the palm
      const restDir = rig.byName.get(`${s}Hand`)!.restPos.clone().sub(rig.byName.get(`${s}ForeArm`)!.restPos).normalize()
      const natural = new Vector3(0, -1, 0).applyQuaternion(new Quaternion().setFromUnitVectors(restDir, aim))
      orient[`${s}ForeArm`] = { lat: natural.lerp(palm, FOREARM_ROLL).normalize(), restLat: new Vector3(0, -1, 0) }
    }
    const hipLat = driven.LeftUpLeg!.clone().sub(driven.RightUpLeg!).normalize()
    const chestLat = driven.LeftArm!.clone().sub(driven.RightArm!).normalize()
    orient.Hips = { lat: hipLat }
    for (const n of ['Spine', 'Spine1', 'Spine2']) orient[n] = { lat: chestLat }
    // staged: the face is turned toward the camera (the camera is on the figure's +z side for the left fighter, -z for the right one)
    const toward = (amount: number): Vector3 => chestLat.clone().applyAxisAngle(headDir, -((stage ? ((side === 'enemy' ? stage.headYawRight : undefined) ?? stage.headYaw ?? 0) : 0) + (P.headYaw ?? 0)) * amount * near)
    orient.Neck = { dir: headDir, lat: toward(0.4) } // the neck and the head stand upright, whatever way the rest pose bows them
    orient.Head = {
      dir: headDir, lat: toward(1), rest: model.head.up,
    }
    orient.LeftFoot = { lat: hipLat }
    orient.RightFoot = { lat: hipLat }
    poseRig(rig, driven, orient, 1)

    // the struck zone flashes (white for a hit, blue for a guarded strike); the aimed / guarded zone glows
    fx.time.value = state.clock.elapsedTime
    fx.flashColor.copy(view.incoming?.blocked ? blue : white)
    for (const z of ['head', 'body', 'legs'] as const) {
      // the zone that was struck flashes, and so does the other part of a super strike (when it landed), SUPER_GAP later or earlier
      const inc = view.incoming
      const part = (blocked: boolean, delay: number): number => (blocked ? 0 : clamp01(1 - (t - view.times.hitAt - delay) / 0.45) * Number(t > view.times.hitAt + delay))
      const flash = inc?.zone === z ? part(inc.blocked, inc.delay) : inc?.also?.zone === z ? part(inc.also.blocked, inc.delay === 0 ? SUPER_GAP : 0) : 0
      setZone(fx.flash, z, inc?.zone === z && inc.blocked ? P.flash : flash)
      const lit = !view.ko && (view.shield === z || view.aim === z || view.aim2 === z)
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
      <ZoneHits view={view} build={bd} />
      <group ref={reg('facing')} rotation-y={stage?.front ? -Math.PI / 2 : side === 'enemy' ? Math.PI : 0}>
        {/* the invisible driver skeleton: empty groups, the pose is applied to them */}
        <group ref={reg('tilt')}>
          <group ref={reg('pelvis')} position={[0, bd.hipY, 0]}>
            <Leg limb="N" z={near * bd.hipZ} reg={reg} bd={bd} toe={model.toe} />
            <Leg limb="F" z={-near * bd.hipZ} reg={reg} bd={bd} toe={model.toe} />
            <group ref={reg('chest')} position={[0, bd.waist, 0]}>
              <Arm limb="N" z={near * bd.shoulderZ} reg={reg} bd={bd} />
              <Arm limb="F" z={-near * bd.shoulderZ} reg={reg} bd={bd} />
              <group ref={reg('neck')} position={[0, bd.neckUp, 0]}>
                <group ref={reg('head')} position={[0, bd.headUp, 0]} />
              </group>
            </group>
          </group>
        </group>

        {/* the character: turned to face +x (it is modelled facing +z), scaled to the figure, lifted so its feet are on the floor */}
        <group rotation-y={Math.PI / 2} scale={model.k}>
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
function Leg({ limb, z, reg, bd, toe }: { limb: Limb; z: number; reg: Reg; bd: Build; toe: { x: number; y: number } }): ReactNode {
  return (
    <group ref={reg(`hip${limb}`)} position={[0, 0, z]}>
      <group ref={reg(`knee${limb}`)} position={[0, -bd.thigh, 0]}>
        <group ref={reg(`ankle${limb}`)} position={[0, -bd.shin, 0]}>
          <group ref={reg(`toe${limb}`)} position={[toe.x, toe.y, 0]} />
        </group>
      </group>
    </group>
  )
}

/** The driver's arm: shoulder -> elbow -> the centre of the fist. Nothing is drawn. */
function Arm({ limb, z, reg, bd }: { limb: Limb; z: number; reg: Reg; bd: Build }): ReactNode {
  return (
    <group ref={reg(`shoulder${limb}`)} position={[0, bd.shoulderUp, z]}>
      <group ref={reg(`elbow${limb}`)} position={[0, -bd.upper, 0]}>
        <group ref={reg(`fist${limb}`)} position={[0, -bd.fore, 0]} />
      </group>
    </group>
  )
}

