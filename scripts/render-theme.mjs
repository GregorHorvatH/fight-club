// Renders the music of the game (src/audio/music.ts: the theme of the menus, or the soundtrack of a fighter, by the id of the
// fighter) to WAV files, so that it can be listened to, checked, or used elsewhere:
//
//   pnpm dev   (in another terminal; the music is TypeScript, so the page of the dev server renders it)
//   node scripts/render-theme.mjs <menu|james|amy|...|all> [out.wav | out-folder] [port]
//
// Needs Google Chrome and the playwright-core package (it is not a dependency of the game: install it where you run this, e.g. `pnpm dlx`
// or a scratch folder). A file has the loop once, with the tail of the echo; the loudness printed is that of the loop at the volume it
// plays at in the game, and (`unity`) as it would be at the volume 1, to which the `level` of each style is trimmed.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const theme = process.argv[2] ?? 'menu'
const out = process.argv[3] ?? (theme === 'all' ? 'soundtracks' : `${theme}-theme.wav`)
const port = process.argv[4] ?? '5173'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/`)
const ids = theme === 'all' ? await page.evaluate(async () => Object.keys((await import('/src/audio/music.ts')).TRACKS)) : [theme]
if (theme === 'all') mkdirSync(out, { recursive: true })

for (const id of ids) {
  const { rate, left, right, seconds, volume } = await page.evaluate(async (id) => {
    const m = await import('/src/audio/music.ts')
    const rate = 44100
    const t = m.TRACKS[id]
    const seconds = t.steps * t.stepS + 3
    const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate)
    const master = c.createGain()
    master.gain.value = t.volume
    master.connect(c.destination)
    const bus = t.makeBus(c, master)
    for (let s = 0; s < t.steps; s++) t.schedule(c, bus, s, s * t.stepS)
    const buf = await c.startRendering()
    return { rate, seconds, volume: t.volume, left: Array.from(buf.getChannelData(0)), right: Array.from(buf.getChannelData(1)) }
  }, id)
  const loop = Math.floor((seconds - 3) * rate)
  let peak = 0
  let sum = 0
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]))
  for (let i = 0; i < loop; i++) sum += left[i] * left[i]
  const rms = Math.sqrt(sum / loop)
  const pcm = Buffer.alloc(left.length * 4)
  left.forEach((v, i) => {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 4)
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2)
  })
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
  const file = theme === 'all' ? join(out, `${id}.wav`) : out
  writeFileSync(file, Buffer.concat([head, pcm]))
  console.log(`${id.padEnd(14)} ${seconds.toFixed(1).padStart(5)} s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  unity-rms ${(rms / volume).toFixed(3)}  -> ${file}`)
}
await browser.close()
