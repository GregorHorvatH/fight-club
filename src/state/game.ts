import { create } from 'zustand'
import { play, type Sound } from '../audio/synth'
import { IMPACT } from '../timing'
import { createMatch, playRound, resolveRound, type Match, type Move, type Rng, type RoundResult, type Side, type Weapon, type Zone } from '../sim'
import { useBest } from './best'
import { useSettings, type Mode } from './settings'

/** title -> choose -> reveal -> (choose -> reveal)* -> over */
export type Phase = 'title' | 'choose' | 'reveal' | 'over'

/** What one player has picked so far for the coming round. */
export interface Choice {
  attack: Zone | null
  weapon: Weapon
  block: Zone | null
  /** two-player mode: this player is ready (the round starts when both are) */
  locked: boolean
}

const blank = (): Choice => ({ attack: null, weapon: 'hand', block: null, locked: false })
const fresh = (): Record<Side, Choice> => ({ player: blank(), enemy: blank() })
export const complete = (c: Choice): boolean => c.attack !== null && c.block !== null

/**
 * Whose turn it is to choose. Alone it is always yours (the left fighter). Between two people they choose one after the other: the
 * left fighter first, and when that player has locked in, the right one. Whoever is not choosing does not see the other's picks.
 */
export const turnOf = (choice: Record<Side, Choice>, mode: Mode): Side => (mode === 'duo' && choice.player.locked ? 'enemy' : 'player')

interface Game {
  phase: Phase
  mode: Mode
  match: Match
  choice: Record<Side, Choice>
  /** the round being shown (phase 'reveal') */
  last: RoundResult | null
  /** counts the matches started (0 = none yet): the intro before the fight plays once for each */
  matchId: number
  /** the zone of a fighter the pointer is over (while choosing): it lights up as a preview of the pick */
  hover: { side: Side; zone: Zone } | null
  start: () => void
  /** `weapon` is given when the caller chooses the weapon together with the zone (the 3D poster, tests); otherwise it stays as it was */
  pickAttack: (side: Side, zone: Zone, weapon?: Weapon) => void
  /** what to strike with: a punch or a kick */
  setWeapon: (side: Side, weapon: Weapon) => void
  pickBlock: (side: Side, zone: Zone) => void
  /**
   * A tap on a zone of a fighter on the field, by whoever is choosing: on their own fighter it picks the zone to guard, on the other
   * fighter the zone to strike. (Alone you choose on the left fighter, James; the enemy is the right one, Amy.)
   */
  tap: (side: Side, zone: Zone) => void
  setHover: (h: { side: Side; zone: Zone } | null) => void
  /** alone: fight at once. Between two people: the player whose turn it is locks in, and the other one chooses; the round starts when the second has locked in */
  lock: (side: Side) => void
  /** leave the reveal: next round, or the end screen when the match is decided */
  next: () => void
  toTitle: () => void
}

let random: Rng = Math.random
/** Tests swap the dice. */
export const setRandomSource = (r: Rng): void => {
  random = r
}

export const useGame = create<Game>((set, get) => {
  /** a player can still change their mind during the choosing phase, unless they have locked in */
  const editable = (side: Side): boolean => {
    const { phase, choice, mode } = get()
    return phase === 'choose' && !choice[side].locked && (mode === 'solo' || side === turnOf(choice, mode))
  }
  const update = (side: Side, patch: Partial<Choice>) => set({ choice: { ...get().choice, [side]: { ...get().choice[side], ...patch } } })
  const moveOf = (c: Choice): Move => ({ attack: c.attack!, weapon: c.weapon, block: c.block! })

  function fight(): void {
    const { match, choice, mode } = get()
    const { match: next, result } =
      mode === 'solo'
        ? playRound(match, moveOf(choice.player), random)
        : resolveRound(match, { player: moveOf(choice.player), enemy: moveOf(choice.enemy) }, random)
    const { player, enemy } = result.strikes
    const kicked = player.weapon === 'foot' || enemy.weapon === 'foot'
    const kickLanded = (player.weapon === 'foot' && !player.blocked) || (enemy.weapon === 'foot' && !enemy.blocked)
    // the sounds are timed to the animation: the strikes connect IMPACT seconds into the replay
    const hit = IMPACT * 1000
    const at = (ms: number, sound: Sound) => void setTimeout(() => play(sound), ms)
    if (player.crit || enemy.crit) at(hit, 'crit')
    else if (kickLanded) at(hit - 90, 'kick') // the thud of the kick sound is 90 ms into it
    else if (!player.blocked || !enemy.blocked) at(hit, 'hit')
    if (kicked && !kickLanded) at(hit - 130, 'whoosh') // a kick that was guarded: you hear the swing, then the guard
    if (player.blocked || enemy.blocked) at(hit + 30, 'block')
    if (player.recoil || enemy.recoil) at(hit + 250, 'stumble')
    set({ phase: 'reveal', match: next, last: result, hover: null })
  }

  return {
    phase: 'title',
    mode: 'solo',
    match: createMatch('normal'),
    choice: fresh(),
    last: null,
    matchId: 0,
    hover: null,

    start: () => {
      const { mode, difficulty } = useSettings.getState()
      set({ phase: 'choose', mode, match: createMatch(difficulty), choice: fresh(), last: null, matchId: get().matchId + 1 })
    },

    pickAttack: (side, zone, weapon) => {
      if (!editable(side)) return
      play('select')
      update(side, weapon ? { attack: zone, weapon } : { attack: zone })
    },

    setWeapon: (side, weapon) => {
      if (!editable(side)) return
      play('select')
      update(side, { weapon })
    },

    pickBlock: (side, zone) => {
      if (!editable(side)) return
      play('select')
      update(side, { block: zone })
    },

    tap: (side, zone) => {
      const { phase, mode, choice } = get()
      if (phase !== 'choose') return
      const me = turnOf(choice, mode)
      if (side === me) get().pickBlock(me, zone)
      else get().pickAttack(me, zone)
    },

    setHover: (h) => {
      const { phase, hover } = get()
      const next = phase === 'choose' ? h : null
      if (next?.side !== hover?.side || next?.zone !== hover?.zone) set({ hover: next })
    },

    lock: (side) => {
      const { phase, mode, choice } = get()
      if (phase !== 'choose' || !complete(choice[side]) || choice[side].locked) return
      if (mode === 'solo') {
        if (side === 'player') fight()
        return
      }
      if (side !== turnOf(choice, mode)) return // between two people only the one whose turn it is can lock in
      update(side, { locked: true })
      play('select')
      if (side === 'enemy') fight() // the second player's lock is the start of the round
    },

    next: () => {
      const { phase, match, mode } = get()
      if (phase !== 'reveal') return
      if (match.status === 'fighting') {
        set({ phase: 'choose', choice: fresh(), last: null })
        return
      }
      if (mode === 'solo') useBest.getState().record(match) // a duel between two people is not your record
      play(mode === 'duo' || match.status === 'won' ? 'win' : 'lose')
      set({ phase: 'over' })
    },

    toTitle: () => set({ phase: 'title', last: null, choice: fresh() }),
  }
})
