import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Assignment, KEvent, Shift, Zone } from '../api/types'
import { eventTime, hhmm, minutes, shiftCovers } from '../lib/time'
import { Avatar, Button } from './ui'

export interface BoardPerson {
  userId: number
  name: string
  initials: string
}

interface BoardProps {
  zones: Zone[]
  people: BoardPerson[]
  /** Shifts of the day shown */
  shifts: Shift[]
  /** Events of the day shown */
  events: KEvent[]
  assignments: Map<number, Assignment[]>
  selectedEventId?: number | null
  onEventClick?: (event: KEvent) => void
  onShiftClick?: (shift: Shift) => void
  onAddShift?: (zoneId: number) => void
}

/** Visible hours: at least 09–18, widened to fit every shift and event of the day */
function hourRange(shifts: Shift[], events: KEvent[]) {
  let lo = 9 * 60
  let hi = 18 * 60
  for (const s of shifts) {
    lo = Math.min(lo, minutes(s.startTime))
    hi = Math.max(hi, minutes(s.endTime))
  }
  for (const e of events) {
    const t = minutes(eventTime(e.dateTime))
    lo = Math.min(lo, t - 30)
    hi = Math.max(hi, t + 60)
  }
  return { lo: Math.max(0, Math.floor(lo / 60)), hi: Math.min(24, Math.ceil(hi / 60)) }
}

/**
 * The day board. Each worker's shift is a bar across the hours of its zone. Every event
 * drops a coverage line at its start time: the bars that line crosses are the people who
 * can work it, which is exactly the rule the API enforces on assignments.
 */
export function Board({
  zones,
  people,
  shifts,
  events,
  assignments,
  selectedEventId,
  onEventClick,
  onShiftClick,
  onAddShift,
}: BoardProps) {
  const [hoverEvent, setHoverEvent] = useState<number | null>(null)
  const { lo, hi } = useMemo(() => hourRange(shifts, events), [shifts, events])
  const span = (hi - lo) * 60
  const x = (mins: number) => `${((mins - lo * 60) / span) * 100}%`
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  const step = hi - lo > 14 ? 2 : 1
  const personById = new Map(people.map((p) => [p.userId, p]))
  const focus = hoverEvent ?? selectedEventId ?? null
  const focusEvent = events.find((e) => e.id === focus) ?? null

  const gridlines = (
    <div className="board-gridlines">
      {hours.map((h) => (
        <div key={h} className="board-gridline" style={{ left: x(h * 60) }} />
      ))}
    </div>
  )

  return (
    <div className="board">
      <div className="board-inner">
        <div className="board-axis">
          <div />
          <div className="board-ticks">
            {hours
              .filter((h) => (h - lo) % step === 0 && h > lo && h < hi)
              .map((h) => (
                <span key={h} className="board-tick" style={{ left: x(h * 60) }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
          </div>
        </div>

        {zones.map((zone) => {
          const zoneShifts = shifts.filter((s) => s.zoneId === zone.id)
          const zoneEvents = events.filter((e) => e.zoneId === zone.id)
          const workerIds = [...new Set(zoneShifts.map((s) => s.workerId))].sort((a, b) =>
            (personById.get(a)?.name ?? '').localeCompare(personById.get(b)?.name ?? ''),
          )
          return (
            <section key={zone.id} aria-label={zone.name}>
              <div className="board-zone-head">
                <div className="board-zone-name">
                  {zone.name}
                  <span className="count">{workerIds.length || ''}</span>
                </div>
                <div className="board-lane">
                  {zoneEvents.map((ev) => {
                    const t = minutes(eventTime(ev.dateTime))
                    const pos = (t - lo * 60) / span
                    const staffed = assignments.get(ev.id)?.length ?? 0
                    const style = pos > 0.72 ? { right: `${(1 - pos) * 100}%` } : { left: x(t) }
                    return (
                      <button
                        key={ev.id}
                        className="event-pin"
                        style={style}
                        aria-pressed={selectedEventId === ev.id}
                        onClick={() => onEventClick?.(ev)}
                        onMouseEnter={() => setHoverEvent(ev.id)}
                        onMouseLeave={() => setHoverEvent(null)}
                        onFocus={() => setHoverEvent(ev.id)}
                        onBlur={() => setHoverEvent(null)}
                        disabled={!onEventClick}
                      >
                        <span className="t">{eventTime(ev.dateTime)}</span>
                        {ev.title}
                        <span className="staffed">{staffed} on</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                {workerIds.length === 0 && !onAddShift && (
                  <div className="board-empty-zone">
                    <span>No shifts</span>
                    <div className="board-lane">{gridlines}</div>
                  </div>
                )}

                {workerIds.map((workerId) => {
                  const person = personById.get(workerId)
                  const rowShifts = zoneShifts.filter((s) => s.workerId === workerId)
                  return (
                    <div key={workerId} className="board-row">
                      <div className="board-person">
                        <Avatar size="sm" initials={person?.initials ?? '?'} />
                        <span>{person?.name ?? `Worker ${workerId}`}</span>
                      </div>
                      <div className="board-lane">
                        {gridlines}
                        {rowShifts.map((s) => {
                          const start = minutes(s.startTime)
                          const end = minutes(s.endTime)
                          const covering = focusEvent ? shiftCovers(s, focusEvent) : false
                          return (
                            <button
                              key={s.id}
                              className={covering ? 'shift-bar covering' : 'shift-bar'}
                              style={{ left: x(start), width: `${((end - start) / span) * 100}%` }}
                              onClick={() => onShiftClick?.(s)}
                              disabled={!onShiftClick}
                              aria-label={`${person?.name ?? 'Worker'} ${hhmm(s.startTime)} to ${hhmm(s.endTime)}`}
                            >
                              {hhmm(s.startTime)}–{hhmm(s.endTime)}
                            </button>
                          )
                        })}
                        {zoneEvents.map((ev) =>
                          assignments.get(ev.id)?.some((a) => a.workerId === workerId) ? (
                            <span
                              key={ev.id}
                              className="assigned-tick"
                              style={{ left: x(minutes(eventTime(ev.dateTime))) }}
                              title={`On ${ev.title}`}
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                  )
                })}

                {onAddShift && (
                  <div className="board-add-row">
                    <Button variant="ghost" size="sm" icon={Plus} onClick={() => onAddShift(zone.id)}>
                      Add shift
                    </Button>
                    <div className="board-lane">{gridlines}</div>
                  </div>
                )}

                {/* Coverage lines sit over the zone's rows, under the pins */}
                <div
                  style={{ position: 'absolute', top: 0, bottom: 0, left: 'var(--name-col)', right: 0, pointerEvents: 'none' }}
                >
                  {zoneEvents.map((ev) => (
                    <span
                      key={ev.id}
                      className={focus === null || focus === ev.id ? 'cover-line' : 'cover-line dim'}
                      style={{ left: x(minutes(eventTime(ev.dateTime))) }}
                    />
                  ))}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
