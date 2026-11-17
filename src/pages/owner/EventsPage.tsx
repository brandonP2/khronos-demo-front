import { useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import type { KEvent } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { EventDrawer, EventFormDialog } from '../../components/EventDialogs'
import { ShiftBatchDialog, type ShiftDraft } from '../../components/ShiftDialogs'
import { Avatar, Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useFmt, useT } from '../../lib/i18n'
import { useAssignments, useEvents, useShifts, useStaff, useZones } from '../../lib/queries'
import { addDays, eventDate, eventTime, today } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal = { kind: 'new' } | { kind: 'edit'; event: KEvent } | { kind: 'shift'; draft: ShiftDraft } | null

export default function EventsPage() {
  const t = useT()
  const fmt = useFmt()
  const me = useMe()
  const { venue } = useVenue()
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [eventId, setEventId] = useState<number | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  // Upcoming fetches from today on, past fetches up to yesterday
  const day = today()
  const range = when === 'upcoming' ? { from: day } : { to: addDays(day, -1) }
  // A night shift of the day before can cover an event in today's small hours
  const shiftRange = when === 'upcoming' ? { from: addDays(day, -1) } : range
  const zones = useZones(venue?.id)
  const staff = useStaff(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id), shiftRange)
  const events = useEvents(venue?.id, range)
  const assignments = useAssignments(venue?.id, range)
  const byEvent = assignments.byEvent

  const list = useMemo(() => {
    const all = events.data ?? []
    return when === 'upcoming'
      ? all.filter((e) => eventDate(e.dateTime) >= day)
      : all.filter((e) => eventDate(e.dateTime) < day).reverse()
  }, [events.data, when, day])

  const staffList = staff.data ?? []
  const zoneList = zones.data ?? []
  const selected = (events.data ?? []).find((e) => e.id === eventId) ?? null

  const groups = useMemo(() => {
    const map = new Map<string, KEvent[]>()
    for (const e of list) {
      const d = eventDate(e.dateTime)
      map.set(d, [...(map.get(d) ?? []), e])
    }
    return [...map.entries()]
  }, [list])

  const unstaffed = list.filter((e) => (byEvent.get(e.id)?.length ?? 0) === 0).length
  // While another range loads, the previous one is still in events.data
  const loading = zones.isLoading || staff.isLoading || events.isLoading || events.isPlaceholderData
  const error = zones.error ?? staff.error ?? events.error ?? shifts.error ?? assignments.error

  return (
    <div className="page">
      <PageHead
        title={t.eventsPage.title}
        sub={
          when === 'upcoming' && list.length
            ? t.eventsPage.summary(list.length, assignments.loading ? 0 : unstaffed)
            : undefined
        }
      >
        <div className="segmented" role="group" aria-label={t.common.show}>
          <button aria-pressed={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
            {t.common.upcoming}
          </button>
          <button aria-pressed={when === 'past'} onClick={() => setWhen('past')}>
            {t.common.past}
          </button>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'new' })} disabled={!zoneList.length}>
          {t.eventsPage.newEvents}
        </Button>
      </PageHead>

      {loading ? (
        <Loading rows={4} />
      ) : error ? (
        <ErrorNote error={error} />
      ) : groups.length === 0 ? (
        <div className="card">
          <Empty
            icon={CalendarClock}
            title={when === 'upcoming' ? t.eventsPage.noUpcoming : t.eventsPage.noPast}
            action={
              when === 'upcoming' && zoneList.length > 0 ? (
                <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'new' })}>
                  {t.eventsPage.newEvents}
                </Button>
              ) : undefined
            }
          >
            {when === 'upcoming'
              ? zoneList.length
                ? t.eventsPage.emptyBody
                : t.eventsPage.emptyNoZones
              : undefined}
          </Empty>
        </div>
      ) : (
        <div className="agenda">
          {groups.map(([day, dayEvents]) => (
            <div key={day} className="agenda-day">
              <div className="agenda-date">
                <div className="d">{fmt.agenda(day).title}</div>
                <div className="w">{fmt.agenda(day).sub}</div>
              </div>
              <div className="agenda-items">
                {dayEvents.map((e) => {
                  const on = byEvent.get(e.id) ?? []
                  return (
                    <button key={e.id} className="agenda-item" onClick={() => setEventId(e.id)}>
                      <span className="time">{eventTime(e.dateTime)}</span>
                      <span>
                        <span className="title">{e.title}</span>
                        <br />
                        <span className="meta">
                          {e.zoneName} · {t.common.guests(e.peopleNumber)}
                        </span>
                      </span>
                      <span className="staffing">
                        {assignments.loading ? null : on.length === 0 ? (
                          when === 'upcoming' ? (
                            <span className="unstaffed">{t.eventsPage.nobodyOnIt}</span>
                          ) : (
                            <span className="muted">{t.eventsPage.nobody}</span>
                          )
                        ) : (
                          <>
                            <span className="faces">
                              {on.slice(0, 4).map((a) => (
                                <Avatar
                                  key={a.id}
                                  size="sm"
                                  initials={staffList.find((s) => s.userId === a.workerId)?.initials ?? '?'}
                                />
                              ))}
                            </span>
                            <span className="muted num">{on.length}</span>
                          </>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && !modal && (
        <EventDrawer
          event={selected}
          staff={staffList}
          shifts={shifts.data ?? []}
          assignments={byEvent.get(selected.id) ?? []}
          assignmentsLoading={assignments.loading}
          onClose={() => setEventId(null)}
          onEdit={() => setModal({ kind: 'edit', event: selected })}
          onAddShift={(draft) => setModal({ kind: 'shift', draft })}
        />
      )}
      {modal?.kind === 'new' && <EventFormDialog zones={zoneList} defaultDate={day} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && (
        <EventFormDialog zones={zoneList} event={modal.event} defaultDate={day} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'shift' && (
        <ShiftBatchDialog
          staff={staffList}
          zones={zoneList}
          anchorDate={modal.draft.dates?.[0] ?? day}
          draft={modal.draft}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
