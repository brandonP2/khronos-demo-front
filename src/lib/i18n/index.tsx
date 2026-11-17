import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { makeFmt, type Fmt } from '../time'
import { en } from './en'
import { es, type Messages } from './es'

// A small typed dictionary per language. Components read strings with useT() and dates
// with useFmt(); both re-render when the language changes from the Account page.

export type { Messages }

export type Locale = 'es' | 'en'

export const LOCALES: { id: Locale; label: string; tag: string }[] = [
  { id: 'es', label: 'Español', tag: 'es-ES' },
  { id: 'en', label: 'English', tag: 'en-GB' },
]

export const DEFAULT_LOCALE: Locale = 'es'

export const dictionaries: Record<Locale, Messages> = { es, en }

const STORAGE_KEY = 'khronos.locale'

function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Messages
  fmt: Fmt
}

const LocaleContext = createContext<LocaleState | null>(null)

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readStoredLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered across reloads, which is fine
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(() => {
    const t = dictionaries[locale]
    const tag = LOCALES.find((l) => l.id === locale)?.tag ?? locale
    return { locale, setLocale, t, fmt: makeFmt(tag, t.dates) }
  }, [locale, setLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

function useLocaleState() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('i18n hooks must be used inside LocaleProvider')
  return ctx
}

/** The strings of the current language: t.team.title, t.common.shifts(3) */
export function useT(): Messages {
  return useLocaleState().t
}

/** Date and number formatting for the current language */
export function useFmt(): Fmt {
  return useLocaleState().fmt
}

export function useLocale() {
  const { locale, setLocale } = useLocaleState()
  return { locale, setLocale }
}
