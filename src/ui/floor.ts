import { useLayoutEffect, useRef, useState } from 'react'

/**
 * How high above the bottom of the arena the fighters' feet stand when the window is tall, so that the gap between the top of the
 * "Punch" button and the fighters is the same as the gap between the "Kick" button and the bottom edge of the window.
 *
 * @param arenaBottom the bottom edge of the arena
 * @param stackTop the top edge of the stack of the two buttons (the top of "Punch")
 * @param stackBottom the bottom edge of the stack (the bottom of "Kick")
 */
export function floorAbove(arenaBottom: number, stackTop: number, stackBottom: number): number {
  const gap = arenaBottom - stackBottom
  return arenaBottom - stackTop + gap
}

/**
 * Measures the buttons on the field and gives the height of the floor (px from the bottom of the arena) for a tall window, or null
 * when the window is wide (the fighters then stand where the view puts them, far from the buttons). Follows every change of size.
 * Returns the ref for the arena element and the measured height.
 */
export function useFloor(tall: boolean): { ref: React.RefObject<HTMLDivElement | null>; floor: number | null } {
  const ref = useRef<HTMLDivElement>(null)
  const [floor, setFloor] = useState<number | null>(null)
  useLayoutEffect(() => {
    const arena = ref.current
    const stack = arena?.querySelector('.side.left')
    if (!tall || !arena || !stack) {
      setFloor(null)
      return
    }
    const measure = () => {
      const a = arena.getBoundingClientRect()
      const s = stack.getBoundingClientRect()
      const f = Math.round(floorAbove(a.bottom, s.top, s.bottom))
      setFloor((old) => (old === f ? old : f))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(arena)
    ro.observe(stack)
    return () => ro.disconnect()
  }, [tall])
  return { ref, floor }
}
