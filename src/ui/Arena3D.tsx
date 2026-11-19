import { Canvas, useFrame } from '@react-three/fiber'
import { Component, Suspense, type ReactNode } from 'react'
import { Fighter3D } from './Fighter3D'
import { ModelFighter3D } from './ModelFighter3D'
import type { FighterView } from './arenaView'
import { useGame } from '../state/game'

/**
 * The two views of the ring. Close: the fighters fill the frame. Far (in front of an arena picture): the camera is pulled back so
 * that they are under half the height of the frame and the arena looks as big as it is; their feet are at the same place on screen.
 */
const FOV = 32
const VIEW = {
  close: { position: [0, 2.1, 8.6], look: 1.7 },
  far: { position: [0, 3.2, 11.2], look: 2.18 },
} as const
/** The camera for a view, with the fighters moved down the frame by `stand` of its height (the camera goes up by as much). */
function viewFor(backdrop: boolean, stand: number): { position: [number, number, number]; look: number } {
  const v = VIEW[backdrop ? 'far' : 'close']
  const shift = backdrop ? stand * 2 * v.position[2] * Math.tan((FOV * Math.PI) / 360) : 0
  return { position: [v.position[0], v.position[1] + shift, v.position[2]], look: v.look + shift }
}

/** The camera drifts slowly from side to side, always looking at the middle of the ring. */
function CameraRig({ look }: { look: number }) {
  useFrame(({ camera, clock }) => {
    camera.position.x = Math.sin(clock.elapsedTime * 0.25) * 0.8
    camera.lookAt(0, look, 0)
  })
  return null
}

/** If the character models cannot be loaded (they are not in the repository: see scripts/prepare-models.mjs) the game keeps the primitive fighters. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
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
}

/** The 3D arena (React Three Fiber). Same game, same rules: only the way it is drawn differs. */
export default function Arena3D({ player, enemy, sceneKey, backdrop, stand }: Props) {
  const view = viewFor(backdrop, stand)
  const over = useGame((s) => s.phase === 'over')
  return (
    <div className="canvas-wrap">
      <Canvas shadows dpr={[1, 2]} gl={{ stencil: true, alpha: true }} camera={{ position: view.position, fov: FOV }}>
        {!backdrop && <color attach="background" args={['#15131d']} />}
        {!backdrop && <fog attach="fog" args={['#15131d', 12, 24]} />}
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#8f86c8', '#1a1626', 0.5]} />
        <directionalLight position={[3, 7, 6]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-3} />
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
            <ModelBoundary key={`${side}${sceneKey}`} fallback={primitive}>
              <Suspense fallback={null}>
                <ModelFighter3D side={side} view={view} settled={over} />
              </Suspense>
            </ModelBoundary>
          )
        })}
        <CameraRig look={view.look} />
      </Canvas>
    </div>
  )
}
