// Turns the Mixamo downloads in assets-src/<name>/ into the optimised models the 3D view uses: public/models/<name>.glb.
//
//   pnpm models           (after putting the characters, as FBX, in assets-src/amy/ and assets-src/james/)
//
// In Mixamo: pick a character, do NOT pick an animation, Download: Format "FBX Binary (.fbx)", Pose "T-pose". Unzip each download
// into its own folder; the character is the big .fbx file (the animation packs next to it are not needed).
//
// What it does: FBX -> glTF binary (FBX2glTF), the textures (4096 px, 90 MB each on the GPU) are shrunk to 1024 px and
// re-encoded as WebP, unused data is pruned. A character goes from tens of MB to 1-3 MB.
//
// Licence: Mixamo's characters may be used inside a game but not redistributed as files, so assets-src/ and public/models/ are
// git-ignored. Without the models the game draws its primitive fighters.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const convert = require('fbx2gltf')

const root = resolve(import.meta.dirname, '..')
const src = join(root, 'assets-src')
const out = join(root, 'public', 'models')
const TEXTURE_SIZE = 1024

if (!existsSync(src)) {
  console.error('No assets-src/ folder: put the Mixamo characters (FBX) into assets-src/<name>/ first.')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const work = join(tmpdir(), `fight-club-models-${process.pid}`)
mkdirSync(work, { recursive: true })

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
let done = 0
for (const name of readdirSync(src)) {
  const dir = join(src, name)
  if (!statSync(dir).isDirectory()) continue
  // the character is the largest .fbx (the animation clips next to it are small)
  const fbx = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.fbx'))
    .map((f) => ({ f, size: statSync(join(dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0]
  if (!fbx) {
    console.warn(`${name}: no .fbx file, skipped`)
    continue
  }
  const glb = join(work, `${name}.glb`)
  await convert(join(dir, fbx.f), glb, [])
  const doc = await io.read(glb)
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE], quality: 85 }),
  )
  const target = join(out, `${name}.glb`)
  await io.write(target, doc)
  console.log(`${name}: ${fbx.f} (${(fbx.size / 1e6).toFixed(1)} MB) -> public/models/${name}.glb (${(statSync(target).size / 1e6).toFixed(2)} MB)`)
  done++
}
rmSync(work, { recursive: true, force: true })
console.log(done ? `Done: ${done} model(s).` : 'Nothing converted.')
