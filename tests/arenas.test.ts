import { describe, expect, it } from 'vitest'
import { NO_ARENA, STAND_RANGE, nextArena, parseArenas, pickArena, type Arena } from '../src/state/arenas'

const arena = (id: string): Arena => ({ id, name: id, file: `${id}.webp`, thumb: `${id}-thumb.webp`, stand: 0 })
const LIST = [arena('fort'), arena('night'), arena('sunset')]

describe('pickArena', () => {
  it('finds the arena that was chosen', () => {
    expect(pickArena(LIST, 'night')?.id).toBe('night')
  })
  it('the first arena is the default: nothing chosen yet, or one that is gone', () => {
    expect(pickArena(LIST, '')?.id).toBe('fort')
    expect(pickArena(LIST, 'removed')?.id).toBe('fort')
  })
  it('"none" is the plain arena, whatever pictures there are', () => {
    expect(pickArena(LIST, NO_ARENA)).toBeNull()
  })
  it('without any pictures there is nothing to show', () => {
    expect(pickArena([], '')).toBeNull()
    expect(pickArena([], 'night')).toBeNull()
  })
})

describe('nextArena', () => {
  it('goes through every arena, then the plain one, then round again', () => {
    let id = 'fort'
    const seen: string[] = []
    for (let i = 0; i < 5; i++) seen.push((id = nextArena(LIST, id)))
    expect(seen).toEqual(['night', 'sunset', NO_ARENA, 'fort', 'night'])
  })
  it('starts from the default when nothing is chosen yet', () => {
    expect(nextArena(LIST, '')).toBe('night') // the first arena is in use, so the next is the second
  })
  it('stays on the plain arena when there are no pictures', () => {
    expect(nextArena([], '')).toBe(NO_ARENA)
  })
})

describe('parseArenas', () => {
  it('keeps the valid entries and drops the rest (the file is data from outside)', () => {
    const good = arena('a')
    expect(parseArenas([good, { id: 'x' }, null, 5, { ...good, file: 3 }])).toEqual([good])
  })

  it('reads where the fighters stand: a number, kept within bounds, 0 when it is missing or not a number', () => {
    const [a, b, c, d, e] = parseArenas([{ ...arena('a'), stand: 0.05 }, { ...arena('b'), stand: 9 }, { ...arena('c'), stand: -9 }, { ...arena('d'), stand: 'low' }, { ...arena('e'), stand: undefined }])
    expect(a!.stand).toBe(0.05)
    expect(b!.stand).toBeCloseTo(STAND_RANGE[1])
    expect(c!.stand).toBeCloseTo(STAND_RANGE[0])
    expect(d!.stand).toBe(0)
    expect(e!.stand).toBe(0)
  })
  it('is empty for anything that is not a list', () => {
    expect(parseArenas({})).toEqual([])
    expect(parseArenas('<!doctype html>')).toEqual([])
    expect(parseArenas(null)).toEqual([])
  })
})
