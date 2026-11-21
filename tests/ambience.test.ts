import { describe, expect, it } from 'vitest'
import { lookOf, motes } from '../src/ui/ambience'

describe('ambience', () => {
  it('has a look for every arena, and one for an arena it does not know', () => {
    expect(lookOf('night').kind).toBe('firefly')
    expect(lookOf('sunset').kind).toBe('ember')
    expect(lookOf('fort').kind).toBe('dust')
    expect(lookOf('somewhere else').kind).toBe('dust')
  })

  it('makes the same lights every time', () => {
    expect(motes('dust', 12, 5)).toEqual(motes('dust', 12, 5))
    expect(motes('dust', 12, 5)).not.toEqual(motes('dust', 12, 6))
  })

  it('keeps the lights inside the picture, and the embers rising', () => {
    for (const kind of ['dust', 'firefly', 'ember'] as const) {
      for (const m of motes(kind, 40, 1)) {
        expect(m.x).toBeGreaterThanOrEqual(0)
        expect(m.x).toBeLessThanOrEqual(100)
        expect(m.y).toBeGreaterThanOrEqual(20)
        expect(m.delay).toBeLessThanOrEqual(0)
        expect(m.dur).toBeGreaterThan(0)
        if (kind === 'ember') expect(m.dy).toBeLessThan(-100)
      }
    }
  })
})
