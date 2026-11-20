export const ZONES = ['head', 'body', 'legs'] as const
export type Zone = (typeof ZONES)[number]

export type Side = 'player' | 'enemy'
export const opponent = (s: Side): Side => (s === 'player' ? 'enemy' : 'player')

/**
 * What the strike is thrown with. A kick hits harder, but a guarded kick makes the kicker stumble. The super strike hits two zones
 * at once (two the player chooses), so a guard can only cover one of them, and every part of it that is not guarded is a critical hit;
 * it is the slowest of all, and it needs the super meter to be full.
 */
export const WEAPONS = ['hand', 'foot', 'super'] as const
export type Weapon = (typeof WEAPONS)[number]

/** What one fighter commits to in a round: where to strike (and with what) and where to guard. */
export interface Move {
  attack: Zone
  weapon: Weapon
  block: Zone
  /** a super strike hits a second zone of the player's own choice (when not given, the one next to `attack`: see SECOND_ZONE) */
  attack2?: Zone
}

/** The zone a super strike hits as well as the one it is aimed at, when none was chosen: the next one down the body (and for the legs, the one above). */
export const SECOND_ZONE: Record<Zone, Zone> = { head: 'body', body: 'legs', legs: 'body' }

export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']
