import { create } from 'zustand'
import { play, type Sound } from '../audio/synth'
import { IMPACT } from '../timing'
import { createMatch, playRound, resolveRound, opponent, type Match, type Move, type Rng, type RoundResult, type Side, type Weapon, type Zone } from '../sim'
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

interface Game {
  phase: Phase
  mode: Mode
  match: Match
  choice: Record<Side, Choice>
  /** the round being shown (phase 'reveal') */
  last: RoundResult | null
  start: () => void
  /** `weapon` is given when the key itself says what to strike with (Q = punch the head, Z = kick the head) */
  pickAttack: (side: Side, zone: Zone, weapon?: Weapon) => void
  setWeapon: (side: Side, weapon: Weapon) => void
  pickBlock: (side: Side, zone: Zone) => void
  /** solo: fight at once. duo: lock this player in (again to take it back); the round starts when both are locked */
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
  const editable = (side: Side): boolean => get().phase === 'choose' && !get().choice[side].locked
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
    set({ phase: 'reveal', match: next, last: result })
  }

  return {
    phase: 'title',
    mode: 'solo',
    match: createMatch('normal'),
    choice: fresh(),
    last: null,

    start: () => {
      const { mode, difficulty } = useSettings.getState()
      set({ phase: 'choose', mode, match: createMatch(difficulty), choice: fresh(), last: null })
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

    lock: (side) => {
      const { phase, mode, choice } = get()
      if (phase !== 'choose') return
      if (mode === 'solo') {
        if (side === 'player' && complete(choice.player)) fight()
        return
      }
      const mine = choice[side]
      if (mine.locked) {
        // taking it back is possible only until the other player has locked in too (then the round has started anyway)
        update(side, { locked: false })
        play('select')
      } else if (complete(mine)) {
        update(side, { locked: true })
        play('select')
        if (get().choice[opponent(side)].locked) fight()
      }
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
