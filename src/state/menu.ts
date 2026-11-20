import { create } from 'zustand'
import { play } from '../audio/synth'
import { useGame } from './game'

/** The items of the main menu, top to bottom. */
export const MENU = ['tournament', 'arcade', 'versus', 'options', 'about'] as const
export type MenuItem = (typeof MENU)[number]

/** Which items are not made yet (they say so when chosen): none now. The texts are in the translations (`menu.<item>.label` and `.blurb`). */
export const MENU_INFO: Record<MenuItem, { soon: boolean }> = {
  tournament: { soon: false },
  arcade: { soon: false },
  versus: { soon: false },
  options: { soon: false },
  about: { soon: false },
}

interface Menu {
  /** the item the cursor is on */
  cursor: MenuItem
  /** an item that was chosen but is not made yet: the menu says so */
  soon: MenuItem | null
  /** move the cursor by `step` items (wraps around) */
  move: (step: number) => void
  point: (item: MenuItem) => void
  /** choose the item under the cursor, or `item` */
  choose: (item?: MenuItem) => void
}

export const useMenu = create<Menu>((set, get) => ({
  cursor: 'arcade',
  soon: null,

  move: (step) => {
    const i = MENU.indexOf(get().cursor)
    play('select')
    set({ cursor: MENU[(i + step + MENU.length) % MENU.length]!, soon: null })
  },

  point: (item) => {
    if (get().cursor !== item) set({ cursor: item, soon: null })
  },

  choose: (item = get().cursor) => {
    if (useGame.getState().phase !== 'menu') return
    play('select')
    if (item === 'tournament') useGame.getState().openTournament()
    else if (item === 'arcade') useGame.getState().openSetup('solo')
    else if (item === 'versus') useGame.getState().openSetup('duo')
    else if (item === 'about') useGame.getState().openAbout()
    else if (item === 'options') useGame.getState().openOptions()
    else set({ cursor: item, soon: item })
  },
}))
