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

export function eventDate(dateTime: string): string {
  return dateTime.slice(0, 10)
}

export function eventTime(dateTime: string): string {
  return dateTime.slice(11, 16)
}

export function toDateTime(date: string, time: string): string {
  return `${date}T${hhmm(time)}:00`
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

export const fmt = {
  day: (iso: string) => dayFmt.format(parseISODate(iso)),
  long: (iso: string) => longFmt.format(parseISODate(iso)),
  weekday: (iso: string) => weekdayFmt.format(parseISODate(iso)),
  dayNumber: (iso: string) => String(parseISODate(iso).getDate()),
  month: (iso: string) => monthFmt.format(parseISODate(iso)),
  /** Two lines for agenda headers: "Tomorrow" over "17 November", or "Thursday" over "19 November" */
  agenda(iso: string): { title: string; sub: string } {
    const d = parseISODate(iso)
    const rel = fmt.relative(iso)
    const sub = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(d)
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(d)
    return { title: rel === longFmt.format(d) ? weekday : rel, sub: rel === longFmt.format(d) ? sub : `${weekday} ${sub}` }
  },
  relative(iso: string): string {
    const t = today()
    if (iso === t) return 'Today'
    if (iso === addDays(t, 1)) return 'Tomorrow'
    if (iso === addDays(t, -1)) return 'Yesterday'
    return longFmt.format(parseISODate(iso))
  },
  /** "Week of 16 Nov" */
  week(iso: string): string {
    const days = weekDays(iso)
    const a = parseISODate(days[0])
    const b = parseISODate(days[6])
    const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    return `${short.format(a)} – ${short.format(b)}`
  },
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
