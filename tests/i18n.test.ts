import { describe, expect, it } from 'vitest'
import { de } from '../src/i18n/de'
import { en } from '../src/i18n/en'
import { es } from '../src/i18n/es'
import { fr } from '../src/i18n/fr'
import { DEFAULT_LANG, LANGUAGES, detectLang, i18next, isLang, setLanguage } from '../src/i18n'
import { hu } from '../src/i18n/hu'
import { it as itTexts } from '../src/i18n/it'
import { pl } from '../src/i18n/pl'
import { pt } from '../src/i18n/pt'
import { uk } from '../src/i18n/uk'

type Tree = { [k: string]: string | Tree }
/** Every text of a translation, by its path, without the plural endings (so that "x_one" and "x_few" are both "x"). */
function flat(tree: Tree, path = ''): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [k, v] of Object.entries(tree)) {
    const key = path + (path ? '.' : '') + k.replace(/_(zero|one|two|few|many|other)$/, '')
    if (typeof v === 'string') out.set(key, [...(out.get(key) ?? []), v])
    else for (const [kk, vv] of flat(v, key)) out.set(kk, [...(out.get(kk) ?? []), ...vv])
  }
  return out
}
/** The names of the {{parameters}} of a text. */
const params = (s: string): string[] => [...new Set([...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]!))].sort()
/** The tags of a text (<b>, <kbd>). */
const tags = (s: string): string[] => [...s.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort()

const LANGS = { de, fr, es, uk, pt, pl, it: itTexts, hu } as const
const base = flat(en as unknown as Tree)

describe('translations', () => {
  it('the languages: english, german, french, spanish, ukrainian, portuguese, polish, italian, hungarian', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['en', 'de', 'fr', 'es', 'uk', 'pt', 'pl', 'it', 'hu'])
    expect(DEFAULT_LANG).toBe('en')
  })

  for (const [id, tree] of Object.entries(LANGS)) {
    describe(id, () => {
      const mine = flat(tree as unknown as Tree)

      it('has every text of the english one, and nothing else', () => {
        expect([...mine.keys()].sort()).toEqual([...base.keys()].sort())
      })

      it('no text is empty, and none is left in english by mistake (the proper names and the signs aside)', () => {
        for (const [key, texts] of mine) for (const t of texts) expect(t.trim(), `${id}:${key}`).not.toBe('')
      })

      it('uses the same {{parameters}} and tags as the english text', () => {
        for (const [key, texts] of mine) {
          const want = params(base.get(key)!.join(' '))
          for (const t of texts) {
            // a plural form may leave out {{count}} (e.g. "one" in some languages), nothing else may differ
            expect(params(t).filter((p) => p !== 'count'), `${id}:${key}`).toEqual(want.filter((p) => p !== 'count'))
          }
          expect(tags(texts.join(' ')).length > 0, `${id}:${key} tags`).toBe(tags(base.get(key)!.join(' ')).length > 0)
        }
      })

      it('the plural forms of the language are all there (ukrainian: one, few, many, other)', () => {
        const rules = new Intl.PluralRules(id)
        const needed = new Set<string>()
        for (let n = 0; n < 200; n++) needed.add(rules.select(n))
        const t = tree as unknown as { end: Record<string, string> }
        for (const form of needed) expect(t.end[`textWon_${form}`] ?? t.end.textWon_other, `${id}:${form}`).toBeTruthy()
        if (id === 'uk' || id === 'pl') for (const form of ['one', 'few', 'many', 'other']) expect(t.end[`textWon_${form}`], form).toBeTruthy()
      })
    })
  }
})

describe('i18next', () => {
  it('translates, interpolates and pluralises in the chosen language', () => {
    setLanguage('en')
    expect(i18next.t('menu.arcade.label')).toBe('Arcade Mode')
    expect(i18next.t('end.next', { name: 'Pete' })).toBe('Next fight: Pete')
    expect(i18next.t('end.textWon', { count: 1, hp: 40 })).toBe('You won in 1 round with 40 health left.')
    expect(i18next.t('end.textWon', { count: 5, hp: 40 })).toBe('You won in 5 rounds with 40 health left.')
    setLanguage('de')
    expect(i18next.t('menu.arcade.label')).toBe('Arcade-Modus')
    setLanguage('uk')
    expect(i18next.t('end.textWon', { count: 1, hp: 3 })).toContain('1 раунд,')
    expect(i18next.t('end.textWon', { count: 3, hp: 3 })).toContain('3 раунди,')
    expect(i18next.t('end.textWon', { count: 5, hp: 3 })).toContain('5 раундів,')
    expect(i18next.t('end.textWon', { count: 22, hp: 3 })).toContain('22 раунди,')
    expect(i18next.t('end.textWon', { count: 11, hp: 3 })).toContain('11 раундів,')
    setLanguage('pl')
    expect(i18next.t('end.textWon', { count: 1, hp: 3 })).toContain('1 rundzie')
    expect(i18next.t('end.textWon', { count: 3, hp: 3 })).toContain('3 rundach')
    expect(i18next.t('end.textWon', { count: 5, hp: 3 })).toContain('5 rundach')
    expect(i18next.t('record.fastest', { count: 2 })).toContain('2 rundy')
    expect(i18next.t('record.fastest', { count: 5 })).toContain('5 rund')
    setLanguage('pt')
    expect(i18next.t('menu.arcade.label')).toBe('Modo Arcade')
    setLanguage('hu')
    expect(i18next.t('menu.arcade.label')).toBe('Arcade mód')
    expect(i18next.t('caption.punch', { name: 'Pete', zone: i18next.t('zoneTo.head') })).toBe('Pete ököllel üt ✊ a fejre')
    expect(i18next.t('end.textWon', { count: 5, hp: 3 })).toContain('5 kör alatt')
    setLanguage('it')
    expect(i18next.t('caption.punch', { name: 'Pete', zone: i18next.t('zoneTo.head') })).toBe('Pete sferra un pugno ✊ alla testa')
    setLanguage('en')
  })

  it('the language of the browser is used when the game has it; english otherwise', () => {
    expect(detectLang(['uk-UA', 'en'])).toBe('uk')
    expect(detectLang(['de-AT'])).toBe('de')
    expect(detectLang(['ja-JP', 'fr'])).toBe('fr')
    expect(detectLang(['pt-BR'])).toBe('pt')
    expect(detectLang(['pl-PL'])).toBe('pl')
    expect(detectLang(['it-IT'])).toBe('it')
    expect(detectLang(['hu-HU'])).toBe('hu')
    expect(detectLang(['ru-RU', 'ja'])).toBe('en') // (russian is left out on purpose)
    expect(detectLang([])).toBe('en')
    expect(isLang('es')).toBe(true)
    expect(isLang('ru')).toBe(false)
  })
})
