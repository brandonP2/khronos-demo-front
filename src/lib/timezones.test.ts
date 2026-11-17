import { describe, expect, it } from 'vitest'
import { dictionaries } from './i18n'
import { isValidTimeZone } from './time'
import { COMMON_TIME_ZONES, timeZoneLabel, timeZoneOptions } from './timezones'

describe('venue time zones', () => {
  it('offers only zones the browser knows, Madrid first', () => {
    expect(COMMON_TIME_ZONES[0]).toBe('Europe/Madrid')
    expect(COMMON_TIME_ZONES.filter((zone) => !isValidTimeZone(zone))).toEqual([])
  })

  it("keeps a venue's zone that is not in the list", () => {
    expect(timeZoneOptions('Asia/Tokyo')[0]).toBe('Asia/Tokyo')
    expect(timeZoneOptions('Europe/Madrid')).toHaveLength(COMMON_TIME_ZONES.length)
  })

  it("names Spain's zones in the current language", () => {
    expect(timeZoneLabel('Atlantic/Canary', dictionaries.es)).toBe('Canarias (Atlantic/Canary)')
    expect(timeZoneLabel('Atlantic/Canary', dictionaries.en)).toBe('Canary Islands (Atlantic/Canary)')
    expect(timeZoneLabel('America/Argentina/Buenos_Aires', dictionaries.es)).toBe('America/Argentina/Buenos Aires')
  })
})
