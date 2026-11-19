// Renders the PNG icons from public/favicon.svg: public/favicon-32.png (browsers that cannot use an SVG icon) and
// public/apple-touch-icon.png (180 px, for a home-screen shortcut on iOS).   pnpm icons
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const pub = join(resolve(import.meta.dirname, '..'), 'public')
const svg = readFileSync(join(pub, 'favicon.svg'))
for (const [file, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: (size / 64) * 72 * 4 }).resize(size, size).png().toFile(join(pub, file))
  console.log(`${file} (${size} px)`)
}
