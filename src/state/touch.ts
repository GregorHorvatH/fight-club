/**
 * A phone or a tablet: the main way to point is a finger (no mouse to hover with). There is no keyboard to speak of, so the names of
 * the keys are not shown, and neither is the list of the keys. (A laptop with a touch screen has a mouse as well: it is not "touch".)
 */
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches
