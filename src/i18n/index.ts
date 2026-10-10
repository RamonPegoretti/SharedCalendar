import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { enUS, it as itLocale } from 'date-fns/locale'
import type { Language } from '../lib/supabase'
import it from './it'
import en from './en'

function savedLanguage(): Language {
  try {
    return localStorage.getItem('language') === 'en' ? 'en' : 'it'
  } catch {
    return 'it'
  }
}

i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: savedLanguage(),
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem('language', lang)
  } catch {
    // storage unavailable: the choice still applies for this visit
  }
  document.documentElement.lang = lang
  void i18n.changeLanguage(lang)
}

/** date-fns locale for the current language (Italian weeks start on Monday). */
export function dateLocale(lang: string) {
  return lang === 'en' ? enUS : itLocale
}

document.documentElement.lang = i18n.language

export default i18n
