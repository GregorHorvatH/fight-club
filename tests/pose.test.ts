import { describe, expect, it } from 'vitest'
import { IMPACT } from '../src/timing'
import { WEAPONS, ZONES } from '../src/sim'
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
const input = (over: Partial<PoseInput> = {}): PoseInput => ({ strike: null, foe: null, incoming: null, stumble: false, ko: false, won: false, ...over })
const at = (t: number, over: Partial<PoseInput> = {}): Pose => computePose(t, input(over))
const name = (s: Strike) => `${s.weapon}-${s.zone}`

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

describe('an aimed strike', () => {
  it('reaches the chosen zone of the opponent, whatever the opponent is doing (all 36 combinations)', () => {
    for (const me of ALL) {
      for (const foe of ALL) {
        const p = at(IMPACT, { strike: me, foe })
        const tip = strikeTip(p, me.weapon)
        const aim = aimPoint(me, foe)
        const miss = Math.hypot(tip[0] - aim[0], tip[1] - aim[1])
        expect(miss, `${name(me)} vs ${name(foe)}`).toBeLessThan(0.15) // less than the radius of a fist
      }
    }
  })

  it('goes to different heights for different zones: head above body above legs', () => {
    for (const weapon of WEAPONS) {
      for (const foe of ALL) {
        const h = aimPoint({ zone: 'head', weapon }, foe)[1]
        const b = aimPoint({ zone: 'body', weapon }, foe)[1]
        const l = aimPoint({ zone: 'legs', weapon }, foe)[1]
        expect(h, `${weapon} vs ${name(foe)}`).toBeGreaterThan(b)
        expect(b).toBeGreaterThan(l)
      }
    }
  })

  it('follows the opponent: a crouching opponent is hit lower than a leaning-back one', () => {
    const low = aimPoint({ zone: 'head', weapon: 'hand' }, { zone: 'legs', weapon: 'hand' }) // the opponent ducks into a low punch
    const high = aimPoint({ zone: 'head', weapon: 'hand' }, { zone: 'head', weapon: 'foot' }) // the opponent kicks high
    expect(low[1]).toBeLessThan(high[1])
  })

  it('a kick is lifted higher for a high target', () => {
    const foe: Strike = { zone: 'body', weapon: 'hand' }
    const hip = (zone: Strike['zone']) => at(IMPACT, { strike: { zone, weapon: 'foot' }, foe }).legN.h
    expect(hip('head')).toBeGreaterThan(hip('body'))
    expect(hip('body')).toBeGreaterThan(hip('legs'))
  })

  it('a punch swings the near arm out and straightens the elbow', () => {
    const p = at(IMPACT, { strike: { zone: 'head', weapon: 'hand' }, foe: { zone: 'head', weapon: 'hand' } })
    expect(p.armN.s).toBeGreaterThan(1) // the upper arm is raised well forward
    expect(p.armN.e).toBeLessThan(0.9) // the forearm is almost in line with it
    expect(p.armN.e).toBeLessThan(at(0).armN.e) // ... and was folded in the guard
  })

  it('the fighters never end up with their heads inside each other', () => {
    for (const me of ALL) for (const foe of ALL) expect(headGap(me, foe), `${name(me)} vs ${name(foe)}`).toBeGreaterThan(0)
  })

  it('both fighters close in by the same amount, whoever is asked, within the ring', () => {
    for (const a of ALL) {
      for (const b of ALL) {
        expect(lungeFor(a, b), `${name(a)} vs ${name(b)}`).toBe(lungeFor(b, a))
        expect(lungeFor(a, b)).toBeGreaterThan(0.4 - 1e-9)
        expect(lungeFor(a, b)).toBeLessThan(1.5 + 1e-9) // the torsos never pass through each other
      }
    }
    const p = at(IMPACT, { strike: { zone: 'body', weapon: 'hand' }, foe: { zone: 'body', weapon: 'hand' } })
    expect(p.x).toBeCloseTo(lungeFor({ zone: 'body', weapon: 'hand' }, { zone: 'body', weapon: 'hand' }), 5)
    expect(at(0, { strike: { zone: 'body', weapon: 'hand' } }).x).toBeCloseTo(0, 1) // and starts where it stands
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

describe('the skeleton', () => {
  /** the height of the sole of the foot above the floor (the foot hangs ANKLE below the ankle joint) */
  const heightOf = (p: Pose, l: LegPose): number => HIP_Y + p.y - THIGH * Math.cos(l.h) - SHIN * Math.cos(l.h + l.k) - ANKLE

  it('stands on the floor: the planted foot is on it, not sunk into it, and the other one is never below it', () => {
    const idle = at(0)
    expect(Math.min(heightOf(idle, idle.legN), heightOf(idle, idle.legF))).toBeCloseTo(0, 3) // the lower sole rests exactly on the floor
  })

  it('keeps the planted foot on the floor (and the other one never below it) through every strike', () => {
    for (const me of ALL) {
      for (const foe of ALL) {
        for (let t = 0; t <= 1.2; t += 1 / 30) {
          const p = at(t, { strike: me, foe })
          if (p.fall > 0) continue
          expect(Math.min(heightOf(p, p.legN), heightOf(p, p.legF)), `${name(me)} vs ${name(foe)} @${t.toFixed(2)}`).toBeGreaterThan(-0.06)
        }
      }
    }
  })

  it('moves smoothly: no joint jumps between two frames at 60 fps', () => {
    const angles = (p: Pose): number[] => [
      p.x, p.y, p.lean, p.head, p.twist, p.pelvis, p.armN.s, p.armN.e, p.armF.s, p.armF.e,
      p.legN.h, p.legN.k, p.legN.a, p.legF.h, p.legF.k, p.legF.a, p.fall,
    ]
    const cases: Partial<PoseInput>[] = []
    for (const me of ALL) for (const foe of [ALL[0]!, ALL[4]!]) {
      cases.push({ strike: me, foe })
      for (const zone of ZONES) {
        cases.push({ strike: me, foe, incoming: { zone, blocked: false } })
        cases.push({ strike: me, foe, incoming: { zone, blocked: true } })
      }
      cases.push({ strike: me, foe, stumble: true }, { strike: me, foe, ko: true }, { strike: me, foe, won: true })
    }
    for (const c of cases) {
      let prev = angles(at(0, c))
      for (let t = 1 / 60; t <= 1.6; t += 1 / 60) {
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
  const me: Strike = { zone: 'body', weapon: 'hand' }
  const foe: Strike = { zone: 'head', weapon: 'hand' }
  const after = (over: Partial<PoseInput>, dt = 0.12): Pose => at(IMPACT + dt, { strike: me, foe, ...over })

  it('a punch to the head snaps the head back and pushes the body back', () => {
    const hit = after({ incoming: { zone: 'head', blocked: false } })
    const ref = after({})
    expect(hit.head).toBeGreaterThan(ref.head + 0.5)
    expect(hit.x).toBeLessThan(ref.x)
    expect(hit.lean).toBeLessThan(ref.lean)
  })

  it('a punch to the body doubles the fighter over and bends the knees', () => {
    const hit = after({ incoming: { zone: 'body', blocked: false } })
    const ref = after({})
    expect(hit.lean).toBeGreaterThan(ref.lean + 0.3)
    expect(hit.legN.k).toBeLessThan(ref.legN.k)
  })

  it('a punch to the legs buckles them: the hip drops', () => {
    const hit = after({ incoming: { zone: 'legs', blocked: false } })
    const ref = after({})
    expect(hit.y).toBeLessThan(ref.y - 0.1)
  })

  it('each zone is reacted to differently', () => {
    const r = ZONES.map((zone) => after({ incoming: { zone, blocked: false } }))
    expect(new Set(r.map((p) => p.head.toFixed(2))).size).toBe(3)
  })

  it('a kick hurts more than a punch', () => {
    const punch = at(IMPACT + 0.1, { strike: me, foe: { zone: 'head', weapon: 'hand' }, incoming: { zone: 'head', blocked: false } })
    const kick = at(IMPACT + 0.1, { strike: me, foe: { zone: 'head', weapon: 'foot' }, incoming: { zone: 'head', blocked: false } })
    expect(kick.head).toBeGreaterThan(punch.head)
  })

  it('a guard puts the forearms up in front of the head', () => {
    const g = after({ incoming: { zone: 'head', blocked: true } }, 0.2)
    expect(g.armN.s).toBeGreaterThan(1.1)
    expect(g.armN.e).toBeGreaterThan(2)
    expect(g.head).toBeLessThan(0.2) // the head did not snap: the guard took it
  })

  it('a guarded strike to the legs brings the near knee up', () => {
    const g = at(IMPACT + 0.2, { strike: null, foe, incoming: { zone: 'legs', blocked: true } })
    expect(g.legN.h).toBeGreaterThan(0.6)
  })

  it('the struck zone flashes and the flash fades; nothing flashes when nothing hits', () => {
    const hit = { incoming: { zone: 'head' as const, blocked: false } }
    expect(after(hit, 0.01).flash).toBeGreaterThan(0.9)
    expect(after(hit, 0.6).flash).toBe(0)
    expect(after({}, 0.01).flash).toBe(0)
    expect(at(0.1, { strike: me, foe, ...hit }).flash).toBe(0) // not before the strike lands
  })

  it('a stumble throws the kicker back and off balance', () => {
    const kick: Strike = { zone: 'head', weapon: 'foot' }
    const calm = at(IMPACT + 0.4, { strike: kick, foe })
    const stumbling = at(IMPACT + 0.4, { strike: kick, foe, stumble: true })
    expect(stumbling.x).toBeLessThan(calm.x - 0.2)
  })

  it('a knocked-out fighter ends up lying on the floor, limp; a fighter that is still up does not', () => {
    const down = at(IMPACT + 2, { strike: me, foe, ko: true, incoming: { zone: 'head', blocked: false } })
    expect(down.fall).toBe(1)
    expect(down.armN.s).toBeLessThan(0.1)
    expect(at(IMPACT + 2, { strike: me, foe }).fall).toBe(0)
    expect(at(IMPACT - 0.1, { strike: me, foe, ko: true }).fall).toBe(0) // it falls only after the blow
  })

  it('the winner raises both fists', () => {
    const w = at(IMPACT + 2, { strike: me, foe, won: true })
    expect(w.armN.s).toBeGreaterThan(2.4)
    expect(w.armF.s).toBeGreaterThan(2.4)
  })
})
