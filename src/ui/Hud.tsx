import { useGame } from '../state/game'
import { useSettings } from '../state/settings'
import { MAX_HP, hpPercent, type Side } from '../sim'
import { LogOverlay } from './Log'
import { useName } from './names'
import { shownHp, shownStreak, useLanded } from './reveal'

function Bar({ side }: { side: Side }) {
  const name = useName(side)
  const last = useGame((s) => (s.phase === 'reveal' ? s.last : null))
  const landed = useLanded()
  const hp = shownHp(last, side, landed, useGame((s) => s.match.hp[side]))
  const streak = shownStreak(last, side, landed, useGame((s) => s.match.streak[side]))
  const pct = hpPercent(hp)
  return (
    <div className={`bar ${side}${pct <= 30 ? ' low' : ''}`}>
      <div className="bar-head">
        <span className="name">{name}</span>
        <span className="num">
          {hp}/{MAX_HP}
        </span>
      </div>
      <div className="track" role="progressbar" aria-label={`${name} health`} aria-valuemin={0} aria-valuemax={MAX_HP} aria-valuenow={hp}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      {/* under the bar, over the log of this fighter's strikes: its place is kept even when there is no combo */}
      <div className="streak" title="strikes landed in a row">
        {streak >= 2 ? `COMBO x${streak}` : ''}
      </div>
      {/* and under the combo, with the same gap: the last strikes of this fighter, the older ones fading away */}
      <LogOverlay side={side} />
    </div>
  )
}

export function Hud() {
  const round = useGame((s) => s.match.round)
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const inFight = phase === 'choose' || phase === 'reveal' || phase === 'over'
  const level = useSettings((s) => s.difficulty)
  const muted = useSettings((s) => s.muted)
  const view = useSettings((s) => s.view)
  const pause = useGame((s) => s.pause)
  const toggleMute = useSettings((s) => s.toggleMute)
  const toggleView = useSettings((s) => s.toggleView)
  return (
    <header className="hud">
      <Bar side="player" />
      <div className="center">
        <div className="round">{!inFight ? 'FIGHT CLUB' : `ROUND ${phase === 'choose' ? round + 1 : round}`}</div>
        <div className="level">
          {mode === 'duo' && inFight ? '2 players' : level}
          <button className="icon" onClick={toggleView} aria-label={`Switch to ${view === '2d' ? '3D' : '2D'} (V)`} title="V">
            {view === '2d' ? '3D' : '2D'}
          </button>
          {(phase === 'choose' || phase === 'reveal') && (
            <button className="icon" onClick={pause} aria-label="Pause (Esc)" title="Esc">
              ⏸
            </button>
          )}
          <button className="icon" onClick={toggleMute} aria-label={muted ? 'Unmute (M)' : 'Mute (M)'} title="M">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
      <Bar side="enemy" />
    </header>
  )
}
