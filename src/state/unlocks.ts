import { create } from 'zustand'

/**
 * The fighters that have been unlocked by beating them in the tournament (the starters are always there). Remembered in the browser.
 * Open the page with `?unlockall` to have everybody unlocked (for trying the fighters out; nothing is saved).
 */
interface Unlocks {
  unlocked: readonly string[]
  /** unlock a fighter; true when it was not unlocked before */
  unlock: (id: string) => boolean
  unlockAll: (ids: readonly string[]) => void
  reset: () => void
}

const KEY = 'fightclub.unlocked'

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const save = (ids: readonly string[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* not remembered: fine */
  }
}

export const useUnlocks = create<Unlocks>((set, get) => ({
  unlocked: load(),
  unlock: (id) => {
    if (get().unlocked.includes(id)) return false
    const next = [...get().unlocked, id]
    set({ unlocked: next })
    save(next)
    return true
  },
  unlockAll: (ids) => set({ unlocked: [...ids] }),
  reset: () => set({ unlocked: [] }),
}))

/** `?unlockall`: everybody is available (nothing is saved). */
export const UNLOCK_ALL_BY_URL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall')
