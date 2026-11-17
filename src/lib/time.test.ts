import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  DEFAULT_TIME_ZONE,
  durationLabel,
  endsNextDay,
  fromMinutes,
  hhmm,
  makeFmt,
  matchPreset,
  minutes,
  minutesLabel,
  minutesSince,
  monthEnd,
  periodIssue,
  presetPeriod,
  shiftCovers,
  shiftMinutes,
  shiftTimeIssue,
  signedMinutesLabel,
  spanMinutes,
  toDateTime,
  today,
  venueTimeZone,
  weekDays,
  weekStart,
  zonedDate,
  zonedInstant,
  zonedTime,
  zonedToday,
} from './time'

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

  it('labels minutes, with a sign for differences', () => {
    expect(minutesLabel(45)).toBe('45m')
    expect(minutesLabel(0)).toBe('0h')
    expect(minutesLabel(2310)).toBe('38h 30m')
    expect(signedMinutesLabel(90)).toBe('+1h 30m')
    expect(signedMinutesLabel(-45)).toBe('−45m')
    expect(signedMinutesLabel(0)).toBe('0h')
  })
})

describe('shifts that end the next day', () => {
  it('reads an end at or before the start as the next day', () => {
    expect(spanMinutes('18:00', '02:00')).toBe(8 * 60)
    expect(spanMinutes('23:30:00', '00:15:00')).toBe(45)
    expect(spanMinutes('09:00', '17:00')).toBe(8 * 60)
    expect(endsNextDay('18:00', '02:00')).toBe(true)
    expect(endsNextDay('09:00', '17:00')).toBe(false)
    expect(durationLabel('18:00', '02:30')).toBe('8h 30m')
  })

  it('refuses zero length and more than 16 hours, like the API', () => {
    expect(shiftTimeIssue('18:00', '18:00')).toBe('same-time')
    expect(shiftTimeIssue('08:00', '00:01')).toBe('too-long')
    expect(shiftTimeIssue('08:00', '00:00')).toBeNull()
    expect(shiftTimeIssue('18:00', '02:00')).toBeNull()
  })

  it("uses the API's duration when there is one", () => {
    expect(shiftMinutes({ startTime: '18:00:00', endTime: '02:00:00', durationMinutes: 480 })).toBe(480)
    expect(shiftMinutes({ startTime: '18:00', endTime: '02:00' })).toBe(480)
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

  it('covers the small hours with the night shift of the day before', () => {
    const night = { zoneId: 1, date: '2026-11-20', startTime: '18:00:00', endTime: '02:00:00' }
    expect(shiftCovers(night, at('2026-11-20T23:30:00'))).toBe(true)
    expect(shiftCovers(night, at('2026-11-21T01:00:00'))).toBe(true)
    expect(shiftCovers(night, at('2026-11-21T02:00:00'))).toBe(false)
    expect(shiftCovers(night, at('2026-11-20T01:00:00'))).toBe(false)
    expect(shiftCovers(night, at('2026-11-22T01:00:00'))).toBe(false)
  })
})

describe("the venue's time zone", () => {
  it('shows instants on the venue clock, not the device one', () => {
    expect(zonedTime('2026-11-20T17:02:00Z', 'Europe/Madrid')).toBe('18:02')
    expect(zonedTime('2026-11-20T17:02:00Z', 'Atlantic/Canary')).toBe('17:02')
    expect(zonedTime('2026-07-20T17:02:00Z', 'Europe/Madrid')).toBe('19:02')
  })

  it('puts a night entry across two calendar days', () => {
    const clockIn = '2026-11-20T21:30:00Z'
    const clockOut = '2026-11-21T01:10:00Z'
    expect([zonedDate(clockIn, 'Europe/Madrid'), zonedTime(clockIn, 'Europe/Madrid')]).toEqual(['2026-11-20', '22:30'])
    expect([zonedDate(clockOut, 'Europe/Madrid'), zonedTime(clockOut, 'Europe/Madrid')]).toEqual(['2026-11-21', '02:10'])
    expect(zonedInstant('2026-11-21', '02:10', 'Europe/Madrid')).toBe(clockOut)
    // 23:30 UTC is already the next day in Madrid
    expect(zonedDate('2026-11-20T23:30:00Z', 'Europe/Madrid')).toBe('2026-11-21')
    expect(zonedToday('Europe/Madrid', Date.parse('2026-11-20T23:30:00Z'))).toBe('2026-11-21')
  })

  it('handles the night the clocks go forward (29 March 2026 in Spain)', () => {
    expect(zonedTime('2026-03-29T00:59:00Z', 'Europe/Madrid')).toBe('01:59')
    expect(zonedTime('2026-03-29T01:00:00Z', 'Europe/Madrid')).toBe('03:00')
    expect(zonedInstant('2026-03-29', '01:30', 'Europe/Madrid')).toBe('2026-03-29T00:30:00Z')
    expect(zonedInstant('2026-03-29', '03:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00Z')
    // 02:30 does not exist that night; it moves on by the hour skipped
    expect(zonedInstant('2026-03-29', '02:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00Z')
    // A night shift across the change lasts an hour less on the clock than it looks
    const minutesWorked =
      (Date.parse(zonedInstant('2026-03-29', '06:00', 'Europe/Madrid')) -
        Date.parse(zonedInstant('2026-03-28', '22:00', 'Europe/Madrid'))) /
      60_000
    expect(minutesWorked).toBe(7 * 60)
  })

  it('handles the night the clocks go back (25 October 2026 in Spain)', () => {
    expect(zonedTime('2026-10-25T00:30:00Z', 'Europe/Madrid')).toBe('02:30')
    expect(zonedTime('2026-10-25T01:30:00Z', 'Europe/Madrid')).toBe('02:30')
    expect(zonedInstant('2026-10-25', '02:30', 'Europe/Madrid')).toBe('2026-10-25T01:30:00Z')
    expect(zonedInstant('2026-10-25', '04:00', 'Europe/Madrid')).toBe('2026-10-25T03:00:00Z')
  })

  it('falls back to Madrid for a missing or unknown zone', () => {
    expect(venueTimeZone({ timeZone: 'Atlantic/Canary' })).toBe('Atlantic/Canary')
    expect(venueTimeZone({ timeZone: 'Mars/Olympus' })).toBe(DEFAULT_TIME_ZONE)
    expect(venueTimeZone(null)).toBe('Europe/Madrid')
  })

  it('counts whole minutes since an instant', () => {
    expect(minutesSince('2026-11-20T17:02:00Z', Date.parse('2026-11-20T19:17:59Z'))).toBe(135)
    expect(minutesSince('2026-11-20T17:02:00Z', Date.parse('2026-11-20T17:00:00Z'))).toBe(0)
  })
})

describe('periods', () => {
  const on = '2026-11-18'

  it('works out weeks and months', () => {
    expect(presetPeriod('this-week', on)).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(presetPeriod('last-week', on)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetPeriod('this-month', on)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(presetPeriod('last-month', on)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetPeriod('last-month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(monthEnd('2028-02-03')).toBe('2028-02-29')
  })

  it('recognises a preset from its range', () => {
    expect(matchPreset('2026-11-09', '2026-11-15', on)).toBe('last-week')
    expect(matchPreset('2026-11-09', '2026-11-16', on)).toBeNull()
  })

  it('keeps reports within 366 days and in order', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
    expect(periodIssue('2026-01-01', '2027-01-01')).toBeNull()
    expect(periodIssue('2026-01-01', '2027-01-02')).toBe('too-long')
    expect(periodIssue('2026-11-22', '2026-11-16')).toBe('order')
    // Days stay whole across the clock change
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
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

  it('writes money the local way, grouped from four digits', () => {
    // Intl puts a no-break space before the euro sign
    const plain = (s: string) => s.replace(/\s/g, ' ')
    expect(plain(es.money(1234.5))).toBe('1.234,50 €')
    expect(plain(es.money(12.5))).toBe('12,50 €')
    expect(plain(es.money(0))).toBe('0,00 €')
    expect(en.money(1234.5)).toBe('€1,234.50')
  })

  it('turns minutes into hours with one decimal', () => {
    expect(es.hours(450)).toBe('7,5')
    expect(es.hours(481)).toBe('8')
    expect(en.hours(2310)).toBe('38.5')
  })

  it('names the days around today', () => {
    expect(es.relative(today())).toBe('Hoy')
    expect(es.relative(addDays(today(), 1))).toBe('Mañana')
    expect(en.relative(addDays(today(), -1))).toBe('Yesterday')
    expect(es.agenda(addDays(today(), 1)).title).toBe('Mañana')
  })
})
