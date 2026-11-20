import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/audio/synth', () => ({ play: () => undefined }))

const { BUTTONS, KEYS, buttonCode, buttonKey, handleKey, zoneCode, zoneKey } = await import('../src/input')
const { useGame, toggleZone, nextRound, LEAVE_MS } = await import('../src/state/game')
const { aimed } = await import('../src/ui/arenaView')

/** The fighters leave the arena before the main menu is shown: let them go (the timer of a test that runs it on a fake clock). */
const letThemLeave = () => {
  vi.advanceTimersByTime(LEAVE_MS + 10)
}
const { useSettings } = await import('../src/state/settings')
const { MENU, useMenu } = await import('../src/state/menu')
const roster = await import('../src/state/roster')
const { useUnlocks } = await import('../src/state/unlocks')
const { STAGES, difficultyAt, ladderFor } = await import('../src/state/tournament')
const { ZONES } = await import('../src/sim')
const { IDLE_MS, stepText, idleHint, stepOf } = await import('../src/ui/steps')
const { i18next } = await import('../src/i18n')
const t = i18next.t.bind(i18next) as unknown as import('i18next').TFunction

describe('the keys form the same picture as the screen', () => {
  it('every player has ten different keys (nine on the grid and the super strike), and the two players share none', () => {
    const a = Object.keys(KEYS.player)
    const b = Object.keys(KEYS.enemy)
    expect(a).toHaveLength(10)
    expect(b).toHaveLength(10)
    expect(new Set([...a, ...b]).size).toBe(20)
  })

  it('no player key is used by anything else (Enter / Space lock in; M, V, B, 1 2 3 are the settings)', () => {
    for (const code of [...Object.keys(KEYS.player), ...Object.keys(KEYS.enemy)]) {
      expect(['Enter', 'Space', 'KeyM', 'KeyV', 'KeyB', 'Digit1', 'Digit2', 'Digit3'], code).not.toContain(code)
    }
  })

  it('three columns, left to right: guard figure, buttons, strike figure; each from the top: head / punch, body / kick, legs / fight', () => {
    const column = (f: (i: number) => string) => [0, 1, 2].map(f)
    for (const [side, cols] of [
      ['player', [['KeyQ', 'KeyA', 'KeyZ'], ['KeyW', 'KeyS', 'KeyX'], ['KeyE', 'KeyD', 'KeyC']]],
      ['enemy', [['KeyI', 'KeyJ', 'Comma'], ['KeyO', 'KeyK', 'Period'], ['KeyP', 'KeyL', 'Slash']]],
    ] as const) {
      expect(column((i) => zoneCode(side, 'guard', ZONES[i]!))).toEqual(cols[0])
      expect(column((i) => buttonCode(side, BUTTONS[i]!))).toEqual(cols[1])
      expect(column((i) => zoneCode(side, 'strike', ZONES[i]!))).toEqual(cols[2])
    }
  })

  it('the label on a button is where the key is', () => {
    expect(zoneKey('player', 'guard', 'head')).toBe('Q')
    expect(zoneKey('player', 'strike', 'legs')).toBe('C')
    expect(buttonKey('player', 'fight')).toBe('X')
    expect(zoneKey('enemy', 'guard', 'legs')).toBe(',')
    expect(buttonKey('enemy', 'kick')).toBe('K')
  })
})

describe('pressing the keys', () => {
  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })
  const press = (...codes: string[]) => codes.forEach((c) => handleKey(c))
  const mine = () => useGame.getState().choice.player

  it('the left column guards a zone, the right column strikes a zone', () => {
    press('KeyA') // guard the body
    expect(mine()).toMatchObject({ block: 'body', attack: null })
    press('KeyC') // strike the legs
    expect(mine()).toMatchObject({ block: 'body', attack: 'legs' })
  })

  it('the first two buttons choose what to strike with, and a punch is the default', () => {
    expect(mine().weapon).toBe('hand')
    press('KeyS') // kick
    expect(mine().weapon).toBe('foot')
    press('KeyW') // punch
    expect(mine().weapon).toBe('hand')
  })

  it('choosing the weapon does not change the zone, and choosing the zone does not change the weapon', () => {
    press('KeyE', 'KeyS') // strike the head, then kick
    expect(mine()).toMatchObject({ attack: 'head', weapon: 'foot' })
    press('KeyD') // strike the body instead: still a kick
    expect(mine()).toMatchObject({ attack: 'body', weapon: 'foot' })
  })

  it('one guard and one strike are kept: a new one replaces the old one', () => {
    press('KeyQ', 'KeyZ', 'KeyE', 'KeyC')
    expect(mine()).toMatchObject({ block: 'legs', attack: 'legs' })
  })

  it('the third button fights once a guard and a strike are picked, and not before; Enter does the same', () => {
    press('KeyX', 'Enter')
    expect(useGame.getState().phase).toBe('choose')
    press('KeyE', 'KeyX')
    expect(useGame.getState().phase).toBe('choose') // a strike is picked, a guard is not
    press('KeyA', 'KeyX')
    expect(useGame.getState().phase).toBe('reveal')
  })

  it('the round is played with the weapon that was chosen', () => {
    press('KeyQ', 'KeyE', 'KeyS', 'Enter') // guard the head, strike the head, kick, fight
    expect(useGame.getState().last!.moves.player.weapon).toBe('foot')
  })

  it('two players choose one after the other: the keys of the one whose turn it is work, the others do nothing', () => {
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    press('KeyJ') // player 2 tries to choose first: nothing happens (P would pause the fight now, it is player 1's turn)
    expect(useGame.getState().choice.enemy).toMatchObject({ attack: null, block: null })
    press('KeyE', 'KeyA') // player 1 strikes the head and guards the body
    expect(mine()).toMatchObject({ attack: 'head', block: 'body' })
    press('KeyX') // player 1 locks in: now it is player 2's turn, the round has not started
    expect(useGame.getState().phase).toBe('choose')
    expect(mine().locked).toBe(true)
    press('KeyQ', 'KeyW') // player 1's keys do nothing any more
    expect(mine()).toMatchObject({ attack: 'head', block: 'body', weapon: 'hand' })
    press('KeyP', 'KeyJ', 'KeyK') // player 2: strike the head, guard the body, kick
    expect(useGame.getState().choice.enemy).toMatchObject({ attack: 'head', block: 'body', weapon: 'foot' })
    press('Enter') // and fights
    expect(useGame.getState().phase).toBe('reveal')
    expect(useGame.getState().last!.moves.enemy.weapon).toBe('foot')
  })

  it('Enter confirms for whoever is choosing', () => {
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    press('KeyE', 'KeyA', 'Enter')
    expect(mine().locked).toBe(true)
    press('KeyP', 'KeyJ', 'Space')
    expect(useGame.getState().phase).toBe('reveal')
  })
})

describe('tapping the fighters', () => {
  const tap = (side: 'player' | 'enemy', zone: 'head' | 'body' | 'legs') => useGame.getState().tap(side, zone)
  const me = () => useGame.getState().choice

  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })

  it('alone: a tap on James picks the zone to guard, a tap on Amy the zone to strike', () => {
    tap('player', 'legs')
    expect(me().player).toMatchObject({ block: 'legs', attack: null })
    tap('enemy', 'head')
    expect(me().player).toMatchObject({ block: 'legs', attack: 'head' })
    tap('player', 'body') // a new guard replaces the old one
    expect(me().player.block).toBe('body')
  })

  it('a tap does not change the weapon', () => {
    useGame.getState().setWeapon('player', 'foot')
    tap('enemy', 'legs')
    expect(me().player).toMatchObject({ attack: 'legs', weapon: 'foot' })
  })

  it('between two people it is the one whose turn it is who taps: on themself to guard, on the other to strike', () => {
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    tap('player', 'head') // James guards
    tap('enemy', 'legs') // James strikes Amy
    expect(me().player).toMatchObject({ block: 'head', attack: 'legs' })
    expect(me().enemy).toMatchObject({ block: null, attack: null })
    useGame.getState().lock('player')
    tap('enemy', 'body') // now it is Amy's turn: this is her guard
    tap('player', 'head') // and this is her strike at James
    expect(me().enemy).toMatchObject({ block: 'body', attack: 'head' })
    expect(me().player).toMatchObject({ block: 'head', attack: 'legs' }) // James's picks were not touched
  })

  it('does nothing outside the choosing', () => {
    tap('player', 'head')
    tap('enemy', 'head')
    useGame.getState().lock('player')
    expect(useGame.getState().phase).toBe('reveal')
    tap('player', 'legs')
    expect(me().player.block).toBe('head')
  })

  it('the pointer over a zone is a preview only while choosing, and only for one zone at a time', () => {
    const g = useGame.getState()
    g.setHover({ side: 'enemy', zone: 'body' })
    expect(useGame.getState().hover).toEqual({ side: 'enemy', zone: 'body' })
    g.setHover({ side: 'player', zone: 'legs' })
    expect(useGame.getState().hover).toEqual({ side: 'player', zone: 'legs' })
    g.setHover(null)
    expect(useGame.getState().hover).toBeNull()
    tap('player', 'head')
    tap('enemy', 'head')
    g.setHover({ side: 'enemy', zone: 'body' })
    g.lock('player') // the round starts: no preview remains
    expect(useGame.getState().hover).toBeNull()
    g.setHover({ side: 'enemy', zone: 'body' })
    expect(useGame.getState().hover).toBeNull()
  })
})

describe('what is still missing', () => {
  const choice = (over: Partial<ReturnType<typeof useGame.getState>['choice']['player']>) => ({ attack: null, attack2: null, weapon: 'hand' as const, block: null, locked: false, ...over })

  it('walks the player through the two choices', () => {
    expect(stepOf(choice({}))).toBe('both')
    expect(stepOf(choice({ attack: 'head' }))).toBe('guard')
    expect(stepOf(choice({ block: 'head' }))).toBe('strike')
    expect(stepOf(choice({ attack: 'head', block: 'legs' }))).toBe('ready')
    expect(stepOf(choice({ attack: 'head', block: 'legs', locked: true }))).toBe('locked')
    // a super strike hits two zones: the second is still missing after the first
    expect(stepOf(choice({ attack: 'head', block: 'legs', weapon: 'super' }))).toBe('strike2')
    expect(stepOf(choice({ attack: 'head', attack2: 'body', block: 'legs', weapon: 'super' }))).toBe('ready')
  })

  it('says something for every step that is waiting, and nothing once the round can start', () => {
    expect(stepText('both', t)).toMatch(/guard and a strike/i)
    expect(stepText('guard', t)).toMatch(/guard/i)
    expect(stepText('strike', t)).toMatch(/strike/i)
    expect(stepText('ready', t)).toBe('')
  })
})

describe('matches', () => {
  it('every match started gets a new number, so the intro plays once for each', () => {
    const before = useGame.getState().matchId
    useGame.getState().start()
    useGame.getState().start()
    expect(useGame.getState().matchId).toBe(before + 2)
  })
})

describe('the hint for a player who does not choose', () => {
  it('waits three seconds', () => {
    expect(IDLE_MS).toBe(3000)
  })

  it('says what is still missing and where to tap', () => {
    expect(idleHint('both', 'James', 'Amy', t)).toMatch(/James to guard.*Amy to strike/)
    expect(idleHint('guard', 'James', 'Amy', t)).toMatch(/guard.*tap James/)
    expect(idleHint('strike', 'James', 'Amy', t)).toMatch(/strike.*tap Amy/)
  })

  it('can speak to the player directly (two players)', () => {
    expect(idleHint('guard', 'yourself', 'Amy', t)).toMatch(/tap yourself/)
    expect(idleHint('both', 'yourself', 'Amy', t)).toBe('Tap yourself to guard a zone and Amy to strike one')
  })

  it('says nothing when the choice is complete or already locked in (the fight button is ready)', () => {
    expect(idleHint('ready', 'James', 'Amy', t)).toBe('')
    expect(idleHint('locked', 'James', 'Amy', t)).toBe('')
  })
})

describe('the main menu', () => {
  it('about shows the description of the game, and Esc or Enter goes back', () => {
    useGame.getState().toMenu()
    useMenu.setState({ cursor: 'about', soon: null })
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('about')
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('menu')
    handleKey('Enter')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('menu')
  })

  beforeEach(() => {
    useGame.getState().toMenu()
    useMenu.setState({ cursor: 'arcade', soon: null })
  })

  it('has tournament, arcade, versus, options and about, and the cursor starts on arcade', () => {
    expect(MENU).toEqual(['tournament', 'arcade', 'versus', 'options', 'about'])
    expect(useGame.getState().phase).toBe('menu')
    expect(useMenu.getState().cursor).toBe('arcade')
  })

  it('the arrows move the cursor and wrap around', () => {
    handleKey('ArrowDown')
    expect(useMenu.getState().cursor).toBe('versus')
    handleKey('ArrowDown')
    handleKey('ArrowDown')
    handleKey('ArrowDown')
    expect(useMenu.getState().cursor).toBe('tournament')
    handleKey('ArrowUp')
    expect(useMenu.getState().cursor).toBe('about')
  })

  it('arcade opens the setup for one player, versus for two', () => {
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('setup')
    expect(useSettings.getState().mode).toBe('solo')
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('menu')
    handleKey('ArrowDown')
    handleKey('Space')
    expect(useGame.getState().phase).toBe('setup')
    expect(useSettings.getState().mode).toBe('duo')
  })

  it('the tournament opens its setup, and the options open the languages', () => {
    handleKey('ArrowUp') // up from arcade: tournament
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('setup')
    expect(useGame.getState().inTournament).toBe(true)
    handleKey('Escape')
    useMenu.setState({ cursor: 'options', soon: null })
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('options')
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('menu')
  })

  it('on the setup screen up / down move between Select fighter and Back, and Enter chooses: the cursor starts on Select fighter', () => {
    handleKey('Enter') // arcade
    expect(useGame.getState().setupItem).toBe('select')
    handleKey('ArrowDown')
    expect(useGame.getState().setupItem).toBe('back')
    handleKey('ArrowDown') // wraps around
    expect(useGame.getState().setupItem).toBe('select')
    handleKey('ArrowUp')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('menu')
    handleKey('Enter') // the setup again: the cursor is back on Select fighter
    expect(useGame.getState().setupItem).toBe('select')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('select')
  })

  it('from the setup Enter goes on to choosing the fighter, and the end screen goes back to the menu with Esc', () => {
    handleKey('Enter')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('select')
    useGame.getState().start()
    expect(useGame.getState().phase).toBe('choose')
    useGame.setState({ phase: 'over' })
    vi.useFakeTimers()
    handleKey('Escape')
    letThemLeave()
    vi.useRealTimers()
    expect(useGame.getState().phase).toBe('menu')
  })
})

describe('the pause', () => {
  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })
  const press = (...codes: string[]) => codes.forEach((c) => handleKey(c))

  it('Esc pauses a fight, and nothing can be chosen while it is paused', () => {
    press('Escape')
    expect(useGame.getState().paused).toBe(true)
    press('KeyE', 'KeyQ', 'KeyS') // strike, guard, kick
    useGame.getState().tap('enemy', 'head')
    expect(useGame.getState().choice.player).toMatchObject({ attack: null, block: null, weapon: 'hand' })
  })

  it('Esc, Enter or Space continue (the cursor is on Continue), and the fight is where it was', () => {
    press('KeyE', 'Escape')
    for (const code of ['Escape', 'Enter', 'Space']) {
      useGame.getState().pause()
      expect(useGame.getState().paused).toBe(true)
      press(code)
      expect(useGame.getState().paused).toBe(false)
    }
    expect(useGame.getState().choice.player.attack).toBe('head')
    expect(useGame.getState().phase).toBe('choose')
  })

  it('the pause window is a list: up / down move the cursor, Enter chooses; Continue is first', () => {
    press('Escape')
    expect(useGame.getState().pauseItem).toBe('continue')
    press('ArrowDown')
    expect(useGame.getState().pauseItem).toBe('again')
    press('ArrowDown')
    expect(useGame.getState().pauseItem).toBe('controls')
    press('ArrowDown')
    expect(useGame.getState().pauseItem).toBe('menu')
    press('ArrowDown') // wraps around
    expect(useGame.getState().pauseItem).toBe('continue')
    press('ArrowUp')
    expect(useGame.getState().pauseItem).toBe('menu')
    press('ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter') // back on Continue
    expect(useGame.getState().paused).toBe(false)
    expect(useGame.getState().phase).toBe('choose')
  })

  it('Back to main menu leaves the fight for the main menu', () => {
    vi.useFakeTimers()
    press('KeyE', 'KeyQ', 'Escape', 'ArrowUp', 'Enter') // (up from Continue: the last item)
    letThemLeave()
    vi.useRealTimers()
    const g = useGame.getState()
    expect(g.paused).toBe(false)
    expect(g.phase).toBe('menu')
    expect(g.choice.player.attack).toBeNull()
  })

  it('Controls shows the layout of the keys; Esc (or Enter) goes back to the list, and the fight is still paused', () => {
    press('Escape', 'ArrowDown', 'ArrowDown', 'Enter')
    expect(useGame.getState().pauseControls).toBe(true)
    expect(useGame.getState().paused).toBe(true)
    press('KeyE') // nothing else does anything meanwhile
    expect(useGame.getState().choice.player.attack).toBeNull()
    press('Escape')
    expect(useGame.getState().pauseControls).toBe(false)
    expect(useGame.getState().paused).toBe(true)
    expect(useGame.getState().pauseItem).toBe('controls')
    press('Enter', 'Enter')
    expect(useGame.getState().pauseControls).toBe(false)
    press('Escape') // continues
    expect(useGame.getState().paused).toBe(false)
  })

  it('Fight again, while choosing, clears the picks and goes on choosing', () => {
    press('KeyE', 'KeyQ', 'Escape', 'ArrowDown', 'Enter')
    const g = useGame.getState()
    expect(g.paused).toBe(false)
    expect(g.phase).toBe('choose')
    expect(g.choice.player).toMatchObject({ attack: null, block: null })
    expect(g.match.round).toBe(0)
  })

  it('Fight again, during the replay of a round, takes the round back: the match is as it was before it', () => {
    press('KeyE', 'KeyQ', 'KeyX') // a round is fought
    expect(useGame.getState().phase).toBe('reveal')
    const hit = useGame.getState().match
    expect(hit.round).toBe(1)
    press('Escape', 'ArrowDown', 'Enter')
    const g = useGame.getState()
    expect(g.paused).toBe(false)
    expect(g.phase).toBe('choose')
    expect(g.match.round).toBe(0)
    expect(g.match.hp).toEqual({ player: 100, enemy: 100 })
    expect(g.match.log).toHaveLength(0)
    expect(g.last).toBeNull()
    expect(g.choice.player.attack).toBeNull()
  })

  it('the cursor of the next pause starts on Continue again', () => {
    press('Escape', 'ArrowDown', 'Escape', 'Escape')
    expect(useGame.getState().pauseItem).toBe('continue')
  })

  it('a round that is being replayed does not move on while paused, and is replayed again on Continue', () => {
    press('KeyE', 'KeyQ', 'KeyX')
    expect(useGame.getState().phase).toBe('reveal')
    const replay = useGame.getState().replay
    press('Escape')
    press('Enter') // would skip the replay if it were not paused: here it chooses Continue
    expect(useGame.getState().phase).toBe('reveal')
    expect(useGame.getState().replay).toBe(replay + 1)
  })

  it('there is nothing to pause in the menu', () => {
    useGame.getState().toMenu()
    handleKey('Escape')
    expect(useGame.getState().paused).toBe(false)
    useGame.getState().pause()
    expect(useGame.getState().paused).toBe(false)
  })
})

describe('the end screen', () => {
  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
    useGame.setState({ phase: 'over', endItem: 'again' })
  })

  it('is a list: up / down move the cursor (it starts on fighting again), Enter chooses', () => {
    expect(useGame.getState().endItem).toBe('again')
    handleKey('ArrowDown')
    expect(useGame.getState().endItem).toBe('back')
    handleKey('ArrowDown') // wraps around
    expect(useGame.getState().endItem).toBe('again')
    handleKey('ArrowUp')
    vi.useFakeTimers()
    handleKey('Enter')
    letThemLeave()
    vi.useRealTimers()
    expect(useGame.getState().phase).toBe('menu')
  })

  it('Enter on the first item starts a new match', () => {
    const id = useGame.getState().matchId
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('choose')
    expect(useGame.getState().matchId).toBe(id + 1)
  })
})

describe('choosing the fighter', () => {
  const { FIGHTERS, SLOTS, columnsFor, slotFighter, isUnlocked, rivalOf, fighterOf } = roster
  beforeEach(() => useUnlocks.getState().reset())
  const open = (mode: 'solo' | 'duo') => {
    useSettings.setState({ mode })
    useGame.getState().toMenu()
    useGame.getState().openSetup(mode)
    useGame.setState({ fighters: { player: 'james', enemy: 'amy' } })
    useGame.getState().setSelectColumns(5)
    handleKey('Enter') // Select fighter
  }

  it('there is a tile for every fighter, james and amy first; the ids are all different', () => {
    expect(FIGHTERS.length).toBeLessThanOrEqual(SLOTS)
    expect(new Set(FIGHTERS.map((f) => f.id)).size).toBe(FIGHTERS.length)
    expect(slotFighter(0)?.id).toBe('james')
    expect(slotFighter(1)?.id).toBe('amy')
    expect(slotFighter(SLOTS)).toBeNull()
  })

  it('only the starters can be chosen at first; the others are "?" until they are beaten in the tournament', () => {
    expect(FIGHTERS.filter((f) => f.starter).map((f) => f.id)).toEqual(['james', 'amy'])
    expect(FIGHTERS.filter((f) => isUnlocked(f)).map((f) => f.id)).toEqual(['james', 'amy'])
    useUnlocks.getState().unlock('pete')
    expect(isUnlocked(fighterOf('pete'))).toBe(true)
  })

  it('every tile is full and the grid has no gaps in both layouts', () => {
    for (const portrait of [false, true]) expect(SLOTS % columnsFor(portrait)).toBe(0)
  })

  it('5 across in a wide window (3 rows), 3 across in a tall one (5 rows)', () => {
    expect(columnsFor(false)).toBe(5)
    expect(columnsFor(true)).toBe(3)
  })

  it('the cursor starts on the current fighter; the arrows move over the tiles and wrap; down from the last row is Back', () => {
    open('solo')
    expect(useGame.getState().phase).toBe('select')
    expect(useGame.getState().selectCursor).toBe(0)
    handleKey('ArrowRight')
    expect(useGame.getState().selectCursor).toBe(1)
    handleKey('ArrowLeft')
    handleKey('ArrowLeft') // wraps to the end of the row
    expect(useGame.getState().selectCursor).toBe(4)
    handleKey('ArrowDown')
    expect(useGame.getState().selectCursor).toBe(9)
    handleKey('ArrowDown')
    expect(useGame.getState().selectCursor).toBe(14)
    handleKey('ArrowDown')
    expect(useGame.getState().selectCursor).toBe(SLOTS) // Back
    handleKey('ArrowUp')
    expect(useGame.getState().selectCursor).toBe(SLOTS - 5)
  })

  it('with 3 across the rows are shorter and there are 5 of them', () => {
    open('solo')
    useGame.getState().setSelectColumns(3)
    handleKey('ArrowDown')
    expect(useGame.getState().selectCursor).toBe(3)
    handleKey('ArrowRight')
    handleKey('ArrowRight')
    handleKey('ArrowRight') // wraps within the row
    expect(useGame.getState().selectCursor).toBe(3)
  })

  it('alone: the chosen fighter is yours, the enemy is another one, and the fight starts', () => {
    open('solo')
    handleKey('ArrowRight')
    handleKey('Enter') // Amy
    const g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.fighters.player).toBe('amy')
    expect(g.fighters.enemy).not.toBe('amy')
  })

  it('a fighter that is not unlocked is a "?": it cannot be chosen', () => {
    open('solo')
    useGame.getState().pointSelect(5)
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('select')
  })

  it('any unlocked fighter can be chosen, and the enemy is never the same one', () => {
    useUnlocks.getState().unlockAll(FIGHTERS.map((f) => f.id))
    for (let slot = 0; slot < FIGHTERS.length; slot++) {
      open('solo')
      useGame.getState().pointSelect(slot)
      handleKey('Enter')
      const g = useGame.getState()
      expect(g.phase).toBe('choose')
      expect(g.fighters.player).toBe(FIGHTERS[slot]!.id)
      expect(g.fighters.enemy).not.toBe(g.fighters.player)
    }
  })

  it('Back (or Esc) returns to the setup', () => {
    open('solo')
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('setup')
    handleKey('Enter')
    handleKey('ArrowUp') // from the first tile up: Back
    expect(useGame.getState().selectCursor).toBe(SLOTS)
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('setup')
  })

  it('two players choose one after the other, and the second cannot take the first one\'s fighter', () => {
    open('duo')
    expect(useGame.getState().selectFor).toBe('player')
    handleKey('ArrowRight')
    handleKey('Enter') // player 1: Amy
    expect(useGame.getState()).toMatchObject({ phase: 'select', selectFor: 'enemy' })
    expect(useGame.getState().fighters.player).toBe('amy')
    expect(slotFighter(useGame.getState().selectCursor)?.id).toBe('james') // the cursor is on a free one
    useGame.getState().pointSelect(1) // Amy: taken
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('select')
    useGame.getState().pointSelect(0)
    handleKey('Enter') // player 2: James
    const g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.fighters).toEqual({ player: 'amy', enemy: 'james' })
  })

  it('Esc in the second choice goes back to the first, in the first back to the setup', () => {
    open('duo')
    handleKey('Enter') // player 1: James
    handleKey('Escape')
    expect(useGame.getState()).toMatchObject({ phase: 'select', selectFor: 'player' })
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('setup')
  })

  it('the rival of a fighter is another one, whatever the dice say', () => {
    for (const f of FIGHTERS) for (const r of [0, 0.5, 0.999]) expect(rivalOf(f.id, () => r)).not.toBe(f.id)
  })
})

describe('choosing the two zones of a super strike', () => {
  const press = (...codes: string[]) => codes.forEach((c) => handleKey(c))
  const mine = () => useGame.getState().choice.player

  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
    // a super strike needs a full meter
    useGame.setState({ match: { ...useGame.getState().match, meter: { player: 100, enemy: 0 } } })
  })

  it('the strike keys take zones in turn: the first, the second, and a third replaces the oldest', () => {
    press('KeyR') // the super strike
    expect(mine().weapon).toBe('super')
    press('KeyE')
    expect(mine()).toMatchObject({ attack: 'head', attack2: null })
    press('KeyC')
    expect(mine()).toMatchObject({ attack: 'head', attack2: 'legs' })
    press('KeyD') // body: the oldest (head) goes
    expect(mine()).toMatchObject({ attack: 'legs', attack2: 'body' })
  })

  it('a zone chosen again is taken away', () => {
    press('KeyR', 'KeyE', 'KeyC', 'KeyE')
    expect(mine()).toMatchObject({ attack: 'legs', attack2: null })
    press('KeyC')
    expect(mine()).toMatchObject({ attack: null, attack2: null })
  })

  it('the round cannot start with one zone only; with two it can', () => {
    press('KeyR', 'KeyA', 'KeyE') // guard the body, strike the head
    expect(stepOf(mine())).toBe('strike2')
    press('KeyX') // fight: nothing happens yet
    expect(useGame.getState().phase).toBe('choose')
    press('KeyC')
    expect(stepOf(mine())).toBe('ready')
    press('KeyX')
    expect(useGame.getState().phase).toBe('reveal')
    expect(useGame.getState().last!.moves.player).toMatchObject({ weapon: 'super', attack: 'head', attack2: 'legs' })
    expect(useGame.getState().last!.strikes.player!.extra!.zone).toBe('legs')
  })

  it('without a full meter the super key does nothing: the strike stays a punch', () => {
    useGame.setState({ match: { ...useGame.getState().match, meter: { player: 99, enemy: 0 } } })
    press('KeyR')
    expect(mine().weapon).toBe('hand')
  })

  it('going back to a punch strikes one zone again', () => {
    press('KeyR', 'KeyE', 'KeyC', 'KeyW') // punch
    expect(mine().weapon).toBe('hand')
    expect(mine().attack2).toBeNull()
    press('KeyD')
    expect(mine()).toMatchObject({ attack: 'body', attack2: null })
  })

  it('toggleZone works on its own', () => {
    expect(toggleZone({ attack: null, attack2: null }, 'head')).toEqual({ attack: 'head', attack2: null })
    expect(toggleZone({ attack: 'head', attack2: null }, 'legs')).toEqual({ attack: 'head', attack2: 'legs' })
    expect(toggleZone({ attack: 'head', attack2: 'legs' }, 'body')).toEqual({ attack: 'legs', attack2: 'body' })
    expect(toggleZone({ attack: 'head', attack2: 'legs' }, 'head')).toEqual({ attack: 'legs', attack2: null })
  })
})

describe('what glows on the enemy while the zones of a super strike are chosen', () => {
  const c = (attack: 'head' | 'body' | 'legs' | null, attack2: 'head' | 'body' | 'legs' | null, weapon: 'hand' | 'super' = 'super') => ({ attack, attack2, weapon })

  it('a punch: the zone under the pointer, or the one chosen', () => {
    expect(aimed(c('head', null, 'hand'), 'legs')).toEqual(['legs', null])
    expect(aimed(c('head', null, 'hand'), null)).toEqual(['head', null])
  })

  it('a super strike: the first zone stays lit while the second is chosen, whatever is under the pointer', () => {
    expect(aimed(c('head', null), 'legs')).toEqual(['head', 'legs'])
    expect(aimed(c('head', null), null)).toEqual(['head', null])
    expect(aimed(c(null, null), 'body')).toEqual(['body', null])
  })

  it('with both chosen, a third under the pointer shows what a tap would do (it replaces the first); a chosen one under it changes nothing', () => {
    expect(aimed(c('head', 'legs'), 'body')).toEqual(['legs', 'body'])
    expect(aimed(c('head', 'legs'), 'legs')).toEqual(['head', 'legs'])
    expect(aimed(c('head', 'legs'), null)).toEqual(['head', 'legs'])
  })
})


describe('the tournament', () => {
  const { FIGHTERS } = roster
  const ids = FIGHTERS.map((f) => f.id)
  const startTournament = (hero: number = 0) => {
    useGame.getState().toMenu()
    useGame.getState().openTournament()
    useGame.getState().setSelectColumns(5)
    handleKey('Enter') // Select fighter
    useGame.getState().pointSelect(hero)
    handleKey('Enter')
    handleKey('Enter') // the ladder is shown first: Enter skips the wait
  }
  /** the end screen's "again": the ladder is shown, and then the fight begins */
  const again = () => {
    handleKey('Enter')
    if (useGame.getState().phase === 'ladder') handleKey('Enter')
  }
  /** wins the match that is on: the enemy is at 0 health, and the replay ends the match */
  const winNow = () => {
    const g = useGame.getState()
    useGame.setState({ phase: 'reveal', last: g.last, match: { ...g.match, status: 'won', hp: { player: 40, enemy: 0 } } })
    useGame.getState().next()
  }
  const loseNow = () => {
    const g = useGame.getState()
    useGame.setState({ phase: 'reveal', match: { ...g.match, status: 'lost', hp: { player: 0, enemy: 40 } } })
    useGame.getState().next()
  }

  beforeEach(() => {
    useUnlocks.getState().reset()
    useSettings.setState({ mode: 'solo' })
  })

  it('the ladder: the fighters not unlocked yet, from the weakest, STAGES of them, never the hero', () => {
    const ladder = ladderFor('james', (id) => !['james', 'amy'].includes(id))
    expect(ladder).toHaveLength(STAGES)
    expect(ladder).not.toContain('james')
    expect(ladder).not.toContain('amy') // already unlocked: not needed to fill it
    expect(ladder).toEqual(ids.filter((id) => ladder.includes(id))) // in the order of the roster
    expect(ladder[0]).toBe('pete')
  })

  it('when few are left to unlock, the strongest of the others fill the ladder', () => {
    const ladder = ladderFor('james', (id) => id === 'pete') // only pete is locked
    expect(ladder).toHaveLength(STAGES)
    expect(ladder).toContain('pete')
    expect(ladder[ladder.length - 1]).toBe('vanguard')
  })

  it('the enemy gets cleverer along the ladder: easy, then normal, then hard', () => {
    const d = Array.from({ length: STAGES }, (_, i) => difficultyAt(i, STAGES))
    expect(d[0]).toBe('easy')
    expect(d[STAGES - 1]).toBe('hard')
    expect(d).toContain('normal')
    expect(d).toEqual([...d].sort((a, b) => ['easy', 'normal', 'hard'].indexOf(a) - ['easy', 'normal', 'hard'].indexOf(b)))
  })

  it('after choosing the fighter the ladder is shown with the first opponent lit, and only then does the fight begin', () => {
    useGame.getState().toMenu()
    useGame.getState().openTournament()
    useGame.getState().setSelectColumns(5)
    handleKey('Enter')
    handleKey('Enter') // James
    const g = useGame.getState()
    expect(g.phase).toBe('ladder')
    expect(g.ladderFrom).toBeNull()
    expect(g.tournament!.stage).toBe(0)
    expect(g.match.round).toBe(0)
    handleKey('Enter') // skip the wait
    expect(useGame.getState().phase).toBe('choose')
  })

  it('after a win the ladder is shown again: the highlight is to move from the opponent just beaten to the next, before the fight', () => {
    startTournament(0)
    winNow()
    handleKey('Enter')
    const g = useGame.getState()
    expect(g.phase).toBe('ladder')
    expect(g.ladderFrom).toBe(0)
    expect(g.tournament!.stage).toBe(1)
    expect(g.fighters.enemy).toBe(g.tournament!.ladder[1])
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('choose')
    expect(useGame.getState().tournament!.stage).toBe(1)
  })

  it('Esc on the ladder leaves the tournament', () => {
    useGame.getState().toMenu()
    useGame.getState().openTournament()
    handleKey('Enter')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('ladder')
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('menu')
    expect(useGame.getState().tournament).toBeNull()
  })

  it('the fighters beaten stay unlocked: in the menu, in other modes and in the next tournament', () => {
    startTournament(0)
    const first = useGame.getState().tournament!.ladder[0]!
    winNow()
    useGame.getState().toMenu()
    expect(roster.isUnlocked(roster.fighterOf(first))).toBe(true)
    // chosen in an arcade fight
    useGame.getState().openSetup('solo')
    useGame.getState().setSelectColumns(5)
    handleKey('Enter')
    useGame.getState().pointSelect(roster.FIGHTERS.findIndex((f) => f.id === first))
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('choose')
    expect(useGame.getState().fighters.player).toBe(first)
  })

  it('the setup has no difficulty to choose, and the fighter you choose starts the first stage against the weakest opponent', () => {
    startTournament(0)
    const g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.tournament).toMatchObject({ hero: 'james', stage: 0, unlocked: null })
    expect(g.fighters).toEqual({ player: 'james', enemy: g.tournament!.ladder[0] })
    expect(g.match.difficulty).toBe('easy')
  })

  it('a win unlocks the opponent for good, and "again" goes on to the next one, a stage tougher', () => {
    startTournament(0)
    const first = useGame.getState().tournament!.ladder[0]!
    winNow()
    let g = useGame.getState()
    expect(g.phase).toBe('over')
    expect(g.tournament!.unlocked).toBe(first)
    expect(useUnlocks.getState().unlocked).toContain(first)
    handleKey('Enter') // next fight: the ladder first, the highlight moves to the next opponent
    expect(useGame.getState().phase).toBe('ladder')
    expect(useGame.getState().ladderFrom).toBe(0)
    handleKey('Enter')
    g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.tournament!.stage).toBe(1)
    expect(g.fighters.enemy).toBe(g.tournament!.ladder[1])
    expect(g.match.round).toBe(0)
  })

  it('a defeat unlocks nothing, and "again" is a retry of the same stage', () => {
    startTournament(0)
    const first = useGame.getState().tournament!.ladder[0]!
    loseNow()
    expect(useUnlocks.getState().unlocked).not.toContain(first)
    again()
    const g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.tournament!.stage).toBe(0)
    expect(g.fighters.enemy).toBe(first)
  })

  it('beating the last opponent wins the tournament: "again" starts a new one with a fresh ladder', () => {
    startTournament(0)
    for (let i = 0; i < STAGES; i++) {
      winNow()
      expect(useGame.getState().phase).toBe('over')
      if (i < STAGES - 1) again()
    }
    expect(STAGES).toBeGreaterThan(1)
    // everybody on the ladder was unlocked
    for (const id of useGame.getState().tournament!.ladder) expect(useUnlocks.getState().unlocked).toContain(id)
    again()
    const g = useGame.getState()
    expect(g.phase).toBe('choose')
    expect(g.tournament!.stage).toBe(0)
    expect(g.tournament!.hero).toBe('james')
  })

  it('the menu ends the tournament, and a tournament does not count toward the record', () => {
    startTournament(0)
    winNow()
    vi.useFakeTimers()
    handleKey('Escape')
    letThemLeave()
    vi.useRealTimers()
    expect(useGame.getState().phase).toBe('menu')
    expect(useGame.getState().tournament).toBeNull()
    expect(useGame.getState().inTournament).toBe(false)
  })

  it('the next tournament takes those who are not unlocked yet', () => {
    startTournament(0)
    const ladder1 = useGame.getState().tournament!.ladder
    for (let i = 0; i < STAGES; i++) {
      winNow()
      if (i < STAGES - 1) again()
    }
    useGame.getState().toMenu()
    startTournament(0)
    const ladder2 = useGame.getState().tournament!.ladder
    for (const id of ladder2.filter((x) => !ladder1.includes(x))) expect(roster.fighterOf(id).starter).toBe(false)
    expect(ladder2.filter((x) => !ladder1.includes(x)).length).toBeGreaterThan(0)
  })
})


describe('going back to the main menu from a fight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })
  afterEach(() => vi.useRealTimers())

  it('the fighters leave the arena first; the menu comes when they are out of the frame', () => {
    useGame.getState().toMenu()
    expect(useGame.getState().phase).toBe('leave')
    expect(useGame.getState().paused).toBe(false)
    handleKey('Enter') // nothing happens meanwhile
    expect(useGame.getState().phase).toBe('leave')
    vi.advanceTimersByTime(LEAVE_MS + 10)
    expect(useGame.getState().phase).toBe('menu')
  })

  it('from the pause and from the end screen alike; from a screen without fighters the menu is at once', () => {
    handleKey('Escape')
    handleKey('ArrowUp')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('leave')
    vi.advanceTimersByTime(LEAVE_MS + 10)
    expect(useGame.getState().phase).toBe('menu')
    useGame.getState().openSetup('solo')
    useGame.getState().toMenu()
    expect(useGame.getState().phase).toBe('menu')
  })
})


describe('the options: the language', () => {
  const LANGUAGES = ['en', 'de', 'fr', 'es', 'uk', 'pt', 'pl', 'it']
  beforeEach(() => {
    useSettings.getState().setLanguage('en')
    useGame.getState().toMenu()
    useMenu.setState({ cursor: 'options', soon: null })
    handleKey('Enter')
  })
  afterAll(() => useSettings.getState().setLanguage('en'))

  it('is a list of the languages and Back; the cursor starts on the current language', () => {
    expect(useGame.getState().phase).toBe('options')
    expect(useGame.getState().optionsCursor).toBe(0)
    handleKey('ArrowDown')
    expect(useGame.getState().optionsCursor).toBe(1)
    handleKey('ArrowUp')
    handleKey('ArrowUp') // wraps around: Back is the last
    expect(useGame.getState().optionsCursor).toBe(LANGUAGES.length)
  })

  it('Enter on a language changes the language at once, and it is remembered in the settings', () => {
    handleKey('ArrowDown') // deutsch
    handleKey('Enter')
    expect(useSettings.getState().language).toBe('de')
    expect(i18next.t('menu.arcade.label')).toBe('Arcade-Modus')
    for (let i = 0; i < 3; i++) handleKey('ArrowDown') // (deutsch -> fr -> es -> ukrainian)
    handleKey('Enter')
    expect(useSettings.getState().language).toBe('uk')
    expect(i18next.t('menu.arcade.label')).toBe('Аркадний режим')
    expect(useGame.getState().phase).toBe('options') // it stays on the screen
  })

  it('the cursor starts on the language that is on; Back (or Esc) leaves', () => {
    handleKey('ArrowDown')
    handleKey('Enter') // de
    handleKey('Escape')
    expect(useGame.getState().phase).toBe('menu')
    useMenu.setState({ cursor: 'options', soon: null })
    handleKey('Enter')
    expect(useGame.getState().optionsCursor).toBe(1)
    handleKey('ArrowUp')
    handleKey('ArrowUp') // Back
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('menu')
  })
})

describe('what you strike with stays for the next round', () => {
  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })
  const press = (...codes: string[]) => codes.forEach((c) => handleKey(c))

  it('a kick is still a kick in the next round, but the zones are to be picked again', () => {
    press('KeyS', 'KeyE', 'KeyQ', 'KeyX') // kick, strike the head, guard the head, fight
    expect(useGame.getState().phase).toBe('reveal')
    useGame.getState().next()
    const c = useGame.getState().choice.player
    if (useGame.getState().phase === 'choose') {
      expect(c.weapon).toBe('foot')
      expect(c.attack).toBeNull()
      expect(c.block).toBeNull()
    }
  })

  it('a punch stays a punch, and a new match starts with a punch again', () => {
    press('KeyS')
    useGame.getState().start()
    expect(useGame.getState().choice.player.weapon).toBe('hand')
  })

  it('between two people each keeps his own', () => {
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    press('KeyS', 'KeyE', 'KeyQ', 'KeyX') // player 1: kick
    press('KeyK', 'KeyP', 'KeyI', 'Period') // player 2: kick too
    useGame.getState().next()
    if (useGame.getState().phase === 'choose') {
      expect(useGame.getState().choice.player.weapon).toBe('foot')
      expect(useGame.getState().choice.enemy.weapon).toBe('foot')
    }
  })

  it('the same carries over by nextRound: a super strike only while its meter is full', () => {
    const m = useGame.getState().match
    const full = { ...m, meter: { player: 100, enemy: 0 } }
    const choice = { player: { attack: 'head', attack2: 'body', weapon: 'super', block: 'legs', locked: false }, enemy: { attack: null, attack2: null, weapon: 'foot', block: null, locked: false } } as const
    expect(nextRound(choice, full).player.weapon).toBe('super')
    expect(nextRound(choice, m).player.weapon).toBe('hand')
    expect(nextRound(choice, m).enemy.weapon).toBe('foot')
    expect(nextRound(choice, m).player.attack).toBeNull()
  })
})

describe('P pauses (Esc leaves the full screen of a browser)', () => {
  const press = (...codes: string[]) => codes.forEach((c) => handleKey(c))
  beforeEach(() => {
    useSettings.setState({ mode: 'solo' })
    useGame.getState().start()
  })

  it('P pauses a fight like Esc, and P continues like Esc', () => {
    press('KeyP')
    expect(useGame.getState().paused).toBe(true)
    press('KeyP')
    expect(useGame.getState().paused).toBe(false)
  })

  it('P closes the layout of the keys (going back to the list) and then continues', () => {
    press('KeyP', 'ArrowDown', 'ArrowDown', 'Enter')
    expect(useGame.getState().pauseControls).toBe(true)
    press('KeyP')
    expect(useGame.getState().pauseControls).toBe(false)
    expect(useGame.getState().paused).toBe(true)
    press('KeyP')
    expect(useGame.getState().paused).toBe(false)
  })

  it('there is nothing to pause in the menus', () => {
    useGame.getState().toMenu()
    press('KeyP')
    expect(useGame.getState().paused).toBe(false)
  })

  it('in VS Mode P is the second player\'s strike at the head while that player is choosing, and a pause otherwise', () => {
    useSettings.setState({ mode: 'duo' })
    useGame.getState().start()
    press('KeyP') // the first player is choosing: a pause
    expect(useGame.getState().paused).toBe(true)
    press('KeyP')
    press('KeyE', 'KeyQ', 'Space') // player 1 picks and locks in
    expect(useGame.getState().choice.player.locked).toBe(true)
    press('KeyP') // the second player's turn: a strike at the head, not a pause
    expect(useGame.getState().paused).toBe(false)
    expect(useGame.getState().choice.enemy.attack).toBe('head')
  })
})
