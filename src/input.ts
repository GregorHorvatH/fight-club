/**
 * Keyboard. A player's nine keys are laid out like the screen, left to right: the figure for the GUARD, the three buttons, the
 * figure for the STRIKE; and top to bottom: the head, the body, the legs (for the buttons: punch, kick, fight).
 *
 *   Player 1 (left hand)                 Player 2 (right hand, two-player mode)
 *            guard  buttons  strike               guard  buttons  strike
 *     top      Q      W        E             top    I      O        P       head  /  punch
 *     middle   A      S        D             middle J      K        L       body  /  kick
 *     bottom   Z      X        C             bottom ,      .        /       legs  /  fight
 *
 * Between two people they choose one after the other (the left fighter first): only the keys of the one whose turn it is do anything.
 * Enter and Space confirm for whoever is choosing. In the main menu: up / down (or W / S) move the cursor, Enter chooses. On the setup
 * screen: 1 2 3 = difficulty (arcade), up / down + Enter = Select fighter or Back (the end screen: fight again or back), on the selection screen the arrows (or W A S D) move over the tiles and Enter chooses, B = the next arena, Esc = back to the menu (also from the about and the end screens).
 * In a fight Esc pauses (then up / down and Enter choose: Continue, or Reset = the main menu; Esc continues). Anywhere: V = 2D / 3D, M = mute. Auto-repeat is ignored.
 */
import { turnOf, useGame } from './state/game'
import { nextArena, useArenas } from './state/arenas'
import { useMenu } from './state/menu'
import { useSettings } from './state/settings'
import type { Difficulty, Side, Weapon, Zone } from './sim'

/** What a key does. */
interface Bind {
  side: Side
  kind: 'guard' | 'strike' | 'weapon' | 'go'
  /** the zone to guard or to strike */
  zone?: Zone
  /** the weapon to strike with */
  weapon?: Weapon
}

const ZONE_ORDER: readonly Zone[] = ['head', 'body', 'legs']

/** The three buttons between the figures, top to bottom. */
export type Button = 'punch' | 'kick' | 'fight'
export const BUTTONS: readonly Button[] = ['punch', 'kick', 'fight']

type Column = readonly [string, string, string]
/** The key codes of a player: the guard column, the button column, the strike column; each from the top to the bottom. */
const GRID: Record<Side, readonly [Column, Column, Column]> = {
  player: [['KeyQ', 'KeyA', 'KeyZ'], ['KeyW', 'KeyS', 'KeyX'], ['KeyE', 'KeyD', 'KeyC']],
  enemy: [['KeyI', 'KeyJ', 'Comma'], ['KeyO', 'KeyK', 'Period'], ['KeyP', 'KeyL', 'Slash']],
}

/** The key that guards / strikes this zone. */
export const zoneCode = (side: Side, what: 'guard' | 'strike', zone: Zone): string => GRID[side][what === 'guard' ? 0 : 2][ZONE_ORDER.indexOf(zone)]!
/** The key of one of the three buttons. */
export const buttonCode = (side: Side, button: Button): string => GRID[side][1][BUTTONS.indexOf(button)]!

function keymap(side: Side): Record<string, Bind> {
  const m: Record<string, Bind> = {}
  for (const zone of ZONE_ORDER) {
    m[zoneCode(side, 'guard', zone)] = { side, kind: 'guard', zone }
    m[zoneCode(side, 'strike', zone)] = { side, kind: 'strike', zone }
  }
  m[buttonCode(side, 'punch')] = { side, kind: 'weapon', weapon: 'hand' }
  m[buttonCode(side, 'kick')] = { side, kind: 'weapon', weapon: 'foot' }
  m[buttonCode(side, 'fight')] = { side, kind: 'go' }
  return m
}

export const KEYS: Record<Side, Record<string, Bind>> = { player: keymap('player'), enemy: keymap('enemy') }
export const LOCK_KEY: Record<Side, string> = { player: 'Space', enemy: 'Enter' }
const LEVEL_KEYS: Record<string, Difficulty> = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' }

const SYMBOL: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Space: 'Space', Enter: 'Enter' }
export const keyLabel = (code: string): string => SYMBOL[code] ?? code.replace('Key', '')

/** The labels of the keys, for the badges on the buttons. They never change: a badge is where the key is. */
export const zoneKey = (side: Side, what: 'guard' | 'strike', zone: Zone): string => keyLabel(zoneCode(side, what, zone))
export const buttonKey = (side: Side, button: Button): string => keyLabel(buttonCode(side, button))

/** Handles one key press; returns whether it was used (so the page can stop it from scrolling). */
export function handleKey(code: string): boolean {
  const g = useGame.getState()
  const s = useSettings.getState()
  if (code === 'KeyM') return s.toggleMute(), true
  if (code === 'KeyV') return s.toggleView(), true
  if (code === 'KeyB' && g.phase === 'setup') return s.setArena(nextArena(useArenas.getState().list, s.arena)), true
  const go = code === 'Enter' || code === 'Space'
  if (g.paused) {
    // the pause window is a list like the main menu: up / down move the cursor, Enter / Space choose, Esc goes on; nothing else does anything
    if (code === 'Escape') return g.resume(), true
    if (code === 'ArrowUp' || code === 'KeyW') return g.movePause(-1), true
    if (code === 'ArrowDown' || code === 'KeyS') return g.movePause(1), true
    if (go) return g.choosePause(), true
    return false
  }
  if (code === 'Escape' && (g.phase === 'choose' || g.phase === 'reveal')) return g.pause(), true
  switch (g.phase) {
    case 'menu': {
      const m = useMenu.getState()
      if (code === 'ArrowUp' || code === 'KeyW') return m.move(-1), true
      if (code === 'ArrowDown' || code === 'KeyS') return m.move(1), true
      if (!go) return false
      m.choose()
      return true
    }
    case 'select':
      if (code === 'Escape') return g.backSelect(), true
      if (code === 'ArrowLeft' || code === 'KeyA') return g.moveSelect(-1, 0), true
      if (code === 'ArrowRight' || code === 'KeyD') return g.moveSelect(1, 0), true
      if (code === 'ArrowUp' || code === 'KeyW') return g.moveSelect(0, -1), true
      if (code === 'ArrowDown' || code === 'KeyS') return g.moveSelect(0, 1), true
      if (!go) return false
      g.chooseSelect()
      return true
    case 'about':
      if (code !== 'Escape' && !go) return false
      return g.toMenu(), true
    case 'setup':
    case 'over':
      if (code === 'Escape') return g.toMenu(), true
      if (g.phase === 'setup') {
        if (s.mode === 'solo' && code in LEVEL_KEYS) return s.setDifficulty(LEVEL_KEYS[code]!), true
        if (code === 'ArrowUp' || code === 'KeyW') return g.moveSetup(-1), true
        if (code === 'ArrowDown' || code === 'KeyS') return g.moveSetup(1), true
        if (!go) return false
        g.chooseSetup() // Start, or Back, whichever the cursor is on
        return true
      }
      if (code === 'ArrowUp' || code === 'KeyW') return g.moveEnd(-1), true
      if (code === 'ArrowDown' || code === 'KeyS') return g.moveEnd(1), true
      if (!go) return false
      g.chooseEnd() // the end screen: fight again, or the menu, whichever the cursor is on
      return true
    case 'reveal':
      if (!go) return false
      g.next()
      return true
    case 'choose': {
      // Enter and Space confirm for whoever is choosing: alone, the fight; between two people, the lock of the one whose turn it is
      if (go) {
        g.lock(turnOf(g.choice, g.mode))
        return true
      }
      for (const side of g.mode === 'solo' ? (['player'] as const) : (['player', 'enemy'] as const)) {
        const b = KEYS[side][code]
        if (!b) continue
        if (b.kind === 'guard') g.pickBlock(side, b.zone!)
        else if (b.kind === 'strike') g.pickAttack(side, b.zone!)
        else if (b.kind === 'weapon') g.setWeapon(side, b.weapon!)
        else g.lock(side)
        return true
      }
      return false
    }
  }
}

/** Binds the shortcuts; returns the function that unbinds them. */
export function bindKeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    if (handleKey(e.code)) e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
