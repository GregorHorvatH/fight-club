import type { Object3D } from 'three'
import { BASE_X, type Pose } from './pose'

export type Limb = 'N' | 'F'
/** the joints of the driver skeleton (a hierarchy of empty groups that the pose is applied to, and the character is read from) */
export type JointName =
  | 'root' | 'facing' | 'tilt' | 'pelvis' | 'chest' | 'neck' | 'head' | 'burst' | 'ring'
  | `${'shoulder' | 'elbow' | 'fist' | 'hip' | 'knee' | 'ankle' | 'toe'}${Limb}`
export type Reg = (name: JointName) => (o: Object3D | null) => void
export type Joints = Partial<Record<JointName, Object3D>>

/**
 * Puts a pose on the joints. `dir` is which way the fighter faces along x (1 = right), `near` which side of the figure is
 * toward the camera (the limbs `N`); the angle conventions are those of pose.ts.
 */
export function applyPose(J: Joints, P: Pose, dir: number, near: number): void {
  J.root!.position.set(-dir * BASE_X + dir * P.x, P.y, 0)
  J.tilt!.rotation.z = P.fall * 1.5
  // turned right round (a fighter leaving the arena): the whole figure turns about its own vertical axis
  if (J.facing) {
    J.facing.userData.baseY ??= J.facing.rotation.y
    J.facing.rotation.y = (J.facing.userData.baseY as number) + (P.turn ?? 0) * Math.PI
  }
  J.pelvis!.rotation.y = P.pelvis * near
  J.chest!.rotation.set(0, P.twist * near, -P.lean) // leaning forward is a negative turn about z
  J.neck!.rotation.z = P.head
  J.shoulderN!.rotation.z = P.armN.s
  J.elbowN!.rotation.z = P.armN.e
  J.shoulderF!.rotation.z = P.armF.s
  J.elbowF!.rotation.z = P.armF.e
  J.hipN!.rotation.z = P.legN.h
  J.kneeN!.rotation.z = P.legN.k
  J.ankleN!.rotation.z = P.legN.a
  J.hipF!.rotation.z = P.legF.h
  J.kneeF!.rotation.z = P.legF.k
  J.ankleF!.rotation.z = P.legF.a
}
