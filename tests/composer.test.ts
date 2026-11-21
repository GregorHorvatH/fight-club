import { describe, expect, it } from 'vitest'
import { formOf, planOf, stepsOf, type Ev } from '../src/audio/composer'
import { JAMES_PROMPT, STYLES } from '../src/audio/styles'
import { FIGHTERS } from '../src/state/roster'

const styles = Object.entries(STYLES)
const events = (id: string): { bar: number; step: number; e: Ev }[] => {
  const out: { bar: number; step: number; e: Ev }[] = []
  planOf(STYLES[id as keyof typeof STYLES]).forEach((bar, b) => bar.forEach((evs, step) => evs.forEach((e) => out.push({ bar: b, step, e }))))
  return out
}

describe("Amy's soundtrack is a minute long", () => {
  const amy = STYLES.amy
  it('is nine sections of four bars, about a minute at 148 beats a minute', () => {
    expect(formOf(amy)).toHaveLength(9)
    const seconds = (stepsOf(amy) / 4) * (60 / amy.bpm)
    expect(seconds).toBeGreaterThan(55)
    expect(seconds).toBeLessThan(65)
  })

  it('still begins as the loop that it was: the first eight bars are the groove and the first lead', () => {
    // (not the sparkles, which are chance; and a loop of eight bars ends at the eighth, where the bass leaves the last two sixteenths)
    const same = (plan: ReturnType<typeof planOf>): Ev[][][] => plan.slice(0, 8).map((b, bar) => b.map((e, st) => e.filter((x) => !(x.t === 'extra' && x.kind === 'sparkle') && !(bar === 7 && st >= 14 && x.t === 'bass'))))
    const plain = same(planOf({ ...amy, form: undefined }))
    const long = same(planOf(amy))
    expect(long).toEqual(plain)
  })

  it('drops the drums and the bass in the breakdown, and builds a riser into the drop', () => {
    const ev = events('amy')
    const bars = [16, 17, 18, 19]
    expect(ev.some((x) => bars.includes(x.bar) && (x.e.t === 'kick' || x.e.t === 'snare' || x.e.t === 'clap' || x.e.t === 'bass'))).toBe(false)
    expect(ev.some((x) => x.bar === 19 && x.step === 8 && x.e.t === 'extra' && x.e.kind === 'riser')).toBe(true)
    expect(ev.some((x) => x.bar === 20 && x.step === 0 && x.e.t === 'kick')).toBe(true) // and the drop is on the beat
  })

  it('thins out at the end so that the loop falls back onto the intro: a kick on the first beat of the first bar, nothing hanging over', () => {
    const ev = events('amy')
    expect(ev.some((x) => x.bar === 0 && x.step === 0 && x.e.t === 'kick')).toBe(true)
    expect(ev.some((x) => x.bar === 35 && x.step >= 14 && x.e.t === 'bass')).toBe(false)
    expect(ev.filter((x) => x.bar >= 33 && x.e.t === 'lead')).toHaveLength(0)
  })
})

describe('the soundtracks of the fighters', () => {
  it('there is one for every fighter, with a prompt of its own', () => {
    expect(Object.keys(STYLES).sort()).toEqual(FIGHTERS.filter((f) => f.id !== 'james').map((f) => f.id).sort())
    const prompts = [JAMES_PROMPT, ...styles.map(([, s]) => s.prompt)]
    expect(new Set(prompts).size).toBe(prompts.length)
    for (const p of prompts) expect(p).toMatch(/instrumental only/i)
    for (const [, s] of styles) expect(s.prompt).toContain(`${s.bpm} BPM`)
  })

  it('are eight bars each that go round, and different from one another', () => {
    for (const [, s] of styles) expect(stepsOf(s) % 64).toBe(0) // whole sections of four bars
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
        const last = stepsOf(s) / 16 - 1
        expect(evs.some((x) => x.bar === last && x.step >= 14 && x.e.t === 'bass')).toBe(false)
      })

      it('plays the lead in the bars the form gives it (a plain loop: a hint in the third bar, then the second half)', () => {
        const bars = new Set(evs.filter((x) => x.e.t === 'lead').map((x) => x.bar))
        const wanted = formOf(s).flatMap((section, i) => section.lead.map((p, k) => (p === null ? -1 : i * 4 + k))).filter((b) => b >= 0)
        expect([...bars].sort((a, b) => a - b)).toEqual(wanted)
        if (!s.form) expect(wanted).toEqual([2, 4, 5, 6, 7])
      })
    })
  }
})
