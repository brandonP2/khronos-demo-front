import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { DateRange, KEvent, Shift } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { Empty, ErrorNote, Loading, PageHead, pluralize } from '../../components/ui'
import { keys } from '../../lib/queries'
import { addDays, durationLabel, eventDate, eventTime, fmt, hhmm, minutes, shiftCovers, today, weekDays } from '../../lib/time'

/** A worker's own view: their shifts by day, with the events they are on inside each shift */
export default function MySchedule() {
  const me = useMe()
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')

  const t = today()
  const week = weekDays(t)
  // From Monday of this week on, which also covers this week's hours; the past is fetched only when shown
  const ahead: DateRange = { from: week[0] }
  const past: DateRange = { to: addDays(t, -1) }

  const worker = useQuery({ queryKey: keys.worker(me.id), queryFn: () => api.workers.get(me.id) })
  const venueId = worker.data?.establishmentId
  const venue = useQuery({
    queryKey: keys.venue(venueId ?? 0),
    queryFn: () => api.establishments.get(venueId!),
    enabled: !!venueId,
  })
  const zones = useQuery({
    queryKey: keys.zones(venueId ?? 0),
    queryFn: () => api.zones.byEstablishment(venueId!),
    enabled: !!venueId,
  })
  const shiftsAhead = useQuery({ queryKey: keys.workerShifts(me.id, ahead), queryFn: () => api.shifts.byWorker(me.id, ahead) })
  const shiftsPast = useQuery({
    queryKey: keys.workerShifts(me.id, past),
    queryFn: () => api.shifts.byWorker(me.id, past),
    enabled: when === 'past',
  })
  const shifts = when === 'upcoming' ? shiftsAhead : shiftsPast
  const mine = useQuery({ queryKey: keys.workerAssignments(me.id), queryFn: () => api.assignments.byWorker(me.id) })
  const eventsAhead = useQuery({
    queryKey: keys.events(venueId ?? 0, ahead),
    queryFn: () => api.events.byEstablishment(venueId!, ahead),
    enabled: !!venueId,
  })
  const eventsPast = useQuery({
    queryKey: keys.events(venueId ?? 0, past),
    queryFn: () => api.events.byEstablishment(venueId!, past),
    enabled: !!venueId && when === 'past',
  })
  const events = when === 'upcoming' ? eventsAhead : eventsPast

  const zoneName = (id: number) => zones.data?.find((z) => z.id === id)?.name ?? ''
  const assignedIds = useMemo(() => new Set((mine.data ?? []).map((a) => a.eventId)), [mine.data])
  const myEvents = useMemo(() => (events.data ?? []).filter((e) => assignedIds.has(e.id)), [assignedIds, events.data])

  const days = useMemo(() => {
    const all = (shifts.data ?? []).filter((s) => (when === 'upcoming' ? s.date >= t : s.date < t))
    const map = new Map<string, Shift[]>()
    for (const s of all) map.set(s.date, [...(map.get(s.date) ?? []), s])
    const entries = [...map.entries()].map(
      ([d, list]) => [d, list.sort((a, b) => a.startTime.localeCompare(b.startTime))] as const,
    )
    entries.sort((a, b) => (when === 'upcoming' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])))
    return entries
  }, [shifts.data, when, t])

  const weekMins = (shiftsAhead.data ?? [])
    .filter((s) => week.includes(s.date))
    .reduce((n, s) => n + minutes(s.endTime) - minutes(s.startTime), 0)
  const next = (shiftsAhead.data ?? [])
    .filter((s) => s.date >= t)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0]
  const upcomingEvents = (eventsAhead.data ?? []).filter((e) => assignedIds.has(e.id) && eventDate(e.dateTime) >= t).length

  const loading = worker.isLoading || shiftsAhead.isLoading || shifts.isLoading || mine.isLoading || events.isLoading
  const error = worker.error ?? shiftsAhead.error ?? shifts.error ?? mine.error ?? events.error

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead
        title="My schedule"
        sub={venue.data ? `${venue.data.establishmentName} · ${venue.data.establishmentAddress}` : undefined}
      >
        <div className="segmented" role="group" aria-label="Show">
          <button aria-pressed={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
            Upcoming
          </button>
          <button aria-pressed={when === 'past'} onClick={() => setWhen('past')}>
            Past
          </button>
        </div>
      </PageHead>

      {loading ? (
        <Loading rows={4} />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="card stat">
              <span className="label">Next shift</span>
              <span className="figure" style={{ fontSize: 22 }}>
                {next ? fmt.agenda(next.date).title : '—'}
              </span>
              <span className="meta mono">
                {next ? `${hhmm(next.startTime)}–${hhmm(next.endTime)} · ${zoneName(next.zoneId)}` : 'Nothing planned yet'}
              </span>
            </div>
            <div className="card stat">
              <span className="label">Hours this week</span>
              <span className="figure">{Math.round((weekMins / 60) * 10) / 10}</span>
              <span className="meta">{fmt.week(t)}</span>
            </div>
            <div className="card stat">
              <span className="label">Events ahead</span>
              <span className="figure">{upcomingEvents}</span>
              <span className="meta">You are emailed when one changes</span>
            </div>
          </div>

          {days.length === 0 ? (
            <div className="card">
              <Empty icon={CalendarRange} title={when === 'upcoming' ? 'No shifts planned yet' : 'No past shifts'}>
                {when === 'upcoming' ? 'New shifts show up here, and you get an email for each one.' : undefined}
              </Empty>
            </div>
          ) : (
            <div className="agenda">
              {days.map(([day, list]) => (
                <div key={day} className="agenda-day">
                  <div className="agenda-date">
                    <div className="d">{fmt.agenda(day).title}</div>
                    <div className="w">{fmt.agenda(day).sub}</div>
                  </div>
                  <div className="agenda-items">
                    {list.map((s) => (
                      <ShiftCard key={s.id} shift={s} zone={zoneName(s.zoneId)} events={myEvents.filter((e) => shiftCovers(s, e))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ShiftCard({ shift, zone, events }: { shift: Shift; zone: string; events: KEvent[] }) {
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span className="mono" style={{ fontSize: 15 }}>
          {hhmm(shift.startTime)}–{hhmm(shift.endTime)}
        </span>
        <span style={{ fontWeight: 500, flex: 1 }}>{zone}</span>
        <span className="muted mono" style={{ fontSize: 12 }}>
          {durationLabel(shift.startTime, shift.endTime)}
        </span>
      </div>
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {pluralize(events.length, 'event')} during this shift
          </span>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="dot accent" style={{ transform: 'translateY(-2px)' }} />
              <span className="mono" style={{ fontSize: 13, color: 'var(--accent-ink)' }}>
                {eventTime(e.dateTime)}
              </span>
              <span style={{ fontWeight: 500 }}>{e.title}</span>
              <span className="muted">{e.peopleNumber} guests</span>
              {e.description && <span className="muted hide-sm">· {e.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
