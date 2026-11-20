// Cuts the faces for the tiles of the selection screen out of screenshots of the poster scene: public/models/<id>.webp.
//
//   pnpm dev                                   (in one terminal)
//   for each fighter <id> (see src/state/roster.ts), save a screenshot of
//     http://localhost:5173/poster.html?arena=night&t=0&lag=0&yaw=0&front=1&cam=-1.8,3.0,4.2,3.0&left=<id>&right=james
//   in a square window (600 x 600 CSS pixels at a device pixel ratio of 2, so 1200 x 1200), as <folder>/<id>.png
//   pnpm portraits <folder>
//
// The camera stands right in front of the left fighter, which is turned (body and head) to face it, so the avatar looks at the player. The boxes
// below say where the face is on each shot, in a 300 x 300 grid (the shot is scaled to it): the middle of the head, and how big a
// square to cut. A new character needs a box (look at its shot); without one the default is used.
// Licence: the faces are renders of the Mixamo characters, so like the models they are git-ignored (public/models/ is); without
// them the tiles show the first letter of the name.
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const SIZE = 192
const DEFAULT = { cy: 130, size: 140 }
const BOXES = {
  james: { cy: 114, size: 140 },
  amy: { cy: 160, size: 160 },
  pete: { cy: 138, size: 130 },
  brute: { cy: 112, size: 150 },
  lola: { cy: 145, size: 130 },
  kachujin: { cy: 140, size: 140 },
  swat: { cy: 128, size: 140 },
  akai: { cy: 135, size: 140 },
  astra: { cy: 150, size: 130 },
  maynard: { cy: 130, size: 150 },
  paladin: { cy: 114, size: 150 },
  dreyar: { cy: 122, size: 140 },
  alien_soldier: { cy: 114, size: 150 },
  exo_red: { cy: 118, size: 140 },
  vanguard: { cy: 113, size: 160 },
}

const folder = process.argv[2]
if (!folder) {
  console.error('Usage: pnpm portraits <folder with a screenshot <id>.png of every fighter>')
  process.exit(1)
}
const out = join(resolve(import.meta.dirname, '..'), 'public', 'models')
mkdirSync(out, { recursive: true })
for (const id of Object.keys(BOXES)) {
  const file = join(folder, `${id}.png`)
  if (!existsSync(file)) {
    console.warn(`${id}: no ${file}, skipped`)
    continue
  }
  const { width, height } = await sharp(file).metadata()
  const f = width / 300 // pixels of the shot per unit of the grid
  const { cy, size } = BOXES[id] ?? DEFAULT
  const half = size / 2
  const top = Math.max(0, Math.min(300 - size, cy - half))
  await sharp(file)
    .extract({ left: Math.round((150 - half) * f), top: Math.round(top * f), width: Math.round(size * f), height: Math.round(size * f) })
    .resize(SIZE, SIZE)
    .webp({ quality: 88 })
    .toFile(join(out, `${id}.webp`))
  console.log(`public/models/${id}.webp`)
}
