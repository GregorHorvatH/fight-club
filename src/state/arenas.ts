import { create } from 'zustand'

/** A background picture the player can fight in (made by scripts/prepare-arenas.mjs; it lists them in public/arenas/arenas.json). */
export interface Arena {
  id: string
  name: string
  /** the picture and its thumbnail, in public/arenas/ */
  file: string
  thumb: string
  /** how far down the frame the fighters stand, as a fraction of its height (0 = the usual place): a picture whose floor is near
   *  the back wall looks better with them a little nearer to us */
  stand: number
}

/** The setting for "no picture": the plain dark arena. */
export const NO_ARENA = 'none'

/**
 * The arena for a saved choice: "none" is the plain arena; an id that is in the list is that arena; anything else (nothing chosen
 * yet, or an arena that is no longer there) is the first one. With an empty list there is no picture.
 */
export function pickArena(list: readonly Arena[], id: string): Arena | null {
  if (id === NO_ARENA) return null
  return list.find((a) => a.id === id) ?? list[0] ?? null
}

/** The choice that comes after the current one: every arena in turn, then the plain one, then round again. */
export function nextArena(list: readonly Arena[], id: string): string {
  if (list.length === 0) return NO_ARENA
  const ids = [...list.map((a) => a.id), NO_ARENA]
  const current = pickArena(list, id)?.id ?? NO_ARENA
  return ids[(ids.indexOf(current) + 1) % ids.length]!
}

/** The most the fighters can be moved: up (negative) or down (positive), as a fraction of the frame's height. */
export const STAND_RANGE = [-0.2, 0.3] as const

/** The valid entries of what the list file contains (it is data from outside: check it). */
export function parseArenas(json: unknown): Arena[] {
  if (!Array.isArray(json)) return []
  const out: Arena[] = []
  for (const a of json as unknown[]) {
    if (typeof a !== 'object' || a === null) continue
    const o = a as Record<string, unknown>
    if (!['id', 'name', 'file', 'thumb'].every((k) => typeof o[k] === 'string')) continue
    const stand = typeof o.stand === 'number' && Number.isFinite(o.stand) ? Math.min(STAND_RANGE[1], Math.max(STAND_RANGE[0], o.stand)) : 0
    out.push({ id: o.id as string, name: o.name as string, file: o.file as string, thumb: o.thumb as string, stand })
  }
  return out
}

interface Arenas {
  list: Arena[]
  loaded: boolean
}

export const useArenas = create<Arenas>(() => ({ list: [], loaded: false }))

/** Reads the list of arenas once. Without the file (the pictures are not in the repository) there are none, and that is fine. */
export async function loadArenas(): Promise<void> {
  if (useArenas.getState().loaded) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}arenas/arenas.json`)
    if (!res.ok) throw new Error(String(res.status))
    useArenas.setState({ list: parseArenas(await res.json()), loaded: true })
  } catch {
    useArenas.setState({ list: [], loaded: true })
  }
}

/** The address of a picture of an arena. */
export const arenaUrl = (file: string): string => `${import.meta.env.BASE_URL}arenas/${file}`
