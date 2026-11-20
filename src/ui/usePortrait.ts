import { useEffect, useState } from 'react'

/** Is the window taller than it is wide (a phone held upright)? Follows the window as it is turned or resized. */
export function usePortrait(): boolean {
  const query = '(orientation: portrait)'
  const [portrait, setPortrait] = useState(() => (typeof matchMedia === 'function' ? matchMedia(query).matches : false))
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setPortrait(m.matches)
    m.addEventListener('change', on)
    on()
    return () => m.removeEventListener('change', on)
  }, [])
  return portrait
}
