import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IMPACT } from '../src/timing'

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

  it('a punch that lands is a "hit"', () => {
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.runAllTimers()
    expect(impacts()).toEqual(['hit'])
  })

  it('a kick that lands has its own sound, not the punch sound', () => {
    // player 1 kicks the head, player 2 guards the body: the kick lands (player 2 punches the body, player 1 guards the legs: lands too)
    round({ attack: 'head', weapon: 'foot', block: 'legs' }, { attack: 'body', block: 'body' })
    vi.runAllTimers()
    expect(impacts()).toEqual(['kick'])
  })

  it('a guarded kick is heard as a swing, then the guard, then the stumble', () => {
    // player 1 kicks the head and player 2 guards it; player 2 punches the body and player 1 guards it: nothing lands
    round({ attack: 'head', weapon: 'foot', block: 'body' }, { attack: 'body', block: 'head' })
    vi.advanceTimersByTime(IMPACT * 1000 - 100)
    expect(impacts()).toEqual(['whoosh']) // the swing comes first ...
    vi.runAllTimers()
    expect(impacts()).toEqual(['whoosh', 'block', 'stumble']) // ... then the guard and the stumble
  })

  it('the sounds are timed to the animation: nothing is heard before the strikes are on their way, the blow lands on the impact', () => {
    round({ attack: 'head', weapon: 'hand', block: 'legs' }, { attack: 'body', block: 'body' })
    expect(impacts()).toEqual([]) // not at the start of the replay
    vi.advanceTimersByTime(IMPACT * 1000 - 1)
    expect(impacts()).toEqual([])
    vi.advanceTimersByTime(2)
    expect(impacts()).toEqual(['hit']) // exactly when the fist arrives
  })

  it('a guarded punch stays quiet except for the guard', () => {
    round({ attack: 'head', weapon: 'hand', block: 'body' }, { attack: 'body', block: 'head' })
    vi.runAllTimers()
    expect(impacts()).toEqual(['block'])
  })
})
