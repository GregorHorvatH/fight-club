/**
 * The composer: turns the description of a style (key and mode, tempo, chords, which drums, which bass, which lead, which extras:
 * see styles.ts) into a loop of eight bars, written one sixteenth at a time like the other themes. Nothing in it is random at play
 * time: the patterns are worked out once from the style's seed, so a soundtrack is the same every time it is played or rendered.
 *
 * The rules that keep it music: every note of the bass, the lead and the arpeggio is a degree of the mode (or a chosen colour note),
 * the chords are built on the degrees of the progression, the lead is one short motif per phrase moved along the chords, and the
 * first half of the loop is the groove while the second adds the lead and the extras.
 */
import { bassVoice, clang, gong, hatVoice, kickVoice, leadVoice, padVoice, riser, siren, snareVoice, tomVoice, crushCurve, type BassKind, type HatKind, type KickKind, type LeadKind, type PadKind, type SnareKind } from './instruments'
import { hz, hit, note, type Bus } from './voices'

type Ctx = BaseAudioContext
type Mark = (hit: 'kick' | 'snare', at: number) => void
/** [sixteenth, strength] */
type Pat = readonly (readonly [number, number])[]

export type DrumKind = 'break' | 'four' | 'half' | 'rock' | 'tribal' | 'dnb' | 'march' | 'lounge' | 'stomp' | 'epic'
export type BassPattern = 'root8' | 'sync' | 'gallop' | 'offbeat' | 'pulse16' | 'walk' | 'half' | 'sparse' | 'funk'
export type LeadRhythm = 'long' | 'busy' | 'sync' | 'sparse' | 'dotted'
export type ArpKind = 'chip' | 'bell' | 'koto' | 'pluck'
export type ExtraKind = 'clang' | 'gong' | 'siren' | 'riser' | 'stab' | 'tick' | 'sparkle' | 'anvil' | 'heartbeat' | 'taikoRoll'

/** Which motif the lead plays in a bar: 0, 1 or 2 (the motifs of the style), "hint" (the first half of the first motif, quietly), or nothing. */
export type LeadPick = 0 | 1 | 2 | 'hint' | null

/** Four bars of the form of a soundtrack: their chords, and what plays in them. What is not said is as in the first section of a plain loop. */
export interface Section {
  /** the four chords, as degrees of the mode */
  prog: readonly number[]
  /** the lead of each of the four bars */
  lead: readonly LeadPick[]
  /** the lead goes this many degrees of the mode higher */
  lift?: number
  /** how loud the lead is (1 = as usual) */
  leadV?: number
  /** the drums: all of them, the kick only on the first and the third beat, or none (a breakdown) */
  drums?: 'full' | 'light' | 'none'
  bass?: boolean
  arp?: boolean
  pad?: boolean
  /** the extras of the style are on (the clangs, the sparkles, the ticks and the drone) */
  extras?: boolean
  /** a riser in the last bar, leading into the next section */
  riser?: boolean
}

export interface Style {
  /** the prompt this soundtrack was written from (what one would give to a music generator) */
  prompt: string
  bpm: number
  /** the tonic of the bass, as a MIDI note (40 = E2) */
  root: number
  /** the semitones of the mode above the tonic, e.g. [0, 2, 3, 5, 7, 8, 10] (natural minor) */
  scale: readonly number[]
  /** the chords of the first four bars, as degrees of the mode (0 = the tonic chord); the second four go by `prog2`, or the same */
  prog: readonly number[]
  prog2?: readonly number[]
  drums: DrumKind
  kick: KickKind
  snare: SnareKind
  hat: HatKind
  /** how late the odd sixteenths come, as a part of a sixteenth (0 = straight) */
  swing: number
  bass: BassKind
  bassPattern: BassPattern
  /** colour notes the bass may use, as semitones above its chord's root (e.g. 1 and 6 for a dark one) */
  colour?: readonly number[]
  lead: LeadKind
  leadRhythm: LeadRhythm
  /** the lead's tonic as a MIDI note */
  leadRoot: number
  /** the arpeggio under everything (null: none) */
  arp: ArpKind | null
  pad: PadKind | null
  /** a drone of these semitones above the tonic, a note each, a bar or two at a time */
  drone?: readonly number[]
  extras: readonly ExtraKind[]
  /** how hard the whole mix is clipped (0 = not), and the crushing (levels) of the part that is crushed */
  drive: number
  crush: number
  /** the reverb (0..1), and the echo (0..1) */
  reverb: number
  echo: number
  seed: number
  /** the rhythm of the third motif, when it should differ from the lead's (the bridge of a long form) */
  leadRhythmC?: LeadRhythm
  /**
   * The form of a long soundtrack: sections of four bars, one after another, and the loop is as long as all of them. Without it the
   * loop is eight bars: the groove (`prog`), then the same with the lead and the extras (`prog2`).
   */
  form?: readonly Section[]
  /** the volume of the soundtrack in the fight (1 = the loudness the soundtracks are mixed to) */
  level?: number
}

// ---- the random numbers (seeded) ----

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

// ---- the drums ----

interface Kit {
  k: readonly Pat[]
  s?: readonly Pat[]
  c?: readonly Pat[]
  rim?: readonly Pat[]
  /** toms: [sixteenth, strength, pitch in Hz] */
  t?: readonly (readonly (readonly [number, number, number])[])[]
  hats: 'eighths' | 'sixteenths' | 'offbeat' | 'none'
  shaker?: boolean
}
const same = <T>(p: T): readonly T[] => [p, p, p, p]
const roll = (steps: readonly number[], from: number): Pat => steps.map((s, i) => [s, from + (1 - from) * (i / Math.max(1, steps.length - 1))] as const)

const KITS: Record<DrumKind, Kit> = {
  break: {
    k: [[[0, 1], [2, 0.45], [10, 1]], [[0, 1], [3, 0.8], [10, 1]], [[0, 1], [2, 0.5], [7, 0.6], [10, 1]], [[0, 1], [10, 1]]],
    s: [[[4, 1], [7, 0.28], [9, 0.22], [12, 1], [15, 0.3]], [[4, 1], [6, 0.25], [11, 0.25], [12, 1], [14, 0.3]], [[4, 1], [7, 0.3], [9, 0.22], [12, 1], [15, 0.32]], [[4, 1], [7, 0.28], [12, 1], ...roll([13, 14, 15], 0.5)]],
    hats: 'eighths',
  },
  four: {
    k: same([[0, 1], [4, 1], [8, 1], [12, 1]]),
    c: [[[4, 0.8], [12, 0.8]], [[4, 0.8], [12, 0.8]], [[4, 0.8], [12, 0.8]], [[4, 0.8], [12, 0.8], ...roll([13, 14, 15], 0.5)]],
    hats: 'offbeat',
  },
  half: {
    k: [[[0, 1], [7, 0.7], [10, 0.9]], [[0, 1], [3, 0.6], [10, 0.9], [14, 0.6]], [[0, 1], [7, 0.7], [10, 0.9]], [[0, 1], [10, 0.9]]],
    s: [[[8, 1], [15, 0.3]], [[8, 1], [15, 0.3]], [[8, 1], [15, 0.3]], [[8, 1], ...roll([12, 13, 14, 15], 0.4)]],
    hats: 'sixteenths',
  },
  rock: {
    k: [[[0, 1], [8, 1], [10, 0.7]], [[0, 1], [6, 0.6], [8, 1]], [[0, 1], [8, 1], [10, 0.7]], [[0, 1], [8, 1]]],
    s: [[[4, 1], [12, 1]], [[4, 1], [12, 1]], [[4, 1], [12, 1]], [[4, 1], [12, 1], ...roll([13, 14, 15], 0.6)]],
    hats: 'eighths',
  },
  tribal: {
    k: same([[0, 1], [8, 1]]),
    rim: same([[4, 0.6], [12, 0.6]]),
    t: [[[0, 0.9, 110], [3, 0.7, 150], [6, 0.8, 110], [8, 0.9, 190], [10, 0.7, 150], [12, 0.9, 110], [14, 0.7, 190]], [[0, 0.9, 110], [2, 0.6, 150], [6, 0.8, 110], [8, 0.9, 190], [11, 0.7, 150], [12, 0.9, 110], [15, 0.7, 190]], [[0, 0.9, 110], [3, 0.7, 150], [6, 0.8, 110], [8, 0.9, 190], [10, 0.7, 150], [12, 0.9, 110], [14, 0.7, 190]], [[0, 0.9, 110], [6, 0.8, 110], [8, 0.9, 190], [12, 0.7, 190], [13, 0.8, 150], [14, 0.9, 110], [15, 1, 110]]],
    hats: 'none',
    shaker: true,
  },
  dnb: {
    k: [[[0, 1], [10, 1]], [[0, 1], [2, 0.5], [10, 1]], [[0, 1], [10, 1]], [[0, 1], [10, 1], [14, 0.6]]],
    s: [[[4, 1], [7, 0.3], [12, 1], [15, 0.3]], [[4, 1], [7, 0.3], [12, 1], [15, 0.3]], [[4, 1], [7, 0.3], [12, 1], [15, 0.3]], [[4, 1], [12, 1], ...roll([13, 14, 15], 0.5)]],
    hats: 'sixteenths',
  },
  march: {
    k: same([[0, 1], [8, 1]]),
    s: [[[0, 0.9], [2, 0.5], [3, 0.6], [4, 1], [6, 0.5], [7, 0.6], [8, 0.9], [10, 0.5], [11, 0.6], [12, 1], [14, 0.5], [15, 0.8]], [[0, 0.9], [2, 0.5], [3, 0.6], [4, 1], [6, 0.5], [7, 0.6], [8, 0.9], [10, 0.5], [11, 0.6], [12, 1], [14, 0.5], [15, 0.8]], [[0, 0.9], [2, 0.5], [3, 0.6], [4, 1], [6, 0.5], [7, 0.6], [8, 0.9], [10, 0.5], [11, 0.6], [12, 1], [14, 0.5], [15, 0.8]], [[0, 0.9], [2, 0.5], [3, 0.6], [4, 1], [6, 0.5], ...roll([8, 9, 10, 11, 12, 13, 14, 15], 0.4)]],
    hats: 'none',
  },
  lounge: {
    k: [[[0, 1], [6, 0.7], [10, 0.8]], [[0, 1], [6, 0.7], [10, 0.8], [13, 0.5]], [[0, 1], [6, 0.7], [10, 0.8]], [[0, 1], [10, 0.8]]],
    rim: same([[4, 0.9], [12, 0.9]]),
    hats: 'eighths',
    shaker: true,
  },
  stomp: {
    k: same([[0, 1], [8, 1]]),
    c: same([[4, 1], [12, 1]]),
    t: same([[2, 0.8, 95], [6, 0.8, 95], [10, 0.8, 95], [14, 0.8, 95]]),
    hats: 'none',
  },
  epic: {
    k: same([[0, 1], [8, 0.8]]),
    s: same([[8, 1]]),
    t: [[[0, 1, 70], [6, 0.8, 85], [8, 1, 70], [11, 0.8, 85], [14, 0.7, 100]], [[0, 1, 70], [6, 0.8, 85], [8, 1, 70], [11, 0.8, 85], [14, 0.7, 100]], [[0, 1, 70], [6, 0.8, 85], [8, 1, 70], [11, 0.8, 85], [14, 0.7, 100]], [[0, 1, 70], [6, 0.8, 85], [8, 1, 70], [10, 0.7, 100], [12, 0.8, 85], [13, 0.9, 85], [14, 1, 70], [15, 1, 70]]],
    hats: 'none',
  },
}

// ---- the bass ----

/** [sixteenth, which note, length in sixteenths]: 0 the root of the chord, 1 its fifth, 2 the octave, 3 its third, 4 and 5 the colour notes. */
const BASS_PATTERNS: Record<BassPattern, readonly (readonly [number, number, number])[]> = {
  root8: [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 2, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 1, 2]],
  sync: [[0, 0, 2], [3, 0, 1], [6, 1, 2], [8, 0, 2], [11, 0, 1], [14, 2, 2]],
  gallop: [[0, 0, 1], [2, 0, 1], [3, 0, 1], [4, 0, 1], [6, 0, 1], [7, 1, 1], [8, 0, 1], [10, 0, 1], [11, 0, 1], [12, 0, 1], [14, 0, 1], [15, 1, 1]],
  offbeat: [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 2, 2]],
  pulse16: [[0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1], [4, 0, 1], [5, 0, 1], [6, 2, 1], [7, 0, 1], [8, 0, 1], [9, 0, 1], [10, 0, 1], [11, 0, 1], [12, 0, 1], [13, 0, 1], [14, 2, 1], [15, 0, 1]],
  walk: [[0, 0, 4], [4, 3, 4], [8, 1, 4], [12, 3, 4]],
  half: [[0, 0, 6], [8, 0, 3], [12, 1, 3]],
  sparse: [[0, 0, 3], [7, 0, 1], [10, 1, 3]],
  funk: [[0, 0, 1], [3, 0, 1], [4, 2, 1], [6, 0, 1], [8, 0, 1], [10, 1, 1], [11, 0, 1], [14, 2, 1]],
}
/** Which of the four bars of a phrase moves the bass off its pattern: the first bar uses it as it is, the later ones a little changed. */
const bassVariant = (pattern: readonly (readonly [number, number, number])[], variant: number, colour: readonly number[]): readonly (readonly [number, number, number])[] => {
  if (variant === 0 || variant === 2) return pattern
  const out = pattern.map((n) => [...n] as [number, number, number])
  // the last notes of the bar turn: a colour note (or the third) before the bar ends
  const last = out[out.length - 1]!
  const before = out[out.length - 2] ?? last
  if (colour.length > 0 && variant === 3) before[1] = 4
  else before[1] = 3
  if (variant === 3 && colour.length > 1) last[1] = 5
  return out
}

// ---- the lead ----

const RHYTHMS: Record<LeadRhythm, readonly (readonly [number, number])[][]> = {
  long: [[[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 8]]],
  busy: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]]],
  sync: [[[0, 3], [3, 3], [6, 2], [8, 3], [11, 3]], [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]]],
  sparse: [[[0, 8], [8, 8]], [[0, 6], [8, 4], [12, 4]]],
  dotted: [[[0, 3], [3, 1], [4, 3], [7, 1], [8, 4], [12, 4]], [[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]]],
}

interface Motif {
  /** [sixteenth, degree offset from the chord's root, length] */
  notes: readonly (readonly [number, number, number])[]
}

/** A motif: the rhythm, and for each note a step up or down the mode (mostly by one or two), starting on a note of the chord and ending on one. */
function motifOf(rhythm: LeadRhythm, r: () => number, which: number): Motif {
  const pats = RHYTHMS[rhythm]
  const pat = pats[which % pats.length]!
  let deg = [0, 2, 4][Math.floor(r() * 3)]!
  const notes = pat.map(([at, len], i) => {
    if (i > 0) {
      const step = [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)]!
      deg += step
      if (deg > 7) deg -= 2
      if (deg < -2) deg += 2
    }
    if (i === pat.length - 1) deg = [0, 2, 4][Math.floor(r() * 3)]! // it ends on a note of the chord
    return [at, deg, len] as const
  })
  return { notes }
}

// ---- the plan: everything that sounds, per bar and per sixteenth ----

export type Ev =
  | { t: 'kick' | 'snare' | 'clap' | 'rim' | 'hat' | 'ohat' | 'shake'; v: number }
  | { t: 'tom'; v: number; f: number }
  | { t: 'bass'; midi: number; len: number }
  | { t: 'lead'; midi: number; len: number; v: number }
  | { t: 'arp'; midi: number; v: number }
  | { t: 'pad'; midis: number[] }
  | { t: 'drone'; midis: number[] }
  | { t: 'extra'; kind: ExtraKind; midi: number }

/** The sections of a style: its own form, or (a plain loop) the groove and then the groove with the lead and the extras. */
export function formOf(s: Style): readonly Section[] {
  if (s.form) return s.form
  return [
    { prog: s.prog, lead: [null, null, 'hint', null], extras: false },
    { prog: s.prog2 ?? s.prog, lead: [0, 0, 1, 0], extras: true },
  ]
}
/** How long the loop of a style is, in sixteenths. */
export const stepsOf = (s: Style): number => formOf(s).length * 4 * 16
export type Plan = Ev[][][] // [bar][sixteenth] -> events

export function planOf(s: Style): Plan {
  const r = rng(s.seed)
  const form = formOf(s)
  const BARS = form.length * 4
  const plan: Plan = Array.from({ length: BARS }, () => Array.from({ length: 16 }, () => [] as Ev[]))
  const n = s.scale.length
  /** the MIDI note of degree `d` of the mode (any integer, it wraps round the octaves) above `base` */
  const pitch = (base: number, d: number): number => base + s.scale[((d % n) + n) % n]! + 12 * Math.floor(d / n)
  const kit = KITS[s.drums]
  const motifs = [motifOf(s.leadRhythm, r, 0), motifOf(s.leadRhythm, r, 1), motifOf(s.leadRhythmC ?? s.leadRhythm, rng(s.seed + 77), 2)] // (the third has a generator of its own: the first two are what they were)
  const colour = s.colour ?? []

  for (let bar = 0; bar < BARS; bar++) {
    const kind = bar % 4
    const section = form[Math.floor(bar / 4)]!
    const deg = section.prog[kind]!
    const layered = section.extras === true
    const drums = section.drums ?? 'full'
    const at = (step: number, e: Ev): void => void plan[bar]![step]!.push(e)

    // drums
    // (in a breakdown only the hats and the shaker go on; in a light section the kick is on the first and the third beat only)
    if (drums !== 'none') {
      for (const [st, v] of kit.k[kind]!) if (drums === 'full' || st === 0 || st === 8) at(st, { t: 'kick', v })
      for (const [st, v] of kit.s?.[kind] ?? []) at(st, { t: 'snare', v })
      for (const [st, v] of kit.c?.[kind] ?? []) at(st, { t: 'clap', v })
      for (const [st, v] of kit.rim?.[kind] ?? []) at(st, { t: 'rim', v })
      for (const [st, v, f] of kit.t?.[kind] ?? []) at(st, { t: 'tom', v, f })
    }
    for (let i = 0; i < 16; i++) {
      if (kit.hats === 'eighths' && i % 2 === 0) at(i, { t: 'hat', v: i % 4 === 0 ? 1 : 0.65 })
      else if (kit.hats === 'sixteenths') at(i, { t: 'hat', v: i % 4 === 0 ? 0.9 : i % 2 === 0 ? 0.6 : 0.35 })
      else if (kit.hats === 'offbeat') {
        if (i % 4 === 2) at(i, { t: 'ohat', v: 0.9 })
        else if (i % 2 === 1) at(i, { t: 'hat', v: 0.3 })
      }
      if (kit.shaker && i % 2 === 1) at(i, { t: 'shake', v: 0.7 })
    }

    // bass: the pattern, on the chord
    const rootMidi = pitch(s.root, deg)
    const tone = (which: number): number =>
      which === 0 ? rootMidi : which === 1 ? pitch(s.root, deg + 4) : which === 2 ? rootMidi + 12 : which === 3 ? pitch(s.root, deg + 2) : which === 4 ? rootMidi + (colour[0] ?? 1) : rootMidi + (colour[1] ?? 6)
    for (const [st, which, len] of section.bass === false ? [] : bassVariant(BASS_PATTERNS[s.bassPattern], kind, colour)) {
      if (bar === BARS - 1 && st >= 14) continue // the loop falls back onto the first beat clean
      at(st, { t: 'bass', midi: tone(which), len })
    }

    // pad: the chord, once a bar
    if (s.pad && section.pad !== false) at(0, { t: 'pad', midis: [pitch(s.leadRoot - 12, deg), pitch(s.leadRoot - 12, deg + 2), pitch(s.leadRoot - 12, deg + 4)] })

    // arpeggio: the chord's notes, sixteenth by sixteenth
    if (s.arp && section.arp !== false) {
      const tones = [pitch(s.leadRoot, deg), pitch(s.leadRoot, deg + 2), pitch(s.leadRoot, deg + 4), pitch(s.leadRoot, deg + 7)]
      const shape = [0, 1, 2, 3, 2, 1, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2]
      for (let i = 0; i < 16; i++) at(i, { t: 'arp', midi: tones[shape[i]!]!, v: i % 4 === 0 ? 1 : 0.65 })
    }

    // lead: the motif the section gives this bar (a hint of the first one is the first half of it, quietly)
    const pick = section.lead[kind] ?? null
    if (pick !== null) {
      const m = motifs[pick === 'hint' ? 0 : pick]!
      for (const [st, d, len] of m.notes) {
        if (pick === 'hint' && st >= 8) continue
        at(st, { t: 'lead', midi: pitch(s.leadRoot, deg + d + (section.lift ?? 0)), len, v: pick === 'hint' ? 0.6 : (section.leadV ?? 1) })
      }
    }

    // drone: two notes, every other bar of the second half
    if (s.drone && layered && bar % 2 === 0) at(0, { t: 'drone', midis: s.drone.map((x) => s.root + 12 + x) })

    // a riser into the next section, when the section asks for one
    if (section.riser && kind === 3 && !s.extras.includes('riser')) at(8, { t: 'extra', kind: 'riser', midi: 0 })

    // extras
    for (const kindOf of s.extras) {
      if (kindOf === 'clang' && layered) {
        at(6, { t: 'extra', kind: kindOf, midi: 410 })
        at(14, { t: 'extra', kind: kindOf, midi: 530 })
      } else if (kindOf === 'anvil') {
        at(4, { t: 'extra', kind: kindOf, midi: 330 })
        at(12, { t: 'extra', kind: kindOf, midi: 330 })
      } else if (kindOf === 'gong' && kind === 0) at(0, { t: 'extra', kind: kindOf, midi: s.root + 24 })
      else if (kindOf === 'siren' && bar % 4 === 1) at(0, { t: 'extra', kind: kindOf, midi: 0 })
      else if (kindOf === 'riser' && bar === BARS - 1) at(8, { t: 'extra', kind: kindOf, midi: 0 })
      else if (kindOf === 'stab' && kind === 3) at(10, { t: 'extra', kind: kindOf, midi: pitch(s.leadRoot + 12, deg) })
      else if (kindOf === 'tick' && layered) for (let i = 1; i < 16; i += 2) at(i, { t: 'extra', kind: kindOf, midi: 0 })
      else if (kindOf === 'sparkle' && layered) {
        for (let i = 0; i < 16; i++) {
          if (r() < 0.18) at(i, { t: 'extra', kind: kindOf, midi: pitch(s.leadRoot + 24, Math.floor(r() * 7)) })
        }
      } else if (kindOf === 'heartbeat') {
        at(0, { t: 'extra', kind: kindOf, midi: 0 })
        at(3, { t: 'extra', kind: kindOf, midi: 0 })
      } else if (kindOf === 'taikoRoll' && kind === 3) {
        for (const st of [12, 13, 14, 15]) at(st, { t: 'extra', kind: kindOf, midi: 70 + (st - 12) * 4 })
      }
    }
  }
  return plan
}

const plans = new Map<Style, Plan>()
const planFor = (s: Style): Plan => {
  let p = plans.get(s)
  if (!p) {
    p = planOf(s)
    plans.set(s, p)
  }
  return p
}

/** Writes the sixteenth number `step` (counted from the start of the loop, any whole number) of a style into the context, to sound at `at`. */
export function scheduleStyled(style: Style, c: Ctx, bus: Bus, step: number, at: number, mark?: Mark): void {
  const s = step % stepsOf(style)
  const bar = Math.floor(s / 16)
  const i = s % 16
  const stepS = 60 / style.bpm / 4
  const t = at + (i % 2 === 1 ? stepS * style.swing : 0)
  for (const e of planFor(style)[bar]![i]!) {
    switch (e.t) {
      case 'kick':
        kickVoice(c, bus.dry, t, e.v, style.kick)
        if (e.v === 1) mark?.('kick', t)
        break
      case 'snare':
        snareVoice(c, bus.dry, t, e.v, style.snare)
        if (e.v === 1) mark?.('snare', t)
        break
      case 'clap':
        snareVoice(c, bus.dry, t, e.v, 'clap')
        if (e.v >= 0.8) mark?.('snare', t)
        break
      case 'rim':
        snareVoice(c, bus.dry, t, e.v, 'rim')
        break
      case 'tom':
        tomVoice(c, bus.dry, t, e.v, e.f)
        break
      case 'hat':
        hatVoice(c, bus.dry, t, e.v, false, style.hat)
        break
      case 'ohat':
        hatVoice(c, bus.dry, t, e.v, true, style.hat)
        break
      case 'shake':
        hatVoice(c, bus.dry, t, e.v, false, 'shaker')
        break
      case 'bass':
        bassVoice(c, bus.dry, style.bass, e.midi, t, e.len * stepS * 0.9, 0.17)
        break
      case 'lead':
        leadVoice(c, bus.dry, bus.echo, style.lead, e.midi, t, e.len * stepS * 0.92, 0.22 * e.v)
        break
      case 'arp':
        leadVoice(c, bus.dry, bus.echo, style.arp === 'bell' ? 'bell' : style.arp === 'koto' ? 'koto' : style.arp === 'pluck' ? 'saw' : 'chip', e.midi, t, stepS * 0.8, 0.08 * e.v)
        break
      case 'pad':
        padVoice(c, bus.dry, style.pad!, e.midis, t, 16 * stepS, 0.07)
        break
      case 'drone':
        for (const m of e.midis) note(c, bus.dry, { type: 'sawtooth', freq: hz(m), at: t, dur: 32 * stepS, gain: 0.016, cutoff: 650, attack: 0.5, release: 0.5, detune: m % 2 ? 8 : -8 })
        break
      case 'extra':
        extra(style, e.kind, e.midi, c, bus, t, stepS)
        break
    }
  }
}

function extra(style: Style, kind: ExtraKind, midi: number, c: Ctx, bus: Bus, t: number, stepS: number): void {
  switch (kind) {
    case 'clang':
      clang(c, bus.dry, t, midi, 0.06)
      clang(c, bus.echo, t, midi, 0.05)
      break
    case 'anvil':
      clang(c, bus.dry, t, midi, 0.09, 0.4)
      clang(c, bus.echo, t, midi, 0.05, 0.4)
      break
    case 'gong':
      gong(c, bus.dry, t, 0.2, hz(midi))
      break
    case 'siren':
      siren(c, bus.dry, t, 16 * stepS, 0.025)
      break
    case 'riser':
      riser(c, bus.dry, t, 8 * stepS, 0.14)
      break
    case 'stab':
      for (const d of [0, 3, 7]) note(c, bus.dry, { type: 'sawtooth', freq: hz(midi + d), at: t, dur: stepS * 1.6, gain: 0.05, cutoff: 2600, from: 6000, release: 0.06 })
      break
    case 'tick':
      hit(c, bus.dry, t, { type: 'bandpass', freq: 4600, dur: 0.02, gain: 0.07 })
      break
    case 'sparkle':
      leadVoice(c, bus.dry, bus.echo, 'bell', midi, t, stepS * 2, 0.06)
      break
    case 'heartbeat':
      kickVoice(c, bus.dry, t, 0.9, 'sub')
      break
    case 'taikoRoll':
      tomVoice(c, bus.dry, t, 0.9, midi)
      break
  }
  void style
}

// ---- the mix ----

let impulse: AudioBuffer | null = null
/** The room of the reverb: noise that dies away (a little over two seconds), the same every time. */
function room(c: Ctx): AudioBuffer {
  if (!impulse || impulse.sampleRate !== c.sampleRate) {
    const len = Math.floor(c.sampleRate * 2.2)
    impulse = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch)
      let seed = 777 + ch * 31
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0
        d[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / len) ** 3
      }
    }
  }
  return impulse
}

/** The graph a style plays through: an echo (dotted eighth) and a reverb for the parts sent to `echo`, a compressor, and the saturation (a clip, and a crushed copy beside it). */
export function makeStyleBus(style: Style, c: Ctx, master: AudioNode): Bus {
  const dry = c.createGain()
  const echo = c.createGain()
  const delay = c.createDelay(1)
  const feedback = c.createGain()
  const dark = c.createBiquadFilter()
  const wet = c.createGain()
  const verb = c.createConvolver()
  const verbGain = c.createGain()
  const comp = c.createDynamicsCompressor()
  const mix = c.createGain()
  const out = c.createGain()
  delay.delayTime.value = (60 / style.bpm / 4) * 3
  feedback.gain.value = 0.2 + style.echo * 0.3
  dark.type = 'lowpass'
  dark.frequency.value = 2600
  wet.gain.value = 0.3 + style.echo * 0.8
  verb.buffer = room(c)
  verbGain.gain.value = style.reverb
  comp.threshold.value = -14
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.14
  echo.connect(delay)
  delay.connect(dark).connect(feedback).connect(delay)
  dark.connect(wet).connect(comp)
  echo.connect(verb)
  dry.connect(verb)
  verb.connect(verbGain).connect(comp)
  dry.connect(comp)
  comp.connect(mix)
  if (style.drive > 0) {
    const clip = c.createWaveShaper()
    const clipGain = c.createGain()
    clip.curve = crushCurve(1 + style.drive)
    clipGain.gain.value = 0.85
    mix.connect(clip).connect(clipGain).connect(out)
  } else mix.connect(out)
  if (style.crush > 0) {
    const crush = c.createWaveShaper()
    const high = c.createBiquadFilter()
    const crushGain = c.createGain()
    crush.curve = crushCurve(3, style.crush)
    high.type = 'highpass'
    high.frequency.value = 350
    crushGain.gain.value = 0.2
    mix.connect(crush).connect(high).connect(crushGain).connect(out)
  }
  out.connect(master)
  return { dry, echo }
}
