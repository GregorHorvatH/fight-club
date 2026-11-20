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
/** Enemy AI: with this much health or less it does not kick (a kick is slow: the faster punch of the other one lands first). */
export const KICK_SAFE_HP = 24

/**
 * The super strike. Each of its two parts does this many times the damage of a punch, and every part that is not guarded is a critical
 * hit (CRIT_MULT times that): both landing is 2 * SUPER_MULT * CRIT_MULT = 2.4 punches, one landing 1.2. It is the slowest strike: it
 * lands after a kick.
 */
export const SUPER_MULT = 0.6
/** The super meter (0 to SUPER_METER): it fills by reading the opponent right ... */
export const SUPER_METER = 100
export const SUPER_LAND = 25 // a strike of yours lands
export const SUPER_GUARD = 25 // you guard the zone that is struck
/** ... and a little by being hurt, so that the one who is losing gets his chance. */
export const SUPER_HURT = 10
/** Enemy AI: how often it throws a super strike when it can (easy, normal, hard). */
export const AI_SUPER_CHANCE = { easy: 0.15, normal: 0.3, hard: 0.5 } as const

/**
 * Enemy AI, easy: how often it misreads the player on purpose. It guards a zone the player has rarely struck, and strikes a zone the
 * player has often guarded (the opposite of what a smart enemy does), otherwise it guesses. So an easy enemy is mostly wrong.
 */
export const EASY_MISREAD = 0.6
