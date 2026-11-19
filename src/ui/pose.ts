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
 * chosen zone of the opponent's body, wherever the opponent's head, chest or shin is at that moment. Both fighters close
 * in just enough for each to reach (see lungeFor), so a punch is thrown at the right range whatever the opponent is doing.
 */
import { IMPACT } from '../timing'
import type { Weapon, Zone } from '../sim'

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

/** the fighters never come closer than this (front surface of one head to the other's), and a strike is reached with the limb this fully stretched */
const MIN_HEAD_GAP = 0.06
const STRETCH = 0.93
const LUNGE_MIN = 0.4
const LUNGE_MAX = 1.5 // 2 * BASE_X - 2 * 1.5 = 0.6 between the two roots: the torsos just touch
/** the fist is sent this far short of the surface point (its radius); a foot this far */
const TOUCH = { hand: FIST, foot: 0.06 }
/** how far the striking limb can reach from the shoulder / the hip */
const REACH = { hand: UPPER + FORE, foot: THIGH + SHIN + FOOT }

export interface Strike {
  zone: Zone
  weapon: Weapon
}
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
}
export interface PoseInput {
  /** the strike this fighter throws */
  strike: Strike | null
  /** the strike the opponent throws (where this fighter's target is, and how hard it gets hit) */
  foe: Strike | null
  /** the strike that comes in: where, and whether it is guarded */
  incoming: { zone: Zone; blocked: boolean } | null
  /** this fighter's own kick was guarded: it stumbles */
  stumble: boolean
  ko: boolean
  won: boolean
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

const GUARD_N: ArmPose = { s: 0.62, e: 1.95 } // fists up by the chin
const GUARD_F: ArmPose = { s: 0.5, e: 2.0 }
const STANCE = { n: 0.18, f: -0.22 } // the thigh angle of the front and the back foot
const ALPHA_IDLE = 0.17
const LEAN_IDLE = 0.03

/** A leg with the foot flat under the hip: the thigh forward by alpha, the knee folding the shin back by 2 alpha. */
const planted = (h0: number, alpha: number): LegPose => ({ h: h0 + alpha, k: -2 * alpha, a: alpha - h0 })
/** how high the hip is above the floor for this leg */
const ext = (l: LegPose): number => THIGH * Math.cos(l.h) + SHIN * Math.cos(l.h + l.k)

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
}

/** How far the body crouches and leans at the moment of contact, for each strike. A low punch needs a deep crouch to reach the legs. */
export const AT_CONTACT: Record<Weapon, Record<Zone, { alpha: number; lean: number }>> = {
  hand: { head: { alpha: 0.19, lean: 0.2 }, body: { alpha: 0.9, lean: 0.17 }, legs: { alpha: 1.47, lean: 0.18 } },
  foot: { head: { alpha: 0.44, lean: -0.13 }, body: { alpha: 0.63, lean: 0 }, legs: { alpha: 0.66, lean: 0.04 } },
}

function bodyAt(t: number, strike: Strike | null, lunge: number, clock: number, phase: number): Body {
  const alpha0 = ALPHA_IDLE + 0.05 * Math.sin(clock * 4.5 + phase)
  const twist0 = 0.05 * Math.sin(clock * 1.7 + phase)
  const head0 = 0.03 * Math.sin(clock * 2.1 + phase)
  if (!strike) return { x: 0, lean: LEAN_IDLE, twist: twist0, pelvis: 0, head: head0, alpha: alpha0, step: 0 }
  const c = AT_CONTACT[strike.weapon][strike.zone]
  const C = IMPACT
  const L = lunge
  if (strike.weapon === 'hand') {
    const W = 0.15, H = 0.38, E = 0.74 // wind-up, end of the follow-through, back in guard
    return {
      x: track(t, [[0, 0], [W, -0.1], [C, L], [H, L], [E, 0]]),
      lean: track(t, [[0, LEAN_IDLE], [W, -0.08], [C, c.lean], [H, c.lean * 0.9], [E, LEAN_IDLE]]),
      twist: track(t, [[0, twist0], [W, -0.45], [C, 0.55], [H, 0.5], [E, twist0]]),
      pelvis: track(t, [[0, 0], [W, -0.2], [C, 0.3], [H, 0.28], [E, 0]]),
      head: track(t, [[0, head0], [C, -0.12], [H, -0.1], [E, head0]]),
      alpha: track(t, [[0, alpha0], [W, alpha0 + 0.08], [C, c.alpha], [H, c.alpha], [E, alpha0]]),
      step: track(t, [[0, 0], [W, -0.1], [C, 0.3], [H, 0.3], [E, 0]]),
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
  }
}

const legsOf = (b: Body): { n: LegPose; f: LegPose } => ({
  n: planted(STANCE.n + b.step, b.alpha),
  f: planted(STANCE.f - 0.8 * b.step, b.alpha),
})

/** The hip height above the floor: the planted leg decides (the kicking leg is in the air). */
function bodyY(b: Body, kicking: boolean): number {
  const l = legsOf(b)
  return (kicking ? ext(l.f) : Math.max(ext(l.n), ext(l.f))) - HIP_Y + ANKLE
}

type Pt = readonly [forward: number, up: number]

/** The front surface of a zone of a body, in that body's own frame (forward = toward its opponent), measured from its root. */
function zonePoint(zone: Zone, b: Body, kicking: boolean): Pt {
  const y = bodyY(b, kicking)
  const wf = 0
  const wu = HIP_Y + WAIST + y
  const s = Math.sin(b.lean)
  const c = Math.cos(b.lean)
  if (zone === 'body') return [wf + CHEST_C * s + BODY_DEPTH * c, wu + CHEST_C * c - BODY_DEPTH * s]
  if (zone === 'head') {
    const tilt = b.lean - b.head
    const hf = wf + NECK_UP * s + HEAD_UP * Math.sin(tilt)
    const hu = wu + NECK_UP * c + HEAD_UP * Math.cos(tilt)
    return [hf + HEAD_R * Math.cos(tilt), hu - HEAD_R * Math.sin(tilt)]
  }
  // legs: the shin of the planted leg that is nearer the opponent
  const l = legsOf(b)
  const leg = kicking ? l.f : l.n
  const kf = THIGH * Math.sin(leg.h)
  const ku = HIP_Y + y - THIGH * Math.cos(leg.h)
  const sa = leg.h + leg.k
  return [kf + 0.35 * Math.sin(sa) + 0.14 * Math.cos(sa), ku - 0.35 * Math.cos(sa) + 0.14 * Math.sin(sa)]
}

/** How far the fighter must stretch to reach the opponent's zone, as a fraction of what its limb can reach, when both close in by `lunge`. */
function stretch(me: Strike, foe: Strike | null, lunge: number): number {
  const kicking = me.weapon === 'foot'
  const bm = bodyAt(IMPACT, me, lunge, 0, 0)
  const from = kicking ? hipAt(bm, true) : shoulderAt(bm, false)
  const t = targetPoint(me.zone, foe, lunge)
  return (Math.hypot(t[0] - from[0], t[1] - from[1]) - TOUCH[me.weapon]) / REACH[me.weapon]
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

const lungeCache = new Map<string, number>()
/** forget the computed lunges (needed only when the choreography constants are changed at run time, as the tuning script does) */
export const clearLungeCache = (): void => lungeCache.clear()
const keyOf = (s: Strike | null): string => (s ? `${s.weapon[0]}${s.zone[0]}` : '-')

/**
 * How far BOTH fighters close in on each other for a pair of strikes. The same number for both (it does not matter who is
 * asked), as little as lets each reach its target with the limb almost fully stretched, and never so much that the heads
 * would touch. So a punch is thrown at the right range whatever the opponent is doing: crouching, leaning back or kicking.
 */
export function lungeFor(a: Strike | null, b: Strike | null): number {
  const [ka, kb] = [keyOf(a), keyOf(b)].sort() as [string, string]
  const key = `${ka}|${kb}`
  const hit = lungeCache.get(key)
  if (hit !== undefined) return hit
  // stretch() falls as the fighters close in: for each fighter, the lunge at which it has to stretch exactly STRETCH;
  // both must be able to reach, so it is the larger of the two
  const boundary = (me: Strike | null, foe: Strike | null): number =>
    me ? largest(LUNGE_MIN, LUNGE_MAX, (l) => stretch(me, foe, l) >= STRETCH) : LUNGE_MIN
  const need = Math.max(boundary(a, b), boundary(b, a))
  const tooClose = largest(LUNGE_MIN, LUNGE_MAX, (l) => headGap(a, b, l) >= MIN_HEAD_GAP)
  const lunge = Math.min(need, tooClose)
  lungeCache.set(key, lunge)
  return lunge
}

/**
 * How far apart the two heads' front surfaces are at the moment of contact, measured along the line between the fighters
 * (negative = the heads would overlap). `a` and `b` are the strikes the two fighters throw.
 */
export function headGap(a: Strike | null, b: Strike | null, lunge = lungeFor(a, b)): number {
  const ba = bodyAt(IMPACT, a, lunge, 0, 0)
  const bb = bodyAt(IMPACT, b, lunge, 0, 0)
  const pa = zonePoint('head', ba, a?.weapon === 'foot')
  const pb = zonePoint('head', bb, b?.weapon === 'foot')
  return 2 * BASE_X - bb.x - pb[0] - (ba.x + pa[0])
}

/** Where the opponent's zone is at the moment of contact, in OUR frame (measured from our root, forward = toward the opponent). */
export function targetPoint(zone: Zone, foe: Strike | null, lunge: number): Pt {
  const fb = bodyAt(IMPACT, foe, lunge, 0, 0)
  const p = zonePoint(zone, fb, foe?.weapon === 'foot')
  return [2 * BASE_X - fb.x - p[0], p[1]]
}

const shoulderAt = (b: Body, kicking: boolean): Pt => [
  b.x + SHOULDER_UP * Math.sin(b.lean) + SHOULDER_Z * Math.sin(b.twist),
  HIP_Y + bodyY(b, kicking) + WAIST + SHOULDER_UP * Math.cos(b.lean),
]
const hipAt = (b: Body, kicking: boolean): Pt => [b.x + HIP_Z * Math.sin(b.pelvis), HIP_Y + bodyY(b, kicking)]

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
export function aimPoint(strike: Strike, foe: Strike | null): Pt {
  const lunge = lungeFor(strike, foe)
  const kicking = strike.weapon === 'foot'
  const bc = bodyAt(IMPACT, strike, lunge, 0, 0)
  const from = kicking ? hipAt(bc, true) : shoulderAt(bc, false)
  const t = targetPoint(strike.zone, foe, lunge)
  const dx = t[0] - from[0]
  const dy = t[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const back = TOUCH[strike.weapon]
  return [t[0] - (dx / len) * back, t[1] - (dy / len) * back]
}

/** The strike's solved joint angles at the moment of contact. */
function contact(strike: Strike, foe: Strike | null): { s: number; e: number } | { h: number; k: number } {
  const kicking = strike.weapon === 'foot'
  const bc = bodyAt(IMPACT, strike, lungeFor(strike, foe), 0, 0)
  const from = kicking ? hipAt(bc, true) : shoulderAt(bc, false)
  const to = aimPoint(strike, foe)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (kicking) {
    const { a1, a2 } = ik(dx, dy, THIGH, SHIN + FOOT, true)
    return { h: a1, k: a2 - a1 }
  }
  const { a1, a2 } = ik(dx, dy, UPPER, FORE, false)
  return { s: a1, e: a2 - a1 }
}

/** Where the fist (hands) or the foot's tip (kicks) is, from a finished pose: for checking that a strike lands where it was aimed. */
export function strikeTip(p: Pose, weapon: Weapon): Pt {
  if (weapon === 'foot') {
    const hf = p.x + HIP_Z * Math.sin(p.pelvis)
    const hu = HIP_Y + p.y
    const kf = hf + THIGH * Math.sin(p.legN.h)
    const ku = hu - THIGH * Math.cos(p.legN.h)
    const sa = p.legN.h + p.legN.k
    return [kf + (SHIN + FOOT) * Math.sin(sa), ku - (SHIN + FOOT) * Math.cos(sa)]
  }
  const sf = p.x + SHOULDER_UP * Math.sin(p.lean) + SHOULDER_Z * Math.sin(p.twist)
  const su = HIP_Y + p.y + WAIST + SHOULDER_UP * Math.cos(p.lean)
  const ef = sf + UPPER * Math.sin(p.armN.s)
  const eu = su - UPPER * Math.cos(p.armN.s)
  const fa = p.armN.s + p.armN.e
  return [ef + FORE * Math.sin(fa), eu - FORE * Math.cos(fa)]
}

const blendArm = (a: ArmPose, to: ArmPose, w: number): ArmPose => ({ s: lerp(a.s, to.s, w), e: lerp(a.e, to.e, w) })
const blendLeg = (l: LegPose, to: LegPose, w: number): LegPose => ({ h: lerp(l.h, to.h, w), k: lerp(l.k, to.k, w), a: lerp(l.a, to.a, w) })

/**
 * The pose `t` seconds into the replay of a round.
 * @param clock a free-running clock (seconds) for the idle bounce and breathing
 * @param phase offsets the idle bounce so the two fighters do not move in lockstep
 */
export function computePose(t: number, input: PoseInput, clock = 0, phase = 0): Pose {
  const { strike, foe, incoming, stumble, ko, won } = input
  const b = bodyAt(t, strike, strike ? lungeFor(strike, foe) : 0, clock, phase)
  let armN: ArmPose = { s: GUARD_N.s + 0.04 * Math.sin(clock * 3 + phase), e: GUARD_N.e }
  let armF: ArmPose = { s: GUARD_F.s + 0.04 * Math.sin(clock * 3.3 + phase), e: GUARD_F.e }
  let kick: LegPose | null = null
  const C = IMPACT

  if (strike?.weapon === 'hand') {
    const c = contact(strike, foe) as { s: number; e: number }
    const W = 0.15, H = 0.38, E = 0.74
    armN = {
      s: track(t, [[0, GUARD_N.s], [W, -0.5], [C, c.s], [H, c.s - 0.04], [E, GUARD_N.s]]),
      e: track(t, [[0, GUARD_N.e], [W, 2.1], [C, c.e], [H, c.e + 0.05], [E, GUARD_N.e]]),
    }
    armF = {
      s: track(t, [[0, GUARD_F.s], [W, 0.95], [C, 0.35], [E, GUARD_F.s]]),
      e: track(t, [[0, GUARD_F.e], [W, 2.2], [C, 1.7], [E, GUARD_F.e]]),
    }
  } else if (strike) {
    const c = contact(strike, foe) as { h: number; k: number }
    const K = 0.16, H = 0.38, R = 0.52, E = 0.74
    const p0 = planted(STANCE.n, ALPHA_IDLE)
    kick = {
      h: track(t, [[0, p0.h], [K, 1.25], [C, c.h], [H, c.h - 0.04], [R, 1.05], [E, p0.h]]),
      k: track(t, [[0, p0.k], [K, -2.1], [C, c.k], [H, c.k - 0.08], [R, -1.5], [E, p0.k]]),
      a: track(t, [[0, p0.a], [K, 0.2], [C, -1.2], [H, -1.2], [R, -0.2], [E, p0.a]]),
    }
    // the arms balance the kick: the far one swings back, the near one forward
    armF = {
      s: track(t, [[0, GUARD_F.s], [K, 0.4], [C, -0.9], [H, -0.9], [R, -0.5], [E, GUARD_F.s]]),
      e: track(t, [[0, GUARD_F.e], [K, 1.0], [C, 0.5], [E, GUARD_F.e]]),
    }
    armN = {
      s: track(t, [[0, GUARD_N.s], [K, 1.1], [C, 1.4], [H, 1.4], [E, GUARD_N.s]]),
      e: track(t, [[0, GUARD_N.e], [C, 0.7], [E, GUARD_N.e]]),
    }
  }

  let lift: { w: number } | null = null // a guarded leg strike: the near knee comes up to meet it
  let hop = 0
  let fall = 0
  let flash = 0
  const tau = t - IMPACT

  if (incoming && tau > 0) {
    const power = foe?.weapon === 'foot' ? 1.3 : 1
    flash = clamp01(1 - tau / 0.45)
    if (!incoming.blocked) {
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
    } else {
      // a guard: the arms (or the knee) come up in front of the zone, the body is pushed back a little
      const g = track(tau, [[0, 0], [0.12, 1], [0.45, 1], [0.8, 0]])
      b.x -= 0.12 * g
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
  }

  if (stumble && tau > 0.08) {
    // the kick was guarded: the kicker loses its balance and staggers back
    const u = tau - 0.08
    const s = track(u, [[0, 0], [0.12, 1], [0.55, 0.7], [1.0, 0]])
    b.x -= 0.5 * s
    b.lean -= 0.3 * s + Math.sin(u * 13) * 0.12 * s
    b.alpha += 0.15 * s
    armN = { s: armN.s + Math.sin(u * 12) * 0.8 * s, e: armN.e }
    armF = { s: armF.s - Math.sin(u * 12) * 0.8 * s, e: armF.e }
  }

  if (ko) {
    // knocked out: the knees give, the arms go limp, then it falls back onto the floor
    const c = track(tau, [[0, 0], [0.35, 1]])
    b.alpha = lerp(b.alpha, 0.95, c)
    b.lean = lerp(b.lean, -0.2, c)
    armN = blendArm(armN, { s: -0.3, e: 0.3 }, c)
    armF = blendArm(armF, { s: -0.2, e: 0.4 }, c)
    fall = track(tau, [[0, 0], [0.3, 0], [1.0, 1]])
  } else if (won) {
    // the winner raises both fists and bounces
    const w = track(tau, [[0, 0], [0.5, 0], [0.95, 1]])
    armN = blendArm(armN, { s: 2.75, e: 0.25 }, w)
    armF = blendArm(armF, { s: 2.6, e: 0.3 }, w)
    hop = w * Math.abs(Math.sin(clock * 6 + phase)) * 0.16
  }

  let legN = kick ?? planted(STANCE.n + b.step, b.alpha)
  const legF = planted(STANCE.f - 0.8 * b.step, b.alpha)
  if (lift && !kick) legN = blendLeg(legN, { h: 0.95, k: -1.7, a: 0.2 }, lift.w)
  const standing = (kick ? ext(legF) : Math.max(ext(legN), ext(legF))) - HIP_Y + ANKLE
  const y = lerp(standing, 0.32, fall) + hop

  return { x: b.x, y, lean: b.lean, twist: b.twist, pelvis: b.pelvis, head: b.head, armN, armF, legN, legF, fall, flash }
}
