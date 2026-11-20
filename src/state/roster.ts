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
}

export const FIGHTERS = [
  { id: 'james', name: 'James', model: 'models/james.glb', portrait: 'models/james.webp', height: 1.07, starter: true },
  { id: 'amy', name: 'Amy', model: 'models/amy.glb', portrait: 'models/amy.webp', height: 1, starter: true },
] as const satisfies readonly Fighter[]

type Roster = (typeof FIGHTERS)[number]
export type FighterId = Roster['id']

/** The tiles on the selection screen: the fighters, then "?" tiles for the ones that do not exist yet. */
export const SLOTS = 12
/** How many tiles in a row: 4 across (3 rows) in a wide window, 3 across (4 rows) in a tall one, where a phone is narrow. */
export const columnsFor = (portrait: boolean): number => (portrait ? 3 : 4)

export const fighterOf = (id: FighterId): Roster => FIGHTERS.find((f) => f.id === id)!

/** The fighter on a tile, or null for a "?". */
export const slotFighter = (slot: number): Roster | null => FIGHTERS[slot] ?? null

/** Can this one be chosen? (Alone against the enemy: any unlocked fighter; nothing is unlocked by playing yet.) */
export const isUnlocked = (f: Fighter): boolean => f.starter

/** Who the enemy is when you have chosen `id`: one of the other unlocked fighters. */
export function rivalOf(id: FighterId, rng: Rng): FighterId {
  const others = FIGHTERS.filter((f) => f.id !== id && isUnlocked(f))
  return others[Math.floor(rng() * others.length)]!.id
}
