// Turns the background pictures in assets-src/arena-<name>/ into the arenas the game offers on its start screen:
// public/arenas/<name>.webp (at most 1920 px wide), <name>-thumb.webp (360 px) and a list, arenas.json.
//
//   pnpm arenas        (after putting a picture, JPG / PNG, in assets-src/arena-<name>/ for every arena)
//
// The largest picture in a folder is the one used (an .eps next to it is ignored). The name shown in the game is the folder's:
// arena-night -> "Night", arena-old-fort -> "Old fort". An optional arena.json next to the picture can change it:
//   { "name": "Sunset colosseum", "stand": 0.05 }
// `stand` moves the fighters down the frame by that fraction of its height (so they stand further from the back wall).
//
// Licence: stock pictures usually may be used in a game but not redistributed as files (and may need a credit), so assets-src/ and
// public/arenas/ are git-ignored. Without them the game has its plain dark arena.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const src = join(root, 'assets-src')
const out = join(root, 'public', 'arenas')
const WIDTH = 1920

if (!existsSync(src)) {
  console.error('No assets-src/ folder: put the pictures into assets-src/arena-<name>/ first.')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const label = (id) => {
  const words = id.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const arenas = []
for (const dir of readdirSync(src).sort()) {
  if (!dir.startsWith('arena-') || !statSync(join(src, dir)).isDirectory()) continue
  const id = dir.slice('arena-'.length)
  const picture = readdirSync(join(src, dir))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => ({ f, size: statSync(join(src, dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0]
  if (!picture) {
    console.warn(`${dir}: no picture, skipped`)
    continue
  }
  const input = join(src, dir, picture.f)
  await sharp(input).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(out, `${id}.webp`))
  await sharp(input).resize({ width: 360 }).webp({ quality: 70 }).toFile(join(out, `${id}-thumb.webp`))
  const extra = existsSync(join(src, dir, 'arena.json')) ? JSON.parse(readFileSync(join(src, dir, 'arena.json'), 'utf8')) : {}
  arenas.push({
    id,
    name: typeof extra.name === 'string' ? extra.name : label(id),
    file: `${id}.webp`,
    thumb: `${id}-thumb.webp`,
    ...(typeof extra.stand === 'number' ? { stand: extra.stand } : {}),
  })
  console.log(`${id}: ${picture.f} (${(picture.size / 1e6).toFixed(1)} MB) -> ${id}.webp (${(statSync(join(out, `${id}.webp`)).size / 1e3).toFixed(0)} kB)`)
}
writeFileSync(join(out, 'arenas.json'), JSON.stringify(arenas, null, 2) + '\n')
console.log(arenas.length ? `Done: ${arenas.length} arena(s).` : 'Nothing converted.')
