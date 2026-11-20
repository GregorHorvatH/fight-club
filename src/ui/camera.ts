/**
 * The two views of the ring. Close: the fighters fill the frame. Far (in front of an arena picture): the camera is pulled back so
 * that they are under half the height of the frame and the arena looks as big as it is; their feet are at the same place on screen.
 */
export const FOV = 32
const VIEW = {
  close: { position: [0, 2.1, 8.6], look: 1.7 },
  far: { position: [0, 3.2, 11.2], look: 2.18 },
} as const
/** How much of the width of the ring must be in the frame: the fighters stand at +-1.8, and a body, a foot or a fist reaches a bit past that. */
export const HALF_WIDTH = 2.6
/** In a tall window, where the feet stand if nothing says otherwise: this far up from the bottom edge, as a fraction of the height. */
const FEET_UP = 0.3

/**
 * The camera for a view, with the fighters moved down the frame by `stand` of its height (the camera goes up by as much).
 * In a tall window (a phone held upright) the frame is narrow: the camera then goes back until both fighters are in it, and
 * looks lower so that they stand over the buttons - they fill the width, as big as they can be. `feetUp` is where their feet are,
 * as a fraction of the height up from the bottom (the page measures it from the buttons); `stand` does not apply there.
 */
export function viewFor(backdrop: boolean, stand: number, aspect = 2, feetUp = FEET_UP): { position: [number, number, number]; look: number } {
  const v = VIEW[backdrop ? 'far' : 'close']
  const tan = Math.tan((FOV * Math.PI) / 360)
  const fit = HALF_WIDTH / (tan * aspect) // the distance at which the width of the ring just fits
  if (fit > v.position[2]) {
    const visible = 2 * fit * tan // the height of the frame at the fighters
    const look = (0.5 - Math.min(0.6, Math.max(0.05, feetUp))) * visible
    return { position: [0, look + (v.position[1] - v.look), fit], look }
  }
  const shift = backdrop ? stand * 2 * v.position[2] * tan : 0
  return { position: [v.position[0], v.position[1] + shift, v.position[2]], look: v.look + shift }
}


/** Is the camera further back than the usual one, because the window is narrow? */
export const isNarrow = (backdrop: boolean, v: { position: readonly number[] }): boolean => v.position[2] > VIEW[backdrop ? 'far' : 'close'].position[2]
