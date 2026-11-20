import { describe, expect, it } from 'vitest'
import { BEAT, IMPACT, LEAD, timelineOf } from '../src/timing'
import { MAX_HP, createMatch, resolveRound, type Move, type Weapon, type Zone } from '../src/sim'

const mv = (attack: Zone, block: Zone, weapon: Weapon = 'hand'): Move => ({ attack, weapon, block })
const dice = (...n: number[]) => () => n.shift() ?? 0.5

describe('the timeline of a round', () => {
  it('two strikes follow each other: the faster one first, each connecting IMPACT seconds after it begins', () => {
    const { result } = resolveRound(createMatch('easy'), { player: mv('head', 'body', 'foot'), enemy: mv('legs', 'legs') }, dice(0.5, 0.99, 0.5, 0.99))
    const t = timelineOf(result)
    expect(t.order).toEqual(['enemy', 'player']) // the punch first
    expect(t.strikeAt.enemy).toBeCloseTo(LEAD)
    expect(t.hitAt.enemy).toBeCloseTo(LEAD + IMPACT)
    expect(t.strikeAt.player).toBeCloseTo(BEAT + LEAD)
    expect(t.hitAt.player).toBeCloseTo(BEAT + LEAD + IMPACT)
    expect(t.duration).toBeCloseTo(2 * BEAT)
    expect(t.endAt).toBeNull()
  })

  it('a knockout by the first strike leaves one beat only, and says when it happened', () => {
    const m = { ...createMatch('easy'), hp: { player: MAX_HP, enemy: 4 } }
    const { result } = resolveRound(m, { player: mv('legs', 'body'), enemy: mv('head', 'head', 'foot') }, dice(0.5, 0.99))
    const t = timelineOf(result)
    expect(t.order).toEqual(['player'])
    expect(t.strikeAt.enemy).toBeNull()
    expect(t.hitAt.enemy).toBeNull()
    expect(t.duration).toBeCloseTo(BEAT)
    expect(t.endAt).toBeCloseTo(LEAD + IMPACT) // the moment the blow lands
  })

  it('the second strike never begins before the first one has landed and been seen', () => {
    const { result } = resolveRound(createMatch('easy'), { player: mv('head', 'body'), enemy: mv('legs', 'legs') }, dice(0.1, 0.5, 0.99, 0.5, 0.99))
    const t = timelineOf(result)
    const [a, b] = t.order
    expect(t.strikeAt[b!]!).toBeGreaterThan(t.hitAt[a!]! + 0.8)
  })
})
