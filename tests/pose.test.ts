import { describe, expect, it } from 'vitest'
import { IMPACT } from '../src/timing'
import { WEAPONS, ZONES, type Weapon, type Zone } from '../src/sim'
import {
  ANKLE,
  HIP_Y,
  SHIN,
  THIGH,
  aimPoint,
  computePose,
  headGap,
  lungeFor,
  strikeTip,
  track,
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
