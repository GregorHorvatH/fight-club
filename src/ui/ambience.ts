/**
 * The life behind the menus: while no fight is going on the arena picture is not a still. It drifts slowly (a camera that creeps
 * closer), a bank of mist rolls along the floor, a shaft of light sweeps over it, and little lights float up in the air: dust in the
 * sun of the fort, fireflies on the night, embers on the sunset. All of it is CSS (only `transform` and `opacity` move, so a phone's
 * graphics chip does the work), under the fighters, and fades in and out when the menus come and go.
 */
/**
 * The phases when no fight is going on: the menus, the choosing of a fighter and the ladder. The picture is alive and the theme plays.
 * (Not the walk out of the arena: the fighters leave first, in quiet.)
 */
export const isCalm = (phase: string): boolean => ['menu', 'about', 'options', 'setup', 'select', 'ladder'].includes(phase)

/** How long after the menu is there (when it was not before) the picture comes alive and the music starts. */
export const CALM_DELAY_MS = 900

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * The points of the wave drawn along the bottom of the picture: `count` heights (0..1) from the spectrum. The pitches are laid out
 * the way the ear hears them (each point is a step up in pitch, from about 60 Hz to 8 kHz, so the bass does not take the whole
 * left side), a point shows the loudest bin in its own stretch, and the quiet highs are lifted (music has less in them) while the
 * loud lows are not allowed to run into the ceiling, so that every part of the wave keeps moving.
 * `nyquist` is half the sample rate: the highest pitch in the last bin.
 */
export function waveFrom(bins: ArrayLike<number>, count: number, ceiling = 1, nyquist = 22050): number[] {
  const LOW = 60
  const HIGH = 8000
  const at = (f: number): number => (f / nyquist) * bins.length
  const freq = (t: number): number => LOW * (HIGH / LOW) ** t
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    const from = Math.floor(at(freq(Math.max(0, (i - 0.5) / (count - 1)))))
    const to = Math.max(from, Math.floor(at(freq(Math.min(1, (i + 0.5) / (count - 1))))))
    let peak = 0
    for (let k = from; k <= to; k++) peak = Math.max(peak, bins[Math.min(k, bins.length - 1)] ?? 0)
    // the bins are decibels laid on a scale (-100 dB at 0, -30 dB at 255, the analyser's own); the highs are lifted by up to 28 dB,
    // and what is between -54 and -30 dB becomes the height: the loud lows do not reach the ceiling, the highs are not flat
    const db = -100 + 70 * (peak / 255) + 28 * t
    return ceiling * clamp01((db + 54) / 24) ** 1.1
  })
}

export type Kind = 'dust' | 'firefly' | 'ember'

interface Look {
  kind: Kind
  /** the colour of the lights, mist and shaft (r, g, b) */
  rgb: string
  count: number
}

const LOOKS: Record<string, Look> = {
  fort: { kind: 'dust', rgb: '255, 232, 190', count: 48 },
  night: { kind: 'firefly', rgb: '176, 255, 130', count: 32 },
  sunset: { kind: 'ember', rgb: '255, 176, 104', count: 42 },
}
const DEFAULT_LOOK: Look = LOOKS.fort!

/** The look of an arena (one the game does not know has the dust of the fort). */
export const lookOf = (id: string): Look => LOOKS[id] ?? DEFAULT_LOOK

/** A small seeded random generator, so that the lights are the same on every render (and on every visit). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Mote {
  x: number
  y: number
  size: number
  dur: number
  delay: number
  dx: number
  dy: number
  peak: number
  blink: number
}

/** Where each light starts and how it moves: the embers rise a long way, the dust and the fireflies wander. */
export function motes(kind: Kind, count: number, seed: number): Mote[] {
  const r = rng(seed)
  return Array.from({ length: count }, () => {
    const dur = (kind === 'ember' ? 7 : 11) + r() * (kind === 'ember' ? 7 : 12)
    return {
      x: r() * 100,
      y: kind === 'ember' ? 45 + r() * 55 : 20 + r() * 70,
      size: kind === 'firefly' ? 4 + r() * 4 : kind === 'ember' ? 3 + r() * 4 : 3 + r() * 5,
      dur,
      delay: -r() * dur,
      dx: (r() - 0.5) * (kind === 'ember' ? 90 : 120),
      dy: kind === 'ember' ? -(160 + r() * 200) : -(20 + r() * 70) * (r() < 0.5 ? 1 : -0.5),
      peak: kind === 'firefly' ? 0.9 : 0.35 + r() * 0.5,
      blink: 1.6 + r() * 2.6,
    }
  })
}

