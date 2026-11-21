import { play } from '../audio/synth'
import type { Side } from '../sim'
import { clamp01, ENTER_S, EXIT_S, smooth, STEPS_PER_S, TURN_S } from './pose'

/**
 * The sound of the walk (pose.ts `walkPose`): a foot comes down each time a leg is at the front of the stride. The fighter is heard
 * louder the nearer it is to its place on the arena (`off` is how far it still is from there, 1 = beyond the frame, 0 = arrived), and
 * the steps stop when the stride dies down next to the place.
 */

/** When the k-th foot comes down, in seconds from the start of the walk. */
const footfall = (k: number): number => (0.5 * k + 0.25) / STEPS_PER_S

/** How far the fighter still is from its place at the time `t` of an entrance ('walk') or an exit ('leave'). */
export function offAt(t: number, entrance: 'walk' | 'leave'): number {
  if (entrance === 'walk') return (1 - clamp01(t / ENTER_S)) ** 2
  const u = clamp01((t - TURN_S * 0.8) / (EXIT_S - TURN_S * 0.8))
  return u ** 1.5
}

/** The loudness (0..1) of a step taken at `t`, or 0 when there is none to hear (next to its place the stride is gone; far away it is faint). */
export function stepGain(t: number, entrance: 'walk' | 'leave'): number {
  const off = offAt(t, entrance)
  const stride = 1 - smooth(clamp01(1 - off / 0.12))
  return (1 - off) ** 0.6 * stride
}

/** The loudness of each foot that comes down after `from` and up to `to` seconds into the walk (nothing for any other kind of scene). */
export function stepsBetween(from: number, to: number, entrance: 'walk' | 'wait' | 'leave' | undefined): number[] {
  if (entrance !== 'walk' && entrance !== 'leave') return []
  const end = entrance === 'walk' ? Math.min(to, ENTER_S) : Math.min(to, EXIT_S)
  const steps: number[] = []
  for (let k = Math.max(0, Math.floor(from * STEPS_PER_S * 2 - 0.5)); footfall(k) <= end; k++) {
    const at = footfall(k)
    if (at <= from) continue
    const gain = stepGain(at, entrance)
    if (gain > 0.02) steps.push(gain)
  }
  return steps
}

/** Plays the steps of the last frame: each fighter from its own side (the one on the left is heard on the left). */
export function stepSounds(side: Side, from: number, to: number, entrance: 'walk' | 'wait' | 'leave' | undefined): void {
  for (const g of stepsBetween(from, to, entrance)) play('step', { gain: 0.5 * g, pan: side === 'player' ? -0.6 : 0.6 })
}
