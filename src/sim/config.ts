/** Rules of the duel. Tuned so a match lasts roughly 8-14 rounds. */
export const MAX_HP = 100

/** A landed strike rolls a base damage in [DAMAGE_MIN, DAMAGE_MAX]. */
export const DAMAGE_MIN = 8
export const DAMAGE_MAX = 14

/** A strike that is not guarded may be a critical hit. */
export const CRIT_CHANCE = 0.15
export const CRIT_MULT = 2

/** Every consecutive landed strike (before this one) adds this much damage, up to STREAK_CAP strikes. */
export const STREAK_BONUS = 2
export const STREAK_CAP = 4

/** A kick does this many times the damage of a punch ... */
export const KICK_MULT = 1.4
/** ... but a guarded kick costs the kicker this much health (a stumble). */
export const KICK_RECOIL = 7

/** Enemy AI: how often the hard AI trusts its prediction instead of guessing. */
export const HARD_CONFIDENCE = 0.8
/** Enemy AI: weight of older rounds when it studies the player's habits (1 = remembers everything equally). */
export const AI_MEMORY = 0.85
/** Enemy AI: the hard AI kicks only when it thinks the zone is open at least this often. */
export const HARD_KICK_THRESHOLD = 0.75
