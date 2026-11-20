/** Every sound is synthesised with the Web Audio API: there are no audio files. */
import { useSettings } from '../state/settings'

export type Sound = 'select' | 'bell' | 'hit' | 'kick' | 'whoosh' | 'crit' | 'super' | 'block' | 'stumble' | 'win' | 'lose'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (useSettings.getState().muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // no Web Audio: the game is silent, and fine
  }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noise
}

/** A tone that glides from `f0` to `f1` and fades out. */
function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0): void {
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

/** A burst of filtered noise. */
function burst(c: AudioContext, freq: number, dur: number, gain: number, at = 0): void {
  const t = c.currentTime + at
  const s = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  s.buffer = noiseBuffer(c)
  f.type = 'lowpass'
  f.frequency.value = freq
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(c.destination)
  s.start(t)
  s.stop(t + dur + 0.02)
}

/** A rush of air: noise through a band-pass filter whose centre sweeps from `f0` to `f1`. */
function whoosh(c: AudioContext, f0: number, f1: number, dur: number, gain: number, at = 0): void {
  const t = c.currentTime + at
  const s = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  s.buffer = noiseBuffer(c)
  f.type = 'bandpass'
  f.Q.value = 1.6
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.55)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(c.destination)
  s.start(t)
  s.stop(t + dur + 0.02)
}

const SOUNDS: Record<Sound, (c: AudioContext) => void> = {
  // the bell that starts a fight: a bright, ringing strike with a long tail
  bell: (c) => {
    for (const [f, g] of [[880, 0.22], [1320, 0.12], [2210, 0.07]] as const) tone(c, 'sine', f, f * 0.995, 1.3, g)
    burst(c, 5000, 0.05, 0.12)
  },
  select: (c) => tone(c, 'square', 520, 760, 0.05, 0.04),
  hit: (c) => {
    burst(c, 1800, 0.12, 0.35)
    tone(c, 'sine', 150, 45, 0.18, 0.5)
  },
  // a landed kick: the leg swings through the air, then a heavy, low thud (a punch is a short, sharp smack)
  kick: (c) => {
    whoosh(c, 500, 2600, 0.11, 0.55)
    burst(c, 900, 0.18, 0.5, 0.09)
    tone(c, 'sine', 115, 34, 0.3, 0.85, 0.09)
    tone(c, 'triangle', 320, 90, 0.12, 0.25, 0.09)
  },
  // a kick that was guarded: only the swing is heard (the guard and the stumble follow)
  whoosh: (c) => whoosh(c, 500, 2600, 0.12, 0.6),
  crit: (c) => {
    burst(c, 3200, 0.2, 0.5)
    tone(c, 'sine', 200, 35, 0.32, 0.7)
    tone(c, 'sawtooth', 900, 200, 0.2, 0.12)
  },
  // the super strike lands: a rising shimmer cut off by a huge, low boom and a crack
  super: (c) => {
    whoosh(c, 300, 5200, 0.16, 0.5)
    burst(c, 2600, 0.35, 0.6, 0.02)
    tone(c, 'sine', 120, 24, 0.7, 1.0, 0.02)
    tone(c, 'sawtooth', 1200, 140, 0.35, 0.16, 0.02)
    tone(c, 'triangle', 880, 440, 0.5, 0.12, 0.05)
  },
  block: (c) => {
    tone(c, 'triangle', 1400, 900, 0.1, 0.25)
    tone(c, 'square', 2100, 1500, 0.06, 0.06)
  },
  stumble: (c) => {
    burst(c, 600, 0.16, 0.3)
    tone(c, 'sawtooth', 260, 70, 0.28, 0.16)
  },
  win: (c) => [523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, 0.28, 0.2, i * 0.13)),
  lose: (c) => [392, 330, 262, 175].forEach((f, i) => tone(c, 'sawtooth', f, f * 0.97, 0.38, 0.14, i * 0.2)),
}

export function play(sound: Sound): void {
  const c = audio()
  if (c) SOUNDS[sound](c)
}
