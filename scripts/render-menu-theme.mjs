// Renders the theme of the menus (src/audio/music.ts) to a WAV file, so that it can be listened to, checked, or used elsewhere:
//
//   pnpm dev   (in another terminal; the music is TypeScript, so the page of the dev server renders it)
//   node scripts/render-menu-theme.mjs [out.wav] [port]
//
// Needs Google Chrome and the playwright-core package (it is not a dependency of the game: install it where you run this, e.g. `pnpm dlx` or a scratch folder). The loop is 16 bars; the file has it once, with the tail of the echo.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'menu-theme.wav'
const port = process.argv[3] ?? '5173'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/`)
const { rate, left, right, seconds } = await page.evaluate(async () => {
  const m = await import('/src/audio/music.ts')
  const rate = 44100
  const seconds = m.LOOP_S + 3
  const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate)
  const master = c.createGain()
  master.gain.value = 0.5
  master.connect(c.destination)
  const bus = m.makeBus(c, master)
  for (let s = 0; s < m.LOOP_STEPS; s++) m.scheduleStep(c, bus, s, s * m.STEP_S)
  const buf = await c.startRendering()
  return { rate, seconds, left: Array.from(buf.getChannelData(0)), right: Array.from(buf.getChannelData(1)) }
})
await browser.close()
let peak = 0
let sum = 0
for (const v of left) {
  peak = Math.max(peak, Math.abs(v))
  sum += v * v
}
const pcm = Buffer.alloc(left.length * 4)
left.forEach((v, i) => {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 4)
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2)
})
const head = Buffer.alloc(44)
head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12)
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24)
head.writeUInt32LE(rate * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
writeFileSync(out, Buffer.concat([head, pcm]))
console.log(`${out}: ${seconds.toFixed(1)} s, peak ${peak.toFixed(2)}, rms ${Math.sqrt(sum / left.length).toFixed(3)}`)
