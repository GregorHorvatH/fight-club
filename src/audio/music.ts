/**
 * The music of the game: the theme of the menus (below) and the theme of the fight (fightTheme.ts), played live like every other sound
 * in the game (Web Audio, no files). The theme of the menus: A minor, 108 beats a minute,
 * sixteen bars that go round: a drum beat that builds, a bass on the roots, a plucked arpeggio through an echo, a slow pad, and, in the
 * second half, a lead that sings the tune. `scheduleStep` writes one sixteenth into any audio context, so the same music can be
 * rendered to a file (scripts/render-menu-theme.mjs) or played live by the scheduler below.
 */
import { audioContext, onSound, type Sound } from './synth'
import { makeStyleBus, scheduleStyled, stepsOf } from './composer'
import { FIGHT_BPM, FIGHT_STEP_S, FIGHT_STEPS, makeFightBus, scheduleFightStep } from './fightTheme'
import { STYLES } from './styles'
import { FIGHTERS, type FighterId } from '../state/roster'
import { hit, hz, note, type Bus, type Voice } from './voices'
import { useSettings } from '../state/settings'

export const BPM = 108
export const STEP_S = 60 / BPM / 4 // a sixteenth note
const BARS = 16
export const LOOP_STEPS = BARS * 16
export const LOOP_S = LOOP_STEPS * STEP_S



/** The chord of each bar: the root for the bass, and the three notes the pad and the arpeggio use. */
interface Chord {
  bass: number
  tones: readonly [number, number, number]
}
const Am: Chord = { bass: 45, tones: [57, 60, 64] }
const F: Chord = { bass: 41, tones: [53, 57, 60] }
const G: Chord = { bass: 43, tones: [55, 59, 62] }
const E: Chord = { bass: 40, tones: [52, 56, 59] }
const PROGRESSION: readonly Chord[] = [Am, Am, F, G, Am, Am, F, E]
export const chordAt = (bar: number): Chord => PROGRESSION[bar % PROGRESSION.length]!

/** The tune of the second half: [step in the bar, note, length in sixteenths], two phrases of four bars. */
const TUNE: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
  [[0, 72, 6], [6, 74, 2], [8, 76, 8]],
  [[0, 77, 6], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
  [[0, 74, 6], [6, 72, 2], [8, 71, 8]],
  [[0, 76, 4], [4, 79, 4], [8, 81, 6], [14, 79, 2]],
  [[0, 76, 6], [6, 74, 2], [8, 72, 8]],
  [[0, 77, 4], [4, 76, 4], [8, 74, 4], [12, 72, 4]],
  [[0, 71, 4], [4, 68, 4], [8, 71, 4], [12, 76, 4]],
]
const ARP = [0, 1, 2, 3, 2, 1, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1] // which of the chord's notes (the 4th is the octave, the 5th the third above it)

/** Writes the sixteenth number `step` (counted from the start of the loop, any whole number) into the context, to sound at time `at`. */
export function scheduleStep(c: BaseAudioContext, bus: Bus, step: number, at: number, mark?: (hit: 'kick' | 'snare', at: number) => void): void {
  const s = step % LOOP_STEPS
  const bar = Math.floor(s / 16)
  const i = s % 16
  const chord = chordAt(bar)
  const intro = bar < 2 // the first two bars: only the kick and the hats, then the whole beat comes in

  // drums
  if (i === 0 || i === 8 || (!intro && i === 10) || (bar % 4 === 3 && i === 14)) {
    hit(c, bus.dry, at, { type: 'lowpass', freq: 220, dur: 0.22, gain: 0.35, tone: [150, 42, 0.95] })
    mark?.('kick', at)
  }
  if (!intro && (i === 4 || i === 12)) {
    hit(c, bus.dry, at, { type: 'bandpass', freq: 1900, dur: 0.16, gain: 0.5, tone: [210, 120, 0.3] })
    mark?.('snare', at)
  }
  if (i % 2 === 0) hit(c, bus.dry, at, { type: 'highpass', freq: 7500, dur: i % 4 === 2 ? 0.09 : 0.035, gain: i % 4 === 2 ? 0.1 : 0.06 })
  if (bar % 4 === 3 && i >= 12 && !intro) hit(c, bus.dry, at, { type: 'highpass', freq: 6500, dur: 0.04, gain: 0.07 }) // a roll into the next four bars

  // bass: eighths on the root, an octave jump now and then
  if (i % 2 === 0) {
    const up = i === 6 || i === 14
    note(c, bus.dry, { type: 'sawtooth', freq: hz(chord.bass + (up ? 12 : 0)), at, dur: STEP_S * 1.7, gain: 0.2, cutoff: 520, from: 1400, release: 0.05 })
    note(c, bus.dry, { type: 'sine', freq: hz(chord.bass - 12 + (up ? 12 : 0)), at, dur: STEP_S * 1.7, gain: 0.16, release: 0.05 })
  }

  // arpeggio: plucked sixteenths through the echo
  {
    const k = ARP[i]!
    const midi = k < 3 ? chord.tones[k]! + 12 : k === 3 ? chord.tones[0] + 24 : chord.tones[1] + 24
    const loud = (i % 4 === 0 ? 0.075 : 0.05) * (intro ? 0.55 : 1)
    const n: Voice = { type: 'square', freq: hz(midi), at, dur: STEP_S * 0.9, gain: loud, cutoff: 1500, from: 5200, release: 0.04 }
    note(c, bus.dry, n)
    note(c, bus.echo, { ...n, gain: n.gain * 0.8 })
  }

  // pad: three slightly different saws, a chord a bar
  if (i === 0) {
    for (const t of chord.tones) {
      for (const d of [-7, 7]) note(c, bus.dry, { type: 'sawtooth', freq: hz(t), at, dur: 16 * STEP_S, gain: 0.028, cutoff: 900, detune: d, attack: 0.5, release: 0.6 })
    }
  }

  // lead: the tune, in the second half
  if (bar >= 8) {
    for (const [from, midi, len] of TUNE[bar - 8]!) {
      if (from !== i) continue
      const n: Voice = { type: 'triangle', freq: hz(midi), at, dur: len * STEP_S * 0.92, gain: 0.16, cutoff: 3200, attack: 0.02, release: 0.14, vibrato: len >= 6 ? 14 : 0 }
      note(c, bus.dry, n)
      note(c, bus.echo, { ...n, gain: n.gain * 0.45 })
      note(c, bus.dry, { type: 'sawtooth', freq: hz(midi), at, dur: n.dur, gain: 0.025, cutoff: 1800, attack: 0.02, release: 0.14 })
    }
  }
}

/** The graph the music plays through: the parts, an echo (a dotted eighth, three sixteenths, with feedback), a compressor to keep it level, a master volume. */
export function makeBus(c: BaseAudioContext, master: AudioNode): Bus {
  const dry = c.createGain()
  const echo = c.createGain()
  const delay = c.createDelay(1)
  const feedback = c.createGain()
  const wet = c.createGain()
  const comp = c.createDynamicsCompressor()
  delay.delayTime.value = STEP_S * 3
  feedback.gain.value = 0.38
  wet.gain.value = 0.55
  comp.threshold.value = -16
  comp.ratio.value = 3
  comp.attack.value = 0.006
  comp.release.value = 0.2
  echo.connect(delay)
  delay.connect(feedback).connect(delay)
  delay.connect(wet).connect(comp)
  dry.connect(comp)
  comp.connect(master)
  return { dry, echo }
}

// ---- the themes, and playing them ----

/** A theme: how it is written into an audio context, and the graph it plays through. */
/** The music of the menus, or the soundtrack of a fighter. */
export type TrackId = 'menu' | FighterId

export interface Track {
  id: TrackId
  bpm: number
  /** a sixteenth note, in seconds */
  stepS: number
  /** the length of the loop in sixteenths */
  steps: number
  /** how loud it plays (the sound effects are heard over it) */
  volume: number
  schedule: (c: BaseAudioContext, bus: Bus, step: number, at: number, mark?: (hit: 'kick' | 'snare', at: number) => void) => void
  makeBus: (c: BaseAudioContext, master: AudioNode) => Bus
}

/** The soundtrack that is mixed to the loudness of the first one (James's); a style's own `level` trims it. */
const FIGHT_VOLUME = 0.2

const styled = (id: Exclude<FighterId, 'james'>): Track => {
  const style = STYLES[id]
  return {
    id,
    bpm: style.bpm,
    stepS: 60 / style.bpm / 4,
    steps: stepsOf(style),
    volume: FIGHT_VOLUME * (style.level ?? 1),
    schedule: (c, bus, step, at, mark) => scheduleStyled(style, c, bus, step, at, mark),
    makeBus: (c, master) => makeStyleBus(style, c, master),
  }
}

export const TRACKS = {
  menu: { id: 'menu', bpm: BPM, stepS: STEP_S, steps: LOOP_STEPS, volume: 0.5, schedule: scheduleStep, makeBus },
  james: { id: 'james', bpm: FIGHT_BPM, stepS: FIGHT_STEP_S, steps: FIGHT_STEPS, volume: FIGHT_VOLUME, schedule: scheduleFightStep, makeBus: makeFightBus },
  ...Object.fromEntries(FIGHTERS.filter((f) => f.id !== 'james').map((f) => [f.id, styled(f.id as Exclude<FighterId, 'james'>)])),
} as Record<TrackId, Track>

const FADE_IN_S = 1.6
const FADE_OUT_S = 0.9
const LOOKAHEAD_S = 0.25
/** While the fight is paused the music goes quiet (not off): this much of its volume. */
const DUCKED = 0.3

interface Playing {
  track: Track
  c: AudioContext
  master: GainNode
  /** between the music and the master: it dips for a moment at every blow, so that the blow is heard */
  side: GainNode
  analyser: AnalyserNode
  /** the drum hits written so far (audio-clock time and kind), newest last: the picture moves to them */
  hits: { at: number; kind: 'kick' | 'snare' }[]
  bus: Bus
  timer: ReturnType<typeof setInterval>
  next: number
  step: number
}
let playing: Playing | null = null
let wanted: TrackId | null = null
let ducked = false

const levelOf = (t: Track): number => t.volume * (ducked ? DUCKED : 1)

function start(): void {
  if (playing || !wanted) return
  const track = TRACKS[wanted]
  const c = audioContext()
  if (!c) return
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, c.currentTime)
  master.gain.exponentialRampToValueAtTime(levelOf(track), c.currentTime + FADE_IN_S)
  master.connect(c.destination)
  const side = c.createGain()
  side.connect(master)
  const analyser = c.createAnalyser()
  analyser.fftSize = SPECTRUM_BINS * 2
  analyser.smoothingTimeConstant = 0.72
  master.connect(analyser) // (listens only: the picture draws what it hears)
  const p: Playing = { track, c, master, side, analyser, hits: [], bus: track.makeBus(c, side), timer: 0 as unknown as ReturnType<typeof setInterval>, next: c.currentTime + 0.08, step: 0 }
  p.timer = setInterval(() => tick(p), 40)
  playing = p
  // a browser keeps the sound off until the player does something (a tap, a key): the music starts as soon as they do
  if (c.state !== 'running') {
    const go = (): void => void c.resume()
    for (const e of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(e, go, { once: true })
  }
}

function tick(p: Playing): void {
  const now = p.c.currentTime
  const { stepS } = p.track
  if (p.next < now) {
    // the page was in the background (the timer slows down there): carry on from here instead of playing what was missed all at once
    const missed = Math.floor((now - p.next) / stepS)
    p.step += missed
    p.next += missed * stepS
  }
  while (p.next < now + LOOKAHEAD_S) {
    p.track.schedule(p.c, p.bus, p.step, p.next, (kind, at) => p.hits.push({ at, kind }))
    p.next += stepS
    p.step += 1
  }
}

function stop(): void {
  const p = playing
  if (!p) return
  playing = null
  clearInterval(p.timer)
  const now = p.c.currentTime
  p.master.gain.cancelScheduledValues(now)
  p.master.gain.setValueAtTime(Math.max(p.master.gain.value, 0.0001), now)
  p.master.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT_S)
  setTimeout(() => p.master.disconnect(), (FADE_OUT_S + 2) * 1000) // (the notes already written are let go with the echo's tail)
}

/**
 * Asks for a theme to be playing (or none): it fades in and out, one theme fades into the other, and it is silent while the sound is
 * muted or the music is switched off.
 */
export function setMusic(id: TrackId | null): void {
  wanted = id
  if (playing && playing.track.id !== id) stop()
  if (id && audible()) start()
  else stop()
}

/**
 * How the fight's music gives way to a blow (like a side-chained compressor): at the sound it drops to `dip` of its volume in a few
 * milliseconds, stays there for `hold` seconds, and comes back over `release`. `delay` is for a sound whose thud comes after a swing.
 */
export interface Dip {
  dip: number
  delay: number
  hold: number
  release: number
}
export const IMPACTS: Partial<Record<Sound, Dip>> = {
  hit: { dip: 0.3, delay: 0, hold: 0.1, release: 0.18 },
  kick: { dip: 0.25, delay: 0.08, hold: 0.12, release: 0.22 },
  crit: { dip: 0.2, delay: 0, hold: 0.14, release: 0.25 },
  super: { dip: 0.15, delay: 0.02, hold: 0.3, release: 0.4 },
  block: { dip: 0.45, delay: 0, hold: 0.06, release: 0.15 },
  stumble: { dip: 0.5, delay: 0, hold: 0.08, release: 0.2 },
}

function duckForBlow(sound: Sound): void {
  const p = playing
  const d = IMPACTS[sound]
  if (!p || !d || p.track.id === 'menu') return
  const g = p.side.gain
  const t = p.c.currentTime + d.delay
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  g.linearRampToValueAtTime(d.dip, t + 0.012)
  g.setTargetAtTime(1, t + 0.012 + d.hold, d.release / 3)
}
onSound(duckForBlow)

/** How far the music is turned down for a blow just now: 1 = not at all (for checking). */
export const dipLevel = (): number => playing?.side.gain.value ?? 1

/** Which theme is sounding now (null: none, or it is fading out). */
export const currentTrack = (): TrackId | null => playing?.track.id ?? null

/** Pauses the fight's music by turning it down (and back up): it does not stop. */
export function setMusicDuck(on: boolean): void {
  ducked = on
  const p = playing
  if (!p) return
  const now = p.c.currentTime
  p.master.gain.cancelScheduledValues(now)
  p.master.gain.setValueAtTime(Math.max(p.master.gain.value, 0.0001), now)
  p.master.gain.exponentialRampToValueAtTime(levelOf(p.track), now + 0.25)
}

/** The music may play: nothing is muted and the music is not switched off in the options. */
const audible = (): boolean => {
  const { muted, musicOff } = useSettings.getState()
  return !muted && !musicOff
}

useSettings.subscribe((s, prev) => {
  if (s.muted === prev.muted && s.musicOff === prev.musicOff) return
  if (s.muted || s.musicOff) stop()
  else start()
})

// ---- what the picture sees of the music ----

/** How hard a drum hit still "rings" at `now`: 1 at the hit, dying away (`decay` seconds to 1/e); 0 before the hit or when there is none. */
export function pulseAt(hits: readonly { at: number; kind: string }[], kind: string, now: number, decay: number): number {
  let last = -Infinity
  for (const h of hits) if (h.kind === kind && h.at <= now && h.at > last) last = h.at
  return last === -Infinity ? 0 : Math.exp(-(now - last) / decay)
}

export interface Beat {
  kick: number
  snare: number
  /** half the sample rate: the pitch of the last bin of the spectrum */
  nyquist: number
}

/**
 * The beat as heard now (the clock is held back by the delay of the speakers, so a flash and its sound meet), and the spectrum of
 * the sound (filled into `bins`, 0..255 each, low pitches first). Null when no music is playing.
 */
export function musicNow(bins: Uint8Array<ArrayBuffer>): Beat | null {
  const p = playing
  if (!p || p.c.state !== 'running') return null
  const now = p.c.currentTime - (p.c.outputLatency || p.c.baseLatency || 0)
  while (p.hits.length > 0 && p.hits[0]!.at < now - 1.5) p.hits.shift()
  p.analyser.getByteFrequencyData(bins)
  return { kick: pulseAt(p.hits, 'kick', now, 0.16), snare: pulseAt(p.hits, 'snare', now, 0.12), nyquist: p.c.sampleRate / 2 }
}

/** How many bins the spectrum has (the analyser's fft is twice that). */
export const SPECTRUM_BINS = 512
