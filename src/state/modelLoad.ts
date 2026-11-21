import { create } from 'zustand'

/**
 * What the 3D view tells the player about the character models: a model is a download of 1-4 MB, which on a phone with a slow
 * connection takes a while (the fighters are not there until it is done), and which can fail (then the primitive fighters stand in).
 */
interface Load {
  /** the models being downloaded now (the url of each) */
  waiting: readonly string[]
  /** bytes received and expected, per url (the expected is 0 when the server does not say) */
  bytes: Readonly<Record<string, { loaded: number; total: number }>>
  /** the models could not be loaded, even after trying again: the simple figures are shown */
  failed: boolean
  start: (url: string) => void
  done: (url: string) => void
  progress: (url: string, loaded: number, total: number) => void
  fail: () => void
  dismiss: () => void
}

export const useModelLoad = create<Load>((set) => ({
  waiting: [],
  bytes: {},
  failed: false,
  start: (url) => set((s) => (s.waiting.includes(url) ? s : { waiting: [...s.waiting, url] })),
  done: (url) => set((s) => ({ waiting: s.waiting.filter((u) => u !== url) })),
  progress: (url, loaded, total) => set((s) => ({ bytes: { ...s.bytes, [url]: { loaded, total } } })),
  fail: () => set({ failed: true }),
  dismiss: () => set({ failed: false }),
}))

/** The percent downloaded of the models that are being downloaded, or null when it is not known. */
export function percentOf(waiting: readonly string[], bytes: Load['bytes']): number | null {
  let loaded = 0
  let total = 0
  for (const url of waiting) {
    const b = bytes[url]
    if (!b || b.total <= 0) return null
    loaded += b.loaded
    total += b.total
  }
  return total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : null
}

