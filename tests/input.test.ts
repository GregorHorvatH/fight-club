import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/audio/synth', () => ({ play: () => undefined }))

const { BUTTONS, KEYS, buttonCode, buttonKey, handleKey, zoneCode, zoneKey } = await import('../src/input')
const { useGame } = await import('../src/state/game')
const { useSettings } = await import('../src/state/settings')
const { MENU, useMenu } = await import('../src/state/menu')
const roster = await import('../src/state/roster')
const { ZONES } = await import('../src/sim')
const { IDLE_MS, STEP_TEXT, idleHint, stepOf } = await import('../src/ui/steps')

describe('the keys form the same picture as the screen', () => {
  it('every player has nine different keys, and the two players share none', () => {
    const a = Object.keys(KEYS.player)
    const b = Object.keys(KEYS.enemy)
    expect(a).toHaveLength(9)
    expect(b).toHaveLength(9)
    expect(new Set([...a, ...b]).size).toBe(18)
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
    press('KeyP', 'KeyJ') // player 2 tries to choose first: nothing happens
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
  const choice = (over: Partial<ReturnType<typeof useGame.getState>['choice']['player']>) => ({ attack: null, weapon: 'hand' as const, block: null, locked: false, ...over })

  it('walks the player through the two choices', () => {
    expect(stepOf(choice({}))).toBe('both')
    expect(stepOf(choice({ attack: 'head' }))).toBe('guard')
    expect(stepOf(choice({ block: 'head' }))).toBe('strike')
    expect(stepOf(choice({ attack: 'head', block: 'legs' }))).toBe('ready')
    expect(stepOf(choice({ attack: 'head', block: 'legs', locked: true }))).toBe('locked')
  })

  it('says something for every step that is waiting, and nothing once the round can start', () => {
    expect(STEP_TEXT.both).toMatch(/guard and a strike/i)
    expect(STEP_TEXT.guard).toMatch(/guard/i)
    expect(STEP_TEXT.strike).toMatch(/strike/i)
    expect(STEP_TEXT.ready).toBe('')
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
    expect(idleHint('both', 'James', 'Amy')).toMatch(/James to guard.*Amy to strike/)
    expect(idleHint('guard', 'James', 'Amy')).toMatch(/guard.*tap James/)
    expect(idleHint('strike', 'James', 'Amy')).toMatch(/strike.*tap Amy/)
  })

  it('can speak to the player directly (two players)', () => {
    expect(idleHint('guard', 'yourself', 'Amy')).toMatch(/tap yourself/)
    expect(idleHint('both', 'yourself', 'Amy')).toBe('Tap yourself to guard a zone and Amy to strike one')
  })

  it('says nothing when the choice is complete or already locked in (the fight button is ready)', () => {
    expect(idleHint('ready', 'James', 'Amy')).toBe('')
    expect(idleHint('locked', 'James', 'Amy')).toBe('')
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

  it('tournament and options are only places in the menu for now: they say so and start nothing', () => {
    handleKey('ArrowUp')
    handleKey('Enter')
    expect(useGame.getState().phase).toBe('menu')
    expect(useMenu.getState().soon).toBe('tournament')
    handleKey('ArrowDown') // moving the cursor takes the message away
    expect(useMenu.getState().soon).toBeNull()
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
    handleKey('Escape')
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
    expect(useGame.getState().pauseItem).toBe('reset')
    press('ArrowDown') // wraps around
    expect(useGame.getState().pauseItem).toBe('continue')
    press('ArrowUp')
    expect(useGame.getState().pauseItem).toBe('reset')
    press('ArrowUp', 'Enter')
    expect(useGame.getState().paused).toBe(false)
    expect(useGame.getState().phase).toBe('choose')
  })

  it('Reset leaves the fight for the main menu', () => {
    press('KeyE', 'KeyQ', 'Escape', 'ArrowDown', 'Enter')
    const g = useGame.getState()
    expect(g.paused).toBe(false)
    expect(g.phase).toBe('menu')
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
    handleKey('Enter')
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
  const { FIGHTERS, SLOTS, columnsFor, slotFighter, isUnlocked, rivalOf } = roster
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

  it('everybody can be chosen for now (nothing unlocks them yet), the starters in any case', () => {
    expect(FIGHTERS.every((f) => isUnlocked(f))).toBe(true)
    expect(FIGHTERS.filter((f) => f.starter).map((f) => f.id)).toEqual(['james', 'amy'])
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

  it('any fighter can be chosen, and the enemy is never the same one', () => {
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
