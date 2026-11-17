import { describe, expect, it } from 'vitest'
import { addDays, durationLabel, fromMinutes, hhmm, makeFmt, minutes, shiftCovers, toDateTime, today, weekDays, weekStart } from './time'

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

  it('turns minutes back into HH:mm', () => {
    expect(fromMinutes(0)).toBe('00:00')
    expect(fromMinutes(23 * 60 + 59)).toBe('23:59')
    expect(fromMinutes(19 * 60 + 30)).toBe('19:30')
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

describe('makeFmt', () => {
  const es = makeFmt('es-ES', { today: 'Hoy', tomorrow: 'Mañana', yesterday: 'Ayer' })
  const en = makeFmt('en-GB', { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' })

  it('formats dates in Spanish with capitals where a line starts', () => {
    expect(es.long('2026-11-16')).toBe('Lunes, 16 de noviembre')
    expect(es.weekday('2026-11-16')).toBe('Lun')
    expect(es.weekdayLong('2026-11-21')).toBe('sábado')
    expect(es.month('2026-11-16')).toBe('Noviembre de 2026')
    expect(es.week('2026-11-18')).toBe('16 nov – 22 nov')
  })

  it('keeps the English formats', () => {
    expect(en.long('2026-11-16')).toBe('Monday 16 November')
    expect(en.weekday('2026-11-16')).toBe('Mon')
    expect(en.week('2026-11-18')).toBe('16 Nov – 22 Nov')
  })

  it('uses a 24-hour clock and local decimals', () => {
    const evening = new Date(2026, 10, 16, 21, 5).getTime()
    expect(es.time(evening)).toBe('21:05')
    expect(en.time(evening)).toBe('21:05')
    expect(es.number(7.5)).toBe('7,5')
    expect(en.number(7.5)).toBe('7.5')
    expect(es.number(8)).toBe('8')
  })

  it('names the days around today', () => {
    expect(es.relative(today())).toBe('Hoy')
    expect(es.relative(addDays(today(), 1))).toBe('Mañana')
    expect(en.relative(addDays(today(), -1))).toBe('Yesterday')
    expect(es.agenda(addDays(today(), 1)).title).toBe('Mañana')
  })
})
