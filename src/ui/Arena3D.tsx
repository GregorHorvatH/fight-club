import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Vector3, type PerspectiveCamera } from 'three'
import { useLayout } from '../state/layout'
import { Component, Suspense, type ReactNode } from 'react'
import { Fighter3D } from './Fighter3D'
import type { Stage } from './arenaView'
import { ModelFighter3D } from './ModelFighter3D'
import type { FighterView } from './arenaView'
import { useGame } from '../state/game'
import { FOV, isNarrow, viewFor } from './camera'
import { fighterOf, type FighterId } from '../state/roster'
import { ModelNotice, Pending } from './ModelLoad'
import { useModelLoad } from '../state/modelLoad'

const modelUrl = (id: FighterId): string => `${import.meta.env.BASE_URL}${fighterOf(id).model}`

/** A phone: a smaller canvas and shadow map keep the memory and the work of the graphics chip down. */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** How high the top of the head of the taller character (with a cap) is above the floor, in units of the figure. */
const HEADS_3D = 3.95

/** The camera drifts slowly from side to side, always looking at the middle of the ring; it follows the shape of the window. */
function CameraRig({ backdrop, stand, fixed, floor }: { backdrop: boolean; stand: number; fixed: boolean; floor: number | null }) {
  useFrame(({ camera, clock, size }) => {
    const feetUp = floor === null ? undefined : floor / size.height
    const v = viewFor(backdrop, stand, size.width / size.height, feetUp)
    const narrow = isNarrow(backdrop, v)
    let y = v.position[1]
    let look = v.look
    camera.position.set(fixed ? camera.position.x : Math.sin(clock.elapsedTime * 0.25) * (narrow ? 0.25 : 0.8), y, v.position[2])
    camera.lookAt(0, look, 0)
    if (narrow && feetUp !== undefined) {
      // the camera looks slightly down, so a flat formula puts the feet a little off: put them exactly where they were asked to be
      // (the point where the fighters stand, projected on the screen, is moved to the height wanted; two steps are plenty)
      const visible = 2 * v.position[2] * Math.tan((camera as PerspectiveCamera).fov * Math.PI / 360)
      for (let i = 0; i < 2; i++) {
        camera.updateMatrixWorld()
        const feet = new Vector3(0, 0, 0).project(camera).y // -1 (bottom) .. 1 (top)
        const wanted = feetUp * 2 - 1
        const dy = ((feet - wanted) / 2) * visible
        y += dy
        look += dy
        camera.position.y = y
        camera.lookAt(0, look, 0)
      }
    }
    // tell the hint where the heads are (the top of the taller character, in its guard, projected on the screen)
    camera.updateMatrixWorld()
    const top = new Vector3(0, HEADS_3D, 0).project(camera).y // -1 (bottom) .. 1 (top)
    useLayout.getState().setHeadsTop(((1 - top) / 2) * size.height)
  })
  return null
}

/** The poster page: the camera is where it was told to be and does not move; it looks straight ahead (along -z), at the height `look`. */
function FixedCamera({ look }: { look: number }) {
  useFrame(({ camera }) => camera.lookAt(camera.position.x, look, 0))
  return null
}

/**
 * If a character model cannot be loaded (a bad connection: it is tried again twice; or it is not there: see scripts/prepare-models.mjs)
 * the game keeps the primitive fighter, and says so.
 */
const RETRIES = 2
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode; url: string }, { failed: boolean }> {
  state = { failed: false }
  private tries = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(): void {
    if (this.tries >= RETRIES) return useModelLoad.getState().fail()
    // the loader remembers a failure: forget it, wait a little, and ask again
    this.timer = setTimeout(() => {
      useLoader.clear(GLTFLoader, this.props.url)
      this.tries += 1
      this.setState({ failed: false })
    }, 1500 * (this.tries + 1))
  }
  componentWillUnmount(): void {
    clearTimeout(this.timer)
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface Props {
  player: FighterView
  enemy: FighterView
  /** changes every round and phase: restarts the fighters' animations */
  sceneKey: string
  /** an arena picture is behind the canvas: the scene is transparent and its floor only catches the shadows */
  backdrop: boolean
  /** how far down the frame the fighters are moved (a fraction of its height) */
  stand: number
  /** a staged scene (the poster page only): the fighters are frozen in a pose and look at the camera */
  stage?: Stage
  /** a tall window: the height of the floor in px above the bottom of the arena (measured from the buttons) */
  floor?: number | null
}

/** The 3D arena (React Three Fiber). Same game, same rules: only the way it is drawn differs. */
export default function Arena3D({ player, enemy, sceneKey, backdrop, stand, stage, floor }: Props) {
  const view = stage?.camera ?? viewFor(backdrop, stand)
  const over = useGame((s) => s.phase === 'over')
  const fighters = useGame((s) => s.fighters)
  return (
    <div className="canvas-wrap">
      <ModelNotice />
      <Canvas
        shadows
        dpr={[1, COARSE ? 1.5 : 2]}
        gl={{ stencil: true, alpha: true }}
        camera={{ position: view.position, fov: FOV }}
        // a phone can take the graphics context away (memory, another tab): let the browser give it back instead of leaving a blank canvas
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())}
      >
        {!backdrop && <color attach="background" args={['#15131d']} />}
        {!backdrop && <fog attach="fog" args={['#15131d', 12, 24]} />}
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#8f86c8', '#1a1626', 0.5]} />
        <directionalLight position={[3, 7, 6]} intensity={2.2} castShadow shadow-mapSize={COARSE ? [512, 512] : [1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-3} />
        <pointLight position={[-5, 3, -3]} intensity={25} color="#3ddbb0" />
        <pointLight position={[5, 3, -3]} intensity={25} color="#ff5a5f" />

        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[40, 20]} />
          {backdrop ? <shadowMaterial opacity={0.4} /> : <meshStandardMaterial color="#1a1626" roughness={0.9} />}
        </mesh>
        {!backdrop && <gridHelper args={[40, 40, '#3a3450', '#241f33']} position={[0, 0.01, 0]} />}

        {(['player', 'enemy'] as const).map((side) => {
          const view = side === 'player' ? player : enemy
          const primitive = <Fighter3D side={side} view={view} settled={over} />
          return (
            <ModelBoundary key={`${side}${sceneKey}`} fallback={primitive} url={modelUrl(fighters[side])}>
              <Suspense fallback={<Pending url={modelUrl(fighters[side])} />}>
                <ModelFighter3D side={side} view={view} settled={over} stage={stage} />
              </Suspense>
            </ModelBoundary>
          )
        })}
        {stage?.camera ? <FixedCamera look={stage.camera.look} /> : <CameraRig backdrop={backdrop} stand={stand} fixed={stage !== undefined} floor={floor ?? null} />}
      </Canvas>
    </div>
  )
}
