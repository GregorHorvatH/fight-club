import { describe, expect, it } from 'vitest'
import { IMPACT } from '../src/timing'
import { WEAPONS, ZONES, type Weapon, type Zone } from '../src/sim'
import {
  ANKLE,
  ENTER_S,
  EXIT_S,
  FIDGET_FIRST,
  FIDGET_KINDS,
  FIDGET_SECONDS,
  fidgetAt,
  HIP_Y,
  SHIN,
  THIGH,
  aimPoint,
  computePose,
  headGap,
  lungeFor,
  planFor,
  STANDARD,
  heightOf,
  strikeTip,
  track,
  type Build,
  type LegPose,
  type Pose,
  type PoseInput,
  type Strike,
} from '../src/ui/pose'

const ALL: Strike[] = WEAPONS.flatMap((weapon) => ZONES.map((zone) => ({ zone, weapon })))
/** A pose input: nothing happens (the strike would begin at 0 and the blow connect at IMPACT) unless the test says so. */
const input = (over: Partial<PoseInput> = {}): PoseInput => ({
  strike: null, strikeAt: 0, incoming: null, hitAt: IMPACT, stumble: false, ko: false, won: false, endAt: IMPACT, ...over,
})
const at = (t: number, over: Partial<PoseInput> = {}): Pose => computePose(t, input(over))
const name = (s: Strike) => `${s.weapon}-${s.zone}`
const blow = (zone: Zone, blocked = false, weapon: Weapon = 'hand') => ({ zone, blocked, weapon })

describe('track', () => {
  const keys = [[0, 0], [1, 10], [2, 4]] as const
  it('holds the first value before the start and the last after the end', () => {
    expect(track(-5, keys)).toBe(0)
    expect(track(9, keys)).toBe(4)
  })
  it('passes through every keyframe and eases between them', () => {
    expect(track(1, keys)).toBe(10)
    expect(track(0.5, keys)).toBeCloseTo(5)
    expect(track(0.25, keys)).toBeLessThan(2.5) // eased: slow at the start
  })
})

describe('an aimed strike (the one who is struck stands in his guard)', () => {
  it('reaches the chosen zone of the opponent, for every punch and kick', () => {
    for (const me of ALL) {
      const tip = strikeTip(at(IMPACT, { strike: me }), me.weapon)
      const aim = aimPoint(me)
      expect(Math.hypot(tip[0] - aim[0], tip[1] - aim[1]), name(me)).toBeLessThan(0.15) // less than the radius of a fist
    }
  })

  it('goes to different heights for different zones: head above body above legs', () => {
    for (const weapon of WEAPONS) {
      const h = aimPoint({ zone: 'head', weapon })[1]
      const b = aimPoint({ zone: 'body', weapon })[1]
      const l = aimPoint({ zone: 'legs', weapon })[1]
      expect(h, weapon).toBeGreaterThan(b)
      expect(b).toBeGreaterThan(l)
    }
  })

  it('a kick is lifted higher for a high target', () => {
    const hip = (zone: Zone) => at(IMPACT, { strike: { zone, weapon: 'foot' } }).legN.h
    expect(hip('head')).toBeGreaterThan(hip('body'))
    expect(hip('body')).toBeGreaterThan(hip('legs'))
  })

  it('a punch swings the near arm out and straightens the elbow', () => {
    const p = at(IMPACT, { strike: { zone: 'head', weapon: 'hand' } })
    expect(p.armN.s).toBeGreaterThan(1) // the upper arm is raised well forward
    expect(p.armN.e).toBeLessThan(0.9) // the forearm is almost in line with it
    expect(p.armN.e).toBeLessThan(at(0).armN.e) // ... and was folded in the guard
  })

  it('the striker never ends up with his head inside the other one', () => {
    for (const me of ALL) expect(headGap(me), name(me)).toBeGreaterThan(0.05)
  })

  it('only the striker closes in, as far as he needs to reach (and within the ring); the other one stands where he is', () => {
    for (const me of ALL) {
      const l = lungeFor(me)
      expect(l, name(me)).toBeGreaterThan(0.4 - 1e-9)
      expect(l).toBeLessThan(2.6 + 1e-9)
      expect(at(IMPACT, { strike: me }).x).toBeCloseTo(l, 5)
    }
    expect(at(IMPACT, {}).x).toBeCloseTo(0, 1) // nobody strikes: nobody moves
    expect(at(0, { strike: ALL[0]! }).x).toBeCloseTo(0, 1) // and the striker starts where he stands
  })

  it('a strike is a round trip: it ends back in the guard stance', () => {
    for (const me of ALL) {
      const start = at(0, { strike: me })
      const end = at(1.2, { strike: me })
      expect(end.x, name(me)).toBeCloseTo(0, 1)
      expect(end.armN.e).toBeCloseTo(start.armN.e, 1)
      expect(end.legN.h).toBeCloseTo(start.legN.h, 1)
    }
  })
})

describe('the strikes of a round follow each other (their times come from the timeline)', () => {
  it('a strike that begins later is the same strike, later: the same pose after the same time', () => {
    for (const me of ALL) {
      for (const dt of [0.1, IMPACT, 0.6]) {
        const early = at(dt, { strike: me, strikeAt: 0 })
        const late = at(1.7 + dt, { strike: me, strikeAt: 1.7 })
        expect(late.x, name(me)).toBeCloseTo(early.x, 6)
        expect(late.armN.s).toBeCloseTo(early.armN.s, 6)
        expect(late.legN.h).toBeCloseTo(early.legN.h, 6)
      }
    }
  })

  it('until it begins the fighter just stands in his guard', () => {
    const idle = at(0.2, {})
    const waiting = at(0.2, { strike: ALL[0]!, strikeAt: 1.7 })
    expect(waiting.x).toBeCloseTo(idle.x, 6)
    expect(waiting.armN.e).toBeCloseTo(idle.armN.e, 6)
  })

  it('the reaction to a blow starts when that blow connects, not before', () => {
    const hit = { incoming: blow('head'), hitAt: 2.0 }
    expect(at(1.9, hit).head).toBeCloseTo(at(1.9, {}).head, 6) // nothing yet
    expect(at(2.12, hit).head).toBeGreaterThan(at(2.12, {}).head + 0.5)
    // and the same reaction as if it had been at IMPACT, shifted in time
    expect(at(2.0 + 0.12, hit).head).toBeCloseTo(at(IMPACT + 0.12, { incoming: blow('head') }).head, 6)
  })

  it('the flash of the struck zone follows the blow', () => {
    const hit = { incoming: blow('head'), hitAt: 2.0 }
    expect(at(1.9, hit).flash).toBe(0)
    expect(at(2.01, hit).flash).toBeGreaterThan(0.9)
    expect(at(2.6, hit).flash).toBe(0)
  })

  it('a knockout falls after the match was decided, not before', () => {
    const down = { ko: true, endAt: 2.0, incoming: blow('head'), hitAt: 2.0 }
    expect(at(1.9, down).fall).toBe(0)
    expect(at(3.5, down).fall).toBe(1)
  })

  it('a stumble follows the fighter’s own kick (when his kick connects), wherever that is in the replay', () => {
    const kick: Strike = { zone: 'head', weapon: 'foot' }
    const calm = at(1.7 + IMPACT + 0.4, { strike: kick, strikeAt: 1.7 })
    const stumbling = at(1.7 + IMPACT + 0.4, { strike: kick, strikeAt: 1.7, stumble: true })
    expect(stumbling.x).toBeLessThan(calm.x - 0.2)
  })
})

describe('the skeleton', () => {
  /** the height of the sole of the foot above the floor (the foot hangs ANKLE below the ankle joint) */
  const heightOf = (p: Pose, l: LegPose): number => HIP_Y + p.y - THIGH * Math.cos(l.h) - SHIN * Math.cos(l.h + l.k) - ANKLE

  it('stands on the floor: the planted foot is on it, not sunk into it, and the other one is never below it', () => {
    const idle = at(0)
    expect(Math.min(heightOf(idle, idle.legN), heightOf(idle, idle.legF))).toBeCloseTo(0, 3) // the lower sole rests exactly on the floor
  })

  it('keeps the planted foot on the floor (and the other one never below it) through every strike', () => {
    for (const me of ALL) {
      for (let t = 0; t <= 1.2; t += 1 / 30) {
        const p = at(t, { strike: me })
        if (p.fall > 0) continue
        expect(Math.min(heightOf(p, p.legN), heightOf(p, p.legF)), `${name(me)} @${t.toFixed(2)}`).toBeGreaterThan(-0.06)
      }
    }
  })

  it('moves smoothly: no joint jumps between two frames at 60 fps', () => {
    const angles = (p: Pose): number[] => [
      p.x, p.y, p.lean, p.head, p.twist, p.pelvis, p.armN.s, p.armN.e, p.armF.s, p.armF.e,
      p.legN.h, p.legN.k, p.legN.a, p.legF.h, p.legF.k, p.legF.a, p.fall,
    ]
    const cases: Partial<PoseInput>[] = []
    for (const zone of ZONES) {
      for (const weapon of WEAPONS) {
        cases.push({ incoming: blow(zone, false, weapon) }, { incoming: blow(zone, true, weapon) })
        cases.push({ incoming: blow(zone, false, weapon), ko: true }, { incoming: blow(zone, false, weapon), won: true })
      }
    }
    for (const me of ALL) cases.push({ strike: me }, { strike: me, stumble: true }, { strike: me, won: true }, { strike: me, strikeAt: 1.7, hitAt: 1.7 + IMPACT })
    for (const c of cases) {
      let prev = angles(at(0, c))
      for (let t = 1 / 60; t <= 3.4; t += 1 / 60) {
        const cur = angles(at(t, c))
        cur.forEach((v, i) => {
          expect(Number.isFinite(v)).toBe(true)
          expect(Math.abs(v - prev[i]!), `channel ${i} @${t.toFixed(2)} ${JSON.stringify(c)}`).toBeLessThan(0.45)
        })
        prev = cur
      }
    }
  })

  it('bends joints the way people do: the knee folds the shin back, the elbow folds the forearm forward', () => {
    for (const me of [null, ...ALL]) {
      for (let t = 0; t <= 1.2; t += 0.05) {
        const p = at(t, { strike: me })
        expect(p.legN.k).toBeLessThan(0.05)
        expect(p.legF.k).toBeLessThan(0.05)
        expect(p.armN.e).toBeGreaterThan(-0.1)
        expect(p.armF.e).toBeGreaterThan(-0.1)
      }
    }
  })

  it('stands in a guard when idle: fists up, knees soft, and it bounces', () => {
    const a = computePose(0, input(), 0)
    const b = computePose(0, input(), 0.3)
    expect(a.armN.e).toBeGreaterThan(1.5)
    expect(a.legN.k).toBeLessThan(-0.2)
    expect(a.y).not.toBe(b.y)
  })
})

describe('reactions', () => {
  const after = (over: Partial<PoseInput>, dt = 0.12): Pose => at(IMPACT + dt, over)
  const ref = (dt = 0.12): Pose => after({}, dt)

  it('a punch to the head snaps the head back and pushes the body back', () => {
    const hit = after({ incoming: blow('head') })
    expect(hit.head).toBeGreaterThan(ref().head + 0.5)
    expect(hit.x).toBeLessThan(ref().x)
    expect(hit.lean).toBeLessThan(ref().lean)
  })

  it('a punch to the body doubles the fighter over and bends the knees', () => {
    const hit = after({ incoming: blow('body') })
    expect(hit.lean).toBeGreaterThan(ref().lean + 0.3)
    expect(hit.legN.k).toBeLessThan(ref().legN.k)
  })

  it('a punch to the legs buckles them: the hip drops', () => {
    expect(after({ incoming: blow('legs') }).y).toBeLessThan(ref().y - 0.1)
  })

  it('each zone is reacted to differently', () => {
    const r = ZONES.map((zone) => after({ incoming: blow(zone) }))
    expect(new Set(r.map((p) => p.head.toFixed(2))).size).toBe(3)
  })

  it('a kick hurts more than a punch', () => {
    const punch = after({ incoming: blow('head', false, 'hand') }, 0.1)
    const kick = after({ incoming: blow('head', false, 'foot') }, 0.1)
    expect(kick.head).toBeGreaterThan(punch.head)
  })

  it('a guard puts the forearms up in front of the head, and the head does not snap back', () => {
    const g = after({ incoming: blow('head', true) }, 0.2)
    expect(g.armN.s).toBeGreaterThan(1.1)
    expect(g.armN.e).toBeGreaterThan(2)
    expect(g.head).toBeLessThan(0.2)
  })

  it('the guard is up BEFORE the blow arrives, so it can be seen what is guarded', () => {
    const early = at(IMPACT - 0.1, { incoming: blow('head', true) })
    expect(early.armN.s).toBeGreaterThan(at(IMPACT - 0.1, {}).armN.s + 0.3)
  })

  it('a guarded strike to the legs brings the near knee up', () => {
    expect(at(IMPACT + 0.2, { incoming: blow('legs', true) }).legN.h).toBeGreaterThan(0.6)
  })

  it('the struck zone flashes and the flash fades; nothing flashes when nothing hits', () => {
    const hit = { incoming: blow('head') }
    expect(after(hit, 0.01).flash).toBeGreaterThan(0.9)
    expect(after(hit, 0.6).flash).toBe(0)
    expect(after({}, 0.01).flash).toBe(0)
    expect(at(0.1, hit).flash).toBe(0) // not before the blow lands
  })

  it('a stumble throws the kicker back and off balance', () => {
    const kick: Strike = { zone: 'head', weapon: 'foot' }
    const calm = at(IMPACT + 0.4, { strike: kick })
    expect(at(IMPACT + 0.4, { strike: kick, stumble: true }).x).toBeLessThan(calm.x - 0.2)
  })

  it('a knocked-out fighter ends up lying on the floor, limp; a fighter that is still up does not', () => {
    const down = at(IMPACT + 2, { ko: true, incoming: blow('head') })
    expect(down.fall).toBe(1)
    expect(down.armN.s).toBeLessThan(0.1)
    expect(at(IMPACT + 2, {}).fall).toBe(0)
    expect(at(IMPACT - 0.1, { ko: true }).fall).toBe(0) // it falls only after the blow
  })

  it('the winner raises both fists', () => {
    const w = at(IMPACT + 2, { won: true })
    expect(w.armN.s).toBeGreaterThan(2.4)
    expect(w.armF.s).toBeGreaterThan(2.4)
  })
})

/** A build with its parts made `by` times as long as the standard one (and its legs, arms or trunk by their own factors). */
const scaled = (id: string, by: { legs?: number; arms?: number; trunk?: number; all?: number }): Build => {
  const a = by.all ?? 1
  const l = (by.legs ?? 1) * a
  const r = (by.arms ?? 1) * a
  const t = (by.trunk ?? 1) * a
  const b = STANDARD
  return {
    id, hipY: b.hipY * l, thigh: b.thigh * l * 1.1, shin: b.shin * l * 0.9, foot: b.foot * a, ankle: b.ankle * a, upper: b.upper * r * 0.95, fore: b.fore * r * 1.05, fist: b.fist * r,
    waist: b.waist * t, shoulderUp: b.shoulderUp * t, neckUp: b.neckUp * t, headUp: b.headUp * a, headR: b.headR * a, bodyDepth: b.bodyDepth * t, chestC: b.chestC * t,
    shoulderZ: b.shoulderZ * a, hipZ: b.hipZ * a,
  }
}
const SMALL = scaled('small', { all: 0.9 })
const TALL = scaled('tall', { all: 1.1 })
// the two ends of what a leap or a crouch is for
const TINY = scaled('tiny', { all: 0.85 })
const GIANT = scaled('giant', { all: 1.15 })
const BIG = scaled('big', { all: 1.3 })
const LITTLE = scaled('little', { all: 0.75 })
const LONG_ARMS = scaled('long-arms', { arms: 1.25 })
const SHORT_LEGS = scaled('short-legs', { legs: 0.8, trunk: 1.1 })
const BUILDS = [STANDARD, SMALL, TALL, LONG_ARMS, SHORT_LEGS]

describe('bodies of their own build', () => {
  const pose = (t: number, me: Build, foe: Build, over: Partial<PoseInput> = {}): Pose => computePose(t, { ...input(over), build: me, foeBuild: foe })

  it('the standard build is as tall as the figure always was', () => {
    expect(heightOf(STANDARD)).toBeCloseTo(3.64, 2)
  })

  it('every strike reaches the zone it is aimed at, whoever strikes whom', () => {
    for (const me of BUILDS) {
      for (const foe of BUILDS) {
        for (const st of ALL) {
          const tip = strikeTip(pose(IMPACT, me, foe, { strike: st }), st.weapon, me)
          const aim = aimPoint(st, me, foe)
          expect(Math.hypot(tip[0] - aim[0], tip[1] - aim[1]), `${me.id} -> ${foe.id} ${name(st)}`).toBeLessThan(0.2)
        }
      }
    }
  })

  it('the feet stand on the floor and flat, however long the thigh is next to the shin', () => {
    for (const bd of BUILDS) {
      const p = pose(0, bd, STANDARD)
      for (const leg of [p.legN, p.legF]) expect(Math.abs(leg.h + leg.k + leg.a), bd.id).toBeLessThan(1e-9)
      expect(lift(p, bd), bd.id).toBeCloseTo(0, 6)
    }
  })

  it('a taller opponent is further to reach for a head, and a taller striker has less to cross', () => {
    const hand = { zone: 'head', weapon: 'hand' } as const
    expect(lungeFor(hand, TALL, STANDARD)).toBeLessThan(lungeFor(hand, SMALL, STANDARD))
    expect(lungeFor(hand, STANDARD, TALL)).toBeGreaterThan(lungeFor(hand, STANDARD, SMALL))
  })

  it('the striker never ends up with his head inside the other one, whatever the builds', () => {
    for (const me of BUILDS) for (const foe of BUILDS) for (const st of ALL) expect(headGap(st, undefined, me, foe), `${me.id} -> ${foe.id} ${name(st)}`).toBeGreaterThan(0.04)
  })
})

/** How far the feet that carry the body are off the floor (0 when it stands). */
const lift = (p: Pose, bd: Build): number => {
  const ankleY = (l: LegPose): number => bd.hipY + p.y - (bd.thigh * Math.cos(l.h) + bd.shin * Math.cos(l.h + l.k))
  return Math.min(ankleY(p.legN), ankleY(p.legF)) - bd.ankle
}

describe('leaps', () => {
  const pose = (t: number, me: Build, foe: Build, st: Strike): Pose => computePose(t, { ...input({ strike: st }), build: me, foeBuild: foe })
  const hand = { zone: 'head', weapon: 'hand' } as const

  it('a long lunge is a leap: the feet are off the floor on the way in, and the fighter lands with the blow', () => {
    const long = ALL.filter((st) => lungeFor(st, STANDARD, STANDARD) > 2)
    expect(long.length).toBeGreaterThan(0)
    for (const st of long) {
      let top = 0
      for (let t = 0.1; t < IMPACT; t += 0.01) top = Math.max(top, lift(pose(t, STANDARD, STANDARD, st), STANDARD))
      expect(top, name(st)).toBeGreaterThan(0.12)
      expect(Math.abs(lift(pose(IMPACT, STANDARD, STANDARD, st), STANDARD)), name(st)).toBeLessThan(0.02)
    }
  })

  it('a short lunge is a step: both feet stay on the floor', () => {
    const short = ALL.filter((st) => st.weapon !== 'super' && lungeFor(st, STANDARD, STANDARD) < 2) // (a super strike is always a leap)
    expect(short.length).toBeGreaterThan(0)
    for (const st of short) for (let t = 0; t < 1.2; t += 0.02) expect(lift(pose(t, STANDARD, STANDARD, st), STANDARD), `${name(st)} @${t.toFixed(2)}`).toBeLessThan(0.1)
  })

  it('a head that is too high to reach is reached by jumping up to it: still in the air at the blow', () => {
    expect(planFor(hand, TINY, GIANT).air).toBeGreaterThan(0.1)
    expect(lift(pose(IMPACT, TINY, GIANT, hand), TINY)).toBeGreaterThan(0.1)
    // ... and a head that is within reach is not
    expect(planFor(hand, STANDARD, STANDARD).air).toBe(0)
  })

  it('a leg that is too low for the fist is reached by crouching deeper (never by jumping)', () => {
    const low = { zone: 'legs', weapon: 'hand' } as const
    const all = [LITTLE, TINY, SMALL, STANDARD, TALL, GIANT, BIG]
    const needing = all.flatMap((me) => all.map((foe) => planFor(low, me, foe))).filter((p) => p.crouch > 0)
    expect(needing.length).toBeGreaterThan(0)
    for (const p of needing) expect(p.air).toBe(0)
  })
})

describe('the winner jumps on both legs', () => {
  it('whatever it did in the last round (a punch, a kick, a super strike), both legs are the same in the jumps', () => {
    const strikes: Strike[] = [...ALL, { zone: 'head', weapon: 'super', zone2: 'legs' }]
    for (const st of strikes) {
      for (const clock of [10, 10.1, 10.25, 10.4, 10.55]) {
        const p = computePose(10 + (clock - 10), { ...input({ strike: st, won: true, endAt: 0.3 }), strikeAt: 0 }, clock, 0)
        expect(p.legN.h, `${name(st)} @${clock}`).toBeCloseTo(p.legF.h, 6)
        expect(p.legN.k, `${name(st)} @${clock}`).toBeCloseTo(p.legF.k, 6)
      }
    }
  })
})

describe('walking onto the arena', () => {
  const walk = (t: number, entrance: 'walk' | 'wait' = 'walk'): Pose => computePose(t, { ...input(), entrance }, t, 0)

  it('starts outside its place, away from the opponent, and arrives at it', () => {
    expect(walk(0).x).toBeLessThan(-3) // far outside (beyond the frame)
    let prev = walk(0).x
    for (let t = 0.1; t < ENTER_S; t += 0.1) {
      const x = walk(t).x
      expect(x, `@${t.toFixed(1)}`).toBeGreaterThanOrEqual(prev - 1e-9) // it only comes closer
      prev = x
    }
    expect(walk(ENTER_S - 0.001).x).toBeCloseTo(0, 1)
    expect(walk(ENTER_S + 1).x).toBeCloseTo(at(ENTER_S + 1).x, 6) // then it is an ordinary idle pose
  })

  it('strides: the legs swing in turn, the knee of the swinging one is bent', () => {
    const p = walk(0.2)
    const q = walk(0.2 + 1 / 2.5 / 2) // half a stride later
    expect(Math.sign(p.legN.h)).not.toBe(Math.sign(q.legN.h))
    expect(p.legN.k).toBeLessThan(0)
    expect(p.legN.h).toBeCloseTo(-p.legF.h, 6)
  })

  it('moves smoothly: no joint jumps between two frames, including the moment it arrives', () => {
    let prev = walk(0)
    for (let t = 1 / 60; t < ENTER_S + 0.5; t += 1 / 60) {
      const cur = walk(t)
      for (const k of ['x', 'y', 'lean'] as const) expect(Math.abs(cur[k] - prev[k]), `${k} @${t.toFixed(2)}`).toBeLessThan(0.2)
      for (const l of ['legN', 'legF'] as const) for (const j of ['h', 'k', 'a'] as const) expect(Math.abs(cur[l][j] - prev[l][j]), `${l}.${j} @${t.toFixed(2)}`).toBeLessThan(0.35)
      for (const a of ['armN', 'armF'] as const) for (const j of ['s', 'e'] as const) expect(Math.abs(cur[a][j] - prev[a][j]), `${a}.${j} @${t.toFixed(2)}`).toBeLessThan(0.35)
      prev = cur
    }
  })

  it('walking, the arms hang and swing (not in the guard): the fists are up only on the arena', () => {
    const guard = at(5).armN // the stance
    const mid = walk(ENTER_S * 0.4)
    expect(Math.max(mid.armN.e, mid.armF.e)).toBeLessThan(guard.e - 0.5) // the elbows are not folded up to the chin
    expect(Math.sign(mid.armN.s)).not.toBe(Math.sign(mid.armF.s)) // they swing against each other
    expect(walk(ENTER_S - 0.001).armN.e).toBeCloseTo(at(ENTER_S).armN.e, 1) // arrived: in the guard
  })

  it('"wait": it stays outside the frame', () => {
    for (const t of [0, 1, 5]) expect(walk(t, 'wait').x).toBeLessThan(-3)
  })
})

describe('leaving the arena', () => {
  const leave = (t: number): Pose => computePose(t, { ...input(), entrance: 'leave' }, t, 0)

  it('turns right round first, and keeps facing away', () => {
    expect(leave(0).turn).toBeCloseTo(0, 6)
    let prev = 0
    for (let t = 0; t < EXIT_S + 1; t += 0.05) {
      const turn = leave(t).turn!
      expect(turn, `@${t.toFixed(2)}`).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = turn
    }
    expect(leave(1).turn).toBeCloseTo(1, 6)
    expect(leave(EXIT_S + 5).turn).toBeCloseTo(1, 6)
    expect(leave(0.1).x).toBeCloseTo(0, 0) // it has not gone anywhere while it is turning
  })

  it('walks out (away from the opponent, out of the frame) and stays out', () => {
    expect(leave(0).x).toBeCloseTo(0, 1)
    let prev = leave(0).x
    for (let t = 0.1; t < EXIT_S + 1; t += 0.1) {
      const x = leave(t).x
      expect(x, `@${t.toFixed(1)}`).toBeLessThanOrEqual(prev + 1e-9) // it only goes further
      prev = x
    }
    expect(leave(EXIT_S).x).toBeLessThan(-3)
    expect(leave(EXIT_S + 5).x).toBeLessThan(-3)
  })

  it('moves smoothly: no joint jumps between two frames, from the stance to the stride and out', () => {
    let prev = leave(0)
    for (let t = 1 / 60; t < EXIT_S + 0.5; t += 1 / 60) {
      const cur = leave(t)
      for (const k of ['x', 'y', 'lean'] as const) expect(Math.abs(cur[k] - prev[k]), `${k} @${t.toFixed(2)}`).toBeLessThan(0.2)
      for (const l of ['legN', 'legF'] as const) for (const j of ['h', 'k', 'a'] as const) expect(Math.abs(cur[l][j] - prev[l][j]), `${l}.${j} @${t.toFixed(2)}`).toBeLessThan(0.35)
      for (const a of ['armN', 'armF'] as const) for (const j of ['s', 'e'] as const) expect(Math.abs(cur[a][j] - prev[a][j]), `${a}.${j} @${t.toFixed(2)}`).toBeLessThan(0.35)
      prev = cur
    }
  })
})


describe('idle fidgets', () => {
  it('none before the wait has gone on for a while; then one now and then, at random moments, never twice at once', () => {
    for (let t = 0; t < FIDGET_FIRST; t += 0.25) expect(fidgetAt(t, 1), `@${t}`).toBeNull()
    const seen = new Set<string>()
    let busy = 0
    for (let t = 0; t < 600; t += 0.1) {
      const f = fidgetAt(t, 1)
      if (f) {
        seen.add(f.kind)
        busy++
        expect(f.u).toBeGreaterThanOrEqual(0)
        expect(f.u).toBeLessThan(FIDGET_SECONDS[f.kind] + 1e-9)
      }
    }
    expect(seen.size).toBe(FIDGET_KINDS.length) // in ten minutes every kind comes up
    expect(busy / 6000).toBeGreaterThan(0.2) // (a fidget is going on a third of the time or so)
    expect(busy / 6000).toBeLessThan(0.6)
  })

  it('the same time and seed always give the same thing, and the two fighters (seeds) do different things at different times', () => {
    expect(fidgetAt(17.3, 1)).toEqual(fidgetAt(17.3, 1))
    let same = 0
    let both = 0
    for (let t = 0; t < 300; t += 0.1) {
      const a = fidgetAt(t, 1)
      const b = fidgetAt(t, 2.7)
      if (a && b) {
        both++
        if (a.kind === b.kind) same++
      }
    }
    expect(both).toBeLessThan(1500) // they are not in step
    expect(same).toBeLessThan(both)
  })

  it('every fidget moves the body, gently: no joint jumps between two frames, whatever the fidget', () => {
    for (const kind of FIDGET_KINDS) {
      const at = (t: number): Pose => computePose(0, { ...input(), idle: { seed: 1, force: { kind, u: t } } }, 0, 0)
      let prev = at(0)
      let moved = 0
      for (let u = 1 / 60; u < FIDGET_SECONDS[kind]; u += 1 / 60) {
        const cur = at(u)
        for (const k of ['x', 'y', 'lean', 'head', 'twist'] as const) expect(Math.abs(cur[k] - prev[k]), `${kind}.${k} @${u.toFixed(2)}`).toBeLessThan(0.3)
        for (const a of ['armN', 'armF'] as const) for (const j of ['s', 'e'] as const) expect(Math.abs(cur[a][j] - prev[a][j]), `${kind}.${a}.${j} @${u.toFixed(2)}`).toBeLessThan(0.35)
        for (const l of ['legN', 'legF'] as const) for (const j of ['h', 'k', 'a'] as const) expect(Math.abs(cur[l][j] - prev[l][j]), `${kind}.${l}.${j} @${u.toFixed(2)}`).toBeLessThan(0.35)
        moved += Math.abs(cur.armN.s - prev.armN.s) + Math.abs(cur.head - prev.head) + Math.abs((cur.headYaw ?? 0) - (prev.headYaw ?? 0)) + Math.abs(cur.legN.h - prev.legN.h)
        prev = cur
      }
      expect(moved, kind).toBeGreaterThan(0.1)
      // it begins and ends in the plain stance
      const plain = computePose(0, input(), 0, 0)
      expect(Math.abs(at(0).armN.e - plain.armN.e), `${kind} start`).toBeLessThan(0.01)
      expect(Math.abs(at(FIDGET_SECONDS[kind]).armN.e - plain.armN.e), `${kind} end`).toBeLessThan(0.01)
    }
  })

  it('the taunting dance turns its back to the opponent, and turns round again', () => {
    const at = (u: number): Pose => computePose(0, { ...input(), idle: { seed: 1, force: { kind: 'taunt', u } } }, 0, 0)
    expect(at(0).turn).toBeCloseTo(0, 6)
    expect(at(2.4).turn).toBeCloseTo(1, 6) // the back to the opponent, wiggling
    expect(at(FIDGET_SECONDS.taunt).turn).toBeCloseTo(0, 6)
    // it wiggles its hips (the pelvis sways quickly) bent over
    const swing = Array.from({ length: 60 }, (_, i) => at(2 + i / 30).pelvis)
    expect(Math.max(...swing) - Math.min(...swing)).toBeGreaterThan(0.6)
    expect(at(2.4).lean).toBeGreaterThan(0.2)
    // the turn is smooth
    let prev = at(0).turn!
    for (let u = 1 / 60; u < FIDGET_SECONDS.taunt; u += 1 / 60) {
      const turn = at(u).turn!
      expect(Math.abs(turn - prev), `@${u.toFixed(2)}`).toBeLessThan(0.1)
      prev = turn
    }
  })

  it('a fighter looking at the player turns its head; the kick at the ball swings the near leg', () => {
    const look = computePose(0, { ...input(), idle: { seed: 1, force: { kind: 'lookAtPlayer', u: 1.3 } } }, 0, 0)
    expect(look.headYaw).toBeGreaterThan(0.5)
    const plain = computePose(0, input(), 0, 0)
    const kick = computePose(0, { ...input(), idle: { seed: 1, force: { kind: 'kickBall', u: 1.22 } } }, 0, 0)
    expect(kick.legN.h).toBeGreaterThan(plain.legN.h + 0.3)
  })

  it('only when it stands doing nothing: not while it strikes, is struck, has won or is down', () => {
    const f = { idle: { seed: 1, force: { kind: 'scratch', u: 1.2 } as const } }
    const base = computePose(0, input(), 0, 0)
    expect(computePose(0, { ...input(), ...f }, 0, 0).armN.s).not.toBeCloseTo(base.armN.s, 1)
    expect(computePose(0.1, { ...input({ strike: { zone: 'head', weapon: 'hand' } }), ...f }, 0, 0).armN.s).toBeCloseTo(computePose(0.1, input({ strike: { zone: 'head', weapon: 'hand' } }), 0, 0).armN.s, 6)
    expect(computePose(0, { ...input({ won: true }), ...f }, 0, 0).headYaw).toBe(0)
    expect(computePose(0, { ...input({ ko: true }), ...f }, 0, 0).armN.s).toBeCloseTo(computePose(0, input({ ko: true }), 0, 0).armN.s, 6)
  })

  it('the pose in the wait carries no fidget when idle is not asked for (the replay of a round)', () => {
    for (let t = 0; t < 30; t += 0.7) expect(computePose(t, input(), t, 0).headYaw).toBe(0)
  })
})
