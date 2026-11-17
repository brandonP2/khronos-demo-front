import { describe, expect, it } from 'vitest'
import { dictionaries, type Locale } from '.'
import { count } from './count'

/** "team.title: string", "common.shifts: function", ... for every leaf of a dictionary */
function shape(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => shape(child, path ? `${path}.${key}` : key))
  }
  const kind = Array.isArray(value) ? `array(${value.length})` : typeof value
  return [`${path}: ${kind}`]
}

describe('dictionaries', () => {
  const [base, ...others] = Object.keys(dictionaries) as Locale[]

  it.each(others)('%s has the same keys and value kinds as the default language', (locale) => {
    expect(shape(dictionaries[locale]).sort()).toEqual(shape(dictionaries[base]).sort())
  })

  it.each(Object.keys(dictionaries) as Locale[])('%s has no empty strings', (locale) => {
    const empty = shape(dictionaries[locale])
      .map((line) => line.split(': ')[0])
      .filter((path) => {
        const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionaries[locale])
        return typeof value === 'string' && value.trim() === ''
      })
    expect(empty).toEqual([])
  })

  it('words plurals per language', () => {
    expect(dictionaries.es.common.shifts(1)).toBe('1 turno')
    expect(dictionaries.es.common.shifts(3)).toBe('3 turnos')
    expect(dictionaries.en.common.shifts(1)).toBe('1 shift')
    expect(dictionaries.en.common.shifts(3)).toBe('3 shifts')
    expect(dictionaries.es.common.wait(45)).toBe('45 segundos')
    expect(dictionaries.es.common.wait(61)).toBe('2 minutos')
  })

  it('counts with one shared helper', () => {
    expect(count(1, 'turno', 'turnos')).toBe('1 turno')
    expect(count(0, 'turno', 'turnos')).toBe('0 turnos')
    expect(count(2, 'local', 'locales')).toBe('2 locales')
    expect(count(2, 'shift')).toBe('2 shifts')
    expect(count(3, 'person', 'people')).toBe('3 people')
  })
})
