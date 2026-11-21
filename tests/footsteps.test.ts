import { describe, expect, it } from 'vitest'
import { stepGain, stepsBetween } from '../src/ui/footsteps'
import { ENTER_S, EXIT_S } from '../src/ui/pose'

describe('footsteps', () => {
  it('has no steps while a fighter stands, waits off the frame or fights', () => {
    expect(stepsBetween(0, 5, undefined)).toEqual([])
    expect(stepsBetween(0, 5, 'wait')).toEqual([])
  })

  it('has a step about every fifth of a second while it walks in, louder as it gets near and gone when it has arrived', () => {
    const steps = stepsBetween(0, ENTER_S + 1, 'walk')
    expect(steps.length).toBeGreaterThan(5)
    expect(steps.length).toBeLessThanOrEqual(Math.ceil(ENTER_S * 5))
    expect(steps[Math.floor(steps.length / 2)]!).toBeGreaterThan(steps[0]!)
    expect(stepsBetween(ENTER_S, ENTER_S + 2, 'walk')).toEqual([])
  })

  it('counts every foot once, however the time is cut into frames', () => {
    const whole = stepsBetween(0, ENTER_S, 'walk')
    let parts: number[] = []
    for (let t = 0; t < ENTER_S; t += 1 / 60) parts = parts.concat(stepsBetween(t, Math.min(t + 1 / 60, ENTER_S), 'walk'))
    expect(parts).toEqual(whole)
  })

  it('is silent while it turns round before walking out, then fades as it goes', () => {
    expect(stepsBetween(0, 0.35, 'leave')).toEqual([])
    const steps = stepsBetween(0, EXIT_S + 2, 'leave')
    expect(steps.length).toBeGreaterThan(2)
    expect(stepGain(1.0, 'leave')).toBeGreaterThan(stepGain(2.0, 'leave'))
    expect(stepGain(EXIT_S, 'leave')).toBe(0)
  })
})
