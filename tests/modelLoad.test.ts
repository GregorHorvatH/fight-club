import { describe, expect, it } from 'vitest'
import { percentOf } from '../src/state/modelLoad'

describe('percentOf', () => {
  it('adds up the models that are being downloaded', () => {
    expect(percentOf(['a', 'b'], { a: { loaded: 50, total: 100 }, b: { loaded: 150, total: 300 } })).toBe(50)
  })
  it('is unknown when a server does not say the size, or nothing has arrived yet', () => {
    expect(percentOf(['a'], { a: { loaded: 50, total: 0 } })).toBeNull()
    expect(percentOf(['a'], {})).toBeNull()
  })
  it('never says 100 before the model is there', () => {
    expect(percentOf(['a'], { a: { loaded: 100, total: 100 } })).toBe(99)
  })
})
