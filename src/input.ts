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
 * Enter and Space confirm for whoever is choosing. On the start screen: 1 2 3 = difficulty,
 * P = one / two players, V = 2D / 3D, B = the next arena. Anywhere: V = 2D / 3D, M = mute. Auto-repeat is ignored.
 */
import { turnOf, useGame } from './state/game'
import { nextArena, useArenas } from './state/arenas'
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
  if (code === 'KeyB' && g.phase === 'title') return s.setArena(nextArena(useArenas.getState().list, s.arena)), true
  const go = code === 'Enter' || code === 'Space'
  switch (g.phase) {
    case 'title':
    case 'over':
      if (g.phase === 'title' && code in LEVEL_KEYS) return s.setDifficulty(LEVEL_KEYS[code]!), true
      if (g.phase === 'title' && code === 'KeyP') return s.setMode(s.mode === 'solo' ? 'duo' : 'solo'), true
      if (!go) return false
      g.start()
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
