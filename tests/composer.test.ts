import { describe, expect, it } from 'vitest'
import { COMPOSED_STEPS, planOf, type Ev } from '../src/audio/composer'
import { JAMES_PROMPT, STYLES } from '../src/audio/styles'
import { FIGHTERS } from '../src/state/roster'

const styles = Object.entries(STYLES)
const events = (id: string): { bar: number; step: number; e: Ev }[] => {
  const out: { bar: number; step: number; e: Ev }[] = []
  planOf(STYLES[id as keyof typeof STYLES]).forEach((bar, b) => bar.forEach((evs, step) => evs.forEach((e) => out.push({ bar: b, step, e }))))
  return out
}

describe('the soundtracks of the fighters', () => {
  it('there is one for every fighter, with a prompt of its own', () => {
    expect(Object.keys(STYLES).sort()).toEqual(FIGHTERS.filter((f) => f.id !== 'james').map((f) => f.id).sort())
    const prompts = [JAMES_PROMPT, ...styles.map(([, s]) => s.prompt)]
    expect(new Set(prompts).size).toBe(prompts.length)
    for (const p of prompts) expect(p).toMatch(/instrumental only/i)
    for (const [, s] of styles) expect(s.prompt).toContain(`${s.bpm} BPM`)
  })

  it('are eight bars each that go round, and different from one another', () => {
    expect(COMPOSED_STEPS).toBe(128)
    const sigs = styles.map(([, s]) => `${s.bpm}|${s.root}|${s.scale.join()}|${s.drums}|${s.bass}|${s.lead}`)
    expect(new Set(sigs).size).toBe(sigs.length)
    expect(new Set(styles.map(([, s]) => s.seed)).size).toBe(styles.length)
  })

  for (const [id, s] of styles) {
    describe(id, () => {
      const evs = events(id)
      const pcs = new Set(s.scale.map((x) => x % 12))
      const inMode = (midi: number, base: number): boolean => pcs.has((((midi - base) % 12) + 12) % 12)

      it('is the same every time it is worked out', () => {
        expect(planOf(s)).toEqual(planOf(s))
      })

      it('has a kick on the first beat of every bar, and the bass plays in every bar', () => {
        for (let bar = 0; bar < 8; bar++) {
          expect(evs.some((x) => x.bar === bar && x.step === 0 && x.e.t === 'kick')).toBe(true)
          expect(evs.some((x) => x.bar === bar && x.e.t === 'bass')).toBe(true)
        }
      })

      it('keeps the notes of the bass, the lead and the arpeggio in the mode (the bass may add its colour notes) and in a range that can be heard', () => {
        const colour = new Set([...(s.colour ?? [])].map((c) => c % 12))
        for (const { e } of evs) {
          if (e.t === 'bass') {
            expect(e.midi).toBeGreaterThanOrEqual(34)
            expect(e.midi).toBeLessThanOrEqual(72)
            const rel = (((e.midi - s.root) % 12) + 12) % 12
            // the root of a chord is on a degree of the mode: the notes are the mode's, or a colour above one of its degrees
            const ok = inMode(e.midi, s.root) || [...s.scale].some((d) => colour.has((((rel - d) % 12) + 12) % 12))
            expect(ok).toBe(true)
          }
          if (e.t === 'lead' || e.t === 'arp') {
            expect(e.midi).toBeGreaterThanOrEqual(48)
            expect(e.midi).toBeLessThanOrEqual(100)
            expect(inMode(e.midi, s.leadRoot)).toBe(true)
          }
        }
      })

      it('lets the bass go quiet for the last two sixteenths of the loop, so that it falls back onto the first beat clean', () => {
        expect(evs.some((x) => x.bar === 7 && x.step >= 14 && x.e.t === 'bass')).toBe(false)
      })

      it('brings the lead in for the second half (with a hint of it in the third bar)', () => {
        const bars = new Set(evs.filter((x) => x.e.t === 'lead').map((x) => x.bar))
        expect([...bars].sort()).toEqual([2, 4, 5, 6, 7])
      })
    })
  }
})
