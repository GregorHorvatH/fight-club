import { create } from 'zustand'
import { play, type Sound } from '../audio/synth'
import { SUPER_GAP, timelineOf } from '../timing'
import { createMatch, playRound, resolveRound, superReady, type Match, type Move, type Rng, type RoundResult, type Side, type Weapon, type Zone } from '../sim'
import { useBest } from './best'
import { difficultyAt, ladderFor, type Tournament } from './tournament'
import { useUnlocks } from './unlocks'
import { fighterOf, isUnlocked, rivalOf, slotFighter, SLOTS, FIGHTERS, type FighterId } from './roster'
import { LANGUAGES } from '../i18n'
import { warmModel } from './modelFiles'
import { useSettings, type Mode } from './settings'

/** menu -> (about | setup -> select -> choose -> reveal -> (choose -> reveal)* -> over) and back to the menu */
export type Phase = 'menu' | 'about' | 'options' | 'setup' | 'select' | 'ladder' | 'leave' | 'choose' | 'reveal' | 'over'

/** The items of the pause window, top to bottom: go on, the round again (from its start), or leave the fight for the main menu. */
export const PAUSE_ITEMS = ['continue', 'again', 'controls', 'menu'] as const
export type PauseItem = (typeof PAUSE_ITEMS)[number]

/** The items under the settings of the setup screen, top to bottom. */
export const SETUP_ITEMS = ['select', 'back'] as const
export type SetupItem = (typeof SETUP_ITEMS)[number]

/** The items of the end screen, top to bottom: another fight, or the main menu. */
export const END_ITEMS = ['again', 'back'] as const
export type EndItem = (typeof END_ITEMS)[number]

/** What one player has picked so far for the coming round. */
export interface Choice {
  attack: Zone | null
  /** a super strike hits a second zone as well, of the player's own choice (null until chosen; unused for a punch and a kick) */
  attack2: Zone | null
  weapon: Weapon
  block: Zone | null
  /** two-player mode: this player is ready (the round starts when both are) */
  locked: boolean
}

const blank = (): Choice => ({ attack: null, attack2: null, weapon: 'hand', block: null, locked: false })
const fresh = (): Record<Side, Choice> => ({ player: blank(), enemy: blank() })
/**
 * The choices for the next round of a match: nothing is picked, but what each fighter strikes with is kept (a punch, a kick), so that
 * it does not have to be chosen again every round. A super strike is kept only while its meter is still full.
 */
export function nextRound(prev: Record<Side, Choice>, match: Match): Record<Side, Choice> {
  const keep = (side: Side): Choice => ({ ...blank(), weapon: prev[side].weapon === 'super' && !superReady(match, side) ? 'hand' : prev[side].weapon })
  return { player: keep('player'), enemy: keep('enemy') }
}
export const complete = (c: Choice): boolean => c.attack !== null && c.block !== null && (c.weapon !== 'super' || c.attack2 !== null)

/**
 * A tap (or a key) on a zone of the enemy, for a super strike, which hits two: it is chosen, or (when it is already) taken away again;
 * with two chosen already, the new one replaces the one that was chosen first.
 */
export function toggleZone(c: Pick<Choice, 'attack' | 'attack2'>, zone: Zone): Pick<Choice, 'attack' | 'attack2'> {
  if (c.attack === zone) return { attack: c.attack2, attack2: null }
  if (c.attack2 === zone) return { attack: c.attack, attack2: null }
  if (c.attack === null) return { attack: zone, attack2: null }
  if (c.attack2 === null) return { attack: c.attack, attack2: zone }
  return { attack: c.attack2, attack2: zone }
}

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
  /** the fight is paused: a window with Continue, Fight again and Back to main menu is up and nothing can be chosen */
  paused: boolean
  /** the match as it was before the round that is being replayed (what "Fight again" goes back to) */
  before: Match | null
  /** the round starts over: the picks are cleared, and a round that has been fought is taken back (its blows never happened) */
  restartRound: () => void
  /** counts the replays started over after a pause: it restarts the animations and the counting of the strikes */
  replay: number
  pause: () => void
  /** Continue: back to the choosing, or the replay of the round starts again from its beginning */
  resume: () => void
  /** the item of the pause window the cursor is on */
  pauseItem: PauseItem
  /** the pause window shows the layout of the keys instead of its list */
  pauseControls: boolean
  closeControls: () => void
  /** move the cursor of the pause window by `step` items (wraps around) */
  movePause: (step: number) => void
  pointPause: (item: PauseItem) => void
  /** choose the item under the cursor (or `item`): Continue, Fight again (the round starts over) or Back to main menu */
  choosePause: (item?: PauseItem) => void
  /** the main menu: leave whatever is on screen */
  toMenu: () => void
  /** from the menu to the setup of a game for one player (arcade) or two (versus) */
  openSetup: (mode: Mode) => void
  /** the setup is that of a tournament (no difficulty to choose: the enemies get cleverer by themselves) */
  inTournament: boolean
  /** a tournament in progress: the ladder of opponents, and the stage being fought */
  tournament: Tournament | null
  /** from the menu to the setup of a tournament */
  openTournament: () => void
  /** the ladder screen: the stage the highlight is moving from (null at the start of a tournament, when it just shows the first) */
  ladderFrom: number | null
  /** leave the ladder screen: the fight begins */
  startFromLadder: () => void
  /** the item of the setup screen the cursor is on */
  setupItem: SetupItem
  moveSetup: (step: number) => void
  pointSetup: (item: SetupItem) => void
  /** choose the item under the cursor (or `item`): go on to the choice of the fighter, or back to the menu */
  chooseSetup: (item?: SetupItem) => void
  /** who is who: the characters of the left fighter and the right one */
  fighters: Record<Side, FighterId>
  /** the selection screen: the tile the cursor is on (the tiles, then Back), and who is choosing (alone always the left one) */
  selectCursor: number
  selectFor: Side
  /** how many tiles there are in a row (the screen tells: it depends on the shape of the window) */
  selectColumns: number
  setSelectColumns: (n: number) => void
  /** from the setup to the choice of the fighter */
  openSelect: () => void
  /** move the cursor over the tiles (and Back below them); it wraps around */
  moveSelect: (dx: number, dy: number) => void
  pointSelect: (slot: number) => void
  /** choose the tile under the cursor (or `slot`). Alone it starts the fight; between two people the second choice does. */
  chooseSelect: (slot?: number) => void
  /** one step back: to the first player's choice, or to the setup */
  backSelect: () => void
  /** the item of the end screen the cursor is on */
  endItem: EndItem
  moveEnd: (step: number) => void
  pointEnd: (item: EndItem) => void
  /** choose the item under the cursor (or `item`): fight again, or back to the main menu */
  chooseEnd: (item?: EndItem) => void
  /** from the menu to the options (the language) */
  openOptions: () => void
  /** the item of the options the cursor is on: a language, or (the last) Back */
  optionsCursor: number
  moveOptions: (step: number) => void
  pointOptions: (i: number) => void
  /** choose the item under the cursor (or `i`): a language takes effect at once; Back leaves */
  chooseOptions: (i?: number) => void
  /** from the menu to the description of the game */
  openAbout: () => void
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
}

/** How long the fighters take to leave the arena when the player goes back to the main menu (see EXIT_S in pose.ts). */
export const LEAVE_MS = 2300

/** The sounds of a replay that are still to come: they stop when the replay is skipped. */
let pending: ReturnType<typeof setTimeout>[] = []
let leaving: ReturnType<typeof setTimeout> | null = null
const stopSounds = (): void => {
  pending.forEach(clearTimeout)
  pending = []
  if (leaving) clearTimeout(leaving) // anything new that begins cancels the leaving of the fighters
  leaving = null
}

/** Each strike of a round sounds at its own moment: the swing, the blow (or the guard), the stumble. The times are those of the replay. */
function scheduleSounds(result: RoundResult): void {
  stopSounds()
  const tl = timelineOf(result)
  const at = (ms: number, sound: Sound) => void pending.push(setTimeout(() => play(sound), Math.max(0, Math.round(ms))))
  for (const side of tl.order) {
    const s = result.strikes[side]!
    const hit = tl.hitAt[side]! * 1000
    if (s.weapon === 'super') {
      at(hit - 240, 'whoosh') // the way in
      // the two parts: each connects at its own moment, and is a blow (a big one) or a guard
      for (const [part, delay] of [[s, 0], [s.extra!, SUPER_GAP]] as const) {
        if (!part.blocked) at(hit + delay * 1000, 'super')
        else at(hit + delay * 1000 + 30, 'block')
      }
    } else if (s.crit) at(hit, 'crit')
    else if (!s.blocked) at(s.weapon === 'foot' ? hit - 90 : hit, s.weapon === 'foot' ? 'kick' : 'hit') // the thud of the kick sound is 90 ms into it
    if (s.blocked && s.weapon === 'foot') at(hit - 130, 'whoosh') // a guarded kick: you hear the swing, then the guard
    if (s.blocked && s.weapon !== 'super') at(hit + 30, 'block')
    if (s.recoil) at(hit + 250, 'stumble')
  }
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
    return phase === 'choose' && !get().paused && !choice[side].locked && (mode === 'solo' || side === turnOf(choice, mode))
  }
  const update = (side: Side, patch: Partial<Choice>) => set({ choice: { ...get().choice, [side]: { ...get().choice[side], ...patch } } })
  const moveOf = (c: Choice): Move => ({ attack: c.attack!, weapon: c.weapon, block: c.block!, ...(c.weapon === 'super' ? { attack2: c.attack2! } : {}) })

  function fight(): void {
    const { match, choice, mode } = get()
    const { match: next, result } =
      mode === 'solo'
        ? playRound(match, moveOf(choice.player), random)
        : resolveRound(match, { player: moveOf(choice.player), enemy: moveOf(choice.enemy) }, random)
    scheduleSounds(result)
    set({ phase: 'reveal', match: next, last: result, hover: null, before: match })
  }

  return {
    phase: 'menu',
    mode: 'solo',
    match: createMatch('normal'),
    choice: fresh(),
    last: null,
    matchId: 0,
    hover: null,
    paused: false,
    replay: 0,

    pause: () => {
      const { phase, paused } = get()
      if (paused || (phase !== 'choose' && phase !== 'reveal')) return
      stopSounds() // the sounds of the replay that are still to come
      set({ paused: true, pauseItem: 'continue', pauseControls: false, hover: null })
    },

    resume: () => {
      const { paused, phase, last, replay } = get()
      if (!paused) return
      if (phase === 'reveal' && last) {
        scheduleSounds(last)
        set({ paused: false, replay: replay + 1 })
      } else set({ paused: false })
    },

    pauseItem: 'continue',
    pauseControls: false,
    closeControls: () => set({ pauseControls: false }),

    movePause: (step) => {
      if (!get().paused) return
      const i = PAUSE_ITEMS.indexOf(get().pauseItem)
      play('select')
      set({ pauseItem: PAUSE_ITEMS[(i + step + PAUSE_ITEMS.length) % PAUSE_ITEMS.length]! })
    },

    pointPause: (item) => {
      if (get().paused && get().pauseItem !== item) set({ pauseItem: item })
    },

    choosePause: (item = get().pauseItem) => {
      if (!get().paused) return
      play('select')
      if (item === 'continue') get().resume()
      else if (item === 'again') get().restartRound()
      else if (item === 'controls') set({ pauseControls: true })
      else get().toMenu()
    },

    before: null,

    restartRound: () => {
      const { phase, before } = get()
      stopSounds()
      // fought already (the replay is on): back to the match as it was before the round; not yet: just the picks are cleared
      if (phase === 'reveal' && before) set({ phase: 'choose', match: before, choice: fresh(), last: null, hover: null, paused: false, before: null })
      else if (phase === 'choose') set({ choice: fresh(), hover: null, paused: false })
    },

    toMenu: () => {
      stopSounds()
      const { phase } = get()
      const toMenu = () => set({ phase: 'menu', paused: false, inTournament: false, tournament: null, last: null, choice: fresh() })
      // the fighters who are on the arena leave it (retreating, out of the frame) before the menu is shown
      if (phase === 'choose' || phase === 'reveal' || phase === 'over') {
        set({ phase: 'leave', paused: false, hover: null })
        leaving = setTimeout(() => get().phase === 'leave' && toMenu(), LEAVE_MS)
      } else toMenu()
    },

    inTournament: false,
    tournament: null,
    ladderFrom: null,
    startFromLadder: () => {
      if (get().phase === 'ladder') get().start()
    },

    openSetup: (mode) => {
      stopSounds()
      useSettings.getState().setMode(mode)
      set({ phase: 'setup', mode, inTournament: false, tournament: null, setupItem: 'select', paused: false, last: null, choice: fresh() })
    },

    openTournament: () => {
      stopSounds()
      useSettings.getState().setMode('solo')
      set({ phase: 'setup', mode: 'solo', inTournament: true, tournament: null, setupItem: 'select', paused: false, last: null, choice: fresh() })
    },

    fighters: { player: FIGHTERS[0].id, enemy: FIGHTERS[1].id },
    selectCursor: 0,
    selectFor: 'player',
    selectColumns: 4,
    setSelectColumns: (n) => {
      if (get().selectColumns !== n) set({ selectColumns: n })
    },

    openSelect: () => {
      if (get().phase !== 'setup') return
      set({ phase: 'select', selectFor: 'player', selectCursor: FIGHTERS.findIndex((f) => f.id === get().fighters.player) })
    },

    moveSelect: (dx, dy) => {
      if (get().phase !== 'select') return
      const back = SLOTS
      const c = get().selectCursor
      const columns = get().selectColumns
      const rows = SLOTS / columns
      let next: number
      if (c === back) next = dy < 0 ? SLOTS - columns : dy > 0 ? 0 : back
      else {
        const col = (((c % columns) + dx) % columns + columns) % columns
        const row = Math.floor(c / columns) + dy
        next = row < 0 || row >= rows ? back : row * columns + col
      }
      play('select')
      set({ selectCursor: next })
    },

    pointSelect: (slot) => {
      if (get().phase === 'select' && get().selectCursor !== slot) set({ selectCursor: slot })
    },

    chooseSelect: (slot = get().selectCursor) => {
      const { phase, mode, selectFor, fighters } = get()
      if (phase !== 'select') return
      if (slot === SLOTS) return get().backSelect()
      const f = slotFighter(slot)
      // a "?" cannot be chosen, nor a fighter that is locked, nor (the second player) the one the first has chosen
      if (!f || !isUnlocked(f) || (selectFor === 'enemy' && f.id === fighters.player)) return
      play('select')
      if (mode === 'solo' && get().inTournament) {
        // a tournament: the opponents are those of the ladder, one after another, the weakest first
        const ladder = ladderFor(f.id, (id) => !isUnlocked(fighterOf(id)))
        set({ tournament: { hero: f.id, ladder, stage: 0, unlocked: null }, fighters: { player: f.id, enemy: ladder[0]! }, phase: 'ladder', ladderFrom: null })
      } else if (mode === 'solo') {
        set({ fighters: { player: f.id, enemy: rivalOf(f.id, random) } })
        get().start()
      } else if (selectFor === 'player') {
        const free = FIGHTERS.findIndex((o) => o.id !== f.id && isUnlocked(o))
        set({ fighters: { ...fighters, player: f.id }, selectFor: 'enemy', selectCursor: free })
      } else {
        set({ fighters: { ...fighters, enemy: f.id } })
        get().start()
      }
    },

    backSelect: () => {
      const { phase, mode, selectFor, fighters } = get()
      if (phase !== 'select') return
      if (mode === 'duo' && selectFor === 'enemy') set({ selectFor: 'player', selectCursor: FIGHTERS.findIndex((f) => f.id === fighters.player) })
      else set({ phase: 'setup' })
    },

    setupItem: 'select',

    moveSetup: (step) => {
      if (get().phase !== 'setup') return
      const i = SETUP_ITEMS.indexOf(get().setupItem)
      play('select')
      set({ setupItem: SETUP_ITEMS[(i + step + SETUP_ITEMS.length) % SETUP_ITEMS.length]! })
    },

    pointSetup: (item) => {
      if (get().phase === 'setup' && get().setupItem !== item) set({ setupItem: item })
    },

    chooseSetup: (item = get().setupItem) => {
      if (get().phase !== 'setup') return
      if (item === 'select') get().openSelect()
      else get().toMenu()
    },

    endItem: 'again',

    moveEnd: (step) => {
      if (get().phase !== 'over') return
      const i = END_ITEMS.indexOf(get().endItem)
      play('select')
      set({ endItem: END_ITEMS[(i + step + END_ITEMS.length) % END_ITEMS.length]! })
    },

    pointEnd: (item) => {
      if (get().phase === 'over' && get().endItem !== item) set({ endItem: item })
    },

    chooseEnd: (item = get().endItem) => {
      if (get().phase !== 'over') return
      if (item === 'back') return get().toMenu()
      const { tournament: t, match } = get()
      if (!t) return get().start()
      // in a tournament "again" goes on: the next opponent after a win, the same one after a defeat, a new ladder after the last win
      if (match.status === 'lost') return get().start()
      // the ladder is shown first: the highlight moves to the next opponent, and then the fight begins
      if (t.stage + 1 < t.ladder.length) {
        set({ tournament: { ...t, stage: t.stage + 1, unlocked: null }, fighters: { ...get().fighters, enemy: t.ladder[t.stage + 1]! }, phase: 'ladder', ladderFrom: t.stage })
      } else {
        const ladder = ladderFor(t.hero, (id) => !isUnlocked(fighterOf(id)))
        set({ tournament: { hero: t.hero, ladder, stage: 0, unlocked: null }, fighters: { player: t.hero, enemy: ladder[0]! }, phase: 'ladder', ladderFrom: null })
      }
    },

    optionsCursor: 0,
    openOptions: () => set({ phase: 'options', optionsCursor: Math.max(0, LANGUAGES.findIndex((l) => l.id === useSettings.getState().language)) }),
    moveOptions: (step) => {
      if (get().phase !== 'options') return
      const n = LANGUAGES.length + 1 // the languages, then Back
      play('select')
      set({ optionsCursor: (get().optionsCursor + step + n) % n })
    },
    pointOptions: (i) => {
      if (get().phase === 'options' && get().optionsCursor !== i) set({ optionsCursor: i })
    },
    chooseOptions: (i = get().optionsCursor) => {
      if (get().phase !== 'options') return
      if (i >= LANGUAGES.length) return get().toMenu()
      play('select')
      useSettings.getState().setLanguage(LANGUAGES[i]!.id)
      set({ optionsCursor: i })
    },

    openAbout: () => set({ phase: 'about' }),

    start: () => {
      stopSounds()
      const { mode, difficulty } = useSettings.getState()
      const t = get().tournament
      set({ phase: 'choose', mode, paused: false, match: createMatch(t ? difficultyAt(t.stage, t.ladder.length) : difficulty), choice: fresh(), last: null, matchId: get().matchId + 1 })
    },

    pickAttack: (side, zone, weapon) => {
      if (!editable(side)) return
      play('select')
      const now = get().choice[side]
      const w = weapon ?? now.weapon
      // a punch or a kick strikes one zone; a super strike two, which are chosen one after the other
      update(side, w === 'super' ? { weapon: w, ...toggleZone(now, zone) } : { weapon: w, attack: zone, attack2: null })
    },

    setWeapon: (side, weapon) => {
      if (!editable(side)) return
      if (weapon === 'super' && !superReady(get().match, side)) return // the meter is not full
      play('select')
      // changing to a super strike keeps the zone chosen (it is the first of two); changing back strikes one zone again
      update(side, weapon === 'super' ? { weapon } : { weapon, attack2: null })
    },

    pickBlock: (side, zone) => {
      if (!editable(side)) return
      play('select')
      update(side, { block: zone })
    },

    tap: (side, zone) => {
      const { phase, mode, choice, paused } = get()
      if (phase !== 'choose' || paused) return
      const me = turnOf(choice, mode)
      if (side === me) get().pickBlock(me, zone)
      else get().pickAttack(me, zone)
    },

    setHover: (h) => {
      const { phase, hover, paused } = get()
      const next = phase === 'choose' && !paused ? h : null
      if (next?.side !== hover?.side || next?.zone !== hover?.zone) set({ hover: next })
    },

    lock: (side) => {
      const { phase, mode, choice, paused } = get()
      if (phase !== 'choose' || paused || !complete(choice[side]) || choice[side].locked) return
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
      const { phase, match, mode, paused } = get()
      if (phase !== 'reveal' || paused) return
      stopSounds()
      if (match.status === 'fighting') {
        set({ phase: 'choose', choice: nextRound(get().choice, match), last: null })
        return
      }
      const t = get().tournament
      if (t) {
        // a win in the tournament unlocks the fighter that was beaten (for good)
        const won = match.status === 'won'
        const beaten = t.ladder[t.stage]!
        set({ tournament: { ...t, unlocked: won && useUnlocks.getState().unlock(beaten) ? beaten : null } })
      } else if (mode === 'solo') useBest.getState().record(match) // a duel between two people is not your record
      play(mode === 'duo' || match.status === 'won' ? 'win' : 'lose')
      set({ phase: 'over', endItem: 'again' })
    },
  }
})

// The 3D models are 1-4 MB each: as soon as the fighters are known their files are asked for, so that they are in the browser's cache
// (or on their way) when the arena opens, e.g. while the player is still reading the ladder (never in the main menu: the fighters there
// are only the defaults, and a phone would download 4 MB for nothing). A failed request is not a problem: the
// arena asks again and says so if it fails too.
function warmModels(ids: readonly FighterId[]): void {
  for (const id of ids) warmModel(`${import.meta.env.BASE_URL}${fighterOf(id).model}`)
}
useGame.subscribe((s, prev) => {
  if (s.fighters !== prev.fighters && s.phase !== 'menu' && useSettings.getState().view === '3d') warmModels([s.fighters.player, s.fighters.enemy])
})
