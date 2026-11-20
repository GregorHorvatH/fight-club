import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { turnOf, useGame } from '../state/game'
import { hintMiddle, useLayout } from '../state/layout'
import { buttonKey, superKey } from '../input'
import { SUPER_METER, superReady, type Side, type Weapon } from '../sim'
import { fighterOf } from '../state/roster'
import { Hint } from './Log'
import { stepOf, stepText } from './steps'

const WEAPON_ICON: Record<Weapon, string> = { hand: '✊', foot: '🦶', super: '✦' }
const WEAPON_TEXT = { hand: 'punch', foot: 'kick', super: 'super' } as const
const HINT_KEY = { hand: 'weaponHint.hand', foot: 'weaponHint.foot', super: 'weaponHint.super' } as const

const WEAPON_KEY = (side: Side, w: Weapon): string => (w === 'super' ? superKey(side) : buttonKey(side, w === 'hand' ? 'punch' : 'kick'))

/** What to strike with: a punch or a kick. A column of two buttons that stands behind James's back. */
function WeaponButtons({ side }: { side: Side }) {
  const { t } = useTranslation()
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const setWeapon = useGame((s) => s.setWeapon)
  return (
    <>
      {(['hand', 'foot'] as const).map((w) => (
        <button key={w} className={`weapon${c.weapon === w ? ' on' : ''}`} disabled={phase !== 'choose'} aria-pressed={c.weapon === w} title={t(HINT_KEY[w])} onClick={() => setWeapon(side, w)}>
          <i aria-hidden="true">{WEAPON_ICON[w]}</i>
          <span>{t(`weapon.${WEAPON_TEXT[w]}`)}</span>
          <kbd>{WEAPON_KEY(side, w)}</kbd>
        </button>
      ))}
    </>
  )
}

/**
 * The super strike: a button of its own, above the one that goes on, behind Amy's back. Its meter fills it like a gauge, and it glows
 * when it is ready. It hits two zones of the enemy, which are chosen one after the other.
 */
function SuperButton({ side }: { side: Side }) {
  const { t } = useTranslation()
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const setWeapon = useGame((s) => s.setWeapon)
  const ready = useGame((s) => superReady(s.match, side))
  // while a round is replayed the meter is the one from before it (what the round did to it shows after)
  const meter = useGame((s) => (s.phase === 'reveal' && s.last ? s.last.meterBefore[side] : s.match.meter[side]))
  const style = fighterOf(useGame((s) => s.fighters[side])).super
  const on = c.weapon === 'super'
  return (
    <button
      className={`weapon super${on ? ' on' : ''}${ready ? ' ready' : ''}`}
      style={{ '--meter': `${Math.round((meter / SUPER_METER) * 100)}%` } as CSSProperties}
      disabled={phase !== 'choose' || !ready}
      aria-pressed={on}
      title={`${style.name}: ${t('weaponHint.super')}`}
      // a second tap takes it back: the strike is a punch again
      onClick={() => setWeapon(side, on ? 'hand' : 'super')}
    >
      <i aria-hidden="true">{WEAPON_ICON.super}</i>
      <span>{style.name}</span>
      <kbd>{superKey(side)}</kbd>
    </button>
  )
}

/**
 * The button that goes on, behind Amy's back: it says what is still missing, then "Fight!" (or "Lock in" for the first of two
 * people); while a round is replayed it is "Next", which skips the replay.
 */
function GoButton({ side }: { side: Side }) {
  const { t } = useTranslation()
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const lock = useGame((s) => s.lock)
  const next = useGame((s) => s.next)
  if (phase === 'reveal') {
    return (
      <button className="go" onClick={next}>
        <span>{t('go.next')}</span>
        <kbd>Enter</kbd>
      </button>
    )
  }
  const step = stepOf(c)
  const waiting = phase === 'choose' && step !== 'ready'
  const first = mode === 'duo' && side === 'player' // the first of two people only locks in; the second one starts the round
  return (
    <button className={`go${waiting ? ' wait' : ''}`} onClick={() => lock(side)} disabled={phase !== 'choose' || waiting}>
      <span>{waiting ? stepText(step, t) : first ? t('go.lockIn') : t('go.fight')}</span>
      <kbd>{mode === 'solo' ? 'Enter' : buttonKey(side, 'fight')}</kbd>
    </button>
  )
}

/**
 * The buttons on the field, at the edges of the screen, each on the side of its fighter: the punch and the kick on James's side
 * (on the left), the super strike above the one that goes on on Amy's (on the right). Between two people they are those of the one whose turn it is.
 */
export function Sides() {
  const turn = useGame((s) => turnOf(s.choice, s.mode))
  return (
    <div className="sides">
      <div className="side left">
        <WeaponButtons key={turn} side={turn} />
      </div>
      <div className="side right">
        <SuperButton key={turn} side={turn} />
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
