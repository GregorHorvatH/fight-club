import { describe, expect, it } from 'vitest'
import { BPM, chordAt, LOOP_S, LOOP_STEPS, pulseAt, STEP_S } from '../src/audio/music'
import { isCalm, waveFrom } from '../src/ui/ambience'

describe('menu theme', () => {
  it('is sixteen bars at the tempo, and goes round', () => {
    expect(LOOP_STEPS).toBe(256)
    expect(STEP_S).toBeCloseTo(60 / BPM / 4, 10)
    expect(LOOP_S).toBeCloseTo(256 * STEP_S, 10)
    expect(chordAt(0)).toBe(chordAt(8))
    expect(chordAt(7).bass).toBe(40) // the E before it goes round
  })

  it('plays while no fight is going on, and not in one', () => {
    for (const p of ['menu', 'about', 'options', 'setup', 'select', 'ladder']) expect(isCalm(p)).toBe(true)
    for (const p of ['choose', 'reveal', 'over', 'leave']) expect(isCalm(p)).toBe(false)
  })
})

describe('what the picture sees of the music', () => {
  const hits = [{ at: 1, kind: 'kick' }, { at: 1.5, kind: 'snare' }, { at: 2, kind: 'kick' }]
  it('swells on the hit and dies away', () => {
    expect(pulseAt(hits, 'kick', 2, 0.16)).toBeCloseTo(1, 5)
    expect(pulseAt(hits, 'kick', 2.16, 0.16)).toBeCloseTo(Math.exp(-1), 5)
    expect(pulseAt(hits, 'kick', 2.5, 0.16)).toBeLessThan(0.05)
  })
  it('does not swell before a hit (the hits are written a little ahead) or when there is none', () => {
    expect(pulseAt(hits, 'snare', 1.2, 0.12)).toBe(0)
    expect(pulseAt([], 'kick', 3, 0.16)).toBe(0)
  })
  it('follows the latest hit of its own kind', () => {
    expect(pulseAt(hits, 'kick', 1.1, 0.16)).toBeCloseTo(Math.exp(-0.1 / 0.16), 5)
  })
})

describe('the wave', () => {
  const bins = (fill: (i: number) => number): Uint8Array => Uint8Array.from({ length: 512 }, (_, i) => fill(i))

  it('has the points asked for, within the ceiling, and is flat for silence', () => {
    const w = waveFrom(bins((i) => (i < 20 ? 255 : 0)), 20, 0.9)
    expect(w).toHaveLength(20)
    expect(Math.max(...w)).toBeLessThanOrEqual(0.9)
    expect(waveFrom(bins(() => 0), 20).every((v) => v === 0)).toBe(true)
  })

  it('puts the bass on the left and the highs on the right', () => {
    const bass = waveFrom(bins((i) => (i >= 1 && i <= 3 ? 255 : 0)), 40)
    const highs = waveFrom(bins((i) => (i >= 120 ? 255 : 0)), 40)
    expect(bass.indexOf(Math.max(...bass))).toBeLessThan(10)
    expect(highs.indexOf(Math.max(...highs))).toBeGreaterThan(25)
  })

  it('does not flatten the left side at the ceiling: a louder bass is a higher point, up to the very loudest', () => {
    const at = (v: number): number => waveFrom(bins((i) => (i >= 1 && i <= 8 ? v : 0)), 40, 1)[3]!
    expect(at(150)).toBeLessThan(at(200))
    expect(at(200)).toBeLessThan(at(240))
    expect(at(240)).toBeLessThanOrEqual(1)
    expect(at(231)).toBeLessThan(0.97) // (what this music has in its lows, typically)
  })
})
