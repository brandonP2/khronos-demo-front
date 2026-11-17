import { describe, expect, it } from 'vitest'
import { addDays, durationLabel, hhmm, minutes, shiftCovers, toDateTime, weekDays, weekStart } from './time'

describe('dates', () => {
  it('starts the week on Monday', () => {
    expect(weekStart('2026-11-17')).toBe('2026-11-16')
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
  })

  it('lists the seven days of the week', () => {
    expect(weekDays('2026-11-19')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })

  it('adds days across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('builds a local date-time', () => {
    expect(toDateTime('2026-11-17', '19:30:00')).toBe('2026-11-17T19:30:00')
  })
})

describe('times', () => {
  it('reads HH:mm and HH:mm:ss', () => {
    expect(minutes('18:30')).toBe(1110)
    expect(minutes('18:30:00')).toBe(1110)
    expect(hhmm('09:05:00')).toBe('09:05')
  })

  it('labels durations', () => {
    expect(durationLabel('09:00', '17:00')).toBe('8h')
    expect(durationLabel('09:00', '17:45')).toBe('8h 45m')
  })
})

describe('shiftCovers', () => {
  const shift = { zoneId: 1, date: '2026-11-17', startTime: '16:00:00', endTime: '23:00:00' }
  const at = (dateTime: string, zoneId = 1) => ({ zoneId, dateTime })

  it('covers an event that starts while the shift runs', () => {
    expect(shiftCovers(shift, at('2026-11-17T16:00:00'))).toBe(true)
    expect(shiftCovers(shift, at('2026-11-17T22:59:00'))).toBe(true)
  })

  it('does not cover the end time, another zone or another day', () => {
    expect(shiftCovers(shift, at('2026-11-17T23:00:00'))).toBe(false)
    expect(shiftCovers(shift, at('2026-11-17T15:59:00'))).toBe(false)
    expect(shiftCovers(shift, at('2026-11-17T18:00:00', 2))).toBe(false)
    expect(shiftCovers(shift, at('2026-11-18T18:00:00'))).toBe(false)
  })
})
