import type { Rng } from '../sim'

/**
 * The fighters a player can choose. Each one is a character (an optimised Mixamo model, see scripts/prepare-models.mjs) with its
 * own height. `starter` fighters can be chosen from the beginning; the others are unlocked by winning the tournament (not made yet).
 */
export interface Fighter {
  id: string
  name: string
  /** the model, relative to the base url of the page */
  model: string
  /** the face on the tile of the selection screen (made by scripts/make-portraits.mjs; a letter stands in when it is missing) */
  portrait: string
  /** how tall the character is, relative to the driver skeleton (1 = as tall as the primitive fighter) */
  height: number
  starter: boolean
  /** parts of the model that are left out: the names (or the beginnings of the names) of its meshes, e.g. a weapon in its hand */
  hide?: readonly string[]
  /** how much its head may be enlarged to meet the fists (the aimed-at head is bigger than most real ones): 1 = not at all */
  headScale?: number
}

/** Nothing can be unlocked yet (the tournament that unlocks fighters is not made), so everybody can be chosen. Turn off when it is made. */
const ALL_UNLOCKED = true

const fighter = <I extends string>(id: I, name: string, height = 1, starter = false, extra: { hide?: readonly string[]; headScale?: number } = {}) => ({
  id, name, model: `models/${id}.glb`, portrait: `models/${id}.webp`, height, starter, hide: extra.hide ?? [], headScale: extra.headScale ?? 1.25,
})

/**
 * In the order of the tiles, and of the tournament: after the two starters the fighters get tougher (and cooler). `height`: how
 * tall the character looks next to the driver skeleton (1 = as tall as the primitive fighter), to be tuned by eye.
 */
export const FIGHTERS = [
  fighter('james', 'James', 1.07, true),
  fighter('amy', 'Amy', 1, true),
  fighter('pete', 'Pete'),
  fighter('brute', 'Brute', 1, false, { hide: ['BattleAxe'] }), // it comes with an axe in its hand: it fights with its fists
  fighter('lola', 'Lola'),
  fighter('kachujin', 'Kachujin'),
  fighter('swat', 'Swat'),
  fighter('akai', 'Akai'),
  fighter('astra', 'Astra'),
  fighter('maynard', 'Maynard'),
  fighter('paladin', 'Paladin'),
  fighter('dreyar', 'Dreyar'),
  fighter('alien_soldier', 'Alien Soldier'),
  fighter('exo_red', 'Exo Red', 1, false, { headScale: 1 }), // its head is in proportion already
  fighter('vanguard', 'Vanguard'),
] as const satisfies readonly Fighter[]

type Roster = (typeof FIGHTERS)[number]
export type FighterId = Roster['id']

/** The tiles on the selection screen: the fighters, then "?" tiles for the ones that do not exist yet. */
export const SLOTS = 15
/** How many tiles in a row: 5 across (3 rows) in a wide window, 3 across (5 rows) in a tall one, where a phone is narrow. */
export const columnsFor = (portrait: boolean): number => (portrait ? 3 : 5)

export const fighterOf = (id: FighterId): Roster => FIGHTERS.find((f) => f.id === id)!

/** The fighter on a tile, or null for a "?". */
export const slotFighter = (slot: number): Roster | null => FIGHTERS[slot] ?? null

/** Can this one be chosen? (Alone against the enemy: any unlocked fighter; nothing is unlocked by playing yet.) */
export const isUnlocked = (f: Fighter): boolean => ALL_UNLOCKED || f.starter

/** Who the enemy is when you have chosen `id`: one of the other unlocked fighters. */
export function rivalOf(id: FighterId, rng: Rng): FighterId {
  const others = FIGHTERS.filter((f) => f.id !== id && isUnlocked(f))
  return others[Math.floor(rng() * others.length)]!.id
}
