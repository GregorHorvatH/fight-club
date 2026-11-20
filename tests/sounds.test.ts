import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BEAT, IMPACT, LEAD } from '../src/timing'

const played: string[] = []
vi.mock('../src/audio/synth', () => ({ play: (s: string) => void played.push(s) }))

// imported after the mock is registered
const { useGame, setRandomSource } = await import('../src/state/game')
const { useSettings } = await import('../src/state/settings')

/** Two players, one after the other: player 1 picks (zone, weapon, guard) and locks in, then player 2 picks (zone, guard) and fights. */
function round(p1: { attack: 'head' | 'body' | 'legs'; weapon: 'hand' | 'foot'; block: 'head' | 'body' | 'legs' }, p2: { attack: 'head' | 'body' | 'legs'; block: 'head' | 'body' | 'legs' }) {
  const g = useGame.getState()
  g.pickAttack('player', p1.attack, p1.weapon)
  g.pickBlock('player', p1.block)
  g.lock('player')
  g.pickAttack('enemy', p2.attack, 'hand')
  g.pickBlock('enemy', p2.block)
  g.lock('enemy')
}

describe('strike sounds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setRandomSource(() => 0.5) // an ordinary hit: no critical
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    played.length = 0 // forget the "select" clicks of the picks too
  })
  afterEach(() => vi.useRealTimers())

  const impacts = () => played.filter((s) => s !== 'select')
  const ms = (s: number) => Math.round(s * 1000)
  /** the times, in ms, at which the blows of the replay connect: the first, then the second */
  const FIRST = ms(LEAD + IMPACT)
  const SECOND = ms(BEAT + LEAD + IMPACT)

  it('a punch that lands is a "hit", at the moment it lands', () => {
    // both punch and nothing is guarded: two blows land
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    expect(impacts()).toEqual([]) // nothing at the start of the replay
    vi.advanceTimersByTime(FIRST - 1)
    expect(impacts()).toEqual([])
    vi.advanceTimersByTime(2)
    expect(impacts()).toEqual(['hit'])
  })

  it('the second blow sounds a whole beat after the first one, when it lands', () => {
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.advanceTimersByTime(SECOND - 1)
    expect(impacts()).toEqual(['hit']) // only the first so far
    vi.advanceTimersByTime(2)
    expect(impacts()).toEqual(['hit', 'hit'])
  })

  it('a kick that lands has its own sound, not the punch sound', () => {
    // player 1 kicks the head, player 2 punches the body: the punch is faster, so it goes first; the kick lands second
    round({ attack: 'head', weapon: 'foot', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.advanceTimersByTime(SECOND + 10)
    expect(impacts()).toEqual(['hit', 'kick'])
  })

  it('a guarded kick is heard as a swing, then the guard, then the stumble', () => {
    // player 1 kicks the head, player 2 guards it; player 2 punches the legs and player 1 guards them: nothing lands
    round({ attack: 'head', weapon: 'foot', block: 'legs' }, { attack: 'legs', block: 'head' })
    vi.advanceTimersByTime(FIRST + 60)
    expect(impacts()).toEqual(['block']) // the punch comes first and is guarded
    vi.runAllTimers()
    expect(impacts()).toEqual(['block', 'whoosh', 'block', 'stumble']) // then the swing of the kick, the guard, the stumble
  })

  it('a guarded punch stays quiet except for the guard', () => {
    round({ attack: 'head', weapon: 'hand', block: 'body' }, { attack: 'body', block: 'head' })
    vi.runAllTimers()
    expect(impacts()).toEqual(['block', 'block'])
  })

  it('a knockout by the first blow leaves one sound: the strike that never happens makes none', () => {
    // both punch, so the more wounded fighter (the player) is first, and his blow knocks the enemy out
    useGame.setState({ match: { ...useGame.getState().match, hp: { player: 2, enemy: 3 } } })
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.runAllTimers()
    expect(impacts()).toEqual(['hit']) // the enemy, already beaten, does not strike
  })

  it('skipping the replay silences the sounds that were still to come', () => {
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.advanceTimersByTime(FIRST + 10)
    useGame.getState().next()
    vi.runAllTimers()
    expect(impacts()).toEqual(['hit']) // only the first one was heard
  })
})
