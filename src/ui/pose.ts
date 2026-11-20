/**
 * The skeleton and its choreography: a pure function from "how long into the round's replay" to every joint angle.
 * Both renderers (2D SVG, 3D) only apply the numbers; nothing here knows about React, three.js or the DOM.
 *
 * Conventions (side view, the fighter faces +x, y is up, lengths in figure units: the hip joints are 1.6 above the ankles, a little under half the height of the figure, like a person's):
 *  - a limb that hangs down is angle 0; a positive angle swings it forward and up (PI/2 = straight ahead);
 *  - the knee angle is relative to the thigh and is negative when the knee bends (the foot goes back);
 *  - the elbow angle is relative to the upper arm and is positive when the forearm folds forward and up;
 *  - `lean` is the torso leaning forward, `head` is the head tilting back;
 *  - "near" is the limb on the camera's side: it is the one that punches and kicks.
 *
 * A strike is aimed: at the moment of contact the fist or the foot is solved (two-link inverse kinematics) to reach the
 * chosen zone of the opponent's body. The strikes of a round come one after the other, so the one who is struck stands in his
 * guard where he is, and the one who strikes closes in just enough to reach him (see lungeFor).
 */
import { IMPACT, SUPER_GAP } from '../timing'
import { SECOND_ZONE, type Weapon, type Zone } from '../sim'

/** where each fighter stands, left and right of the middle of the ring */
export const BASE_X = 1.8

export const HIP_Y = 1.6
export const THIGH = 0.8
export const SHIN = 0.8
export const FOOT = 0.3 // the foot points along the shin during a kick
export const ANKLE = 0.15 // from the ankle joint down to the sole of the foot: the planted ankle is this high above the floor
export const UPPER = 0.5
export const FORE = 0.55
export const FIST = 0.17
export const WAIST = 0.27 // pelvis -> waist
export const SHOULDER_UP = 0.68 // waist -> shoulders
export const NECK_UP = 0.78 // waist -> neck
export const HEAD_UP = 0.5 // neck -> middle of the head (a visible neck under it)
export const HEAD_R = 0.34
export const BODY_DEPTH = 0.29
export const CHEST_C = 0.32 // waist -> the middle of the chest
export const SHOULDER_Z = 0.42
export const HIP_Z = 0.22

/**
 * The lengths of a body, in figure units: what the choreography is computed for. A character's own are measured from its model (see
 * ModelFighter3D), so that nothing has to be stretched to fit; the primitive fighters (2D and 3D) are the standard build above.
 */
export interface Build {
  /** names the build (the computed lunges are remembered per pair of builds) */
  id: string
  /** the hip joint above the ankle, the thigh, the shin, the ankle to the tip of the foot, the ankle above the sole */
  hipY: number
  thigh: number
  shin: number
  foot: number
  ankle: number
  /** the upper arm, the forearm, the radius of a fist */
  upper: number
  fore: number
  fist: number
  /** pelvis -> waist, waist -> shoulders, waist -> neck, neck -> the middle of the head, the radius of the head */
  waist: number
  shoulderUp: number
  neckUp: number
  headUp: number
  headR: number
  /** the front of the chest from the spine, the middle of the chest above the waist, half the width of the shoulders and of the hips */
  bodyDepth: number
  chestC: number
  shoulderZ: number
  hipZ: number
}

export const STANDARD: Build = {
  id: 'standard', hipY: HIP_Y, thigh: THIGH, shin: SHIN, foot: FOOT, ankle: ANKLE, upper: UPPER, fore: FORE, fist: FIST,
  waist: WAIST, shoulderUp: SHOULDER_UP, neckUp: NECK_UP, headUp: HEAD_UP, headR: HEAD_R, bodyDepth: BODY_DEPTH, chestC: CHEST_C,
  shoulderZ: SHOULDER_Z, hipZ: HIP_Z,
}

/** How tall a build stands (the sole to the top of the head). */
export const heightOf = (b: Build): number => b.hipY + b.ankle + b.waist + b.neckUp + b.headUp + b.headR

/** the fighters never come closer than this (front surface of one head to the other's), and a strike is reached with the limb this fully stretched */
const MIN_HEAD_GAP = 0.06
const STRETCH = 0.93
const LUNGE_MIN = 0.4
const LUNGE_MAX = 2.6 // only the striker moves: it may cross most of the ring (2 * BASE_X = 3.6 between the roots)
/** the fist is sent this far short of the surface point (its radius); a foot this far */
const touch = (b: Build, w: Weapon): number => (w === 'foot' ? 0.06 : b.fist)
/** how far the striking limb can reach from the shoulder / the hip */
const reach = (b: Build, w: Weapon): number => (w === 'foot' ? b.thigh + b.shin + b.foot : b.upper + b.fore)
/** a lunge longer than this is a leap (both feet leave the floor on the way in); the longer the lunge, the higher */
const JUMP_FROM = 2.0
const hopHeight = (lunge: number): number => 0.2 + 0.25 * clamp01((lunge - JUMP_FROM) / (LUNGE_MAX - JUMP_FROM))
/** a strike thrown in a leap (a super strike of a leaping style) is this high at least */
const SUPER_HOP = 0.55
/** a target that cannot be reached otherwise is reached by jumping up to it (up to this high), or by crouching deeper for a low one */
const AIR_MAX = 0.9
const CROUCH_MAX = 0.35

/**
 * How a fighter gets to its opponent: it closes in by `lunge`, and when that is not enough to reach the zone it is aimed at, it is
 * off the floor by `air` at the moment of contact (a target too high), or crouches `crouch` deeper than usual (a target too low).
 */
export interface Plan {
  lunge: number
  air: number
  crouch: number
}
const NO_PLAN: Plan = { lunge: 0, air: 0, crouch: 0 }

/**
 * How a fighter throws its super strike: two blows one after the other, each a punch or a kick, optionally in a leap and with a
 * full turn of the body between them. (The first goes to the zone aimed at, the second to the other zone that was chosen.)
 */
export interface SuperStyle {
  name: string
  first: 'hand' | 'foot'
  second: 'hand' | 'foot'
  /** both blows are thrown in a leap */
  leap?: boolean
  /** the body turns right round between the two blows */
  spin?: boolean
}
export const DEFAULT_STYLE: SuperStyle = { name: 'Super strike', first: 'hand', second: 'hand' }

export interface Strike {
  zone: Zone
  weapon: Weapon
  /** a super strike: the second zone and the way it is thrown */
  zone2?: Zone
  style?: SuperStyle
  /** thrown in a leap, whatever the distance (a part of a super strike of a leaping style) */
  leap?: boolean
}

/** What a strike is for the purposes of reach: a super strike is its first blow. */
const blow = (a: Strike): Strike => (a.weapon === 'super' ? { zone: a.zone, weapon: (a.style ?? DEFAULT_STYLE).first, leap: a.style?.leap } : a)
export interface ArmPose {
  s: number // shoulder
  e: number // elbow
}
export interface LegPose {
  h: number // hip
  k: number // knee
  a: number // ankle
}
export interface Pose {
  /** how far the fighter has moved toward the opponent / up from where it stands */
  x: number
  y: number
  lean: number
  twist: number // the chest turning (3D only), positive = the near shoulder forward
  pelvis: number // the hips turning (3D only)
  head: number
  armN: ArmPose
  armF: ArmPose
  legN: LegPose
  legF: LegPose
  /** 0 = standing, 1 = lying on the floor */
  fall: number
  /** 0..1: the struck zone flashes */
  flash: number
  /** the head turned about its vertical axis, toward the camera (a fighter looking at the player); not given = 0 */
  headYaw?: number
  /** 0 = facing the opponent, 1 = turned right round, facing away (a fighter leaving the arena); not given = 0 */
  turn?: number
}
export interface PoseInput {
  /** the strike this fighter throws, and when it begins (seconds into the replay) */
  strike: Strike | null
  strikeAt: number
  /** the strike that comes in: where, with what, and whether it is guarded; and when it connects */
  incoming: { zone: Zone; blocked: boolean; weapon: Weapon } | null
  hitAt: number
  /** this fighter's own kick was guarded: it stumbles (when its kick connects) */
  stumble: boolean
  ko: boolean
  won: boolean
  /** when the match was decided (a knockout), for falling down and for the winner's joy */
  endAt: number
  /**
   * Idle fidgets: while the fighter waits (the player is choosing) it now and then does something on its own (scratches its head, looks
   * at the player, kicks an imaginary ball...). `seed` makes the two fighters do different things at different times.
   */
  idle?: { seed: number; /** a given fidget instead of the random ones (the poster scene, tests) */ force?: Fidget }
  /**
   * Walking onto the arena at the start of a match: 'walk' = the fighter comes in from beyond its side of the frame (ENTER_S seconds
   * from t = 0, then it stands in its guard); 'wait' = it is still off the frame (while the ladder of a tournament is shown);
   * 'leave' = it turns round and walks out of the frame (EXIT_S seconds from t = 0), when the player goes back to the menu.
   */
  entrance?: 'walk' | 'wait' | 'leave'
  /** the builds of this fighter and of its opponent (the standard one when not given) */
  build?: Build
  foeBuild?: Build
}

type Key = readonly [time: number, value: number]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const clamp01 = (v: number): number => clamp(v, 0, 1)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const smooth = (u: number): number => u * u * (3 - 2 * u)

/** A value that moves smoothly through keyframes [time, value]; before the first it holds the first, after the last the last. */
export function track(t: number, keys: readonly Key[]): number {
  const first = keys[0]!
  if (t <= first[0]) return first[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i]!
    const [t1, v1] = keys[i + 1]!
    if (t < t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)))
  }
  return keys[keys.length - 1]![1]
}

/**
 * The winner's jump: one cycle takes 1 / JOY_RATE seconds. `u` runs 0..1 through it: the crouch (the knees bend, `alpha` is how much),
 * the push-off at JOY_TAKEOFF (the legs straighten), the air (the knees are drawn up, then reach for the floor) until JOY_LANDING,
 * and the landing, which the knees take up before the body straightens again. The values at 0 and at 1 are the same: it loops.
 */
const JOY_RATE = 1.5
const JOY_TAKEOFF = 0.28
const JOY_LANDING = 0.66
const JOY_HEIGHT = 0.42 // how high the body rises in the air, in figure units
// (the landing and the crouch for the next jump are one dip, deepest around u = 0)
const JOY_ALPHA: readonly Key[] = [[0, 0.9], [0.08, 0.95], [JOY_TAKEOFF, 0.05], [0.4, 0.6], [0.54, 0.3], [JOY_LANDING, 0.1], [0.78, 0.55], [0.92, 0.95], [1, 0.9]]
const JOY_LEAN: readonly Key[] = [[0, 0.17], [0.08, 0.18], [JOY_TAKEOFF, -0.06], [JOY_LANDING, -0.02], [0.78, 0.1], [0.92, 0.17], [1, 0.17]]
const JOY_ARMS: readonly Key[] = [[0, 0.1], [0.08, 0], [JOY_TAKEOFF, 1], [0.5, 1], [0.72, 0.5], [0.92, 0.1], [1, 0.1]]

/** The entrance: how long the walk in takes, how far outside its place the fighter starts (beyond the frame, whatever the window), and the stride. */
export const ENTER_S = 2.4
export const EXIT_S = 2.2
const TURN_S = 0.5 // turning round before it walks out
const ENTER_DIST = 6.6
const STEPS_PER_S = 2.5

/**
 * Idle fidgets. While a fighter waits for the player to choose, it does a little something now and then, at random moments (but the
 * same ones every time the scene is drawn: `fidgetAt` is a pure function of the time and the fighter's seed).
 */
export const FIDGET_KINDS = ['scratch', 'lookAtPlayer', 'kickBall', 'shakeOut', 'stretchNeck', 'shadowBox', 'shiftWeight', 'crackKnuckles', 'wipeNose', 'lookAround', 'taunt'] as const
export type FidgetKind = (typeof FIDGET_KINDS)[number]
export const FIDGET_SECONDS: Record<FidgetKind, number> = {
  scratch: 2.4, lookAtPlayer: 2.6, kickBall: 2.4, shakeOut: 2.0, stretchNeck: 2.6, shadowBox: 2.2, shiftWeight: 1.8, crackKnuckles: 2.2, wipeNose: 1.5, lookAround: 3.0, taunt: 4.8,
}
/** Nothing before this long into the wait (the hint comes up after 3 s), then a fidget every 4.5-8 s. */
export const FIDGET_FIRST = 3.5
const rnd = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
export interface Fidget {
  kind: FidgetKind
  /** seconds into it */
  u: number
}
/** The fidget going on `t` seconds into a wait (null when none). */
export function fidgetAt(t: number, seed: number): Fidget | null {
  let start = FIDGET_FIRST
  for (let k = 0; start <= t; k++) {
    const len = 4.5 + 3.5 * rnd(k * 7.31 + seed * 3.7)
    if (t < start + len) {
      const kind = FIDGET_KINDS[Math.floor(rnd(k * 3.17 + seed * 1.9 + 9) * FIDGET_KINDS.length)]!
      const u = t - start
      return u < FIDGET_SECONDS[kind] ? { kind, u } : null
    }
    start += len
  }
  return null
}

/** What a fidget does to the pose: arms and the kicking leg as they are to be (blended in by the envelope), the rest added to the pose. */
interface FidgetFx {
  armN?: ArmPose
  armF?: ArmPose
  head?: number
  headYaw?: number
  alpha?: number
  lean?: number
  x?: number
  twist?: number
  pelvis?: number
  /** turned round (see Pose.turn): not blended by the envelope, it is 0 at the ends of the fidget anyway */
  turn?: number
  kick?: { leg: LegPose; w: number }
}
/** The taunting dance, in time: the dance (0 to 1.1 s), turning round (1.1-1.6), the behind wiggling (to 3.6), turning back (3.6-4.1), the dance again. */
const TAUNT_TURN = (u: number): number => smooth(clamp01((u - 1.1) / 0.5)) * (1 - smooth(clamp01((u - 3.6) / 0.5)))
const TAUNT_BACK = (u: number): number => smooth(clamp01((u - 1.3) / 0.4)) * (1 - smooth(clamp01((u - 3.5) / 0.4)))
const bump = (u: number, a: number, b: number): number => (u <= a || u >= b ? 0 : Math.sin((Math.PI * (u - a)) / (b - a)))
function fidgetFx(kind: FidgetKind, u: number): FidgetFx {
  const wave = (hz: number): number => Math.sin(u * 2 * Math.PI * hz)
  switch (kind) {
    case 'scratch': // the near hand to the top of the head, scrubbing
      return { armN: { s: 1.8, e: 2.0 + 0.25 * Math.sin(u * 20) }, head: 0.12 }
    case 'wipeNose': // a quick swipe of the fist under the nose
      return { armN: { s: 1.0, e: 2.2 + 0.18 * Math.sin(u * 24) }, head: -0.05 }
    case 'lookAtPlayer': // turns its head toward the player (the camera), holds, turns back
      return { headYaw: 0.95, head: -0.06 }
    case 'lookAround': // looks one way, then the other
      return { headYaw: 0.8 * wave(0.45), head: 0.06 * wave(0.9) }
    case 'stretchNeck': // rolls the head about
      return { head: 0.32 * wave(0.9), headYaw: 0.5 * Math.sin(u * 2 * Math.PI * 0.9 + 1.2), lean: -0.04 }
    case 'shakeOut': // shakes the arms loose
      return { armN: { s: 0.15 + 0.3 * wave(2.4), e: 0.45 }, armF: { s: 0.15 - 0.3 * wave(2.4), e: 0.45 }, alpha: 0.03 * wave(2.4), head: 0.04 * wave(1.2) }
    case 'crackKnuckles': // the fists together in front, squeezing
      return { armN: { s: 1.25, e: 1.3 + 0.12 * wave(3.5) }, armF: { s: 1.25, e: 1.3 + 0.12 * wave(3.5) }, head: -0.12 }
    case 'shadowBox': { // bounces, and throws a couple of jabs at nothing
      const p = Math.max(0, Math.sin(u * 2 * Math.PI * 1.4)) ** 3
      return { alpha: 0.13 * Math.max(0, wave(3)), armN: { s: 0.62 + 0.9 * p, e: 1.95 - 1.4 * p }, lean: 0.1 * p, twist: 0.3 * p }
    }
    case 'shiftWeight': // shifts its weight, and settles again
      return { x: 0.1 * bump(u, 0, 1.8), alpha: 0.12 * bump(u, 0, 1.8), lean: 0.05 * bump(u, 0, 1.8) }
    case 'taunt': {
      // a dance to tease the opponent: bouncing on the knees, the hips and the shoulders swaying, the elbows pumping in turn; then it
      // turns its back to the opponent, bends over and wiggles its behind, and turns round again to finish the dance
      const back = TAUNT_BACK(u)
      const beat = Math.sin(u * 2 * Math.PI * 2.5)
      const wiggle = Math.sin(u * 2 * Math.PI * 4)
      const dance = { alpha: 0.13 * (0.5 - 0.5 * Math.cos(u * 2 * Math.PI * 2.5)), pelvis: 0.4 * Math.sin(u * 2 * Math.PI * 1.25), twist: 0.35 * Math.sin(u * 2 * Math.PI * 1.25 + Math.PI / 2), head: 0.1 * beat, lean: 0.05 }
      const mixed = (d: number, w: number): number => d * (1 - back) + w * back
      return {
        alpha: mixed(dance.alpha, 0.38 + 0.12 * (0.5 - 0.5 * Math.cos(u * 2 * Math.PI * 4))),
        pelvis: mixed(dance.pelvis, 0.55 * wiggle),
        twist: mixed(dance.twist, -0.15 * wiggle),
        lean: mixed(dance.lean, 0.32),
        head: mixed(dance.head, -0.12),
        armN: mixArm({ s: 1.1, e: 1.5 + 0.6 * beat }, { s: 0.35, e: 0.2 }, back), // (the hands on the knees)
        armF: mixArm({ s: 1.0, e: 1.5 - 0.6 * beat }, { s: 0.3, e: 0.2 }, back),
        turn: TAUNT_TURN(u),
      }
    }
    case 'kickBall': {
      // looks down at the floor, takes a short swing at an imaginary ball with the near foot, looks up again
      const swing = bump(u, 0.95, 1.5)
      return { head: -0.42 * bump(u, 0.05, 2.3), lean: 0.06 * bump(u, 0.05, 2.3), kick: { leg: { h: 0.9, k: -0.25, a: -0.55 }, w: swing } }
    }
  }
}
/** The strength of a fidget over its time: it eases in and out. */
const fidgetEnvelope = (kind: FidgetKind, u: number): number => smooth(clamp01(u / 0.35)) * smooth(clamp01((FIDGET_SECONDS[kind] - u) / 0.4))

const GUARD_N: ArmPose = { s: 0.62, e: 1.95 } // fists up by the chin
const GUARD_F: ArmPose = { s: 0.5, e: 2.0 }
const STANCE = { n: 0.18, f: -0.22 } // the thigh angle of the front and the back foot
const ALPHA_IDLE = 0.17
const LEAN_IDLE = 0.03

/**
 * A leg with the foot flat on the floor: the thigh forward by h0 + alpha, the knee folding the shin back so that the ankle stands
 * (thigh + shin) * sin(h0) * cos(alpha) in front of the hip (for a thigh as long as the shin that is the shin folded back by 2 alpha).
 */
const planted = (h0: number, alpha: number, b: Build = STANDARD): LegPose => {
  const h = h0 + alpha
  const shin = Math.asin(clamp((((b.thigh + b.shin) * Math.sin(h0) * Math.cos(alpha)) - b.thigh * Math.sin(h)) / b.shin, -1, 1)) // the angle of the shin
  return { h, k: shin - h, a: -shin }
}
/** how high the hip is above the floor for this leg */
const ext = (l: LegPose, b: Build = STANDARD): number => b.thigh * Math.cos(l.h) + b.shin * Math.cos(l.h + l.k)

/** What the body (everything but the striking limb) does while a strike is thrown. */
interface Body {
  x: number
  lean: number
  twist: number
  pelvis: number
  head: number
  /** the crouch of the planted legs */
  alpha: number
  /** the front foot steps forward, the back foot follows */
  step: number
  /** how high the whole body is off the floor (a leap) */
  air: number
}

/** How far the body crouches and leans at the moment of contact, for each strike. A low punch needs a deep crouch to reach the legs. */
export const AT_CONTACT: Record<'hand' | 'foot', Record<Zone, { alpha: number; lean: number }>> = {
  hand: { head: { alpha: 0.19, lean: 0.2 }, body: { alpha: 0.9, lean: 0.17 }, legs: { alpha: 1.47, lean: 0.18 } },
  foot: { head: { alpha: 0.44, lean: -0.13 }, body: { alpha: 0.63, lean: 0 }, legs: { alpha: 0.66, lean: 0.04 } },
}

function bodyAt(t: number, strike: Strike | null, plan: Plan, clock: number, phase: number): Body {
  const alpha0 = ALPHA_IDLE + 0.05 * Math.sin(clock * 4.5 + phase)
  const twist0 = 0.05 * Math.sin(clock * 1.7 + phase)
  const head0 = 0.03 * Math.sin(clock * 2.1 + phase)
  if (!strike) return { x: 0, lean: LEAN_IDLE, twist: twist0, pelvis: 0, head: head0, alpha: alpha0, step: 0, air: 0 }
  const c0 = AT_CONTACT[strike.weapon === 'foot' ? 'foot' : 'hand'][strike.zone]
  const c = { alpha: c0.alpha + plan.crouch, lean: c0.lean }
  const C = IMPACT
  const L = plan.lunge
  // a long lunge is a leap: the feet are off the floor from the start of the move to the moment of contact, and land after the blow
  // (a leap up to a high target ends in the air at the contact itself)
  const start = strike.weapon === 'foot' ? 0.16 : 0.15
  const land = strike.weapon === 'foot' ? 0.52 : 0.5
  const hop = strike.leap ? Math.max(SUPER_HOP, L > JUMP_FROM ? hopHeight(L) : 0) : L > JUMP_FROM ? hopHeight(L) : 0
  const top = Math.max(hop, plan.air)
  const air = top === 0 ? 0 : track(t, [[0, 0], [start, 0], [(start + C) / 2, top], [C, plan.air], [0.38, plan.air], [land, 0]])
  if (strike.weapon !== 'foot') {
    const W = 0.15, H = 0.38, E = 0.74 // wind-up, end of the follow-through, back in guard
    return {
      x: track(t, [[0, 0], [W, -0.1], [C, L], [H, L], [E, 0]]),
      lean: track(t, [[0, LEAN_IDLE], [W, -0.08], [C, c.lean], [H, c.lean * 0.9], [E, LEAN_IDLE]]),
      twist: track(t, [[0, twist0], [W, -0.45], [C, 0.55], [H, 0.5], [E, twist0]]),
      pelvis: track(t, [[0, 0], [W, -0.2], [C, 0.3], [H, 0.28], [E, 0]]),
      head: track(t, [[0, head0], [C, -0.12], [H, -0.1], [E, head0]]),
      alpha: track(t, [[0, alpha0], [W, alpha0 + 0.08], [C, c.alpha], [H, c.alpha], [E, alpha0]]),
      step: track(t, [[0, 0], [W, -0.1], [C, 0.3], [H, 0.3], [E, 0]]),
      air,
    }
  }
  const K = 0.16, H = 0.38, R = 0.52, E = 0.74 // chamber, end of the hold, retract, back in guard
  return {
    x: track(t, [[0, 0], [K, 0.05], [C, L], [H, L], [R, L * 0.6], [E, 0]]),
    lean: track(t, [[0, LEAN_IDLE], [K, -0.1], [C, c.lean], [H, c.lean], [R, c.lean * 0.5], [E, LEAN_IDLE]]),
    twist: track(t, [[0, twist0], [K, -0.3], [C, 0.4], [H, 0.35], [E, twist0]]),
    pelvis: track(t, [[0, 0], [K, -0.15], [C, 0.5], [H, 0.45], [E, 0]]),
    head: track(t, [[0, head0], [C, 0.1], [E, head0]]),
    alpha: track(t, [[0, alpha0], [K, c.alpha], [C, c.alpha], [R, c.alpha * 0.8], [E, alpha0]]),
    step: 0,
    air,
  }
}

const legsOf = (b: Body, bd: Build): { n: LegPose; f: LegPose } => ({
  n: planted(STANCE.n + b.step, b.alpha, bd),
  f: planted(STANCE.f - 0.8 * b.step, b.alpha, bd),
})

/** The hip height above the floor: the planted leg decides (the kicking leg is in the air). */
function bodyY(b: Body, kicking: boolean, bd: Build): number {
  const l = legsOf(b, bd)
  return (kicking ? ext(l.f, bd) : Math.max(ext(l.n, bd), ext(l.f, bd))) - bd.hipY + bd.ankle + b.air
}

type Pt = readonly [forward: number, up: number]

/** The front surface of a zone of a body, in that body's own frame (forward = toward its opponent), measured from its root. */
function zonePoint(zone: Zone, b: Body, kicking: boolean, bd: Build): Pt {
  const y = bodyY(b, kicking, bd)
  const wf = 0
  const wu = bd.hipY + bd.waist + y
  const s = Math.sin(b.lean)
  const c = Math.cos(b.lean)
  if (zone === 'body') return [wf + bd.chestC * s + bd.bodyDepth * c, wu + bd.chestC * c - bd.bodyDepth * s]
  if (zone === 'head') {
    const tilt = b.lean - b.head
    const hf = wf + bd.neckUp * s + bd.headUp * Math.sin(tilt)
    const hu = wu + bd.neckUp * c + bd.headUp * Math.cos(tilt)
    return [hf + bd.headR * Math.cos(tilt), hu - bd.headR * Math.sin(tilt)]
  }
  // legs: the shin of the planted leg that is nearer the opponent
  const l = legsOf(b, bd)
  const leg = kicking ? l.f : l.n
  const kf = bd.thigh * Math.sin(leg.h)
  const ku = bd.hipY + y - bd.thigh * Math.cos(leg.h)
  const sa = leg.h + leg.k
  // the middle of the shin and its front, 0.35 down the shin of the standard build (a shin of 0.8) and 0.14 in front of it
  const along = 0.4375 * bd.shin
  const front = 0.175 * bd.shin
  return [kf + along * Math.sin(sa) + front * Math.cos(sa), ku - along * Math.cos(sa) + front * Math.sin(sa)]
}

/** How far the fighter must stretch to reach the opponent's zone, as a fraction of what its limb can reach, when it closes in by `lunge`. */
function stretch(me: Strike, plan: Plan, bd: Build, foe: Build): number {
  const kicking = me.weapon === 'foot'
  const bm = bodyAt(IMPACT, me, plan, 0, 0)
  const from = kicking ? hipAt(bm, true, bd) : shoulderAt(bm, false, bd)
  const t = targetPoint(me.zone, foe)
  return (Math.hypot(t[0] - from[0], t[1] - from[1]) - touch(bd, me.weapon)) / reach(bd, me.weapon)
}

/** The largest value in [lo, hi] for which `ok` holds, given that `ok` holds up to some value and not beyond (bisection). */
function largest(lo: number, hi: number, ok: (v: number) => boolean): number {
  if (ok(hi)) return hi
  if (!ok(lo)) return lo
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** The smallest value in [lo, hi] for which `ok` holds, given that `ok` holds from some value on (bisection); null when it never does. */
function smallest(lo: number, hi: number, ok: (v: number) => boolean): number | null {
  if (ok(lo)) return lo
  if (!ok(hi)) return null
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) hi = mid
    else lo = mid
  }
  return hi
}

const planCache = new Map<string, Plan>()
/** forget the computed plans (needed only when the choreography constants are changed at run time, as a tuning script does) */
export const clearLungeCache = (): void => planCache.clear()

/**
 * How the striker gets to the opponent, who stands in his guard where he is: it closes in as little as lets it reach its target with
 * the limb almost fully stretched, and never so much that the heads would touch. A target that is still out of reach is reached by
 * jumping up to it (too high) or by crouching deeper (too low).
 */
export function planFor(strike: Strike, bd: Build = STANDARD, foe: Build = STANDARD): Plan {
  const a = blow(strike)
  const key = `${bd.id}>${foe.id}:${a.weapon}${a.zone}`
  const hit = planCache.get(key)
  if (hit) return hit
  // stretch() falls as the striker closes in: the lunge at which it has to stretch exactly STRETCH
  const need = largest(LUNGE_MIN, LUNGE_MAX, (l) => stretch(a, { ...NO_PLAN, lunge: l }, bd, foe) >= STRETCH)
  const tooClose = largest(LUNGE_MIN, LUNGE_MAX, (l) => headGap(a, l, bd, foe) >= MIN_HEAD_GAP)
  const lunge = Math.min(need, tooClose)
  // within reach: the limb may be stretched right out, and fall short by a little (less than the radius of a fist): that is not noticed
  const reaches = (p: Plan): boolean => (stretch(a, p, bd, foe) - 1) * reach(bd, a.weapon) <= 0.12
  let plan: Plan = { ...NO_PLAN, lunge }
  if (!reaches(plan)) {
    const air = smallest(0, AIR_MAX, (v) => reaches({ lunge, air: v, crouch: 0 }))
    const crouch = smallest(0, CROUCH_MAX, (v) => reaches({ lunge, air: 0, crouch: v }))
    // whichever of the two gets there (a high target: the leap; a low one: the crouch); when neither does, the one that gets nearer
    if (air !== null) plan = { lunge, air, crouch: 0 }
    else if (crouch !== null) plan = { lunge, air: 0, crouch }
    else {
      const up = { lunge, air: AIR_MAX, crouch: 0 }
      const down = { lunge, air: 0, crouch: CROUCH_MAX }
      plan = stretch(a, up, bd, foe) < stretch(a, down, bd, foe) ? up : down
      if (stretch(a, plan, bd, foe) > stretch(a, { ...NO_PLAN, lunge }, bd, foe)) plan = { ...NO_PLAN, lunge }
    }
  }
  planCache.set(key, plan)
  return plan
}

/** How far the striker closes in on the opponent. */
export const lungeFor = (a: Strike, bd: Build = STANDARD, foe: Build = STANDARD): number => planFor(a, bd, foe).lunge

/**
 * How far apart the two heads' front surfaces are at the moment of contact, measured along the line between the fighters
 * (negative = the heads would overlap): the striker has closed in by `lunge`, the opponent stands in his guard.
 */
export function headGap(asked: Strike, lunge?: number, bd: Build = STANDARD, foe: Build = STANDARD): number {
  const a = blow(asked)
  const ba = bodyAt(IMPACT, a, { ...NO_PLAN, lunge: lunge ?? lungeFor(a, bd, foe) }, 0, 0)
  const pa = zonePoint('head', ba, a.weapon === 'foot', bd)
  const pb = zonePoint('head', bodyAt(IMPACT, null, NO_PLAN, 0, 0), false, foe)
  return 2 * BASE_X - pb[0] - (ba.x + pa[0])
}

/** Where a zone of the opponent (standing in his guard, with his build) is at the moment of contact, in OUR frame (from our root, forward = toward him). */
export function targetPoint(zone: Zone, foe: Build = STANDARD): Pt {
  const p = zonePoint(zone, bodyAt(IMPACT, null, NO_PLAN, 0, 0), false, foe)
  return [2 * BASE_X - p[0], p[1]]
}

const shoulderAt = (b: Body, kicking: boolean, bd: Build): Pt => [
  b.x + bd.shoulderUp * Math.sin(b.lean) + bd.shoulderZ * Math.sin(b.twist),
  bd.hipY + bodyY(b, kicking, bd) + bd.waist + bd.shoulderUp * Math.cos(b.lean),
]
const hipAt = (b: Body, kicking: boolean, bd: Build): Pt => [b.x + bd.hipZ * Math.sin(b.pelvis), bd.hipY + bodyY(b, kicking, bd)]

/**
 * Two-link inverse kinematics in the side plane: the angles (from "hanging down", forward positive) of two links of length
 * l1 and l2 whose end reaches (dx, dy) from the root. The joint bends up (a knee) or down (an elbow).
 */
function ik(dx: number, dy: number, l1: number, l2: number, jointUp: boolean): { a1: number; a2: number } {
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.02)
  const base = Math.atan2(dx, -dy)
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
  const a1 = jointUp ? base + A : base - A
  const jx = l1 * Math.sin(a1)
  const jy = -l1 * Math.cos(a1)
  return { a1, a2: Math.atan2(dx - jx, -(dy - jy)) }
}

/** The point the fist (centre) or the foot (tip) is sent to: the target, pulled back a little so it touches instead of sinking in. */
export function aimPoint(asked: Strike, bd: Build = STANDARD, foe: Build = STANDARD): Pt {
  const strike = blow(asked)
  const kicking = strike.weapon === 'foot'
  const bc = bodyAt(IMPACT, strike, planFor(strike, bd, foe), 0, 0)
  const from = kicking ? hipAt(bc, true, bd) : shoulderAt(bc, false, bd)
  const t = targetPoint(strike.zone, foe)
  const dx = t[0] - from[0]
  const dy = t[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const back = touch(bd, strike.weapon)
  return [t[0] - (dx / len) * back, t[1] - (dy / len) * back]
}

/** The strike's solved joint angles at the moment of contact. */
function contact(asked: Strike, bd: Build, foe: Build): { s: number; e: number } | { h: number; k: number } {
  const strike = blow(asked)
  const kicking = strike.weapon === 'foot'
  const bc = bodyAt(IMPACT, strike, planFor(strike, bd, foe), 0, 0)
  const from = kicking ? hipAt(bc, true, bd) : shoulderAt(bc, false, bd)
  const to = aimPoint(strike, bd, foe)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (kicking) {
    const { a1, a2 } = ik(dx, dy, bd.thigh, bd.shin + bd.foot, true)
    return { h: a1, k: a2 - a1 }
  }
  const { a1, a2 } = ik(dx, dy, bd.upper, bd.fore, false)
  return { s: a1, e: a2 - a1 }
}

/** Where the fist (hands) or the foot's tip (kicks) is, from a finished pose: for checking that a strike lands where it was aimed. */
export function strikeTip(p: Pose, weapon: Weapon, bd: Build = STANDARD): Pt {
  if (weapon === 'foot') {
    const hf = p.x + bd.hipZ * Math.sin(p.pelvis)
    const hu = bd.hipY + p.y
    const kf = hf + bd.thigh * Math.sin(p.legN.h)
    const ku = hu - bd.thigh * Math.cos(p.legN.h)
    const sa = p.legN.h + p.legN.k
    return [kf + (bd.shin + bd.foot) * Math.sin(sa), ku - (bd.shin + bd.foot) * Math.cos(sa)]
  }
  const sf = p.x + bd.shoulderUp * Math.sin(p.lean) + bd.shoulderZ * Math.sin(p.twist)
  const su = bd.hipY + p.y + bd.waist + bd.shoulderUp * Math.cos(p.lean)
  const ef = sf + bd.upper * Math.sin(p.armN.s)
  const eu = su - bd.upper * Math.cos(p.armN.s)
  const fa = p.armN.s + p.armN.e
  return [ef + bd.fore * Math.sin(fa), eu - bd.fore * Math.cos(fa)]
}

const blendArm = (a: ArmPose, to: ArmPose, w: number): ArmPose => ({ s: lerp(a.s, to.s, w), e: lerp(a.e, to.e, w) })
const blendLeg = (l: LegPose, to: LegPose, w: number): LegPose => ({ h: lerp(l.h, to.h, w), k: lerp(l.k, to.k, w), a: lerp(l.a, to.a, w) })

const mix = (a: number, b: number, w: number): number => a + (b - a) * w
const mixArm = (a: ArmPose, b: ArmPose, w: number): ArmPose => ({ s: mix(a.s, b.s, w), e: mix(a.e, b.e, w) })
const mixLeg = (a: LegPose, b: LegPose, w: number): LegPose => ({ h: mix(a.h, b.h, w), k: mix(a.k, b.k, w), a: mix(a.a, b.a, w) })

/**
 * A super strike: two blows one after the other, in the fighter's own style. Each is an ordinary punch or kick aimed at its own zone
 * (the second begins SUPER_GAP later), and the pose passes from the first to the second just after the first has connected: the arm
 * or the leg is drawn back, and the second blow is thrown. In between the fighter may turn right round (a spin), and it moves in from
 * where it stood to where each blow needs it.
 */
function superPose(t: number, input: PoseInput, clock: number, phase: number): Pose {
  const strike = input.strike!
  const style = strike.style ?? DEFAULT_STYLE
  const bd = input.build ?? STANDARD
  const foe = input.foeBuild ?? STANDARD
  const zone2 = strike.zone2 ?? SECOND_ZONE[strike.zone]
  const s1: Strike = { zone: strike.zone, weapon: style.first, leap: style.leap }
  const s2: Strike = { zone: zone2, weapon: style.second, leap: style.leap }
  const base: PoseInput = { ...input, stumble: false } // a super strike is not made to stumble: it cannot be guarded altogether
  const A = computePose(t, { ...base, strike: s1 }, clock, phase)
  const B = computePose(t, { ...base, strike: s2, strikeAt: input.strikeAt + SUPER_GAP }, clock, phase)
  const ts = t - input.strikeAt
  const w = smooth(clamp01((ts - IMPACT) / 0.2))
  const L1 = lungeFor(s1, bd, foe)
  const L2 = lungeFor(s2, bd, foe)
  const END = 0.74 + SUPER_GAP
  // in from the guard to the first blow, on to the second, and back: one movement (it is the striker's own: nothing else moves it now)
  const x = ts < END ? track(ts, [[0, 0], [0.15, -0.1], [IMPACT, L1], [IMPACT + 0.05, L1], [IMPACT + SUPER_GAP, L2], [IMPACT + SUPER_GAP + 0.1, L2], [END, 0]]) : mix(A.x, B.x, w)
  // the legs are blended, and the body is held at the height they need (so that the feet stay on the floor): what is more than that
  // (a leap) is blended on its own
  const legN = mixLeg(A.legN, B.legN, w)
  const legF = mixLeg(A.legF, B.legF, w)
  const standing = (n: LegPose, f: LegPose, kicking: boolean): number => (kicking ? ext(f, bd) : Math.max(ext(n, bd), ext(f, bd))) - bd.hipY + bd.ankle
  const kicks1 = style.first === 'foot'
  const kicks2 = style.second === 'foot'
  const airA = A.y - standing(A.legN, A.legF, kicks1)
  const airB = B.y - standing(B.legN, B.legF, kicks2)
  const y = standing(legN, legF, w < 0.5 ? kicks1 : kicks2) + mix(airA, airB, w)
  let pelvis = mix(A.pelvis, B.pelvis, w)
  if (style.spin && ts > IMPACT && ts < IMPACT + SUPER_GAP) {
    // a full turn between the blows: it ends where it began, facing the opponent again as the second blow connects
    pelvis += 2 * Math.PI * smooth(clamp01((ts - (IMPACT + 0.03)) / (SUPER_GAP - 0.06)))
  }
  return {
    x,
    y,
    lean: mix(A.lean, B.lean, w),
    twist: mix(A.twist, B.twist, w),
    pelvis,
    head: mix(A.head, B.head, w),
    armN: mixArm(A.armN, B.armN, w),
    armF: mixArm(A.armF, B.armF, w),
    legN,
    legF,
    fall: mix(A.fall, B.fall, w),
    flash: mix(A.flash, B.flash, w),
  }
}

/**
 * The pose `t` seconds into the replay of a round.
 * @param clock a free-running clock (seconds) for the idle bounce and breathing
 * @param phase offsets the idle bounce so the two fighters do not move in lockstep
 */
/** The pose of a fighter walking in: a stride with the knees bending as the legs swing, the fists up in the guard, a little bob. */
function walkPose(t: number, off: number, input: PoseInput, clock: number, phase: number, wait = false, guard = smooth(clamp01((0.3 - off) / 0.3))): Pose {
  const idle = computePose(t, { ...input, entrance: undefined, strike: null, incoming: null, won: false, ko: false, stumble: false }, clock, phase)
  if (wait) return { ...idle, x: -ENTER_DIST } // still off the frame: standing, out of sight
  const ph = t * STEPS_PER_S * 2 * Math.PI
  const swing = 0.5 * Math.sin(ph)
  const lift = (v: number): number => 0.25 + 0.7 * Math.max(0, v) // the knee of the leg that swings forward bends
  const legN: LegPose = { h: swing, k: -lift(Math.cos(ph)), a: 0 }
  const legF: LegPose = { h: -swing, k: -lift(-Math.cos(ph)), a: 0 }
  legN.a = -(legN.h + legN.k)
  legF.a = -(legF.h + legF.k)
  // next to its place (arriving, or just leaving it) the legs are in the stance: the stride builds up and dies down over a short way
  const arrive = smooth(clamp01(1 - off / 0.12))
  // the arms hang and swing against the legs, as in an ordinary walk; the fists go up to the guard only on the arena (`guard`: 0 = down, 1 = up)
  const down = (swingOf: number): ArmPose => ({ s: -1.6 * swingOf, e: 0.25 + 0.7 * Math.max(0, -swingOf) })
  return {
    ...idle,
    x: -ENTER_DIST * off,
    y: idle.y + 0.05 * Math.abs(Math.sin(ph)) * (1 - arrive),
    legN: mixLeg(legN, idle.legN, arrive),
    legF: mixLeg(legF, idle.legF, arrive),
    armN: mixArm(down(-swing), idle.armN, guard), // (the near arm swings with the far leg)
    armF: mixArm(down(swing), idle.armF, guard),
    lean: idle.lean + 0.06 * (1 - arrive),
  }
}

export function computePose(t: number, input: PoseInput, clock = 0, phase = 0): Pose {
  if (input.entrance === 'leave') {
    // it turns right round on the spot, and then walks out the way a walker does, face first (out of the frame it goes on striding)
    const u = clamp01((t - TURN_S * 0.8) / (EXIT_S - TURN_S * 0.8))
    return { ...walkPose(t, u ** 1.5, input, clock, phase, false, 1 - smooth(clamp01(t / (TURN_S * 0.8)))), turn: smooth(clamp01(t / TURN_S)) } // (the fists come down as it turns)
  }
  if (input.entrance === 'wait') return walkPose(t, 1, input, clock, phase, true)
  if (input.entrance === 'walk' && t < ENTER_S) return walkPose(t, (1 - clamp01(t / ENTER_S)) ** 2, input, clock, phase) // (it comes in fast from beyond the frame and slows down as it arrives)
  if (input.strike?.weapon === 'super') return superPose(t, input, clock, phase)
  const { strike, incoming, stumble, ko, won } = input
  const bd = input.build ?? STANDARD
  const foe = input.foeBuild ?? STANDARD
  const ts = t - input.strikeAt // time into this fighter's own strike
  const b = bodyAt(ts, strike, strike ? planFor(strike, bd, foe) : NO_PLAN, clock, phase)
  const air = b.air // the leap, if there is one: the body is off the floor by this much, and the legs are drawn up
  let armN: ArmPose = { s: GUARD_N.s + 0.04 * Math.sin(clock * 3 + phase), e: GUARD_N.e }
  let armF: ArmPose = { s: GUARD_F.s + 0.04 * Math.sin(clock * 3.3 + phase), e: GUARD_F.e }
  let kick: LegPose | null = null
  const C = IMPACT

  if (strike && strike.weapon !== 'foot') {
    const c = contact(strike, bd, foe) as { s: number; e: number }
    const W = 0.15, H = 0.38, E = 0.74
    armN = {
      s: track(ts, [[0, GUARD_N.s], [W, -0.5], [C, c.s], [H, c.s - 0.04], [E, GUARD_N.s]]),
      e: track(ts, [[0, GUARD_N.e], [W, 2.1], [C, c.e], [H, c.e + 0.05], [E, GUARD_N.e]]),
    }
    armF = {
      s: track(ts, [[0, GUARD_F.s], [W, 0.95], [C, 0.35], [E, GUARD_F.s]]),
      e: track(ts, [[0, GUARD_F.e], [W, 2.2], [C, 1.7], [E, GUARD_F.e]]),
    }
  } else if (strike) {
    const c = contact(strike, bd, foe) as { h: number; k: number }
    const K = 0.16, H = 0.38, R = 0.52, E = 0.74
    const p0 = planted(STANCE.n, ALPHA_IDLE, bd)
    kick = {
      h: track(ts, [[0, p0.h], [K, 1.25], [C, c.h], [H, c.h - 0.04], [R, 1.05], [E, p0.h]]),
      k: track(ts, [[0, p0.k], [K, -2.1], [C, c.k], [H, c.k - 0.08], [R, -1.5], [E, p0.k]]),
      a: track(ts, [[0, p0.a], [K, 0.2], [C, -1.2], [H, -1.2], [R, -0.2], [E, p0.a]]),
    }
    // the arms balance the kick: the far one swings back, the near one forward
    armF = {
      s: track(ts, [[0, GUARD_F.s], [K, 0.4], [C, -0.9], [H, -0.9], [R, -0.5], [E, GUARD_F.s]]),
      e: track(ts, [[0, GUARD_F.e], [K, 1.0], [C, 0.5], [E, GUARD_F.e]]),
    }
    armN = {
      s: track(ts, [[0, GUARD_N.s], [K, 1.1], [C, 1.4], [H, 1.4], [E, GUARD_N.s]]),
      e: track(ts, [[0, GUARD_N.e], [C, 0.7], [E, GUARD_N.e]]),
    }
  }

  let lift: { w: number } | null = null // a guarded leg strike: the near knee comes up to meet it
  let hop = 0
  let together = 0 // 0 = the feet apart, one in front of the other (the stance); 1 = side by side, as in a jump for joy
  let fall = 0
  let flash = 0
  const tau = t - input.hitAt // time since the incoming strike connected (negative before)
  const tauOwn = ts - IMPACT // time since this fighter's own strike connected

  if (incoming && !incoming.blocked && tau > 0) {
    const power = incoming.weapon === 'foot' || incoming.weapon === 'super' ? 1.3 : 1
    flash = clamp01(1 - tau / 0.45)
    const e = track(tau, [[0, 0], [0.1, 1], [0.32, 0.6], [0.65, 0]]) * power
    if (incoming.zone === 'head') {
      // the head snaps back, the body follows, the arms fly up
      b.head += 0.9 * e
      b.lean -= 0.35 * e
      b.x -= 0.35 * e
      b.twist -= 0.4 * e
      armN = { s: armN.s + 0.5 * e, e: armN.e }
      armF = { s: armF.s + 0.5 * e, e: armF.e }
    } else if (incoming.zone === 'body') {
      // doubled over, the knees give, the arms clutch
      b.lean += 0.6 * e
      b.alpha += 0.25 * e
      b.x -= 0.3 * e
      b.head -= 0.3 * e
      armN = { s: armN.s + 0.3 * e, e: armN.e + 0.5 * e }
      armF = { s: armF.s + 0.3 * e, e: armF.e + 0.5 * e }
    } else {
      // the legs buckle
      b.alpha += 0.7 * e
      b.lean += 0.25 * e
      b.x -= 0.25 * e
      armN = { s: armN.s + 0.6 * e, e: armN.e }
      armF = { s: armF.s + 0.6 * e, e: armF.e }
    }
    if (tau < 0.4) b.x += Math.sin(tau * 70) * 0.06 * (1 - tau / 0.4)
  }

  if (incoming?.blocked) {
    flash = tau > 0 ? clamp01(1 - tau / 0.45) : 0
    // a guard: the arms (or the knee) come up in front of the zone just before the blow, and the body is pushed back a little
    const g = track(tau, [[-0.3, 0], [-0.05, 1], [0.45, 1], [0.8, 0]])
    b.x -= 0.12 * track(tau, [[0, 0], [0.12, 1], [0.45, 1], [0.8, 0]])
    if (incoming.zone === 'head') {
      armN = blendArm(armN, { s: 1.3, e: 2.3 }, g)
      armF = blendArm(armF, { s: 1.2, e: 2.4 }, g)
    } else if (incoming.zone === 'body') {
      armN = blendArm(armN, { s: 0.35, e: 2.4 }, g)
      armF = blendArm(armF, { s: 0.3, e: 2.5 }, g)
      b.lean += 0.12 * g
    } else {
      b.lean += 0.1 * g
      lift = { w: g }
    }
  }

  if (stumble && tauOwn > 0.08) {
    // the kick was guarded: the kicker loses its balance and staggers back
    const u = tauOwn - 0.08
    const s = track(u, [[0, 0], [0.12, 1], [0.55, 0.7], [1.0, 0]])
    b.x -= 0.5 * s
    b.lean -= 0.3 * s + Math.sin(u * 13) * 0.12 * s
    b.alpha += 0.15 * s
    armN = { s: armN.s + Math.sin(u * 12) * 0.8 * s, e: armN.e }
    armF = { s: armF.s - Math.sin(u * 12) * 0.8 * s, e: armF.e }
  }

  const tauEnd = t - input.endAt // time since the match was decided
  if (ko) {
    // knocked out: the knees give, the arms go limp, then it falls back onto the floor
    const c = track(tauEnd, [[0, 0], [0.35, 1]])
    b.alpha = lerp(b.alpha, 0.95, c)
    b.lean = lerp(b.lean, -0.2, c)
    armN = blendArm(armN, { s: -0.3, e: 0.3 }, c)
    armF = blendArm(armF, { s: -0.2, e: 0.4 }, c)
    fall = track(tauEnd, [[0, 0], [0.3, 0], [1.0, 1]])
  } else if (won) {
    // the winner raises both fists and bounces
    const w = track(tauEnd, [[0, 0], [0.5, 0], [0.95, 1]])
    // a jump, over and over: the knees bend (the body sinks), the legs push off, the knees are drawn up in the air, the legs reach
    // for the floor again, and the landing is taken up by the knees; the fists go up with the push and come down a little in the crouch
    // (it starts at the push-off: a pose that stands still - clock 0 - is the winner with the fists up)
    const u = (((clock * JOY_RATE + phase / 5 + JOY_TAKEOFF) % 1) + 1) % 1
    const crouch = track(u, JOY_ALPHA)
    b.alpha = lerp(b.alpha, crouch, w)
    together = w // (with one foot ahead of the other, one knee would come up higher than the other: it would be a jump on one leg)
    b.lean = lerp(b.lean, track(u, JOY_LEAN), w)
    hop = w * JOY_HEIGHT * 4 * clamp01((u - JOY_TAKEOFF) / (JOY_LANDING - JOY_TAKEOFF)) * (1 - clamp01((u - JOY_TAKEOFF) / (JOY_LANDING - JOY_TAKEOFF)))
    const swing = track(u, JOY_ARMS) // 0 = fists low, 1 = high
    armN = blendArm(armN, { s: 2.3 + 0.55 * swing, e: 0.3 - 0.1 * swing }, w)
    armF = blendArm(armF, { s: 2.2 + 0.5 * swing, e: 0.35 - 0.1 * swing }, w)
  }

  // an idle fidget: only while it stands in its guard doing nothing (no strike, no blow coming in, nobody won or fell, not walking)
  let headYaw = 0
  let fidgetTurn = 0
  let fidgetKick: { leg: LegPose; w: number } | null = null
  const fidget = input.idle && !strike && !incoming && !won && !ko && (input.entrance !== 'walk' || t >= ENTER_S) ? (input.idle.force ?? fidgetAt(t, input.idle.seed)) : null
  if (fidget) {
    const fx = fidgetFx(fidget.kind, fidget.u)
    const w = fidgetEnvelope(fidget.kind, fidget.u)
    if (fx.armN) armN = mixArm(armN, fx.armN, w)
    if (fx.armF) armF = mixArm(armF, fx.armF, w)
    b.head += (fx.head ?? 0) * w
    b.alpha += (fx.alpha ?? 0) * w
    b.lean += (fx.lean ?? 0) * w
    b.x += (fx.x ?? 0) * w
    b.twist += (fx.twist ?? 0) * w
    b.pelvis += (fx.pelvis ?? 0) * w
    headYaw = (fx.headYaw ?? 0) * w
    fidgetTurn = fx.turn ?? 0
    if (fx.kick) fidgetKick = { leg: fx.kick.leg, w: fx.kick.w * w }
  }

  // a winner who has just thrown a kick has the leg of that kick (back in its stance by now): it joins the other for the jumps
  const own = planted(STANCE.n * (1 - together) + b.step, b.alpha, bd)
  let legN = kick ? (together > 0 ? blendLeg(kick, own, together) : kick) : own
  const legF = planted(STANCE.f * (1 - together) - 0.8 * b.step, b.alpha, bd)
  if (fidgetKick) legN = mixLeg(legN, fidgetKick.leg, fidgetKick.w)
  if (lift && !kick) legN = blendLeg(legN, { h: 0.95, k: -1.7, a: 0.2 }, lift.w)
  const kicking = kick !== null && together < 0.5
  const standing = (kicking ? ext(legF, bd) : Math.max(ext(legN, bd), ext(legF, bd))) - bd.hipY + bd.ankle
  const y = lerp(standing, 0.32, fall) + hop + air

  return { x: b.x, y, lean: b.lean, twist: b.twist, pelvis: b.pelvis, head: b.head, headYaw, turn: fidgetTurn, armN, armF, legN, legF, fall, flash }
}
