/**
 * The instruments the soundtracks of the fighters are played on (see composer.ts): drums, basses, leads, pads and a few effects, all
 * made of oscillators and noise in any audio context. Each takes the context, the node it plays into, the time, and a loudness.
 */
import { hz, hit, note } from './voices'

type Ctx = BaseAudioContext

// ---- saturation ----

const curves = new Map<number, Float32Array<ArrayBuffer>>()
/** A waveshaper curve: a hard clip that gets harder with `k`, and, with `steps`, cut into levels like a low bit depth. */
export function crushCurve(k: number, steps = 0): Float32Array<ArrayBuffer> {
  const key = k * 1000 + steps
  let c = curves.get(key)
  if (!c) {
    c = new Float32Array(2048)
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1
      let y = Math.tanh(x * k) / Math.tanh(k)
      if (steps > 0) y = Math.round(y * steps) / steps
      c[i] = y
    }
    curves.set(key, c)
  }
  return c
}

// ---- drums ----

export type KickKind = 'punch' | 'sub' | 'taiko' | 'soft'
export function kickVoice(c: Ctx, to: AudioNode, at: number, v: number, kind: KickKind): void {
  if (kind === 'sub') {
    hit(c, to, at, { type: 'lowpass', freq: 160, dur: 0.5, gain: 0.08 * v, tone: [120, 36, 1.05 * v] })
  } else if (kind === 'taiko') {
    hit(c, to, at, { type: 'lowpass', freq: 400, dur: 0.38, gain: 0.25 * v, tone: [105, 50, 1 * v] })
    hit(c, to, at, { type: 'bandpass', freq: 1800, dur: 0.02, gain: 0.25 * v })
  } else if (kind === 'soft') {
    hit(c, to, at, { type: 'lowpass', freq: 200, dur: 0.2, gain: 0.1 * v, tone: [130, 50, 0.8 * v] })
  } else {
    hit(c, to, at, { type: 'lowpass', freq: 260, dur: 0.22, gain: 0.3 * v, tone: [175, 42, 1 * v] })
    hit(c, to, at, { type: 'highpass', freq: 3500, dur: 0.012, gain: 0.35 * v })
  }
}

export type SnareKind = 'crack' | 'clap' | 'gate' | 'rim'
export function snareVoice(c: Ctx, to: AudioNode, at: number, v: number, kind: SnareKind): void {
  if (kind === 'clap') {
    for (const d of [0, 0.011, 0.023]) hit(c, to, at + d, { type: 'bandpass', freq: 1500, dur: 0.05, gain: 0.45 * v })
    hit(c, to, at + 0.03, { type: 'bandpass', freq: 1300, dur: 0.16, gain: 0.35 * v })
  } else if (kind === 'gate') {
    hit(c, to, at, { type: 'bandpass', freq: 1900, dur: 0.2, gain: 0.8 * v, tone: [190, 120, 0.35 * v] })
    hit(c, to, at, { type: 'highpass', freq: 5000, dur: 0.22, gain: 0.35 * v })
  } else if (kind === 'rim') {
    hit(c, to, at, { type: 'bandpass', freq: 1700, dur: 0.03, gain: 0.7 * v, tone: [420, 330, 0.25 * v] })
  } else {
    hit(c, to, at, { type: 'bandpass', freq: 2300, dur: 0.15, gain: 0.95 * v, tone: [205, 130, 0.4 * v] })
    hit(c, to, at, { type: 'highpass', freq: 6000, dur: 0.06, gain: 0.7 * v })
  }
}

/** A tom (or a taiko, when low): a sine that falls, with a knock of noise. */
export function tomVoice(c: Ctx, to: AudioNode, at: number, v: number, freq: number): void {
  hit(c, to, at, { type: 'lowpass', freq: freq * 5, dur: 0.3, gain: 0.18 * v, tone: [freq * 1.35, freq * 0.72, 0.9 * v] })
}

export type HatKind = 'crisp' | 'dark' | 'shaker'
export function hatVoice(c: Ctx, to: AudioNode, at: number, v: number, open: boolean, kind: HatKind): void {
  const freq = kind === 'dark' ? 5500 : kind === 'shaker' ? 6500 : 7500
  const dur = kind === 'shaker' ? 0.05 : open ? 0.13 : 0.035
  hit(c, to, at, { type: 'highpass', freq, dur, gain: (kind === 'shaker' ? 0.09 : 0.14) * v })
}

/** A big gong: inharmonic partials, a long ring. */
export function gong(c: Ctx, to: AudioNode, at: number, gain: number, f0 = 110): void {
  const g = c.createGain()
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 3)
  for (const [r, l] of [[1, 1], [1.51, 0.7], [2.17, 0.5], [2.93, 0.4], [4.1, 0.25]] as const) {
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = 'sine'
    o.frequency.value = f0 * r
    og.gain.value = l * 0.3
    o.connect(og).connect(g)
    o.start(at)
    o.stop(at + 3.05)
  }
  g.connect(to)
}

/** A metallic clang: five square waves at inharmonic ratios, through a narrow band-pass and a high-pass, ringing for a moment. */
export function clang(c: Ctx, to: AudioNode, at: number, f0: number, gain: number, dur = 0.16): void {
  const band = c.createBiquadFilter()
  const high = c.createBiquadFilter()
  const g = c.createGain()
  band.type = 'bandpass'
  band.frequency.value = f0 * 7
  band.Q.value = 2.2
  high.type = 'highpass'
  high.frequency.value = 2200
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  for (const ratio of [1, 1.4832, 1.9318, 2.5466, 3.1017]) {
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = f0 * ratio
    o.connect(band)
    o.start(at)
    o.stop(at + dur + 0.02)
  }
  band.connect(high).connect(g).connect(to)
}

// ---- basses ----

export type BassKind = 'dist' | 'sub' | 'pluck' | 'acid' | 'wobble' | 'pulse' | 'reese'

/** A distorted bass note: a saw and a square a little apart, clipped hard, a filter that closes over the note, and a clean sub under it. */
export function distBass(c: Ctx, to: AudioNode, midi: number, at: number, dur: number, gain: number): void {
  const mix = c.createGain()
  const shaper = c.createWaveShaper()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  shaper.curve = crushCurve(14)
  shaper.oversample = '2x'
  f.type = 'lowpass'
  f.Q.value = 1.4
  f.frequency.setValueAtTime(3000, at)
  f.frequency.exponentialRampToValueAtTime(700, at + Math.min(dur, 0.2))
  const end = at + dur
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.004)
  g.gain.setValueAtTime(gain, Math.max(at + 0.004, end - 0.02))
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05)
  for (const [type, ratio, level] of [['sawtooth', 1, 0.6], ['square', 1.006, 0.4]] as const) {
    const o = c.createOscillator()
    const l = c.createGain()
    o.type = type
    o.frequency.value = hz(midi) * ratio
    l.gain.value = level
    o.connect(l).connect(mix)
    o.start(at)
    o.stop(end + 0.07)
  }
  mix.connect(shaper).connect(f).connect(g).connect(to)
  note(c, to, { type: 'sine', freq: hz(midi - 12), at, dur, gain: gain * 0.75, release: 0.05 })
}

/** One bass note of any kind. */
export function bassVoice(c: Ctx, to: AudioNode, kind: BassKind, midi: number, at: number, dur: number, gain: number): void {
  const f0 = hz(midi)
  if (kind === 'dist') return distBass(c, to, midi, at, dur, gain)
  if (kind === 'sub') {
    note(c, to, { type: 'sine', freq: f0, at, dur, gain: gain * 1.1, attack: 0.008, release: 0.08 })
    note(c, to, { type: 'triangle', freq: f0 * 2, at, dur, gain: gain * 0.25, cutoff: 900, release: 0.06 })
  } else if (kind === 'pluck') {
    note(c, to, { type: 'sawtooth', freq: f0, at, dur: Math.min(dur, 0.22), gain, cutoff: 500, from: 3200, release: 0.05 })
    note(c, to, { type: 'sine', freq: f0 / 2, at, dur: Math.min(dur, 0.3), gain: gain * 0.7, release: 0.05 })
  } else if (kind === 'acid') {
    const o = c.createOscillator()
    const f = c.createBiquadFilter()
    const g = c.createGain()
    o.type = 'sawtooth'
    o.frequency.value = f0
    f.type = 'lowpass'
    f.Q.value = 9
    f.frequency.setValueAtTime(2800, at)
    f.frequency.exponentialRampToValueAtTime(260, at + Math.max(0.08, dur * 0.9))
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(gain * 0.8, at + 0.004)
    g.gain.setValueAtTime(gain * 0.8, Math.max(at + 0.004, at + dur - 0.02))
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.04)
    o.connect(f).connect(g).connect(to)
    o.start(at)
    o.stop(at + dur + 0.06)
  } else if (kind === 'wobble') {
    const o = c.createOscillator()
    const f = c.createBiquadFilter()
    const g = c.createGain()
    const lfo = c.createOscillator()
    const depth = c.createGain()
    o.type = 'sawtooth'
    o.frequency.value = f0
    f.type = 'lowpass'
    f.Q.value = 5
    f.frequency.value = 600
    lfo.frequency.value = 4.5
    depth.gain.value = 450
    lfo.connect(depth).connect(f.frequency)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(gain, at + 0.01)
    g.gain.setValueAtTime(gain, Math.max(at + 0.01, at + dur - 0.03))
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06)
    o.connect(f).connect(g).connect(to)
    for (const n of [o, lfo]) {
      n.start(at)
      n.stop(at + dur + 0.08)
    }
    note(c, to, { type: 'sine', freq: f0, at, dur, gain: gain * 0.6, release: 0.06 })
  } else if (kind === 'pulse') {
    note(c, to, { type: 'square', freq: f0, at, dur, gain: gain * 0.7, cutoff: 800, from: 1800, release: 0.04 })
    note(c, to, { type: 'sine', freq: f0, at, dur, gain: gain * 0.5, release: 0.04 })
  } else {
    // a reese: two saws a few cents apart, slowly beating, under a closed filter
    for (const d of [-14, 14]) note(c, to, { type: 'sawtooth', freq: f0, at, dur, gain: gain * 0.55, cutoff: 520, detune: d, attack: 0.01, release: 0.1 })
    note(c, to, { type: 'sine', freq: f0, at, dur, gain: gain * 0.6, release: 0.08 })
  }
}

// ---- leads and pads ----

export type LeadKind = 'chip' | 'saw' | 'bell' | 'flute' | 'koto' | 'brass' | 'choir' | 'organ' | 'guitar'

/** FM: a sine carrier whose pitch is shaken by another sine; the shake dies away, so the sound starts bright and goes soft (a bell, an electric piano). */
function fm(c: Ctx, to: AudioNode, freq: number, at: number, dur: number, gain: number, ratio: number, index: number): void {
  const car = c.createOscillator()
  const mod = c.createOscillator()
  const depth = c.createGain()
  const g = c.createGain()
  car.frequency.value = freq
  mod.frequency.value = freq * ratio
  depth.gain.setValueAtTime(freq * index, at)
  depth.gain.exponentialRampToValueAtTime(freq * 0.05, at + Math.max(0.1, dur))
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.12, dur) + 0.5)
  mod.connect(depth).connect(car.frequency)
  car.connect(g).connect(to)
  car.start(at)
  mod.start(at)
  car.stop(at + dur + 0.6)
  mod.stop(at + dur + 0.6)
}

/** A plucked string: a saw through a filter that closes quickly; with `bend` the pitch starts a little high and settles (a koto). */
function pluck(c: Ctx, to: AudioNode, freq: number, at: number, dur: number, gain: number, bend = 0): void {
  const o = c.createOscillator()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(freq * (1 + bend), at)
  if (bend) o.frequency.exponentialRampToValueAtTime(freq, at + 0.05)
  f.type = 'lowpass'
  f.Q.value = 1.2
  f.frequency.setValueAtTime(5500, at)
  f.frequency.exponentialRampToValueAtTime(700, at + 0.28)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.2, dur) + 0.25)
  o.connect(f).connect(g).connect(to)
  o.start(at)
  o.stop(at + Math.max(0.2, dur) + 0.3)
}

/** A voice with the vowel of a choir: detuned saws through two band-pass filters at the formants of an "ah". */
function choir(c: Ctx, to: AudioNode, freqs: readonly number[], at: number, dur: number, gain: number, attack = 0.25): void {
  const g = c.createGain()
  const a = c.createBiquadFilter()
  const b = c.createBiquadFilter()
  a.type = 'bandpass'
  a.frequency.value = 700
  a.Q.value = 5
  b.type = 'bandpass'
  b.frequency.value = 1220
  b.Q.value = 6
  const end = at + dur
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(gain, at + attack)
  g.gain.setValueAtTime(gain, Math.max(at + attack, end - 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.5)
  for (const freq of freqs) {
    for (const d of [-9, 0, 9]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = d
      o.connect(a)
      o.connect(b)
      o.start(at)
      o.stop(end + 0.55)
    }
  }
  a.connect(g)
  b.connect(g)
  g.connect(to)
}

/** One lead note of any kind (`echo` gets a quieter copy, for the kinds that are sent through it). */
export function leadVoice(c: Ctx, to: AudioNode, echo: AudioNode, kind: LeadKind, midi: number, at: number, dur: number, gain: number): void {
  const f0 = hz(midi)
  if (kind === 'chip') {
    note(c, to, { type: 'square', freq: f0, at, dur: dur * 0.9, gain: gain * 0.7, cutoff: 4200, attack: 0.004, release: 0.05, vibrato: dur > 0.25 ? 12 : 0 })
    note(c, echo, { type: 'square', freq: f0, at, dur: dur * 0.9, gain: gain * 0.3, cutoff: 3000, attack: 0.004, release: 0.05 })
  } else if (kind === 'saw') {
    for (const d of [-9, 9]) note(c, to, { type: 'sawtooth', freq: f0, at, dur: dur * 0.95, gain: gain * 0.55, cutoff: 3200, from: 5200, detune: d, attack: 0.01, release: 0.12 })
    note(c, echo, { type: 'sawtooth', freq: f0, at, dur, gain: gain * 0.25, cutoff: 2400, release: 0.12 })
  } else if (kind === 'bell') {
    fm(c, to, f0, at, dur, gain * 0.9, 3.5, 1.6)
    fm(c, echo, f0, at, dur, gain * 0.5, 3.5, 1.6)
  } else if (kind === 'flute') {
    note(c, to, { type: 'triangle', freq: f0, at, dur: dur * 0.95, gain: gain * 1.1, cutoff: 2600, attack: 0.05, release: 0.14, vibrato: 18 })
    hit(c, to, at, { type: 'bandpass', freq: f0 * 2.5, dur: Math.min(0.18, dur), gain: gain * 0.25 })
    note(c, echo, { type: 'triangle', freq: f0, at, dur, gain: gain * 0.4, cutoff: 2000, attack: 0.05, release: 0.14 })
  } else if (kind === 'koto') {
    pluck(c, to, f0, at, dur, gain * 0.8, 0.035)
    pluck(c, echo, f0, at, dur, gain * 0.4, 0.035)
  } else if (kind === 'brass') {
    for (const d of [-6, 6]) note(c, to, { type: 'sawtooth', freq: f0, at, dur: dur * 0.95, gain: gain * 0.6, cutoff: 3000, from: 500, detune: d, attack: 0.05, release: 0.12 })
  } else if (kind === 'choir') {
    choir(c, to, [f0], at, dur, gain * 0.35, 0.18)
    choir(c, echo, [f0], at, dur, gain * 0.18, 0.18)
  } else if (kind === 'organ') {
    for (const [r, l] of [[1, 1], [2, 0.6], [3, 0.4], [4, 0.3], [6, 0.15]] as const) note(c, to, { type: 'sine', freq: f0 * r, at, dur: dur * 0.95, gain: gain * 0.35 * l, attack: 0.015, release: 0.09 })
  } else {
    // a guitar: a power chord (the note and its fifth and octave), clipped
    const mix = c.createGain()
    const shaper = c.createWaveShaper()
    const f = c.createBiquadFilter()
    const g = c.createGain()
    shaper.curve = crushCurve(8)
    f.type = 'lowpass'
    f.frequency.value = 2400
    const end = at + dur * 0.95
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(gain * 0.9, at + 0.006)
    g.gain.setValueAtTime(gain * 0.9, Math.max(at + 0.006, end - 0.02))
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08)
    for (const r of [1, 1.5, 2]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f0 * r
      o.connect(mix)
      o.start(at)
      o.stop(end + 0.1)
    }
    mix.connect(shaper).connect(f).connect(g).connect(to)
  }
}

export type PadKind = 'saw' | 'choir' | 'strings' | 'organ'

/** A chord held for `dur`: `midis` are its notes. */
export function padVoice(c: Ctx, to: AudioNode, kind: PadKind, midis: readonly number[], at: number, dur: number, gain: number): void {
  if (kind === 'choir') return choir(c, to, midis.map(hz), at, dur, gain * 0.17, 0.5)
  for (const m of midis) {
    if (kind === 'organ') {
      for (const [r, l] of [[1, 1], [2, 0.5], [3, 0.3]] as const) note(c, to, { type: 'sine', freq: hz(m) * r, at, dur, gain: gain * 0.3 * l, attack: 0.04, release: 0.2 })
    } else if (kind === 'strings') {
      for (const d of [-12, -4, 5, 12]) note(c, to, { type: 'sawtooth', freq: hz(m), at, dur, gain: gain * 0.2, cutoff: 1900, detune: d, attack: 0.35, release: 0.6 })
    } else {
      for (const d of [-7, 7]) note(c, to, { type: 'sawtooth', freq: hz(m), at, dur, gain: gain * 0.28, cutoff: 900, detune: d, attack: 0.5, release: 0.6 })
    }
  }
}

/** A rise of noise (a riser): it swells from `from` Hz to `to` Hz over `dur` seconds and stops. */
export function riser(c: Ctx, to: AudioNode, at: number, dur: number, gain: number): void {
  const s = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  s.buffer = c.createBuffer(1, Math.ceil(c.sampleRate * (dur + 0.1)), c.sampleRate)
  const d = s.buffer.getChannelData(0)
  let seed = 4242
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    d[i] = (seed / 4294967296) * 2 - 1
  }
  f.type = 'bandpass'
  f.Q.value = 1.4
  f.frequency.setValueAtTime(400, at)
  f.frequency.exponentialRampToValueAtTime(7000, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.95)
  g.gain.linearRampToValueAtTime(0, at + dur)
  s.connect(f).connect(g).connect(to)
  s.start(at)
  s.stop(at + dur + 0.05)
}

/** A siren: a saw that swoops up and down twice. */
export function siren(c: Ctx, to: AudioNode, at: number, dur: number, gain: number): void {
  const o = c.createOscillator()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(600, at)
  o.frequency.linearRampToValueAtTime(950, at + dur / 4)
  o.frequency.linearRampToValueAtTime(600, at + dur / 2)
  o.frequency.linearRampToValueAtTime(950, at + (3 * dur) / 4)
  o.frequency.linearRampToValueAtTime(600, at + dur)
  f.type = 'bandpass'
  f.frequency.value = 1100
  f.Q.value = 2
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.05)
  g.gain.setValueAtTime(gain, at + dur - 0.05)
  g.gain.linearRampToValueAtTime(0, at + dur)
  o.connect(f).connect(g).connect(to)
  o.start(at)
  o.stop(at + dur + 0.02)
}
