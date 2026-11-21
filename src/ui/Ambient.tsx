import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { musicNow, SPECTRUM_BINS } from '../audio/music'
import { lookOf, motes, waveFrom } from './ambience'

/**
 * The life behind the menus (see ambience.ts for what it is made of, and index.css for how it moves). It also dances to the music:
 * every frame the beat (the kick and the snare, as they ring out) goes into the CSS variables `--kick` and `--snare`, which swell the
 * picture, the mist and the little lights, and the sound's own spectrum is drawn as a wave along the bottom.
 */
const W = 640
const H = 120
const POINTS = 56

/** Draws the wave: a back one that lags behind and a front one, filled with the colour of the arena, with a bright line along the top. */
function drawWave(g: CanvasRenderingContext2D, rgb: string, heights: readonly number[], lag: readonly number[]): void {
  g.clearRect(0, 0, W, H)
  const path = (hs: readonly number[]): void => {
    g.beginPath()
    g.moveTo(0, H)
    hs.forEach((h, i) => {
      const x = (i / (hs.length - 1)) * W
      const y = H - h * (H - 8)
      if (i === 0) g.lineTo(x, y)
      else {
        const px = ((i - 1) / (hs.length - 1)) * W
        const py = H - hs[i - 1]! * (H - 8)
        g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2) // (smooth between the points)
      }
    })
    g.lineTo(W, H - hs[hs.length - 1]! * (H - 8))
    g.lineTo(W, H)
    g.closePath()
  }
  g.fillStyle = `rgba(${rgb}, 0.16)`
  path(lag)
  g.fill()
  const fill = g.createLinearGradient(0, 0, 0, H)
  fill.addColorStop(0, `rgba(${rgb}, 0.5)`)
  fill.addColorStop(1, `rgba(${rgb}, 0.04)`)
  g.fillStyle = fill
  path(heights)
  g.fill()
  g.strokeStyle = `rgba(${rgb}, 0.9)`
  g.lineWidth = 2
  g.stroke()
}

export function Ambient({ arena, image, on }: { arena: string; image: string; on: boolean }) {
  const look = lookOf(arena)
  const lights = useMemo(() => motes(look.kind, look.count, arena.length * 7919 + look.count), [look, arena])
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = root.current
    const g = canvas.current?.getContext('2d')
    if (!on || !el || !g) return
    const bins = new Uint8Array(SPECTRUM_BINS)
    let front: number[] = new Array<number>(POINTS).fill(0)
    let back: number[] = new Array<number>(POINTS).fill(0)
    let kick = 0
    let snare = 0
    let raf = 0
    const frame = (): void => {
      const beat = musicNow(bins)
      // with no music (muted, or the browser has not let it start yet) everything eases back to rest
      kick = beat ? beat.kick : kick * 0.9
      snare = beat ? beat.snare : snare * 0.9
      el.style.setProperty('--kick', kick.toFixed(3))
      el.style.setProperty('--snare', snare.toFixed(3))
      const target = beat ? waveFrom(bins, POINTS, 0.95, beat.nyquist) : front.map(() => 0)
      // up quickly, down slowly: it looks like a wave and not like a flicker
      front = front.map((h, i) => (target[i]! > h ? h + (target[i]! - h) * 0.55 : h + (target[i]! - h) * 0.12))
      back = back.map((h, i) => h + (front[i]! - h) * 0.06)
      drawWave(g, look.rgb, front, back)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [on, look.rgb])

  return (
    <div ref={root} className={`ambient ${look.kind}${on ? ' on' : ''}`} style={{ '--amb': look.rgb } as CSSProperties} aria-hidden="true">
      <div className="amb-pic" style={{ backgroundImage: image }} />
      <div className="amb-shaft" />
      <div className="amb-mist a" />
      <div className="amb-mist b" />
      <canvas ref={canvas} className="amb-wave" width={W} height={H} />
      {lights.map((m, i) => (
        <span
          key={i}
          className="amb-mote"
          style={{ left: `${m.x}%`, top: `${m.y}%`, '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, '--dx': `${m.dx}px`, '--dy': `${m.dy}px`, '--peak': m.peak, '--blink': `${m.blink}s`, '--size': `${m.size}px` } as CSSProperties}
        >
          <i />
        </span>
      ))}
    </div>
  )
}
