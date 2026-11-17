import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Map as MapIcon, Plus } from 'lucide-react'
import type { KEvent, Shift } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { Board } from '../../components/Board'
import { EventDrawer, EventFormDialog } from '../../components/EventDialogs'
import { CopyWeekDialog, ShiftBatchDialog, ShiftEditDialog, type ShiftDraft } from '../../components/ShiftDialogs'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useFmt, useT } from '../../lib/i18n'
import { useAssignments, useEvents, useShifts, useStaff, useZones } from '../../lib/queries'
import { addDays, endsNextDay, eventDate, shiftMinutes, today, weekDays } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal =
  | { kind: 'add-shifts'; draft?: ShiftDraft }
  | { kind: 'edit-shift'; shift: Shift }
  | { kind: 'copy-week' }
  | { kind: 'new-event' }
  | { kind: 'edit-event'; event: KEvent }
  | null

export default function SchedulePage() {
  const t = useT()
  const fmt = useFmt()
  const me = useMe()
  const { venue } = useVenue()
  const [date, setDate] = useState(today())
  const [eventId, setEventId] = useState<number | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  // Only the week on screen is fetched; shifts include the week before for "Copy last week"
  const days = weekDays(date)
  const weekRange = { from: days[0], to: days[6] }
  const zones = useZones(venue?.id)
  const staff = useStaff(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id), { from: addDays(days[0], -7), to: days[6] })
  const events = useEvents(venue?.id, weekRange)
  const assignments = useAssignments(venue?.id, weekRange)
  const byEvent = assignments.byEvent

  const dayShifts = useMemo(() => (shifts.data ?? []).filter((s) => s.date === date), [shifts.data, date])
  // Night shifts of the day before still run in the small hours of this one; the week before is fetched too
  const previousNight = useMemo(() => {
    const yesterday = addDays(date, -1)
    return (shifts.data ?? []).filter((s) => s.date === yesterday && endsNextDay(s.startTime, s.endTime))
  }, [shifts.data, date])
  const dayEvents = useMemo(() => (events.data ?? []).filter((e) => eventDate(e.dateTime) === date), [events.data, date])

  const selectedEvent = (events.data ?? []).find((e) => e.id === eventId) ?? null
  // Moving to another day or week closes the event panel, which belongs to the day left behind
  const goTo = (day: string) => {
    setDate(day)
    setEventId(null)
  }
  const loading = zones.isLoading || staff.isLoading || shifts.isLoading || events.isLoading
  // While another week loads, shifts.data and events.data still hold the previous range, so
  // nothing is counted or drawn from them and what is built on them waits
  const stale = shifts.isPlaceholderData || events.isPlaceholderData
  const error = zones.error ?? staff.error ?? shifts.error ?? events.error ?? assignments.error

  const people = new Set(dayShifts.map((s) => s.workerId)).size
  // Hours of the shifts that start this day, night shifts counted whole
  const hours = dayShifts.reduce((sum, s) => sum + shiftMinutes(s), 0) / 60
  const unstaffed = dayEvents.filter((e) => (byEvent.get(e.id)?.length ?? 0) === 0).length

  const countOn = (d: string) => ({
    shifts: (shifts.data ?? []).filter((s) => s.date === d).length,
    events: (events.data ?? []).filter((e) => eventDate(e.dateTime) === d).length,
  })

  if (loading) {
    return (
      <div className="page">
        <PageHead title={t.schedule.title} />
        <Loading rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHead title={t.schedule.title} />
        <ErrorNote error={error} />
      </div>
    )
  }

  const zoneList = zones.data ?? []
  const staffList = staff.data ?? []
  // A figure of the week that is still loading
  const pending = (
    <span className="figure muted" aria-busy="true">
      —
    </span>
  )

  if (zoneList.length === 0) {
    return (
      <div className="page">
        <PageHead title={t.schedule.title} />
        <div className="card">
          <Empty
            icon={MapIcon}
            title={t.schedule.noZonesTitle}
            action={
              <Link to="/venue" className="btn btn-primary">
                {t.schedule.setUpZones}
              </Link>
            }
          >
            {t.schedule.noZonesBody}
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead title={fmt.relative(date)} sub={date === today() ? fmt.long(date) : fmt.month(date)}>
        <Button icon={Copy} onClick={() => setModal({ kind: 'copy-week' })} disabled={stale}>
          {t.schedule.copyLastWeek}
        </Button>
        <Button icon={CalendarPlus} onClick={() => setModal({ kind: 'new-event' })}>
          {t.schedule.newEvent}
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add-shifts' })}>
          {t.schedule.addShifts}
        </Button>
      </PageHead>

      <div className="week">
        <Button variant="ghost" iconOnly icon={ChevronLeft} aria-label={t.common.previousWeek} onClick={() => goTo(addDays(date, -7))} />
        <div className="week-days">
          {days.map((d) => {
            const c = countOn(d)
            return (
              <button
                key={d}
                className={d === today() ? 'week-day is-today' : 'week-day'}
                aria-pressed={d === date}
                onClick={() => goTo(d)}
              >
                <span className="wd">
                  {fmt.weekday(d)}
                  {!stale && c.events > 0 && <span className="dot accent" title={t.schedule.dayEvents(c.events)} />}
                </span>
                <span className="dn">{fmt.dayNumber(d)}</span>
                <span className="counts">{stale ? '…' : t.schedule.dayShifts(c.shifts)}</span>
              </button>
            )
          })}
        </div>
        <Button variant="ghost" iconOnly icon={ChevronRight} aria-label={t.common.nextWeek} onClick={() => goTo(addDays(date, 7))} />
        {!days.includes(today()) && (
          <Button size="sm" onClick={() => goTo(today())}>
            {t.common.today}
          </Button>
        )}
      </div>

      <div className="stats">
        <div className="card stat">
          <span className="label">{t.schedule.peopleOnShift}</span>
          {stale ? pending : <span className="figure">{people}</span>}
          <span className="meta">{t.schedule.ofActive(staffList.filter((s) => s.isActive).length)}</span>
        </div>
        <div className="card stat">
          <span className="label">{t.schedule.hoursScheduled}</span>
          {stale ? pending : <span className="figure">{fmt.number(hours)}</span>}
          <span className="meta">{stale ? t.schedule.loadingWeek : t.schedule.acrossShifts(dayShifts.length)}</span>
        </div>
        <div className="card stat">
          <span className="label">{t.schedule.events}</span>
          {stale ? pending : <span className="figure">{dayEvents.length}</span>}
          <span className="meta">
            {stale ? t.schedule.loadingWeek : t.schedule.guestsExpected(dayEvents.reduce((n, e) => n + e.peopleNumber, 0))}
          </span>
        </div>
        <div className="card stat">
          <span className="label">{t.schedule.unstaffed}</span>
          {assignments.loading || stale ? (
            <>
              <span className="figure muted" aria-busy="true">
                —
              </span>
              <span className="meta">{t.schedule.loadingAssignments}</span>
            </>
          ) : (
            <>
              <span className={unstaffed ? 'figure accent' : 'figure'}>{unstaffed}</span>
              <span className="meta">{unstaffed ? t.schedule.unstaffedHint : t.schedule.allStaffed}</span>
            </>
          )}
        </div>
      </div>

      {stale && (
        <div className="card card-body">
          <Loading rows={3} />
        </div>
      )}
      {/* Kept mounted while hidden, so it comes back as it was once the week has loaded */}
      <div className="card" hidden={stale}>
        <Board
          zones={zoneList}
          people={staffList}
          shifts={dayShifts}
          previousNight={previousNight}
          events={dayEvents}
          assignments={byEvent}
          assignmentsLoading={assignments.loading}
          selectedEventId={eventId}
          onEventClick={(e) => setEventId(e.id)}
          onShiftClick={(shift) => setModal({ kind: 'edit-shift', shift })}
          onAddShift={(zoneId) => setModal({ kind: 'add-shifts', draft: { zoneId, dates: [date] } })}
        />
      </div>

      {selectedEvent && !modal && (
        <EventDrawer
          event={selectedEvent}
          staff={staffList}
          shifts={shifts.data ?? []}
          assignments={byEvent.get(selectedEvent.id) ?? []}
          assignmentsLoading={assignments.loading}
          onClose={() => setEventId(null)}
          onEdit={() => setModal({ kind: 'edit-event', event: selectedEvent })}
          onAddShift={(draft) => setModal({ kind: 'add-shifts', draft })}
        />
      )}

      {modal?.kind === 'add-shifts' && (
        <ShiftBatchDialog
          staff={staffList}
          zones={zoneList}
          anchorDate={modal.draft?.dates?.[0] ?? date}
          draft={modal.draft}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'edit-shift' && (
        <ShiftEditDialog shift={modal.shift} staff={staffList} zones={zoneList} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'copy-week' && (
        <CopyWeekDialog
          shifts={shifts.data ?? []}
          staff={staffList}
          zones={zoneList}
          targetWeekDate={date}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'new-event' && <EventFormDialog zones={zoneList} defaultDate={date} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit-event' && (
        <EventFormDialog zones={zoneList} event={modal.event} defaultDate={date} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
