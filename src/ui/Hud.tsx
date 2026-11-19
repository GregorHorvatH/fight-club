import { useGame } from '../state/game'
import { useSettings } from '../state/settings'
import { MAX_HP, hpPercent, type Side } from '../sim'
import { useName } from './names'

function Bar({ side }: { side: Side }) {
  const name = useName(side)
  const hp = useGame((s) => s.match.hp[side])
  const streak = useGame((s) => s.match.streak[side])
  const pct = hpPercent(hp)
  return (
    <div className={`bar ${side}${pct <= 30 ? ' low' : ''}`}>
      <div className="bar-head">
        <span className="name">{name}</span>
        <span className="streak" title="strikes landed in a row">{streak >= 2 ? `COMBO x${streak}` : ''}</span>
        <span className="num">
          {hp}/{MAX_HP}
        </span>
      </div>
      <div className="track" role="progressbar" aria-label={`${name} health`} aria-valuemin={0} aria-valuemax={MAX_HP} aria-valuenow={hp}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Hud() {
  const round = useGame((s) => s.match.round)
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const level = useSettings((s) => s.difficulty)
  const muted = useSettings((s) => s.muted)
  const view = useSettings((s) => s.view)
  const toggleMute = useSettings((s) => s.toggleMute)
  const toggleView = useSettings((s) => s.toggleView)
  return (
    <header className="hud">
      <Bar side="player" />
      <div className="center">
        <div className="round">{phase === 'title' ? 'FIGHT CLUB' : `ROUND ${phase === 'choose' ? round + 1 : round}`}</div>
        <div className="level">
          {mode === 'duo' && phase !== 'title' ? '2 players' : level}
          <button className="icon" onClick={toggleView} aria-label={`Switch to ${view === '2d' ? '3D' : '2D'} (V)`} title="V">
            {view === '2d' ? '3D' : '2D'}
          </button>
          <button className="icon" onClick={toggleMute} aria-label={muted ? 'Unmute (M)' : 'Mute (M)'} title="M">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
      <Bar side="enemy" />
    </header>
  )
}
