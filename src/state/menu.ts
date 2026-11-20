import { create } from 'zustand'
import { play } from '../audio/synth'
import { useGame } from './game'

/** The items of the main menu, top to bottom. */
export const MENU = ['tournament', 'arcade', 'versus', 'options', 'about'] as const
export type MenuItem = (typeof MENU)[number]

/** What an item is called on screen, and what it is. Tournament and options are not made yet: they only have a place in the menu. */
export const MENU_INFO: Record<MenuItem, { label: string; blurb: string; soon: boolean }> = {
  tournament: { label: 'Tournament', blurb: 'Beat a row of opponents, one after another. Every fighter you beat can be chosen in other fights.', soon: true },
  arcade: { label: 'Arcade Mode', blurb: 'One player against the enemy.', soon: false },
  versus: { label: 'VS Mode', blurb: 'Two players, one screen.', soon: false },
  options: { label: 'Options', blurb: 'Language and the rest of the settings.', soon: true },
  about: { label: 'About', blurb: 'How the game is played.', soon: false },
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
    if (item === 'arcade') useGame.getState().openSetup('solo')
    else if (item === 'versus') useGame.getState().openSetup('duo')
    else if (item === 'about') useGame.getState().openAbout()
    else set({ cursor: item, soon: item })
  },
}))
