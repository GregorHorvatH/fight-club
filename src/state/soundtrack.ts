import { FIGHTERS, fighterOf, isUnlocked, type FighterId } from './roster'

/** The soundtrack of the fights: the one of the opponent ("auto"), or the one of a fighter chosen in the options. */
export type Soundtrack = 'auto' | FighterId

export const isSoundtrack = (v: unknown): v is Soundtrack => v === 'auto' || FIGHTERS.some((f) => f.id === v)

/** What can be chosen: "auto", and the soundtracks of the fighters that can be chosen (the others are still to be won). */
export const soundtrackChoices = (): Soundtrack[] => ['auto', ...FIGHTERS.filter(isUnlocked).map((f) => f.id)]

/** The choice `step` places on from `current` (round the list; a choice that is not on it any more counts as "auto"). */
export function stepSoundtrack(current: Soundtrack, step: number): Soundtrack {
  const all = soundtrackChoices()
  const i = Math.max(0, all.indexOf(current))
  return all[(i + step + all.length) % all.length]!
}

/** The soundtrack that plays in a fight: the chosen one, or (auto, or a fighter that is not there to choose) the one of the fighter whose it is. */
export function fightTrack(choice: Soundtrack, theme: FighterId): FighterId {
  return choice !== 'auto' && isUnlocked(fighterOf(choice)) ? choice : theme
}
