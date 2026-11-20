import type { Zone } from '../sim'
import type { FighterView } from './arenaView'
import { STANDARD, type Build } from './pose'

/**
 * Three invisible boxes that stack from the floor up, in a standing pose, in the units of pose.ts: what a pointer can hit in the 3D
 * view. (The characters have tens of thousands of vertices and move every frame: casting a ray against them each time the mouse
 * moves would cost far more than it is worth, and a box is what a thumb hits anyway.)
 *
 * The body is everything from the hips up to the chin: the shoulders, the arms and the chest are all the body. The head is only what
 * is above the chin, and the legs are what is below the hips. The boxes stand where the zones of the fighter's `build` are.
 */
function boxes(b: Build): Record<Zone, { from: number; to: number; w: number }> {
  const hips = b.hipY + b.ankle
  const chin = hips + b.waist + b.neckUp + 0.08
  const top = hips + b.waist + b.neckUp + b.headUp + b.headR + 0.3
  return {
    legs: { from: 0, to: hips, w: 1.1 },
    body: { from: hips, to: chin, w: 1.5 },
    head: { from: chin, to: top, w: 1.0 },
  }
}

/** Place it inside the fighter's root group. It renders nothing when the fighter cannot be picked (no `pick` in the view). */
export function ZoneHits({ view, build = STANDARD, show = false }: { view: FighterView; build?: Build; show?: boolean }) {
  if (!view.pick) return null
  const BOXES = boxes(build)
  return (
    <group>
      {(Object.keys(BOXES) as Zone[]).map((zone) => {
        const b = BOXES[zone]
        const h = b.to - b.from
        return (
          <mesh
            key={zone}
            position={[0, (b.from + b.to) / 2, 0]}
            onClick={(e) => {
              e.stopPropagation()
              view.pick?.(zone)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              if (e.nativeEvent.pointerType === 'mouse') {
                view.over?.(zone)
                document.body.style.cursor = 'pointer'
              }
            }}
            onPointerOut={(e) => {
              if (e.nativeEvent.pointerType === 'mouse') {
                view.over?.(null)
                document.body.style.cursor = ''
              }
            }}
          >
            <boxGeometry args={[b.w, h, 1.2]} />
            <meshBasicMaterial transparent opacity={show ? 0.35 : 0} depthWrite={false} colorWrite={show} color={zone === 'head' ? '#ff0' : zone === 'body' ? '#0f0' : '#0ff'} />
          </mesh>
        )
      })}
    </group>
  )
}
