import { useLayoutEffect, useRef, useState } from 'react'
import { turnOf, useGame } from '../state/game'
import { hintMiddle, useLayout } from '../state/layout'
import { buttonKey } from '../input'
import type { Side, Weapon } from '../sim'
import { Hint } from './Log'
import { STEP_TEXT, stepOf } from './steps'

const WEAPON_LABEL: Record<Weapon, string> = { hand: 'Punch', foot: 'Kick' }
const WEAPON_ICON: Record<Weapon, string> = { hand: '✊', foot: '🦶' }
const WEAPON_HINT: Record<Weapon, string> = {
  hand: 'Punch: fast, so it strikes before a kick. Steady damage.',
  foot: 'Kick: slow (a punch strikes first), 1.4x the damage, but if it is guarded you stumble and lose 7 health.',
}

/** What to strike with: a punch or a kick. A column of two buttons that stands behind James's back. */
function WeaponButtons({ side }: { side: Side }) {
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const setWeapon = useGame((s) => s.setWeapon)
  return (
    <>
      {(['hand', 'foot'] as const).map((w) => (
        <button key={w} className={`weapon${c.weapon === w ? ' on' : ''}`} disabled={phase !== 'choose'} aria-pressed={c.weapon === w} title={WEAPON_HINT[w]} onClick={() => setWeapon(side, w)}>
          <i aria-hidden="true">{WEAPON_ICON[w]}</i>
          <span>{WEAPON_LABEL[w]}</span>
          <kbd>{buttonKey(side, w === 'hand' ? 'punch' : 'kick')}</kbd>
        </button>
      ))}
    </>
  )
}

/**
 * The button that goes on, behind Amy's back: it says what is still missing, then "Fight!" (or "Lock in" for the first of two
 * people); while a round is replayed it is "Next", which skips the replay.
 */
function GoButton({ side }: { side: Side }) {
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const lock = useGame((s) => s.lock)
  const next = useGame((s) => s.next)
  if (phase === 'reveal') {
    return (
      <button className="go" onClick={next}>
        <span>Next</span>
        <kbd>Enter</kbd>
      </button>
    )
  }
  const step = stepOf(c)
  const waiting = phase === 'choose' && step !== 'ready'
  const first = mode === 'duo' && side === 'player' // the first of two people only locks in; the second one starts the round
  return (
    <button className={`go${waiting ? ' wait' : ''}`} onClick={() => lock(side)} disabled={phase !== 'choose' || waiting}>
      <span>{waiting ? STEP_TEXT[step] : first ? 'Lock in' : 'Fight!'}</span>
      <kbd>{mode === 'solo' ? 'Enter' : buttonKey(side, 'fight')}</kbd>
    </button>
  )
}

/**
 * The buttons on the field, at the edges of the screen, each on the side of its fighter: the punch and the kick on James's side
 * (on the left), the one that goes on on Amy's (on the right). Between two people they are those of the one whose turn it is.
 */
export function Sides() {
  const turn = useGame((s) => turnOf(s.choice, s.mode))
  return (
    <div className="sides">
      <div className="side left">
        <WeaponButtons key={turn} side={turn} />
      </div>
      <div className="side right">
        <GoButton key={turn} side={turn} />
      </div>
    </div>
  )
}

/** The bottom of the field, under the fighters: the hint. */
export function Dock() {
  const ref = useRef<HTMLDivElement>(null)
  const headsTop = useLayout((s) => s.headsTop)
  const [middle, setMiddle] = useState<number | null>(null)
  const phase = useGame((s) => s.phase)
  const duo = useGame((s) => s.mode === 'duo')
  const logged = useGame((s) => s.match.log.length > 0)
  // the hint goes right under the bars; once there are logs (or between two people) it goes under them in a tall window
  // the hint is halfway between the bottom of the logs (the bars with their combo and logs) and the top of the heads
  useLayoutEffect(() => {
    const app = ref.current?.parentElement
    const hud = app?.querySelector('.hud')
    if (!app || !hud) return
    const measure = () => {
      const a = app.getBoundingClientRect()
      const bottom = Math.max(...[...hud.querySelectorAll('.bar')].map((b) => b.getBoundingClientRect().bottom)) - a.top
      setMiddle(hintMiddle(Number.isFinite(bottom) ? bottom : null, headsTop))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(hud)
    return () => ro.disconnect()
  }, [headsTop])
  return (
    <div ref={ref} className={`dock${duo ? ' duo' : ''}${logged ? ' logged' : ''}`} style={middle === null ? undefined : { top: middle, transform: 'translateY(-50%)' }}>
      {phase !== 'reveal' && <Hint />}
    </div>
  )
}
