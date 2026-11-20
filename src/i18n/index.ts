import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { de } from './de'
import { en, type Translation } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { pl } from './pl'
import { pt } from './pt'
import { uk } from './uk'

/** The languages of the game, with their own names (as a player looks for them). More can be added: a file like en.ts and a line here. */
export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
  { id: 'uk', name: 'Українська' },
  { id: 'pt', name: 'Português' },
  { id: 'pl', name: 'Polski' },
  { id: 'it', name: 'Italiano' },
] as const
export type Lang = (typeof LANGUAGES)[number]['id']
export const DEFAULT_LANG: Lang = 'en'
export const isLang = (v: unknown): v is Lang => LANGUAGES.some((l) => l.id === v)

/** The language of the browser, when the game has it; otherwise English (where nothing was chosen yet). */
export function detectLang(preferred: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const p of preferred) {
    const base = p.toLowerCase().split('-')[0]
    if (isLang(base)) return base
  }
  return DEFAULT_LANG
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Translation }
  }
}

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de }, fr: { translation: fr }, es: { translation: es }, uk: { translation: uk }, pt: { translation: pt }, pl: { translation: pl }, it: { translation: it } },
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false }, // React escapes
  returnNull: false,
  react: { useSuspense: false },
})

/** Switches the language of the interface (and of the page). */
export function setLanguage(lang: Lang): void {
  void i18next.changeLanguage(lang)
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export { i18next }
