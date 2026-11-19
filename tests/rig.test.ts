import type { MeshBasicMaterial } from 'three'
import { Bone, BufferAttribute, BufferGeometry, Float32BufferAttribute, Object3D, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { boneName, buildRig, poseRig, type Orient, type Rig } from '../src/ui/rig'
import { AdditiveBlending, BackSide, MeshStandardMaterial, NotEqualStencilFunc, ReplaceStencilOp } from 'three'
import { addZoneAttribute, createHalo, createZoneFx, writeStencil, zoneOfBone } from '../src/ui/zoneFx'

/** A small Mixamo-like rig in a T-pose (metres): a spine up the middle, the left arm along +x, the left leg down, +z forward. */
function tRig(prefix = 'mixamorig:'): { root: Object3D; rig: Rig } {
  const root = new Object3D()
  const make = (name: string, parent: Object3D, x: number, y: number, z: number): Bone => {
    const b = new Bone()
    b.name = prefix + name
    b.position.set(x, y, z)
    parent.add(b)
    return b
  }
  const hips = make('Hips', root, 0, 1, 0)
  const spine = make('Spine', hips, 0, 0.1, 0)
  const spine1 = make('Spine1', spine, 0, 0.15, 0)
  const spine2 = make('Spine2', spine1, 0, 0.15, 0)
  const neck = make('Neck', spine2, 0, 0.15, 0)
  const head = make('Head', neck, 0, 0.1, 0)
  make('HeadTop_End', head, 0, 0.2, 0.05)
  const shoulder = make('LeftShoulder', spine2, 0.05, 0.1, 0)
  const arm = make('LeftArm', shoulder, 0.1, 0, 0)
  const fore = make('LeftForeArm', arm, 0.25, 0, 0)
  const hand = make('LeftHand', fore, 0.25, 0, 0)
  make('LeftHandMiddle1', hand, 0.08, 0, 0)
  const finger1 = make('LeftHandIndex1', hand, 0.08, 0, 0.02)
  const finger2 = make('LeftHandIndex2', finger1, 0.03, 0, 0)
  make('LeftHandIndex3', finger2, 0.03, 0, 0)
  const upLeg = make('LeftUpLeg', hips, 0.1, -0.05, 0)
  const leg = make('LeftLeg', upLeg, 0, -0.4, 0)
  const foot = make('LeftFoot', leg, 0, -0.4, 0)
  const toe = make('LeftToeBase', foot, 0, -0.08, 0.1)
  make('LeftToe_End', toe, 0, 0, 0.08)
  return { root, rig: buildRig(root) }
}

const world = (rig: Rig, name: string): Vector3 => {
  rig.byName.get(name)!.bone.updateWorldMatrix(true, false)
  return rig.byName.get(name)!.bone.getWorldPosition(new Vector3())
}
const near = (a: Vector3, b: Vector3, eps = 1e-5): void => {
  expect(a.distanceTo(b)).toBeLessThan(eps)
}

describe('boneName', () => {
  it('drops the Mixamo prefix, with or without the colon and with or without a number', () => {
    for (const n of ['mixamorig:Hips', 'mixamorig9:Hips', 'mixamorigHips', 'mixamorig9Hips', 'Hips']) expect(boneName(n)).toBe('Hips')
    expect(boneName('mixamorig:LeftHandIndex1')).toBe('LeftHandIndex1')
  })
})

describe('buildRig', () => {
  it('finds every bone, parents first, with its rest pose in the space of the root', () => {
    const { rig } = tRig()
    expect(rig.bones[0]!.name).toBe('Hips')
    expect(rig.byName.size).toBe(rig.bones.length)
    near(rig.byName.get('Neck')!.restPos, new Vector3(0, 1.55, 0)) // hips 1 + spine 0.1 + 0.15 + 0.15 + neck 0.15
    near(rig.byName.get('LeftHand')!.restPos, new Vector3(0.65, 1.5, 0)) // shoulder 0.05 + 0.1 + 0.25 + 0.25 along x, 0.1 above the spine
    expect(rig.byName.get('Spine')!.parent!.name).toBe('Hips')
  })

  it('reads the same names whatever the prefix', () => {
    const { rig } = tRig('mixamorig9')
    expect([...rig.byName.keys()]).toContain('LeftToe_End')
  })
})

describe('poseRig', () => {
  /** every driven bone left where it is at rest */
  const restTargets = (rig: Rig, names: string[]): Record<string, Vector3> => Object.fromEntries(names.map((n) => [n, rig.byName.get(n)!.restPos.clone()]))
  const ALL = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase']

  it('leaves the rig in its rest pose when the targets are the rest positions', () => {
    const { rig, root } = tRig()
    poseRig(rig, restTargets(rig, ALL), {})
    root.updateMatrixWorld(true)
    for (const rb of rig.bones) {
      near(world(rig, rb.name), rb.restPos)
      const q = rb.bone.getWorldQuaternion(new Quaternion())
      expect(Math.abs(q.dot(rb.restQuat))).toBeCloseTo(1, 5) // the same rotation (a quaternion and its negative are one rotation)
    }
  })

  it('puts every driven bone exactly at its target', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    // raise the left arm straight up and bend the left knee forward
    t.LeftArm = new Vector3(0.15, 1.45, 0)
    t.LeftForeArm = new Vector3(0.15, 1.7, 0)
    t.LeftHand = new Vector3(0.15, 1.95, 0)
    t.LeftLeg = new Vector3(0.1, 0.8, 0.3)
    t.LeftFoot = new Vector3(0.1, 0.4, 0.3)
    poseRig(rig, t, {})
    root.updateMatrixWorld(true)
    for (const n of ALL) near(world(rig, n), t[n]!, 1e-4)
  })

  it('turns a bone so that it points at its child, by the shortest arc from the rest pose', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    t.LeftForeArm = new Vector3(0.35, 1.45, 0.3).add(new Vector3(0.1, 0.3, 0)) // the forearm goes up and forward
    t.LeftHand = t.LeftForeArm.clone().add(new Vector3(0, 0.1, 0.4))
    poseRig(rig, t, {})
    root.updateMatrixWorld(true)
    const arm = rig.byName.get('LeftArm')!
    const delta = arm.bone.getWorldQuaternion(new Quaternion()).multiply(arm.restQuat.clone().invert()) // rest -> posed
    const restDir = rig.byName.get('LeftForeArm')!.restPos.clone().sub(arm.restPos).normalize()
    const want = t.LeftForeArm.clone().sub(t.LeftArm!).normalize()
    near(restDir.applyQuaternion(delta), want, 1e-4)
  })

  it('a lateral axis sets the twist: the hips turned to face sideways', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    const orient: Record<string, Orient> = { Hips: { lat: new Vector3(0, 0, 1) } } // the left side of the hips now points forward
    poseRig(rig, t, orient)
    root.updateMatrixWorld(true)
    const hips = rig.byName.get('Hips')!
    const delta = hips.bone.getWorldQuaternion(new Quaternion()).multiply(hips.restQuat.clone().invert())
    near(new Vector3(1, 0, 0).applyQuaternion(delta), new Vector3(0, 0, 1), 1e-4)
    near(new Vector3(0, 1, 0).applyQuaternion(delta), new Vector3(0, 1, 0), 1e-4) // and it still stands up
  })

  it('an explicit direction and rest direction turn the head about its own up axis, ignoring the tilt of its rest pose', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    // lean the head back by 30 degrees
    const back = new Vector3(0, Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6))
    poseRig(rig, t, { Head: { dir: back, rest: new Vector3(0, 1, 0) } })
    root.updateMatrixWorld(true)
    const head = rig.byName.get('Head')!
    const delta = head.bone.getWorldQuaternion(new Quaternion()).multiply(head.restQuat.clone().invert())
    near(new Vector3(0, 1, 0).applyQuaternion(delta), back, 1e-4)
  })

  it('an anchor places a bone by a point attached to it (the centre of the skull)', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    const local = new Vector3(0, 0.12, 0.02)
    const point = new Vector3(0.05, 1.7, 0.1)
    const dir = new Vector3(0, 1, -0.4).normalize()
    poseRig(rig, t, { Head: { dir, rest: new Vector3(0, 1, 0), anchor: { point, local }, scale: 1 } })
    root.updateMatrixWorld(true)
    const head = rig.byName.get('Head')!.bone
    // the attached point, carried by the posed head, is where it was asked to be
    const attached = local.clone().applyQuaternion(head.getWorldQuaternion(new Quaternion())).add(head.getWorldPosition(new Vector3()))
    near(attached, point, 1e-4)
  })

  it('scales a bone (the head) when asked', () => {
    const { rig } = tRig()
    poseRig(rig, restTargets(rig, ALL), { Head: { scale: 1.3 } })
    expect(rig.byName.get('Head')!.bone.scale.x).toBeCloseTo(1.3)
  })

  it('curls the fingers when the fist is closed, and not when it is open', () => {
    const { rig } = tRig()
    const t = restTargets(rig, ALL)
    poseRig(rig, t, {}, 0)
    const open = rig.byName.get('LeftHandIndex2')!.bone.quaternion.clone()
    expect(Math.abs(open.dot(rig.byName.get('LeftHandIndex2')!.restLocalQuat))).toBeCloseTo(1, 6)
    poseRig(rig, t, {}, 1)
    const closed = rig.byName.get('LeftHandIndex2')!.bone.quaternion.clone()
    expect(Math.abs(closed.dot(open))).toBeLessThan(0.95) // turned by about a radian
    // the finger bends toward the palm (down in the T-pose): its tip drops below the knuckle
    rig.bones[0]!.bone.updateWorldMatrix(true, true)
    expect(world(rig, 'LeftHandIndex3').y).toBeLessThan(world(rig, 'LeftHandIndex1').y)
  })

  it('is stateless: posing twice gives the same pose (nothing accumulates)', () => {
    const { rig, root } = tRig()
    const t = restTargets(rig, ALL)
    t.LeftForeArm = new Vector3(0.35, 1.9, 0.1)
    t.LeftHand = new Vector3(0.4, 2.1, 0.3)
    poseRig(rig, t, { Hips: { lat: new Vector3(0.3, 0, 1).normalize() } }, 0.8)
    root.updateMatrixWorld(true)
    const first = rig.bones.map((b) => b.bone.getWorldPosition(new Vector3()))
    poseRig(rig, t, { Hips: { lat: new Vector3(0.3, 0, 1).normalize() } }, 0.8)
    root.updateMatrixWorld(true)
    rig.bones.forEach((b, i) => near(b.bone.getWorldPosition(new Vector3()), first[i]!, 1e-6))
  })
})

describe('closing a fist', () => {
  /** A hand with an index finger of four bones, along `dir` in the T-pose, whose bones' own axes are turned by `roll` (as they are in some characters). */
  function hand(side: 'Left' | 'Right', dir: number, roll: Quaternion): { root: Object3D; rig: Rig } {
    const root = new Object3D()
    const bone = (name: string, parent: Object3D, x: number, quat?: Quaternion): Bone => {
      const b = new Bone()
      b.name = `mixamorig:${name}`
      b.position.set(x, 0, 0)
      if (quat) b.quaternion.copy(quat)
      parent.add(b)
      return b
    }
    const wrist = bone(`${side}Hand`, root, 0)
    bone(`${side}HandMiddle1`, wrist, dir * 0.08)
    // the finger joints are laid out along the finger, in the (turned) frame of the bone above
    let parent: Object3D = wrist
    for (let i = 1; i <= 4; i++) parent = bone(`${side}HandIndex${i}`, parent, dir * 0.03, i === 1 ? roll : undefined)
    return { root, rig: buildRig(root) }
  }
  const rolls: [string, Quaternion][] = [
    ['aligned with the world', new Quaternion()],
    ['turned a half-turn about the finger', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)],
    ['turned a quarter-turn about the finger', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)],
    ['turned about the vertical', new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)],
  ]
  for (const [side, dir] of [['Left', 1], ['Right', -1]] as const) {
    for (const [label, roll] of rolls) {
      it(`closes a ${side.toLowerCase()} hand toward the palm (down), whatever the bones' axes are: ${label}`, () => {
        const { rig, root } = hand(side, dir, roll)
        root.updateMatrixWorld(true)
        const length = world(rig, `${side}HandIndex1`).distanceTo(world(rig, `${side}HandIndex4`))
        poseRig(rig, { [`${side}Hand`]: new Vector3() }, {}, 1)
        root.updateMatrixWorld(true)
        // the finger first goes DOWN (toward the palm), not up: the middle joint drops below the knuckle ...
        expect(world(rig, `${side}HandIndex1`).y - world(rig, `${side}HandIndex2`).y, 'the first joint bends toward the palm').toBeGreaterThan(0.01)
        // ... and the whole finger is folded up: its tip is close to the knuckle
        expect(world(rig, `${side}HandIndex1`).distanceTo(world(rig, `${side}HandIndex4`))).toBeLessThan(length * 0.65)
      })
    }
  }
})

describe('the thumb of a fist', () => {
  /** A left hand in a T-pose (fingers along +x, palm down, the thumb side toward +z, the little finger toward -z). */
  function tHand(): { root: Object3D; rig: Rig } {
    const root = new Object3D()
    const bone = (name: string, parent: Object3D, x: number, y: number, z: number): Bone => {
      const b = new Bone()
      b.name = `mixamorig:${name}`
      b.position.set(x, y, z)
      parent.add(b)
      return b
    }
    const wrist = bone('LeftHand', root, 0, 0, 0)
    bone('LeftHandMiddle1', wrist, 0.09, 0, 0)
    let p: Object3D = wrist
    for (let i = 1; i <= 4; i++) p = bone(`LeftHandIndex${i}`, p, i === 1 ? 0.09 : 0.03, 0, i === 1 ? 0.01 : 0)
    p = wrist
    for (let i = 1; i <= 4; i++) p = bone(`LeftHandPinky${i}`, p, i === 1 ? 0.09 : 0.02, 0, i === 1 ? -0.06 : 0)
    p = wrist
    // the thumb leaves the palm toward the front and slightly down
    for (let i = 1; i <= 4; i++) p = bone(`LeftHandThumb${i}`, p, i === 1 ? 0.03 : 0.025, i === 1 ? -0.02 : -0.012, i === 1 ? 0.0 : 0.02)
    return { root, rig: buildRig(root) }
  }

  it('folds across the palm toward the little finger and down: it is not left sticking out', () => {
    const { rig, root } = tHand()
    root.updateMatrixWorld(true)
    const tipOpen = world(rig, 'LeftHandThumb4')
    poseRig(rig, { LeftHand: new Vector3() }, {}, 1)
    root.updateMatrixWorld(true)
    const tip = world(rig, 'LeftHandThumb4')
    expect(tip.z, 'toward the little finger side (-z)').toBeLessThan(tipOpen.z - 0.02)
    expect(tip.y, 'and down onto the fingers').toBeLessThan(tipOpen.y - 0.005)
    // and it does not swing back out beyond the base of the thumb
    expect(tip.z).toBeLessThan(world(rig, 'LeftHandThumb1').z + 0.01)
  })

  it('closes the fingers into the palm more than half-way (a fist, not claws)', () => {
    const { rig, root } = tHand()
    root.updateMatrixWorld(true)
    const length = world(rig, 'LeftHandIndex1').distanceTo(world(rig, 'LeftHandIndex4')) // the straight finger
    poseRig(rig, { LeftHand: new Vector3() }, {}, 1)
    root.updateMatrixWorld(true)
    const curled = world(rig, 'LeftHandIndex1').distanceTo(world(rig, 'LeftHandIndex4'))
    expect(curled).toBeLessThan(length * 0.6) // a tightly bent finger: the tip is close to the knuckle
    expect(world(rig, 'LeftHandIndex2').y).toBeLessThan(world(rig, 'LeftHandIndex1').y) // the first bend is toward the palm
  })
})

describe('the orientation of a hand', () => {
  it('turns the palm (down in the T-pose) where it is asked to face, about the forearm', () => {
    const root = new Object3D()
    const add = (name: string, parent: Object3D, x: number): Bone => {
      const b = new Bone()
      b.name = `mixamorig:${name}`
      b.position.set(x, 0, 0)
      parent.add(b)
      return b
    }
    const fore = add('LeftForeArm', root, 0)
    const hand = add('LeftHand', fore, 0.25)
    add('LeftHandMiddle1', hand, 0.08)
    const rig = buildRig(root)
    // the forearm points up, and the palm must face forward (+z): a guard with the fist turned toward the opponent
    const up = new Vector3(0, 1, 0)
    poseRig(rig, { LeftForeArm: new Vector3(), LeftHand: new Vector3(0, 0.25, 0) }, { LeftHand: { dir: up, lat: new Vector3(0, 0, 1), restLat: new Vector3(0, -1, 0) } })
    root.updateMatrixWorld(true)
    const h = rig.byName.get('LeftHand')!
    const delta = h.bone.getWorldQuaternion(new Quaternion()).multiply(h.restQuat.clone().invert())
    near(new Vector3(1, 0, 0).applyQuaternion(delta), up, 1e-4) // the finger direction follows the forearm
    near(new Vector3(0, -1, 0).applyQuaternion(delta), new Vector3(0, 0, 1), 1e-4) // and the palm faces forward
    // the same hand with the palm asked to face the other way is a different rotation: the twist is not left to chance
    poseRig(rig, { LeftForeArm: new Vector3(), LeftHand: new Vector3(0, 0.25, 0) }, { LeftHand: { dir: up, lat: new Vector3(0, 0, -1), restLat: new Vector3(0, -1, 0) } })
    root.updateMatrixWorld(true)
    const turned = h.bone.getWorldQuaternion(new Quaternion()).multiply(h.restQuat.clone().invert())
    near(new Vector3(0, -1, 0).applyQuaternion(turned), new Vector3(0, 0, -1), 1e-4)
  })
})

describe('createHalo', () => {
  function skinned(): SkinnedMesh {
    const bone = new Bone()
    bone.name = 'mixamorig:Hips'
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3))
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4))
    geo.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
    const mesh = new SkinnedMesh(geo)
    mesh.add(bone)
    mesh.bind(new Skeleton([bone]))
    return mesh
  }

  it('is a second copy of the mesh on the same geometry and skeleton, drawn from the back, additively, and hidden until a zone glows', () => {
    const mesh = skinned()
    const halo = createHalo(mesh, createZoneFx())
    expect(halo.geometry).toBe(mesh.geometry)
    expect(halo.skeleton).toBe(mesh.skeleton)
    expect(halo.visible).toBe(false)
    const m = halo.material as MeshBasicMaterial
    expect(m.side).toBe(BackSide)
    expect(m.blending).toBe(AdditiveBlending)
    expect(m.depthWrite).toBe(false) // a glow never hides what is behind it
    expect(m.transparent).toBe(true)
  })

  it('is drawn only where the character is not (the stencil): an outline of the silhouette, no lines across the body', () => {
    const halo = createHalo(skinned(), createZoneFx())
    const m = halo.material as MeshBasicMaterial
    expect(m.stencilWrite).toBe(true)
    expect(m.stencilFunc).toBe(NotEqualStencilFunc)
    const body = new MeshStandardMaterial()
    writeStencil(body)
    expect(body.stencilWrite).toBe(true)
    expect(body.stencilZPass).toBe(ReplaceStencilOp)
    expect(body.stencilRef).toBe(m.stencilRef) // what the character writes is what the halo tests against
  })

  it('is thin by default', () => {
    expect(createZoneFx().thick.value).toBeLessThanOrEqual(0.04)
  })

  it('has one material per group of a mesh that has several, so every group is drawn', () => {
    const mesh = skinned()
    mesh.material = [mesh.material as MeshBasicMaterial, mesh.material as MeshBasicMaterial, mesh.material as MeshBasicMaterial]
    const halo = createHalo(mesh, createZoneFx())
    expect(Array.isArray(halo.material) && halo.material.length).toBe(3)
  })
})

describe('zoneOfBone', () => {
  it('assigns each bone to the zone it moves', () => {
    for (const n of ['Head', 'Neck', 'HeadTop_End']) expect(zoneOfBone(`mixamorig:${n}`), n).toBe('head')
    for (const n of ['LeftUpLeg', 'RightLeg', 'LeftFoot', 'RightToeBase', 'LeftToe_End']) expect(zoneOfBone(`mixamorig9:${n}`), n).toBe('legs')
    // the pelvis and the hem of a top are the body's: its outline reaches down to the legs, the legs' outline starts at the thighs
    for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightArm', 'LeftForeArm', 'RightHand', 'LeftHandIndex2']) expect(zoneOfBone(`mixamorig:${n}`), n).toBe('body')
  })
  it('does not care about the prefix', () => {
    expect(zoneOfBone('mixamorigHead')).toBe('head')
    expect(zoneOfBone('LeftLeg')).toBe('legs')
  })
})

describe('addZoneAttribute', () => {
  it('gives each vertex the share of every zone: by the weights of the bones that move it', () => {
    const head = new Bone()
    head.name = 'mixamorig:Head'
    const arm = new Bone()
    arm.name = 'mixamorig:LeftArm'
    const leg = new Bone()
    leg.name = 'mixamorig:LeftLeg'
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3))
    // vertex 0: all head. vertex 1: 3/4 arm, 1/4 leg. vertex 2: half head, a quarter arm, a quarter spine-less leg (weights not summing to 1)
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0, 1, 2, 0, 0, 0, 1, 2, 0]), 4))
    geo.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 0.75, 0.25, 0, 0, 0.4, 0.2, 0.2, 0], 4))
    const mesh = new SkinnedMesh(geo)
    mesh.add(head, arm, leg)
    mesh.bind(new Skeleton([head, arm, leg]))
    addZoneAttribute(mesh)
    const w = geo.getAttribute('zoneW')
    expect(w.itemSize).toBe(3) // head, body, legs
    expect([w.getX(0), w.getY(0), w.getZ(0)]).toEqual([1, 0, 0])
    expect(w.getY(1)).toBeCloseTo(0.75)
    expect(w.getZ(1)).toBeCloseTo(0.25)
    for (let v = 0; v < 3; v++) expect(w.getX(v) + w.getY(v) + w.getZ(v)).toBeCloseTo(1, 6) // always shares of one
    expect(w.getX(2)).toBeCloseTo(0.5) // 0.4 of 0.8
  })

  it('is done once per geometry (the characters share it between fighters)', () => {
    const bone = new Bone()
    bone.name = 'mixamorig:Head'
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(3), 3))
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0]), 4))
    geo.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0], 4))
    const mesh = new SkinnedMesh(geo)
    mesh.add(bone)
    mesh.bind(new Skeleton([bone]))
    addZoneAttribute(mesh)
    const first = geo.getAttribute('zoneW')
    addZoneAttribute(mesh)
    expect(geo.getAttribute('zoneW')).toBe(first)
  })
})
