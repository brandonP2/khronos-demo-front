import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Map as MapIcon, Plus } from 'lucide-react'
import type { KEvent, Shift } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { Board } from '../../components/Board'
import { EventDrawer, EventFormDialog } from '../../components/EventDialogs'
import { CopyWeekDialog, ShiftBatchDialog, ShiftEditDialog, type ShiftDraft } from '../../components/ShiftDialogs'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useAssignments, useEvents, useShifts, useStaff, useZones } from '../../lib/queries'
import { addDays, eventDate, fmt, minutes, today, weekDays } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal =
  | { kind: 'add-shifts'; draft?: ShiftDraft }
  | { kind: 'edit-shift'; shift: Shift }
  | { kind: 'copy-week' }
  | { kind: 'new-event' }
  | { kind: 'edit-event'; event: KEvent }
  | null

export default function SchedulePage() {
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
  const dayEvents = useMemo(() => (events.data ?? []).filter((e) => eventDate(e.dateTime) === date), [events.data, date])

  const selectedEvent = (events.data ?? []).find((e) => e.id === eventId) ?? null
  const loading = zones.isLoading || staff.isLoading || shifts.isLoading || events.isLoading
  const error = zones.error ?? staff.error ?? shifts.error ?? events.error

  const people = new Set(dayShifts.map((s) => s.workerId)).size
  const hours = dayShifts.reduce((sum, s) => sum + (minutes(s.endTime) - minutes(s.startTime)), 0) / 60
  const unstaffed = dayEvents.filter((e) => (byEvent.get(e.id)?.length ?? 0) === 0).length

  const countOn = (d: string) => ({
    shifts: (shifts.data ?? []).filter((s) => s.date === d).length,
    events: (events.data ?? []).filter((e) => eventDate(e.dateTime) === d).length,
  })

  if (loading) {
    return (
      <div className="page">
        <PageHead title="Schedule" />
        <Loading rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <PageHead title="Schedule" />
        <ErrorNote error={error} />
      </div>
    )
  }

  const zoneList = zones.data ?? []
  const staffList = staff.data ?? []

  if (zoneList.length === 0) {
    return (
      <div className="page">
        <PageHead title="Schedule" />
        <div className="card">
          <Empty
            icon={MapIcon}
            title="Start by adding the zones of your venue"
            action={
              <Link to="/venue" className="btn btn-primary">
                Set up zones
              </Link>
            }
          >
            Shifts and events happen in a zone, like Terrace, Kitchen or Main hall. Add at least one to start scheduling.
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead title={fmt.relative(date)} sub={date === today() ? fmt.long(date) : fmt.month(date)}>
        <Button icon={Copy} onClick={() => setModal({ kind: 'copy-week' })}>
          Copy last week
        </Button>
        <Button icon={CalendarPlus} onClick={() => setModal({ kind: 'new-event' })}>
          New event
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add-shifts' })}>
          Add shifts
        </Button>
      </PageHead>

      <div className="week">
        <Button variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous week" onClick={() => setDate(addDays(date, -7))} />
        <div className="week-days">
          {days.map((d) => {
            const c = countOn(d)
            return (
              <button
                key={d}
                className={d === today() ? 'week-day is-today' : 'week-day'}
                aria-pressed={d === date}
                onClick={() => {
                  setDate(d)
                  setEventId(null)
                }}
              >
                <span className="wd">
                  {fmt.weekday(d)}
                  {c.events > 0 && <span className="dot accent" title={`${c.events} events`} />}
                </span>
                <span className="dn">{fmt.dayNumber(d)}</span>
                <span className="counts">{c.shifts ? `${c.shifts} shifts` : 'No shifts'}</span>
              </button>
            )
          })}
        </div>
        <Button variant="ghost" iconOnly icon={ChevronRight} aria-label="Next week" onClick={() => setDate(addDays(date, 7))} />
        {!days.includes(today()) && (
          <Button size="sm" onClick={() => setDate(today())}>
            Today
          </Button>
        )}
      </div>

      <div className="stats">
        <div className="card stat">
          <span className="label">People on shift</span>
          <span className="figure">{people}</span>
          <span className="meta">of {staffList.filter((s) => s.isActive).length} active on the team</span>
        </div>
        <div className="card stat">
          <span className="label">Hours scheduled</span>
          <span className="figure">{hours % 1 ? hours.toFixed(1) : hours}</span>
          <span className="meta">across {dayShifts.length} shifts</span>
        </div>
        <div className="card stat">
          <span className="label">Events</span>
          <span className="figure">{dayEvents.length}</span>
          <span className="meta">{dayEvents.reduce((n, e) => n + e.peopleNumber, 0)} guests expected</span>
        </div>
        <div className="card stat">
          <span className="label">Events with nobody on them</span>
          <span className={unstaffed ? 'figure accent' : 'figure'}>{unstaffed}</span>
          <span className="meta">{unstaffed ? 'Pick one on the board to assign people' : 'Every event has someone'}</span>
        </div>
      </div>

      <div className="card">
        <Board
          zones={zoneList}
          people={staffList}
          shifts={dayShifts}
          events={dayEvents}
          assignments={byEvent}
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
