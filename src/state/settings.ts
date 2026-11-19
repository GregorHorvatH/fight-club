import { create } from 'zustand'
import { DIFFICULTIES, type Difficulty } from '../sim'

export type Mode = 'solo' | 'duo'
export type View = '2d' | '3d'

interface Settings {
  muted: boolean
  difficulty: Difficulty
  /** solo: you against the enemy AI; duo: two players on one keyboard / screen */
  mode: Mode
  view: View
  /** the id of the arena picture, "none" for the plain arena; "" = nothing chosen yet (the first arena) */
  arena: string
  toggleMute: () => void
  setDifficulty: (d: Difficulty) => void
  setMode: (m: Mode) => void
  toggleView: () => void
  setArena: (id: string) => void
}

const KEY = 'fightclub.settings'

type Saved = Pick<Settings, 'muted' | 'difficulty' | 'mode' | 'view' | 'arena'>

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null
    return {
      muted: v?.muted === true,
      difficulty: DIFFICULTIES.find((d) => d === v?.difficulty) ?? 'normal',
      mode: v?.mode === 'duo' ? 'duo' : 'solo',
      view: v?.view === '3d' ? '3d' : '2d',
      arena: typeof v?.arena === 'string' ? v.arena : '',
    }
  } catch {
    return { muted: false, difficulty: 'normal', mode: 'solo', view: '2d', arena: '' } // storage can be blocked (private window)
  }
}

export const useSettings = create<Settings>((set, get) => {
  const change = (patch: Partial<Saved>) => {
    set(patch)
    const { muted, difficulty, mode, view, arena } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ muted, difficulty, mode, view, arena }))
    } catch {
      /* not remembered: fine */
    }
  }
  return {
    ...load(),
    toggleMute: () => change({ muted: !get().muted }),
    setDifficulty: (difficulty) => change({ difficulty }),
    setMode: (mode) => change({ mode }),
    toggleView: () => change({ view: get().view === '2d' ? '3d' : '2d' }),
    setArena: (arena) => change({ arena }),
  }
})
