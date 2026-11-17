import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { DateRange, KEvent, Shift } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { ClockCard } from '../../components/ClockCard'
import { Empty, ErrorNote, Loading, PageHead, ShiftTimes } from '../../components/ui'
import { useFmt, useT } from '../../lib/i18n'
import { keys, useMyVenue } from '../../lib/queries'
import {
  addDays,
  venueTimeZone,
  eventDate,
  eventTime,
  minutesLabel,
  shiftCovers,
  shiftMinutes,
  today,
  weekDays,
} from '../../lib/time'

/** A worker's own view: their shifts by day, with the events they are on inside each shift */
export default function MySchedule() {
  const t = useT()
  const fmt = useFmt()
  const me = useMe()
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')

  const now = today()
  const week = weekDays(now)
  // From Monday of this week on, which also covers this week's hours; the past is fetched only when shown
  const ahead: DateRange = { from: week[0] }
  const past: DateRange = { to: addDays(now, -1) }

  const { worker, venue } = useMyVenue(me.id)
  const venueId = worker.data?.establishmentId
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
    const all = (shifts.data ?? []).filter((s) => (when === 'upcoming' ? s.date >= now : s.date < now))
    const map = new Map<string, Shift[]>()
    for (const s of all) map.set(s.date, [...(map.get(s.date) ?? []), s])
    const entries = [...map.entries()].map(
      ([d, list]) => [d, list.sort((a, b) => a.startTime.localeCompare(b.startTime))] as const,
    )
    entries.sort((a, b) => (when === 'upcoming' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])))
    return entries
  }, [shifts.data, when, now])

  const weekMins = (shiftsAhead.data ?? [])
    .filter((s) => week.includes(s.date))
    .reduce((n, s) => n + shiftMinutes(s), 0)
  const next = (shiftsAhead.data ?? [])
    .filter((s) => s.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0]
  const upcomingEvents = (eventsAhead.data ?? []).filter((e) => assignedIds.has(e.id) && eventDate(e.dateTime) >= now).length

  const loading = worker.isLoading || shiftsAhead.isLoading || shifts.isLoading || mine.isLoading || events.isLoading
  const error = worker.error ?? shiftsAhead.error ?? shifts.error ?? mine.error ?? events.error

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead
        title={t.mySchedule.title}
        sub={venue.data ? `${venue.data.establishmentName} · ${venue.data.establishmentAddress}` : undefined}
      >
        <div className="segmented" role="group" aria-label={t.common.show}>
          <button aria-pressed={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
            {t.common.upcoming}
          </button>
          <button aria-pressed={when === 'past'} onClick={() => setWhen('past')}>
            {t.common.past}
          </button>
        </div>
      </PageHead>

      {/* Clocking in works on its own, so it is there even while the rest loads */}
      {venueId && <ClockCard timeZone={venueTimeZone(venue.data)} zones={zones.data ?? []} />}

      {loading ? (
        <Loading rows={4} />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <>
          <div className="stats stats-3">
            <div className="card stat">
              <span className="label">{t.mySchedule.nextShift}</span>
              <span className="figure" style={{ fontSize: 22 }}>
                {next ? fmt.agenda(next.date).title : '—'}
              </span>
              <span className="meta mono">
                {next ? (
                  <>
                    <ShiftTimes startTime={next.startTime} endTime={next.endTime} /> · {zoneName(next.zoneId)}
                  </>
                ) : (
                  t.mySchedule.nothingPlanned
                )}
              </span>
            </div>
            <div className="card stat">
              <span className="label">{t.mySchedule.hoursThisWeek}</span>
              <span className="figure">{fmt.number(weekMins / 60)}</span>
              <span className="meta">{fmt.week(now)}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.mySchedule.eventsAhead}</span>
              <span className="figure">{upcomingEvents}</span>
              <span className="meta">{t.mySchedule.eventsAheadHint}</span>
            </div>
          </div>

          {days.length === 0 ? (
            <div className="card">
              <Empty icon={CalendarRange} title={when === 'upcoming' ? t.mySchedule.noUpcoming : t.mySchedule.noPast}>
                {when === 'upcoming' ? t.mySchedule.noUpcomingBody : undefined}
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
  const t = useT()
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span className="mono" style={{ fontSize: 15 }}>
          <ShiftTimes startTime={shift.startTime} endTime={shift.endTime} />
        </span>
        <span style={{ fontWeight: 500, flex: 1 }}>{zone}</span>
        <span className="muted mono" style={{ fontSize: 12 }}>
          {minutesLabel(shiftMinutes(shift))}
        </span>
      </div>
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {t.mySchedule.eventsDuring(events.length)}
          </span>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12 }}>
              <span className="dot accent" style={{ transform: 'translateY(-2px)' }} />
              <span className="mono" style={{ fontSize: 13, color: 'var(--accent-ink)' }}>
                {eventTime(e.dateTime)}
              </span>
              <span style={{ fontWeight: 500 }}>{e.title}</span>
              <span className="muted">{t.common.guests(e.peopleNumber)}</span>
              {e.description && <span className="muted hide-sm">· {e.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
