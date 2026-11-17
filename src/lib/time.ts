// Local dates only: the API uses LocalDate / LocalTime / LocalDateTime with no zone

const pad = (n: number) => String(n).padStart(2, '0')

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
  const timeFmt = df({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const numberFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
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
  }
  return fmt
}

export function durationLabel(start: string, end: string): string {
  const mins = minutes(end) - minutes(start)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Mirrors WorkerShiftRepository: same zone, same date, start <= event time < end */
export function shiftCovers(
  shift: { zoneId: number; date: string; startTime: string; endTime: string },
  event: { zoneId: number; dateTime: string },
): boolean {
  if (shift.zoneId !== event.zoneId || shift.date !== eventDate(event.dateTime)) return false
  const t = minutes(eventTime(event.dateTime))
  return minutes(shift.startTime) <= t && minutes(shift.endTime) > t
}
