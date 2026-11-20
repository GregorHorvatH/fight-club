import { create } from 'zustand'
import { DIFFICULTIES, type Difficulty } from '../sim'
import { detectLang, isLang, setLanguage, type Lang } from '../i18n'

export type Mode = 'solo' | 'duo'
export type View = '2d' | '3d'

interface Settings {
  muted: boolean
  difficulty: Difficulty
  /** solo: you against the enemy AI; duo: two players on one keyboard / screen */
  mode: Mode
  view: View
  /** the language of the interface */
  language: Lang
  /** the id of the arena picture, "none" for the plain arena; "" = nothing chosen yet (the first arena) */
  arena: string
  toggleMute: () => void
  setDifficulty: (d: Difficulty) => void
  setMode: (m: Mode) => void
  toggleView: () => void
  setView: (v: View) => void
  setLanguage: (l: Lang) => void
  setArena: (id: string) => void
}

const KEY = 'fightclub.settings'

type Saved = Pick<Settings, 'muted' | 'difficulty' | 'mode' | 'view' | 'arena' | 'language'>

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null
    return {
      muted: v?.muted === true,
      difficulty: DIFFICULTIES.find((d) => d === v?.difficulty) ?? 'normal',
      mode: v?.mode === 'duo' ? 'duo' : 'solo',
      view: v?.view === '3d' ? '3d' : '2d',
      arena: typeof v?.arena === 'string' ? v.arena : '',
      language: isLang(v?.language) ? v.language : detectLang(),
    }
  } catch {
    return { muted: false, difficulty: 'normal', mode: 'solo', view: '2d', arena: '', language: detectLang() } // storage can be blocked (private window)
  }
}

const initial = load()
setLanguage(initial.language) // the language of the interface is that of the settings from the start

export const useSettings = create<Settings>((set, get) => {
  const change = (patch: Partial<Saved>) => {
    set(patch)
    const { muted, difficulty, mode, view, arena, language } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ muted, difficulty, mode, view, arena, language }))
    } catch {
      /* not remembered: fine */
    }
  }
  return {
    ...initial,
    toggleMute: () => change({ muted: !get().muted }),
    setDifficulty: (difficulty) => change({ difficulty }),
    setMode: (mode) => change({ mode }),
    toggleView: () => change({ view: get().view === '2d' ? '3d' : '2d' }),
    setView: (view) => change({ view }),
    setLanguage: (language) => {
      setLanguage(language)
      change({ language })
    },
    setArena: (arena) => change({ arena }),
  }
})
