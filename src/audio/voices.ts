/**
 * The voices the themes are made of: a note (an oscillator through a filter and an envelope), a hit of filtered noise (with an
 * optional falling tone), and where they are sent. Shared by the themes of the menu and of the fight.
 */

export const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

let noise: AudioBuffer | null = null
export function noiseOf(c: BaseAudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== c.sampleRate) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noise.getChannelData(0)
    let seed = 12345
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0 // the same noise every time: the render is the same every time
      d[i] = (seed / 4294967296) * 2 - 1
    }
  }
  return noise
}

export interface Voice {
  type: OscillatorType
  freq: number
  at: number
  dur: number
  gain: number
  attack?: number
  release?: number
  cutoff?: number
  detune?: number
  /** the filter opens from this to `cutoff` over the note (a pluck) */
  from?: number
  /** a tremble of the pitch (cents) */
  vibrato?: number
}

/** One note: an oscillator through a low-pass filter and an envelope. */
export function note(c: BaseAudioContext, to: AudioNode, v: Voice): void {
  const o = c.createOscillator()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  o.type = v.type
  o.frequency.value = v.freq
  if (v.detune) o.detune.value = v.detune
  f.type = 'lowpass'
  f.Q.value = 0.8
  const cutoff = v.cutoff ?? 2000
  f.frequency.setValueAtTime(v.from ?? cutoff, v.at)
  if (v.from) f.frequency.exponentialRampToValueAtTime(cutoff, v.at + Math.min(v.dur, 0.25))
  const attack = v.attack ?? 0.005
  const end = v.at + v.dur
  g.gain.setValueAtTime(0.0001, v.at)
  g.gain.linearRampToValueAtTime(v.gain, v.at + attack)
  g.gain.setValueAtTime(v.gain, Math.max(v.at + attack, end - 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, end + (v.release ?? 0.06))
  if (v.vibrato) {
    const l = c.createOscillator()
    const d = c.createGain()
    l.frequency.value = 5.2
    d.gain.value = v.vibrato
    l.connect(d).connect(o.detune)
    l.start(v.at)
    l.stop(end + (v.release ?? 0.06) + 0.02)
  }
  o.connect(f).connect(g).connect(to)
  o.start(v.at)
  o.stop(end + (v.release ?? 0.06) + 0.02)
}

/** A hit of filtered noise (and an optional tone that falls): the hats, the snare, the kick. */
export function hit(c: BaseAudioContext, to: AudioNode, at: number, o: { type: BiquadFilterType; freq: number; dur: number; gain: number; tone?: [number, number, number] }): void {
  const s = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  s.buffer = noiseOf(c)
  f.type = o.type
  f.frequency.value = o.freq
  g.gain.setValueAtTime(o.gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur)
  s.connect(f).connect(g).connect(to)
  s.start(at)
  s.stop(at + o.dur + 0.02)
  if (o.tone) {
    const [f0, f1, gain] = o.tone
    const t = c.createOscillator()
    const tg = c.createGain()
    t.type = 'sine'
    t.frequency.setValueAtTime(f0, at)
    t.frequency.exponentialRampToValueAtTime(f1, at + o.dur)
    tg.gain.setValueAtTime(gain, at)
    tg.gain.exponentialRampToValueAtTime(0.0001, at + o.dur)
    t.connect(tg).connect(to)
    t.start(at)
    t.stop(at + o.dur + 0.02)
  }
}


/** Where the parts of a theme go: dry to the master, and some also to the echo. */
export interface Bus {
  dry: AudioNode
  echo: AudioNode
}

