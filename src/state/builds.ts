import { create } from 'zustand'
import { STANDARD, type Build } from '../ui/pose'

/**
 * The builds of the characters that are on the screen (measured from their models, see ModelFighter3D): a fighter needs its
 * opponent's too, to know how far its blow has to reach.
 */
interface Builds {
  builds: Readonly<Record<string, Build>>
  set: (b: Build) => void
}

export const useBuilds = create<Builds>((set, get) => ({
  builds: {},
  set: (b) => {
    if (get().builds[b.id] !== b) set({ builds: { ...get().builds, [b.id]: b } })
  },
}))

/** The build of a character, or the standard one while its model is not loaded (and for the primitive fighters). */
export const buildOf = (id: string): Build => useBuilds.getState().builds[id] ?? STANDARD
