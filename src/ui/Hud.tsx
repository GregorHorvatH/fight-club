import { useTranslation } from 'react-i18next'
import { useGame } from '../state/game'
import { useSettings } from '../state/settings'
import { MAX_HP, hpPercent, type Side } from '../sim'
import { LogOverlay } from './Log'
import { useName } from './names'
import { shownHp, shownStreak, useLanded } from './reveal'

function Bar({ side }: { side: Side }) {
  const { t } = useTranslation()
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
      <div className="track" role="progressbar" aria-label={t('hud.health', { name })} aria-valuemin={0} aria-valuemax={MAX_HP} aria-valuenow={hp}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      {/* under the bar, over the log of this fighter's strikes: its place is kept even when there is no combo */}
      <div className="streak" title={t('hud.comboTitle')}>
        {streak >= 2 ? t('hud.combo', { n: streak }) : ''}
      </div>
      {/* and under the combo, with the same gap: the last strikes of this fighter, the older ones fading away */}
      <LogOverlay side={side} />
    </div>
  )
}

export function Hud() {
  const { t } = useTranslation()
  const round = useGame((s) => s.match.round)
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const inFight = phase === 'choose' || phase === 'reveal' || phase === 'over'
  const level = useSettings((s) => s.difficulty)
  const muted = useSettings((s) => s.muted)
  const view = useSettings((s) => s.view)
  const tournament = useGame((s) => s.tournament)
  const pause = useGame((s) => s.pause)
  const toggleMute = useSettings((s) => s.toggleMute)
  const toggleView = useSettings((s) => s.toggleView)
  return (
    <header className={`hud${inFight ? '' : ' idle'}${phase === 'menu' ? ' in-menu' : ''}`}>
      <Bar side="player" />
      <div className="center">
        <div className="round">{!inFight ? 'FIGHT CLUB' : t('hud.round', { n: phase === 'choose' ? round + 1 : round })}</div>
        <div className="level">
          {mode === 'duo' && inFight ? t('hud.players') : tournament ? t('hud.stage', { n: tournament.stage + 1, total: tournament.ladder.length }) : t(`difficulty.${level}`)}
          <button className="icon" onClick={toggleView} aria-label={view === '2d' ? t('hud.switchTo3d') : t('hud.switchTo2d')} title="V">
            {view === '2d' ? '3D' : '2D'}
          </button>
          {(phase === 'choose' || phase === 'reveal') && (
            <button className="icon" onClick={pause} aria-label={t('hud.pause')} title="Esc / P">
              ⏸
            </button>
          )}
          <button className="icon" onClick={toggleMute} aria-label={muted ? t('hud.unmute') : t('hud.mute')} title="M">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
      <Bar side="enemy" />
    </header>
  )
}
