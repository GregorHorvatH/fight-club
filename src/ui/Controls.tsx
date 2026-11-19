import { useGame } from '../state/game'
import { keyFor, keyLabel, LOCK_KEY } from '../input'
import { WEAPONS, ZONES, type Side, type Weapon } from '../sim'
import { NAMES } from './names'

const WEAPON_LABEL: Record<Weapon, string> = { hand: '✊ Hand', foot: '🦶 Foot' }
const WEAPON_HINT: Record<Weapon, string> = {
  hand: 'Punch: steady damage.',
  foot: 'Kick: 1.4x the damage, but if it is guarded you stumble and lose 7 health.',
}

function Strike({ side }: { side: Side }) {
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const pickAttack = useGame((s) => s.pickAttack)
  const setWeapon = useGame((s) => s.setWeapon)
  const disabled = phase !== 'choose' || c.locked
  const shown = !c.locked // once locked in, the picks are not shown: the other player is looking at the same screen
  return (
    <section className="picker attack" aria-label="Strike">
      <h2>Strike</h2>
      <div className="weapons" role="radiogroup" aria-label="Strike with">
        {WEAPONS.map((w) => (
          <button key={w} role="radio" aria-checked={shown && c.weapon === w} title={WEAPON_HINT[w]} className={`weapon${shown && c.weapon === w ? ' on' : ''}`} disabled={disabled} onClick={() => setWeapon(side, w)}>
            {WEAPON_LABEL[w]}
          </button>
        ))}
      </div>
      <div className="zones">
        {ZONES.map((z) => (
          <button key={z} className={`zone-btn${shown && c.attack === z ? ' on' : ''}`} disabled={disabled} aria-pressed={shown && c.attack === z} onClick={() => pickAttack(side, z)}>
            <span className="z">{z}</span>
            <kbd>{keyFor(side, 'attack', z, c.weapon)}</kbd>
          </button>
        ))}
      </div>
    </section>
  )
}

function Guard({ side }: { side: Side }) {
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const pickBlock = useGame((s) => s.pickBlock)
  const disabled = phase !== 'choose' || c.locked
  const shown = !c.locked
  return (
    <section className="picker block" aria-label="Guard">
      <h2>Guard</h2>
      <div className="zones">
        {ZONES.map((z) => (
          <button key={z} className={`zone-btn${shown && c.block === z ? ' on' : ''}`} disabled={disabled} aria-pressed={shown && c.block === z} onClick={() => pickBlock(side, z)}>
            <span className="z">{z}</span>
            <kbd>{keyFor(side, 'block', z)}</kbd>
          </button>
        ))}
      </div>
    </section>
  )
}

/** One player's half of the two-player screen: both pickers and a lock-in button. */
function Player({ side }: { side: Side }) {
  const c = useGame((s) => s.choice[side])
  const phase = useGame((s) => s.phase)
  const lock = useGame((s) => s.lock)
  const ready = c.attack !== null && c.block !== null
  return (
    <div className={`player-card ${side}${c.locked ? ' locked' : ''}`}>
      <h3>
        {NAMES.duo[side]} <small>Player {side === 'player' ? 1 : 2}</small>
      </h3>
      <div className="pair">
        <Guard side={side} />
        <Strike side={side} />
      </div>
      <button className="go lock" onClick={() => lock(side)} disabled={phase !== 'choose' || (!ready && !c.locked)}>
        {c.locked ? 'Locked in ✓ (undo)' : 'Lock in'} <kbd>{keyLabel(LOCK_KEY[side])}</kbd>
      </button>
    </div>
  )
}

export function Controls() {
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const choice = useGame((s) => s.choice.player)
  const lock = useGame((s) => s.lock)
  const next = useGame((s) => s.next)

  if (mode === 'duo' && phase !== 'title') {
    return (
      <div className="controls duo">
        <Player side="player" />
        <Player side="enemy" />
        {phase === 'reveal' && (
          <button className="go next" onClick={next}>
            Next <kbd>Enter</kbd>
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="controls">
      <Guard side="player" />
      {phase === 'reveal' ? (
        <button className="go" onClick={next}>
          Next <kbd>Enter</kbd>
        </button>
      ) : (
        <button className="go" onClick={() => lock('player')} disabled={phase !== 'choose' || choice.attack === null || choice.block === null}>
          Fight! <kbd>Enter</kbd>
        </button>
      )}
      <Strike side="player" />
    </div>
  )
}
