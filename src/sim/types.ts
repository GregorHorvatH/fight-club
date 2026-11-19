export const ZONES = ['head', 'body', 'legs'] as const
export type Zone = (typeof ZONES)[number]

export type Side = 'player' | 'enemy'
export const opponent = (s: Side): Side => (s === 'player' ? 'enemy' : 'player')

/** What the strike is thrown with. A kick hits harder, but a guarded kick makes the kicker stumble. */
export const WEAPONS = ['hand', 'foot'] as const
export type Weapon = (typeof WEAPONS)[number]

/** What one fighter commits to in a round: where to strike (and with what) and where to guard. */
export interface Move {
  attack: Zone
  weapon: Weapon
  block: Zone
}

export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']
