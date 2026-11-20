/**
 * Puts our skeleton's pose on a Mixamo rig (the "retargeting" of option B): the angles come from `computePose`, the character
 * (a skinned mesh with Mixamo's 65 bones) only follows them. Pure maths on three.js vectors: no React, no GL, testable in node.
 *
 * For every bone that has a counterpart in our skeleton we are told where it must be (a position, in the rig's own space) and
 * where it must point (the direction to its child, or one given explicitly). Each bone is then turned from its rest (T-pose)
 * orientation by the shortest arc that takes its rest direction to the wanted one; where the twist about the bone matters
 * (the hips, the spine, the head, the feet) a second direction (the lateral axis, from left to right) fixes it as well.
 * The positions are set directly, so a limb is stretched or squashed to the proportions of our skeleton: that is what keeps a
 * strike that is aimed at a zone landing on it.
 */
import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three'

/**
 * Mixamo names the bones `mixamorig:Hips`, and sometimes `mixamorig9:Hips`: the number differs between downloads. three.js
 * drops the colon from node names when it loads a glTF (`mixamorigHips`), so it is optional here.
 */
export const boneName = (n: string): string => n.replace(/^mixamorig\d*:?/, '')

/** The child whose direction gives each bone its direction. */
export const CHILD: Readonly<Record<string, string>> = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToe_End',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToe_End',
}

export interface RigBone {
  /** the name without the `mixamorig:` prefix */
  name: string
  bone: Bone
  parent: RigBone | null
  /** rest pose, in the space of the rig's root (the T-pose) */
  restPos: Vector3
  restQuat: Quaternion
  /** rest pose relative to the parent bone */
  restLocalPos: Vector3
  restLocalQuat: Quaternion
  /**
   * Fingers only: the axis, in the bone's own frame, about which turning the joint closes the finger toward the palm.
   * Worked out from the rest pose (the palm faces down in a T-pose), because the bones' own axes differ between characters.
   */
  curlAxis?: Vector3
}

export interface Rig {
  /** parents come before their children */
  bones: RigBone[]
  byName: Map<string, RigBone>
}

/** Reads the rest pose of every bone under `root` (call it before anything has moved the bones). */
export function buildRig(root: Object3D): Rig {
  root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(root.matrixWorld).invert()
  const bones: RigBone[] = []
  const byName = new Map<string, RigBone>()
  const visit = (o: Object3D, parent: RigBone | null): void => {
    let here = parent
    if ((o as Bone).isBone) {
      const m = new Matrix4().multiplyMatrices(inv, o.matrixWorld)
      const restPos = new Vector3()
      const restQuat = new Quaternion()
      m.decompose(restPos, restQuat, new Vector3())
      const rb: RigBone = {
        name: boneName(o.name),
        bone: o as Bone,
        parent,
        restPos,
        restQuat,
        restLocalPos: o.position.clone(),
        restLocalQuat: o.quaternion.clone(),
      }
      bones.push(rb)
      byName.set(rb.name, rb)
      here = rb
    }
    for (const c of o.children) visit(c, here)
  }
  visit(root, null)
  // the way each finger joint closes. Fingers: from their direction along the finger toward the palm (down in the T-pose).
  // The thumb: it does not close toward the palm but across it, toward the little finger (and down), so that in a fist it lies
  // over the fingers instead of sticking out.
  for (const rb of bones) {
    const m = /^(.*Hand)(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(rb.name)
    const next = m ? byName.get(`${m[1]}${m[2]}${Number(m[3]) + 1}`) : undefined
    if (!m || !next) continue
    const along = next.restPos.clone().sub(rb.restPos).normalize()
    const palm = new Vector3(0, -1, 0)
    let toward = palm
    if (m[2] === 'Thumb') {
      const index = byName.get(`${m[1]}Index1`)
      const pinky = byName.get(`${m[1]}Pinky1`)
      if (index && pinky) toward = pinky.restPos.clone().sub(index.restPos).normalize().multiplyScalar(0.9).addScaledVector(palm, 0.5).normalize()
    }
    const axis = new Vector3().crossVectors(along, toward)
    if (axis.lengthSq() > 1e-8) rb.curlAxis = axis.normalize().applyQuaternion(rb.restQuat.clone().invert())
  }
  return { bones, byName }
}

export interface Orient {
  /** where the bone must point (a unit vector, in the rig's space); by default: toward its driven child */
  dir?: Vector3
  /** which way the bone's rest direction is taken to be, when it is not the way to its child (the head and the neck: up) */
  rest?: Vector3
  /** the lateral axis, from the character's right side to its left (the rest pose has it along +x); fixes the twist */
  lat?: Vector3
  /** the direction that `lat` takes in the rest pose, when it is not +x (a hand: the palm, which faces down in a T-pose) */
  restLat?: Vector3
  /**
   * Places the bone so that a point that is rigidly attached to it (`local`, an offset from the bone, already scaled) ends up
   * at `point`: the head is placed by the centre of the skull, not by the joint at the base of it.
   */
  anchor?: { point: Vector3; local: Vector3 }
  /** a uniform scale for the bone (and the part of the mesh it moves, and its children) */
  scale?: number
}

const X = new Vector3(1, 0, 0)

/** An orthonormal frame whose first axis is `a` and whose second lies in the plane of `a` and `b`. */
function frame(a: Vector3, b: Vector3): Matrix4 {
  const x = a.clone().normalize()
  const y = b.clone().sub(x.clone().multiplyScalar(x.dot(b)))
  if (y.lengthSq() < 1e-10) y.set(0, 1, 0).sub(x.clone().multiplyScalar(x.y)) // b along a: any perpendicular will do
  y.normalize()
  const z = new Vector3().crossVectors(x, y)
  return new Matrix4().makeBasis(x, y, z)
}

/** How far each joint of a finger (knuckle, middle, tip) and of the thumb curls (radians) when the hand makes a tight fist. */
const CURL = {
  finger: { 1: 1.5, 2: 1.8, 3: 1.35 },
  thumb: { 1: 0.5, 2: 0.65, 3: 0.55 },
} as const

/**
 * Poses the rig.
 * @param driven where each driven bone must be (rig space); the other bones follow their parent at their rest offset
 * @param orient where bones must point, for those that do not point at a driven child
 * @param fist how tightly the hands are closed, 0 (open, as in the T-pose) to 1
 */
export function poseRig(rig: Rig, driven: Readonly<Record<string, Vector3>>, orient: Readonly<Record<string, Orient>>, fist = 0): void {
  const wPos = new Map<string, Vector3>()
  const wQuat = new Map<string, Quaternion>()
  for (const rb of rig.bones) {
    const pp = rb.parent ? wPos.get(rb.parent.name)! : new Vector3()
    const pq = rb.parent ? wQuat.get(rb.parent.name)! : new Quaternion()
    let pos = driven[rb.name]?.clone() ?? rb.restLocalPos.clone().applyQuaternion(pq).add(pp)

    const o = orient[rb.name]
    const childName = CHILD[rb.name]
    const child = childName ? rig.byName.get(childName) : undefined
    let dir = o?.dir
    if (!dir && childName && driven[childName]) dir = driven[childName]!.clone().sub(pos)
    let quat: Quaternion
    if (dir && (child || o?.rest)) {
      dir = dir.clone().normalize()
      const restDir = o?.rest?.clone().normalize() ?? child!.restPos.clone().sub(rb.restPos).normalize()
      const rot = o?.lat
        ? new Quaternion().setFromRotationMatrix(new Matrix4().multiplyMatrices(frame(dir, o.lat), frame(restDir, o.restLat ?? X).invert()))
        : new Quaternion().setFromUnitVectors(restDir, dir)
      quat = rot.multiply(rb.restQuat)
    } else {
      quat = pq.clone().multiply(rb.restLocalQuat)
    }
    if (o?.anchor) pos = o.anchor.point.clone().sub(o.anchor.local.clone().applyQuaternion(quat))
    if (o?.scale !== undefined) rb.bone.scale.setScalar(o.scale)
    wPos.set(rb.name, pos)
    wQuat.set(rb.name, quat)

    const inverse = pq.clone().invert()
    rb.bone.position.copy(pos).sub(pp).applyQuaternion(inverse)
    rb.bone.quaternion.copy(inverse).multiply(quat)

    // a closed hand: the finger joints curl toward the palm, the thumb a little less
    const finger = /Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(rb.name)
    if (finger && rb.curlAxis && fist > 0) {
      const amount = CURL[finger[1] === 'Thumb' ? 'thumb' : 'finger'][Number(finger[2]) as 1 | 2 | 3] * fist
      rb.bone.quaternion.multiply(new Quaternion().setFromAxisAngle(rb.curlAxis, amount))
    }
  }
}
