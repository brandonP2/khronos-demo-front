import { useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import type { KEvent } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { EventDrawer, EventFormDialog } from '../../components/EventDialogs'
import { ShiftBatchDialog, type ShiftDraft } from '../../components/ShiftDialogs'
import { Avatar, Button, Empty, ErrorNote, Loading, PageHead, pluralize } from '../../components/ui'
import { useAssignments, useEvents, useShifts, useStaff, useZones } from '../../lib/queries'
import { eventDate, eventTime, fmt, today } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal = { kind: 'new' } | { kind: 'edit'; event: KEvent } | { kind: 'shift'; draft: ShiftDraft } | null

export default function EventsPage() {
  const me = useMe()
  const { venue } = useVenue()
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [eventId, setEventId] = useState<number | null>(null)
  const [modal, setModal] = useState<Modal>(null)

  const zones = useZones(venue?.id)
  const staff = useStaff(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id))
  const events = useEvents(venue?.id)

  const t = today()
  const list = useMemo(() => {
    const all = events.data ?? []
    return when === 'upcoming'
      ? all.filter((e) => eventDate(e.dateTime) >= t)
      : all.filter((e) => eventDate(e.dateTime) < t).reverse()
  }, [events.data, when, t])

  const { byEvent } = useAssignments(list)
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
  const loading = zones.isLoading || staff.isLoading || events.isLoading
  const error = zones.error ?? staff.error ?? events.error ?? shifts.error

  return (
    <div className="page">
      <PageHead
        title="Events"
        sub={
          when === 'upcoming' && list.length
            ? `${pluralize(list.length, 'upcoming event')}${unstaffed ? `, ${unstaffed} with nobody on them` : ''}`
            : undefined
        }
      >
        <div className="segmented" role="group" aria-label="Show">
          <button aria-pressed={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
            Upcoming
          </button>
          <button aria-pressed={when === 'past'} onClick={() => setWhen('past')}>
            Past
          </button>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'new' })} disabled={!zoneList.length}>
          New events
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
            title={when === 'upcoming' ? 'No upcoming events' : 'No past events'}
            action={
              when === 'upcoming' && zoneList.length > 0 ? (
                <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'new' })}>
                  New events
                </Button>
              ) : undefined
            }
          >
            {when === 'upcoming'
              ? zoneList.length
                ? 'Weddings, private dinners, tastings. Add them here and staff them from the people on shift.'
                : 'Add a zone on the Venue page first, then events can be placed in it.'
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
                          {e.zoneName} · {e.peopleNumber} guests
                        </span>
                      </span>
                      <span className="staffing">
                        {on.length === 0 ? (
                          when === 'upcoming' ? (
                            <span className="unstaffed">Nobody on it</span>
                          ) : (
                            <span className="muted">Nobody</span>
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
          onClose={() => setEventId(null)}
          onEdit={() => setModal({ kind: 'edit', event: selected })}
          onAddShift={(draft) => setModal({ kind: 'shift', draft })}
        />
      )}
      {modal?.kind === 'new' && <EventFormDialog zones={zoneList} defaultDate={t} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && (
        <EventFormDialog zones={zoneList} event={modal.event} defaultDate={t} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'shift' && (
        <ShiftBatchDialog
          staff={staffList}
          zones={zoneList}
          anchorDate={modal.draft.dates?.[0] ?? t}
          draft={modal.draft}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
