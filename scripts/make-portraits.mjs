// Cuts the faces for the tiles of the selection screen out of a screenshot of the poster scene: public/models/<id>.webp.
//
//   pnpm dev                                   (in one terminal)
//   open  http://localhost:5173/poster.html?arena=night&t=0&lag=0&yaw=80&yawR=95&cam=0,3.4,7,3.2
//         in a window of 1200 x 800 CSS pixels at a device pixel ratio of 2 and save a screenshot of it (2400 x 1600) as shot.png
//   pnpm portraits shot.png
//
// (yaw / yawR turn the two heads to face the camera: the icons look at the player.)
// The boxes below are in pixels of that 2400 x 1600 screenshot: where each character's head and shoulders are. A new character
// needs a new box (look at the screenshot). Licence: the faces are renders of the Mixamo characters, so like the models they are
// git-ignored (public/models/ is); without them the tiles show the first letter of the name.
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const SIZE = 192
const BOXES = {
  james: { left: 314, top: 520, size: 380 },
  amy: { left: 1705, top: 560, size: 400 },
}

const shot = process.argv[2]
if (!shot) {
  console.error('Usage: pnpm portraits <screenshot of the poster scene, 2400 x 1600>')
  process.exit(1)
}
const out = join(resolve(import.meta.dirname, '..'), 'public', 'models')
mkdirSync(out, { recursive: true })
for (const [id, b] of Object.entries(BOXES)) {
  await sharp(shot)
    .extract({ left: b.left, top: b.top, width: b.size, height: b.size })
    .resize(SIZE, SIZE)
    .webp({ quality: 88 })
    .toFile(join(out, `${id}.webp`))
  console.log(`public/models/${id}.webp`)
}
