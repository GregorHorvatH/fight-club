/**
 * The theme of the fight, written the same way as the theme of the menus (Web Audio, no files): dark industrial hip-hop, a chopped
 * breakbeat at 115 beats a minute with a hard kick and a cracking snare, a distorted bass that leans on the flat second and the
 * tritone of E, metallic hits, a restrained dissonant drone, all of it pushed through a gritty, crushed saturation. Eight bars that go
 * round: the first four are the groove, the second four add layers (the clangs, the ticks, the drone), and the last bar drops the bass
 * at its end, so that the loop falls back onto the first beat clean.
 */
import { clang, crushCurve, distBass } from './instruments'
import { hit, hz, note, type Bus } from './voices'

export { crushCurve }

export const FIGHT_BPM = 115
export const FIGHT_STEP_S = 60 / FIGHT_BPM / 4 // a sixteenth note
export const FIGHT_BARS = 8
export const FIGHT_STEPS = FIGHT_BARS * 16
export const FIGHT_LOOP_S = FIGHT_STEPS * FIGHT_STEP_S

type Mark = (hit: 'kick' | 'snare', at: number) => void

/** The bass of each kind of bar: [sixteenth, semitones above E2, length in sixteenths]. The flat second (1) and the tritone (6) are the dark notes. */
const BASS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 0, 2], [3, 0, 1], [6, 3, 2], [8, 0, 2], [11, 1, 1], [14, 0, 2]],
  [[0, 0, 2], [2, 0, 1], [5, 0, 1], [7, 6, 2], [10, 1, 2], [13, 0, 1], [15, 3, 1]],
  [[0, 0, 2], [3, 0, 1], [6, 3, 2], [8, 1, 2], [10, 0, 1], [12, 6, 2], [15, 0, 1]],
]
const E2 = 40
/** Which bass the bar has: the pattern goes A, B, A, C and again. */
const bassOf = (bar: number): number => [0, 1, 0, 2][bar % 4]!

/** The break, per kind of bar (bar % 4): kicks and ghost kicks [sixteenth, strength], snares and ghost snares. */
const KICKS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 1], [2, 0.45], [10, 1]],
  [[0, 1], [3, 0.8], [10, 1]],
  [[0, 1], [2, 0.5], [7, 0.6], [10, 1]],
  [[0, 1], [10, 1]],
]
const SNARES: readonly (readonly (readonly [number, number])[])[] = [
  [[4, 1], [7, 0.28], [9, 0.22], [12, 1], [15, 0.3]],
  [[4, 1], [6, 0.25], [11, 0.25], [12, 1], [14, 0.3]],
  [[4, 1], [7, 0.3], [9, 0.22], [12, 1], [15, 0.32]],
  [[4, 1], [7, 0.28], [12, 1], [13, 0.5], [14, 0.7], [15, 0.95]], // the fill
]

const kick = (c: BaseAudioContext, to: AudioNode, at: number, v: number): void => {
  hit(c, to, at, { type: 'lowpass', freq: 260, dur: 0.22, gain: 0.3 * v, tone: [175, 42, 1 * v] })
  hit(c, to, at, { type: 'highpass', freq: 3500, dur: 0.012, gain: 0.35 * v })
}
const snare = (c: BaseAudioContext, to: AudioNode, at: number, v: number): void => {
  hit(c, to, at, { type: 'bandpass', freq: 2300, dur: 0.15, gain: 0.95 * v, tone: [205, 130, 0.4 * v] })
  hit(c, to, at, { type: 'highpass', freq: 6000, dur: 0.06, gain: 0.7 * v })
}

/** Writes the sixteenth number `step` (counted from the start of the loop, any whole number) into the context, to sound at time `at`. */
export function scheduleFightStep(c: BaseAudioContext, bus: Bus, step: number, at: number, mark?: Mark): void {
  const s = step % FIGHT_STEPS
  const bar = Math.floor(s / 16)
  const i = s % 16
  const kind = bar % 4
  const layered = bar >= 4 // the second half: more is going on
  const last = bar === FIGHT_BARS - 1
  const t = at + (i % 2 === 1 ? FIGHT_STEP_S * 0.1 : 0) // a little swing: the odd sixteenths come late

  // drums: the chopped break
  for (const [k, v] of KICKS[kind]!) {
    if (k !== i) continue
    kick(c, bus.dry, t, v)
    if (v === 1) mark?.('kick', t)
  }
  for (const [k, v] of SNARES[kind]!) {
    if (k !== i) continue
    snare(c, bus.dry, t, v)
    if (v === 1) mark?.('snare', t)
  }
  // hats: eighths, the beats louder, a ghost sixteenth now and then; the open one before the next bar
  if (i % 2 === 0) hit(c, bus.dry, t, { type: 'highpass', freq: 7500, dur: i === 14 && layered ? 0.12 : 0.035, gain: i % 4 === 0 ? 0.16 : 0.1 })
  else if (i === 3 || i === 11) hit(c, bus.dry, t, { type: 'highpass', freq: 8000, dur: 0.025, gain: 0.05 })

  // the bass (it drops out for the last two sixteenths of the loop: it falls back onto the first beat clean)
  for (const [k, semis, len] of BASS[bassOf(bar)]!) {
    if (k !== i || (last && k >= 14)) continue
    distBass(c, bus.dry, E2 + semis, t, len * FIGHT_STEP_S * 0.9, 0.2)
  }

  if (layered) {
    // metal: a clang on the off-beats, answered by a higher one, through the echo
    if (i === 6 || i === 14) {
      clang(c, bus.dry, t, i === 6 ? 410 : 530, 0.07)
      clang(c, bus.echo, t, i === 6 ? 410 : 530, 0.06)
    }
    // the ticks of a machine: short grains of band-passed noise between the beats
    if (i % 4 === 1 || i % 4 === 3) hit(c, bus.dry, t, { type: 'bandpass', freq: 4600, dur: 0.02, gain: 0.09 })
  }
  // an ugly stab (the root, the flat second and the tritone together) that ends every second half-phrase
  if (kind === 3 && i === 10) {
    for (const m of [64, 65, 70]) note(c, bus.dry, { type: 'square', freq: hz(m), at: t, dur: FIGHT_STEP_S * 1.6, gain: 0.04, cutoff: 2600, from: 6000, release: 0.05 })
    hit(c, bus.dry, t, { type: 'bandpass', freq: 3000, dur: 0.1, gain: 0.12 })
  }
  // the drone: two saws a semitone apart, grinding, a bar or two at a time (only in the second half, and quietly)
  if (layered && i === 0 && bar % 2 === 0) {
    for (const m of [52, 53]) note(c, bus.dry, { type: 'sawtooth', freq: hz(m), at: t, dur: 32 * FIGHT_STEP_S, gain: 0.016, cutoff: 650, attack: 0.5, release: 0.5, detune: m === 53 ? 8 : -8 })
  }
}

/** The graph the fight's music plays through: a short dub echo for the metal, a hard compressor, and the saturation: the whole thing pushed through a clip, part of it crushed to a few levels, beside the clean signal. */
export function makeFightBus(c: BaseAudioContext, master: AudioNode): Bus {
  const dry = c.createGain()
  const echo = c.createGain()
  const delay = c.createDelay(1)
  const feedback = c.createGain()
  const dark = c.createBiquadFilter()
  const wet = c.createGain()
  const comp = c.createDynamicsCompressor()
  const mix = c.createGain()
  const clip = c.createWaveShaper()
  const clipGain = c.createGain()
  const crush = c.createWaveShaper()
  const crushHigh = c.createBiquadFilter()
  const crushGain = c.createGain()
  const lo = c.createBiquadFilter()
  delay.delayTime.value = FIGHT_STEP_S * 3
  feedback.gain.value = 0.32
  dark.type = 'lowpass'
  dark.frequency.value = 2400
  wet.gain.value = 0.7
  comp.threshold.value = -14
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.14
  clip.curve = crushCurve(1.8)
  clipGain.gain.value = 0.8
  crush.curve = crushCurve(3, 22)
  crushHigh.type = 'highpass'
  crushHigh.frequency.value = 350
  crushGain.gain.value = 0.2
  lo.type = 'lowpass' // (a little lo-fi: nothing above this)
  lo.frequency.value = 11000
  echo.connect(delay)
  delay.connect(dark).connect(feedback).connect(delay)
  dark.connect(wet).connect(comp)
  dry.connect(comp)
  comp.connect(mix)
  mix.connect(clip).connect(clipGain).connect(lo)
  mix.connect(crush).connect(crushHigh).connect(crushGain).connect(lo)
  lo.connect(master)
  return { dry, echo }
}
