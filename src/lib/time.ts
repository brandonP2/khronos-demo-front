// Dates and times. The plan (shifts, events) uses LocalDate / LocalTime / LocalDateTime with no
// zone. Time entries are UTC instants, always shown in the venue's time zone, never the device's.

const pad = (n: number) => String(n).padStart(2, '0')

const DAY_MINUTES = 24 * 60

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Monday of the week that holds the date */
export function weekStart(iso: string): string {
  const d = parseISODate(iso)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return toISODate(d)
}

export function weekDays(iso: string): string[] {
  const start = weekStart(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Whole days from one date to another: 2026-11-16 to 2026-11-22 is 6 */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000)
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function monthEnd(iso: string): string {
  const d = parseISODate(monthStart(iso))
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/* ---------- Periods for the hours reports ---------- */

export type PeriodPreset = 'this-week' | 'last-week' | 'this-month' | 'last-month'

export const PERIOD_PRESETS: PeriodPreset[] = ['this-week', 'last-week', 'this-month', 'last-month']

/** The API takes at most 366 days per report; counted inclusive here so a request never goes over */
export const MAX_PERIOD_DAYS = 366

export function presetPeriod(preset: PeriodPreset, on: string = today()): { from: string; to: string } {
  switch (preset) {
    case 'this-week':
      return { from: weekStart(on), to: addDays(weekStart(on), 6) }
    case 'last-week':
      return { from: addDays(weekStart(on), -7), to: addDays(weekStart(on), -1) }
    case 'this-month':
      return { from: monthStart(on), to: monthEnd(on) }
    case 'last-month': {
      const previous = addDays(monthStart(on), -1)
      return { from: monthStart(previous), to: monthEnd(previous) }
    }
  }
}

/** The preset that gives exactly this range, if any */
export function matchPreset(from: string, to: string, on: string = today()): PeriodPreset | null {
  return PERIOD_PRESETS.find((p) => {
    const range = presetPeriod(p, on)
    return range.from === from && range.to === to
  }) ?? null
}

export type PeriodIssue = 'order' | 'too-long'

export function periodIssue(from: string, to: string): PeriodIssue | null {
  if (from > to) return 'order'
  if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS) return 'too-long'
  return null
}

/** "18:00:00" or "18:00" to "18:00" */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 1110 to "18:30" */
export function fromMinutes(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/* ---------- Shifts that end the next day ---------- */

/** The API refuses longer shifts */
export const MAX_SHIFT_MINUTES = 16 * 60

/** Minutes from start to end. An end at or before the start is on the next day: 18:00–02:00 is 480. */
export function spanMinutes(start: string, end: string): number {
  const diff = minutes(end) - minutes(start)
  return diff > 0 ? diff : diff + DAY_MINUTES
}

/** 18:00–02:00 ends the next day. Equal times would be a zero-length shift, which the API refuses. */
export function endsNextDay(start: string, end: string): boolean {
  return minutes(end) <= minutes(start)
}

export type ShiftTimeIssue = 'same-time' | 'too-long'

/** Checks the API makes on a shift's times: no zero length, 16 hours at most */
export function shiftTimeIssue(start: string, end: string): ShiftTimeIssue | null {
  if (!start || !end) return null
  if (minutes(start) === minutes(end)) return 'same-time'
  if (spanMinutes(start, end) > MAX_SHIFT_MINUTES) return 'too-long'
  return null
}

/** Length of a shift: the API's durationMinutes, or worked out from the times for a draft */
export function shiftMinutes(shift: { startTime: string; endTime: string; durationMinutes?: number }): number {
  return shift.durationMinutes ?? spanMinutes(shift.startTime, shift.endTime)
}

/** 525 to "8h 45m", 480 to "8h", 45 to "45m" */
export function minutesLabel(total: number): string {
  const abs = Math.abs(Math.round(total))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return h && m ? `${h}h ${m}m` : m ? `${m}m` : `${h}h`
}

/** Differences always carry a sign, so they read without colour: "+1h 30m", "−45m", "0h" */
export function signedMinutesLabel(total: number): string {
  if (total > 0) return `+${minutesLabel(total)}`
  if (total < 0) return `−${minutesLabel(total)}`
  return minutesLabel(0)
}

/* ---------- The venue's time zone ---------- */

/** What a venue uses until it says otherwise, as in the API */
export const DEFAULT_TIME_ZONE = 'Europe/Madrid'

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let format = zoneFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    zoneFormats.set(timeZone, format)
  }
  return format
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormat(timeZone)
    return true
  } catch {
    return false
  }
}

/** The venue's zone, falling back to the default for a missing or unknown one */
export function venueTimeZone(venue: { timeZone?: string | null } | null | undefined): string {
  const zone = venue?.timeZone
  return zone && isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE
}

const toEpoch = (instant: string | number) => (typeof instant === 'number' ? instant : Date.parse(instant))

/** What a wall clock in the zone reads at an instant */
function wallClock(epochMs: number, timeZone: string) {
  const parts = zoneFormat(timeZone).formatToParts(new Date(epochMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** The venue's calendar date at an instant: "2026-11-21" */
export function zonedDate(instant: string | number, timeZone: string): string {
  const w = wallClock(toEpoch(instant), timeZone)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

/** The venue's clock at an instant: "02:10" */
export function zonedTime(instant: string | number, timeZone: string): string {
  const w = wallClock(toEpoch(instant), timeZone)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/** Today's date where the venue is, which can differ from the device's */
export function zonedToday(timeZone: string, now: number = Date.now()): string {
  return zonedDate(now, timeZone)
}

/** How far the zone's clock is ahead of UTC at an instant, in milliseconds */
function zoneOffset(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(epochMs / 1000) * 1000
}

/**
 * The instant at which the venue's clock reads `time` on `date`, as UTC ISO-8601
 * ("2026-11-20T17:02:00Z"). When the clocks go back, a time that happens twice gives the
 * second one; when they go forward, a time that does not exist moves on by the gap.
 */
export function zonedInstant(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = minutes(time)
  const wall = Date.UTC(y, m - 1, d, Math.floor(t / 60), t % 60)
  let epoch = wall - zoneOffset(wall, timeZone)
  // The guess used the offset at the wall time; near a change the offset at the result can differ
  const offset = zoneOffset(epoch, timeZone)
  if (wall - offset !== epoch) epoch = wall - offset
  return new Date(epoch).toISOString().replace('.000Z', 'Z')
}

/** When a shift starts and ends on the venue's clock, as epoch milliseconds */
export function shiftWindow(
  shift: { date: string; startTime: string; endTime: string },
  timeZone: string,
): { start: number; end: number } {
  const endDate = endsNextDay(shift.startTime, shift.endTime) ? addDays(shift.date, 1) : shift.date
  return {
    start: Date.parse(zonedInstant(shift.date, hhmm(shift.startTime), timeZone)),
    end: Date.parse(zonedInstant(endDate, hhmm(shift.endTime), timeZone)),
  }
}

/** Whole minutes from an instant to another (now by default) */
export function minutesSince(instant: string, until: number = Date.now()): number {
  return Math.max(0, Math.floor((until - Date.parse(instant)) / 60_000))
}

export function eventDate(dateTime: string): string {
  return dateTime.slice(0, 10)
}

export function eventTime(dateTime: string): string {
  return dateTime.slice(11, 16)
}

export function toDateTime(date: string, time: string): string {
  return `${date}T${hhmm(time)}:00`
}

/** Words that dates turn into near today, in the current language */
export interface RelativeDayWords {
  today: string
  tomorrow: string
  yesterday: string
}

export type Fmt = ReturnType<typeof makeFmt>

/**
 * Date formatting for one locale ("es-ES", "en-GB"): 24-hour clock, weeks from Monday.
 * Components get the one for the current language from useFmt() in lib/i18n.
 */
export function makeFmt(locale: string, words: RelativeDayWords) {
  const df = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options)
  const dayFmt = df({ weekday: 'short', day: 'numeric', month: 'short' })
  const longFmt = df({ weekday: 'long', day: 'numeric', month: 'long' })
  const weekdayFmt = df({ weekday: 'short' })
  const weekdayLongFmt = df({ weekday: 'long' })
  const monthFmt = df({ month: 'long', year: 'numeric' })
  const dayMonthFmt = df({ day: 'numeric', month: 'long' })
  const shortFmt = df({ day: 'numeric', month: 'short' })
  const rangeEndFmt = df({ day: 'numeric', month: 'short', year: 'numeric' })
  const timeFmt = df({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const numberFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  // Spanish leaves four-digit numbers ungrouped by default; amounts of money read better grouped: 1.234,50 €.
  // useGrouping: 'always' is ES2023 Intl, which the ES2022 lib types only know as a boolean.
  const moneyOptions = { style: 'currency', currency: 'EUR', useGrouping: 'always' }
  const moneyFmt = new Intl.NumberFormat(locale, moneyOptions as unknown as Intl.NumberFormatOptions)
  // Spanish writes weekdays and months in lower case; lines that stand on their own start with a capital
  const cap = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
  const date = parseISODate

  const fmt = {
    locale,
    /** "lun, 16 nov" / "Mon 16 Nov" */
    day: (iso: string) => dayFmt.format(date(iso)),
    /** "Lunes, 16 de noviembre" / "Monday 16 November" */
    long: (iso: string) => cap(longFmt.format(date(iso))),
    /** "Lun" / "Mon" */
    weekday: (iso: string) => cap(weekdayFmt.format(date(iso))),
    /** "lunes" / "Monday", for use inside a sentence */
    weekdayLong: (iso: string) => weekdayLongFmt.format(date(iso)),
    dayNumber: (iso: string) => String(date(iso).getDate()),
    /** "Noviembre de 2026" / "November 2026" */
    month: (iso: string) => cap(monthFmt.format(date(iso))),
    /** "14:05" from epoch milliseconds */
    time: (epochMs: number) => timeFmt.format(new Date(epochMs)),
    /** "7,5" / "7.5" */
    number: (n: number) => numberFmt.format(n),
    /** "1.234,50 €" / "€1,234.50" */
    money: (n: number) => moneyFmt.format(n),
    /** Hours with one decimal from minutes: 450 to "7,5" */
    hours: (mins: number) => numberFmt.format(Math.round(mins / 6) / 10),
    /** "Today", "Tomorrow", "Yesterday", or the long date */
    relative(iso: string): string {
      const t = today()
      if (iso === t) return words.today
      if (iso === addDays(t, 1)) return words.tomorrow
      if (iso === addDays(t, -1)) return words.yesterday
      return fmt.long(iso)
    },
    /** Two lines for agenda headers: "Tomorrow" over "Wednesday 18 November", or "Thursday" over "19 November" */
    agenda(iso: string): { title: string; sub: string } {
      const d = date(iso)
      const weekday = cap(weekdayLongFmt.format(d))
      const sub = dayMonthFmt.format(d)
      const rel = fmt.relative(iso)
      return rel === fmt.long(iso) ? { title: weekday, sub } : { title: rel, sub: `${weekday} ${sub}` }
    },
    /** "16 nov – 22 nov" for the week that holds the date */
    week(iso: string): string {
      const days = weekDays(iso)
      return `${shortFmt.format(date(days[0]))} – ${shortFmt.format(date(days[6]))}`
    },
    /** "16 nov" */
    short: (iso: string) => shortFmt.format(date(iso)),
    /** "1 nov – 30 nov 2026", or one date when both are the same */
    range(from: string, to: string): string {
      const end = rangeEndFmt.format(date(to))
      return from === to ? end : `${shortFmt.format(date(from))} – ${end}`
    },
  }
  return fmt
}

/** "8h 45m"; an end at or before the start is on the next day */
export function durationLabel(start: string, end: string): string {
  return minutesLabel(spanMinutes(start, end))
}

/**
 * Mirrors the API rule: same zone, and the event's local time falls in [start, end) of the
 * shift. A shift that ends the next day covers the small hours too, so Friday 18:00–02:00
 * covers an event on Saturday at 01:00.
 */
export function shiftCovers(
  shift: { zoneId: number; date: string; startTime: string; endTime: string },
  event: { zoneId: number; dateTime: string },
): boolean {
  if (shift.zoneId !== event.zoneId) return false
  const day = eventDate(event.dateTime)
  const offset = day === shift.date ? 0 : day === addDays(shift.date, 1) ? DAY_MINUTES : null
  if (offset === null) return false
  const t = offset + minutes(eventTime(event.dateTime))
  const start = minutes(shift.startTime)
  return start <= t && t < start + spanMinutes(shift.startTime, shift.endTime)
}
