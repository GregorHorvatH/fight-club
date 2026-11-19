/**
 * Keyboard. Player 1 (left hand): Q W E punch the head / body / legs, Z X C kick them, A S D guard, Space locks in.
 * Player 2 (right hand, two-player mode only): I O P punch, `,` `.` `/` kick, J K L guard, Enter locks in.
 * In solo mode Enter / Space both fight. 1 2 3 = difficulty and P = one / two players (title screen), V = 2D / 3D, B = the next
 * arena background, M = mute.
 * Auto-repeat is ignored.
 */
import { useGame } from './state/game'
import { nextArena, useArenas } from './state/arenas'
import { useSettings } from './state/settings'
import type { Difficulty, Side, Weapon, Zone } from './sim'

interface Bind {
  side: Side
  kind: 'attack' | 'block'
  zone: Zone
  weapon?: Weapon
}

const ZONE_ORDER: readonly Zone[] = ['head', 'body', 'legs']

/** Builds a table from three rows of three keys: punches, kicks, guards. */
function keymap(side: Side, punch: string[], kick: string[], guard: string[]): Record<string, Bind> {
  const m: Record<string, Bind> = {}
  ZONE_ORDER.forEach((zone, i) => {
    m[punch[i]!] = { side, kind: 'attack', zone, weapon: 'hand' }
    m[kick[i]!] = { side, kind: 'attack', zone, weapon: 'foot' }
    m[guard[i]!] = { side, kind: 'block', zone }
  })
  return m
}

export const KEYS: Record<Side, Record<string, Bind>> = {
  player: keymap('player', ['KeyQ', 'KeyW', 'KeyE'], ['KeyZ', 'KeyX', 'KeyC'], ['KeyA', 'KeyS', 'KeyD']),
  enemy: keymap('enemy', ['KeyI', 'KeyO', 'KeyP'], ['Comma', 'Period', 'Slash'], ['KeyJ', 'KeyK', 'KeyL']),
}
export const LOCK_KEY: Record<Side, string> = { player: 'Space', enemy: 'Enter' }
const LEVEL_KEYS: Record<string, Difficulty> = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' }

const SYMBOL: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Space: 'Space', Enter: 'Enter' }
export const keyLabel = (code: string): string => SYMBOL[code] ?? code.replace('Key', '')

/** The key that picks this zone (and this weapon) for this player, for the hint on the button. */
export function keyFor(side: Side, kind: 'attack' | 'block', zone: Zone, weapon: Weapon = 'hand'): string {
  const code = Object.keys(KEYS[side]).find((c) => {
    const b = KEYS[side][c]!
    return b.kind === kind && b.zone === zone && (kind === 'block' || b.weapon === weapon)
  })!
  return keyLabel(code)
}

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
      // solo: Enter and Space both fight. duo: Space locks player 1 in, Enter locks player 2 in.
      if (go) {
        if (g.mode === 'solo') g.lock('player')
        else g.lock(code === LOCK_KEY.player ? 'player' : 'enemy')
        return true
      }
      for (const side of g.mode === 'solo' ? (['player'] as const) : (['player', 'enemy'] as const)) {
        const b = KEYS[side][code]
        if (!b) continue
        if (b.kind === 'attack') g.pickAttack(side, b.zone, b.weapon)
        else g.pickBlock(side, b.zone)
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
