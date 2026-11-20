import { create } from 'zustand'

/** Where things are on the screen that other parts of the screen need to know about (pixels from the top of the arena). */
interface Layout {
  /** the top of the fighters' heads, when they stand in their guard */
  headsTop: number | null
  setHeadsTop: (y: number | null) => void
}

export const useLayout = create<Layout>((set, get) => ({
  headsTop: null,
  // a change of less than a pixel is not a change: the 3D view reports every frame
  setHeadsTop: (y) => {
    const now = get().headsTop
    if (y === now || (y !== null && now !== null && Math.abs(y - now) < 1)) return
    set({ headsTop: y === null ? null : Math.round(y) })
  },
}))

/** Where the hint goes: halfway between the bottom of the logs and the top of the heads (null while either is not known). */
export function hintMiddle(logsBottom: number | null, headsTop: number | null): number | null {
  if (logsBottom === null || headsTop === null || headsTop <= logsBottom) return null
  return Math.round((logsBottom + headsTop) / 2)
}
