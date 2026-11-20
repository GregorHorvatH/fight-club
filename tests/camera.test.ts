import { describe, expect, it } from 'vitest'
import { FOV, isNarrow, viewFor } from '../src/ui/camera'
import { floorAbove } from '../src/ui/floor'

const tan = Math.tan((FOV * Math.PI) / 360)
/** Half the width of the frame at the fighters, for a camera at distance z in a window of this shape. */
const halfWidth = (z: number, aspect: number): number => z * tan * aspect
const BASE_X = 1.8

describe('the camera', () => {
  it('keeps the usual view in a wide window (nothing changes there)', () => {
    expect(viewFor(false, 0, 1.6).position).toEqual([0, 2.1, 8.6])
    expect(viewFor(true, 0, 1.6).position).toEqual([0, 3.2, 11.2])
    expect(isNarrow(true, viewFor(true, 0, 1.6))).toBe(false)
  })

  it('goes back in a tall window until both fighters are in the frame, with room to spare', () => {
    for (const aspect of [0.3, 0.4, 393 / 852, 0.56, 820 / 1180]) {
      for (const backdrop of [true, false]) {
        const v = viewFor(backdrop, 0, aspect)
        expect(halfWidth(v.position[2], aspect), `aspect ${aspect}`).toBeGreaterThanOrEqual(BASE_X + 0.6)
      }
    }
  })

  it('never comes closer than the usual view, however the window is shaped', () => {
    for (const aspect of [0.3, 0.46, 0.8, 1, 1.5, 2.4]) {
      expect(viewFor(true, 0, aspect).position[2]).toBeGreaterThanOrEqual(11.2 - 1e-9)
      expect(viewFor(false, 0, aspect).position[2]).toBeGreaterThanOrEqual(8.6 - 1e-9)
    }
  })

  it('in a tall window the feet stand low in the frame, above the buttons', () => {
    const v = viewFor(true, 0, 0.46)
    const visible = 2 * v.position[2] * tan
    const feet = 0.5 - v.look / visible // the floor, as a fraction of the height up from the bottom
    expect(feet).toBeGreaterThan(0.2)
    expect(feet).toBeLessThan(0.4)
  })

  it('"stand" moves the fighters down the frame in the usual view; in the narrow one the feet are where the page says', () => {
    expect(viewFor(true, 0.05, 1.6).look).toBeGreaterThan(viewFor(true, 0, 1.6).look)
    expect(viewFor(true, 0.05, 0.46).look).toBe(viewFor(true, 0, 0.46).look)
  })

  it('the feet stand where they are asked to: a fraction of the height up from the bottom', () => {
    for (const feetUp of [0.2, 0.3, 0.37]) {
      const v = viewFor(true, 0, 0.46, feetUp)
      const visible = 2 * v.position[2] * tan
      expect(0.5 - v.look / visible).toBeCloseTo(feetUp, 6)
    }
    expect(viewFor(true, 0, 0.46, 0.4).look).toBeLessThan(viewFor(true, 0, 0.46, 0.2).look) // higher feet: the camera looks lower
  })

  it('a silly request (the floor off the screen) is kept on the screen', () => {
    for (const feetUp of [-1, 0, 5]) {
      const v = viewFor(true, 0, 0.46, feetUp)
      const feet = 0.5 - v.look / (2 * v.position[2] * tan)
      expect(feet).toBeGreaterThanOrEqual(0.05 - 1e-9)
      expect(feet).toBeLessThanOrEqual(0.6 + 1e-9)
    }
  })

  it('a bigger fighter on a narrower window: the width is what limits the size', () => {
    const wide = viewFor(true, 0, 0.5).position[2]
    const narrower = viewFor(true, 0, 0.4).position[2]
    expect(narrower).toBeGreaterThan(wide)
  })
})

describe('the floor', () => {
  it('the gap over the Punch button equals the gap under the Kick button', () => {
    // the arena ends at y = 852; the buttons are at 704..834: 18 px from the bottom edge
    const floor = floorAbove(852, 704, 834)
    expect(floor).toBe(852 - 704 + 18) // the top of the stack, and one more gap above it
    const feetY = 852 - floor // where the fighters stand, down the screen
    expect(704 - feetY).toBe(852 - 834) // the gap over Punch = the gap under Kick
  })
  it('a taller stack or a bigger margin lifts the floor', () => {
    expect(floorAbove(800, 650, 780)).toBeGreaterThan(floorAbove(800, 700, 780))
    expect(floorAbove(800, 700, 770)).toBeGreaterThan(floorAbove(800, 700, 780))
  })
})
