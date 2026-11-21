/**
 * The soundtrack of every fighter: a prompt written from how the fighter looks (the sort of text one would give to a music generator),
 * and the style that the composer (composer.ts) writes from it. James's soundtrack is the one of fightTheme.ts, written by hand.
 */
import type { FighterId } from '../state/roster'
import type { Style } from './composer'

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10]
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11]
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10]

/** The prompt of James's soundtrack (the one it was written from, as it was given). */
export const JAMES_PROMPT =
  'Dark industrial hip-hop breakbeat at 115 BPM, tense underground fight-club atmosphere, heavy distorted bassline, punchy chopped break drums with hard kick and cracking snare, abrasive metallic percussion and restrained dissonant machine textures. Keep the groove high-energy and tightly loopable, with a compact repeating main section, subtle layer variations every few bars, and a clean seamless ending that returns naturally to the opening. Raw lo-fi saturation, clipped edges, gritty narrow midrange balanced by a solid low end; instrumental only.'

/** The styles of everybody but James. */
export const STYLES: Record<Exclude<FighterId, 'james'>, Style> = {
  amy: {
    prompt:
      'Bright kawaii future-pop at 148 BPM for a cheerful teal-haired girl with bunny-ear tufts, bouncy plucked bass on the off-beats, sparkling bell arpeggios, a bubbly chiptune lead hopping through a major scale, crisp hand claps and shiny hi-hats, playful and sugary but with real energy, a one-minute arrangement with an intro groove, a verse, a big chorus, a quiet breakdown with a rising riser, a drop, a bridge, a final chorus and an outro that falls back onto the intro, instrumental only, loopable.',
    bpm: 148, root: 48, scale: MAJOR, prog: [0, 4, 5, 3], prog2: [0, 4, 5, 3], drums: 'four', kick: 'soft', snare: 'clap', hat: 'crisp', swing: 0,
    bass: 'pluck', bassPattern: 'offbeat', lead: 'chip', leadRhythm: 'busy', leadRoot: 72, arp: 'bell', pad: 'saw', extras: ['sparkle'],
    drive: 0, crush: 0, reverb: 0.18, echo: 0.3, seed: 1101, leadRhythmC: 'sync',
    level: 1.6,
    // 36 bars at 148 bpm, a minute: the groove and the first lead are the loop the soundtrack began as (the first two sections)
    form: [
      { prog: [0, 4, 5, 3], lead: [null, null, 'hint', null], extras: false }, // the intro groove
      { prog: [0, 4, 5, 3], lead: [0, 0, 1, 0], extras: true }, // the lead comes in
      { prog: [5, 3, 0, 4], lead: [2, 2, 2, 1], extras: true }, // the verse: other chords, a new tune
      { prog: [0, 4, 5, 3], lead: [0, 0, 0, 1], lift: 2, extras: true }, // the chorus: the first tune again, a third higher
      { prog: [3, 0, 4, 5], lead: [2, null, 2, null], leadV: 0.7, drums: 'none', bass: false, extras: false, riser: true }, // the breakdown: no drums or bass, a riser into the drop
      { prog: [0, 4, 5, 3], lead: [2, 2, 2, 1], lift: 2, extras: true }, // the drop
      { prog: [3, 4, 5, 2], lead: [1, 1, 2, null], drums: 'light', extras: false }, // the bridge: lighter, other chords
      { prog: [0, 4, 5, 3], lead: [0, 0, 0, 1], lift: 2, extras: true }, // the final chorus
      { prog: [0, 4, 5, 3], lead: [0, null, null, null], drums: 'light', extras: false }, // the outro: it thins out and the loop begins again
    ],
  },
  pete: {
    prompt:
      'Heavy industrial blues-rock stomp at 100 BPM for a construction worker in a hard hat and hi-vis vest, a distorted power-chord guitar riff in E minor, stomping kick and hand-clap backbeat, anvil and steel-girder clangs, jackhammer-like energy, dusty and sweaty, instrumental only, tightly loopable.',
    bpm: 100, root: 40, scale: MINOR, prog: [0, 0, 3, 4], prog2: [0, 0, 3, 4], drums: 'stomp', kick: 'punch', snare: 'clap', hat: 'dark', swing: 0,
    bass: 'dist', bassPattern: 'sync', lead: 'guitar', leadRhythm: 'sync', leadRoot: 52, arp: null, pad: null, extras: ['anvil', 'stab'],
    drive: 4, crush: 0, reverb: 0.08, echo: 0.1, seed: 1102,
    level: 0.5,
  },
  brute: {
    prompt:
      'Brutal tribal war-drum groove at 92 BPM for a shirtless tattooed bare-knuckle brawler with a handlebar moustache, huge taiko and floor toms, a deep sub bass that barely moves, low brass roars in Phrygian mode, gongs and a chanting stomp, raw and heavy, instrumental only, loopable.',
    bpm: 92, root: 43, scale: PHRYGIAN, prog: [0, 0, 1, 0], prog2: [0, 0, 1, 6], drums: 'tribal', kick: 'taiko', snare: 'rim', hat: 'shaker', swing: 0,
    bass: 'sub', bassPattern: 'half', lead: 'brass', leadRhythm: 'long', leadRoot: 55, arp: null, pad: 'strings', extras: ['taikoRoll', 'gong'],
    drive: 2, crush: 0, reverb: 0.15, echo: 0.15, seed: 1103,
    level: 0.72,
  },
  lola: {
    prompt:
      'Sultry retro electro-funk at 108 BPM for a red-haired femme fatale in glossy red leather, a slinky slap-style bass, soft swung drums with rim clicks, warm electric-piano licks in G Dorian, a smoky organ pad and glittering bell flourishes, cool and seductive, instrumental only, loopable.',
    bpm: 108, root: 43, scale: DORIAN, prog: [0, 3, 0, 3], prog2: [0, 3, 6, 4], drums: 'lounge', kick: 'soft', snare: 'rim', hat: 'crisp', swing: 0.14,
    bass: 'pluck', bassPattern: 'funk', lead: 'bell', leadRhythm: 'sync', leadRoot: 67, arp: null, pad: 'organ', extras: ['sparkle'],
    drive: 0, crush: 0, reverb: 0.2, echo: 0.25, seed: 1104,
    level: 2.28,
  },
  kachujin: {
    prompt:
      'Japanese-inspired martial arts groove at 98 BPM for a disciplined fighter with a topknot and a navy scarf, plucked koto lines in the Phrygian mode, a breathy shakuhachi-style flute, deep taiko hits and rim knocks, sparse and precise with a rolling taiko fill every four bars, instrumental only, loopable.',
    bpm: 98, root: 38, scale: PHRYGIAN, prog: [0, 1, 0, 6], prog2: [0, 1, 0, 6], drums: 'tribal', kick: 'taiko', snare: 'rim', hat: 'shaker', swing: 0,
    bass: 'sub', bassPattern: 'sparse', lead: 'koto', leadRhythm: 'dotted', leadRoot: 62, arp: 'koto', pad: null, extras: ['gong', 'taikoRoll'],
    drive: 0, crush: 0, reverb: 0.22, echo: 0.2, seed: 1105,
    level: 1.47,
  },
  swat: {
    prompt:
      'Tense tactical techno-thriller at 138 BPM for an assault officer in black body armour and night-vision goggles, relentless staccato 16th-note synth bass, four-on-the-floor kick with clap, ticking machine percussion, alarm sirens and rising tension risers, cold and disciplined, instrumental only, tightly loopable.',
    bpm: 138, root: 50, scale: MINOR, prog: [0, 0, 5, 4], prog2: [0, 0, 5, 6], drums: 'four', kick: 'punch', snare: 'clap', hat: 'crisp', swing: 0,
    bass: 'pulse', bassPattern: 'pulse16', lead: 'saw', leadRhythm: 'sync', leadRoot: 62, arp: 'pluck', pad: null, extras: ['siren', 'tick', 'riser'],
    drive: 2, crush: 0, reverb: 0.1, echo: 0.2, seed: 1106,
    level: 0.67,
  },
  akai: {
    prompt:
      'Stealthy dark folk trip-hop at 92 BPM for a hooded green archer in a night forest, a soft breakbeat with rim clicks, a deep sparse sub bass, a breathy flute melody in D Dorian, plucked harp-like arpeggios, bowed strings and wide echoing space, mysterious and patient, instrumental only, loopable.',
    bpm: 92, root: 38, scale: DORIAN, prog: [0, 0, 3, 6], prog2: [0, 5, 3, 6], drums: 'half', kick: 'soft', snare: 'rim', hat: 'dark', swing: 0.08,
    bass: 'sub', bassPattern: 'sparse', lead: 'flute', leadRhythm: 'sparse', leadRoot: 67, arp: 'koto', pad: 'strings', extras: ['sparkle'],
    drive: 0, crush: 0, reverb: 0.35, echo: 0.35, seed: 1107,
    level: 1.66,
  },
  astra: {
    prompt:
      'Cosmic cinematic synth-pop at 124 BPM for a bald astronaut in a white pressure suit, shimmering bell arpeggios in F Lydian, a pumping off-beat pluck bass, lush string pads, a soaring bell lead, sparkles like stars and a long riser, weightless and heroic, instrumental only, loopable.',
    bpm: 124, root: 41, scale: LYDIAN, prog: [0, 1, 0, 4], prog2: [0, 1, 4, 0], drums: 'four', kick: 'soft', snare: 'clap', hat: 'crisp', swing: 0,
    bass: 'pluck', bassPattern: 'offbeat', lead: 'bell', leadRhythm: 'long', leadRoot: 77, arp: 'bell', pad: 'strings', extras: ['sparkle', 'riser'],
    drive: 0, crush: 0, reverb: 0.4, echo: 0.4, seed: 1108,
    level: 1.93,
  },
  maynard: {
    prompt:
      'Horror doom industrial at 72 BPM for a flayed, skinless creature of rotting flesh, a grinding detuned reese bass, slow half-time drums with a gated snare and heartbeat sub kicks, a ghostly whispering choir in Locrian mode, grinding dissonant drones, bitcrushed and decaying, instrumental only, loopable.',
    bpm: 72, root: 36, scale: LOCRIAN, prog: [0, 1, 0, 4], prog2: [0, 1, 0, 4], drums: 'half', kick: 'sub', snare: 'gate', hat: 'dark', swing: 0,
    bass: 'reese', bassPattern: 'half', colour: [1, 6], lead: 'choir', leadRhythm: 'sparse', leadRoot: 60, arp: null, pad: 'choir', drone: [0, 1, 6], extras: ['heartbeat', 'riser'],
    drive: 3, crush: 14, reverb: 0.35, echo: 0.2, seed: 1109,
    level: 0.77,
  },
  paladin: {
    prompt:
      'Epic gothic orchestral metal at 108 BPM for a knight in black full plate armour, a galloping low string ostinato, snapping military snare marches and thundering taiko, heroic brass melody in D harmonic minor, a mighty choir pad, cathedral reverb and a tolling gong, solemn and unstoppable, instrumental only, loopable.',
    bpm: 108, root: 50, scale: HARMONIC_MINOR, prog: [0, 5, 3, 4], prog2: [0, 5, 3, 4], drums: 'march', kick: 'taiko', snare: 'crack', hat: 'dark', swing: 0,
    bass: 'pulse', bassPattern: 'gallop', lead: 'brass', leadRhythm: 'dotted', leadRoot: 62, arp: null, pad: 'choir', extras: ['gong', 'stab'],
    drive: 0, crush: 0, reverb: 0.35, echo: 0.15, seed: 1110,
    level: 1.4,
  },
  dreyar: {
    prompt:
      'Dark gothic synth villain theme at 96 BPM for a silver-haired warlord in spiked black armour, a pounding gated-snare rock beat, a menacing driving synth bass in E harmonic minor, a pipe-organ melody and organ pad, grinding metal clangs and tolling bells, cold and commanding, instrumental only, loopable.',
    bpm: 96, root: 40, scale: HARMONIC_MINOR, prog: [0, 0, 5, 4], prog2: [0, 3, 5, 4], drums: 'rock', kick: 'punch', snare: 'gate', hat: 'dark', swing: 0,
    bass: 'pulse', bassPattern: 'root8', colour: [1, 6], lead: 'organ', leadRhythm: 'dotted', leadRoot: 64, arp: 'pluck', pad: 'organ', drone: [0, 6], extras: ['clang', 'gong'],
    drive: 2, crush: 0, reverb: 0.3, echo: 0.2, seed: 1111,
    level: 0.64,
  },
  alien_soldier: {
    prompt:
      'Neon cyber synthwave at 128 BPM for a black-suited alien soldier with glowing orange circuit lines, a rolling 8th-note synth bass, four-on-the-floor kick with a gated snare, sawtooth arpeggios in D minor, a wide detuned lead, shimmering pads and rising sweeps, sleek and electric, instrumental only, loopable.',
    bpm: 128, root: 43, scale: MINOR, prog: [0, 0, 5, 6], prog2: [0, 3, 5, 6], drums: 'four', kick: 'punch', snare: 'gate', hat: 'crisp', swing: 0,
    bass: 'pulse', bassPattern: 'root8', lead: 'saw', leadRhythm: 'long', leadRoot: 67, arp: 'pluck', pad: 'saw', extras: ['riser', 'tick'],
    drive: 1, crush: 0, reverb: 0.2, echo: 0.3, seed: 1112,
    level: 0.84,
  },
  exo_red: {
    prompt:
      'Heroic high-energy drum and bass at 174 BPM for a masked hero in red-and-blue armour, a growling reese bass, fast two-step breakbeats with crisp ghost snares, soaring saw leads in E minor, string pads and stabs, rising risers before the drop, fast and triumphant, instrumental only, loopable.',
    bpm: 174, root: 40, scale: MINOR, prog: [0, 0, 5, 6], prog2: [0, 3, 5, 6], drums: 'dnb', kick: 'punch', snare: 'crack', hat: 'crisp', swing: 0,
    bass: 'reese', bassPattern: 'half', lead: 'saw', leadRhythm: 'busy', leadRoot: 64, arp: null, pad: 'strings', extras: ['riser', 'stab'],
    drive: 2, crush: 0, reverb: 0.15, echo: 0.25, seed: 1113,
    level: 0.84,
  },
  vanguard: {
    prompt:
      'Colossal desert siege-war soundtrack at 88 BPM for a gold-armoured juggernaut in a horned helm, massive taiko and war drums in half-time, a deep rumbling sub bass, doom horns playing a Phrygian-dominant melody, droning strings, huge gongs and a long rolling fill every four bars, vast and crushing, instrumental only, loopable.',
    bpm: 88, root: 43, scale: PHRYGIAN_DOMINANT, prog: [0, 0, 1, 0], prog2: [0, 0, 1, 6], drums: 'epic', kick: 'taiko', snare: 'gate', hat: 'dark', swing: 0,
    bass: 'sub', bassPattern: 'half', lead: 'brass', leadRhythm: 'long', leadRoot: 55, arp: null, pad: 'strings', drone: [0, 7], extras: ['gong', 'taikoRoll', 'riser'],
    drive: 1, crush: 0, reverb: 0.4, echo: 0.15, seed: 1114,
    level: 0.92,
  },
}
