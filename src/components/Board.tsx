import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Assignment, KEvent, Shift, Zone } from '../api/types'
import { useT } from '../lib/i18n'
import { endsNextDay, eventTime, hhmm, minutes, shiftCovers, spanMinutes } from '../lib/time'
import { Avatar, Button, NextDay } from './ui'

export interface BoardPerson {
  userId: number
  name: string
  initials: string
}

interface BoardProps {
  zones: Zone[]
  people: BoardPerson[]
  /** Shifts of the day shown; a night shift runs past midnight to where it really ends */
  shifts: Shift[]
  /** Night shifts of the day before, drawn from midnight to their end, so the small hours show who is on */
  previousNight?: Shift[]
  /** Events of the day shown */
  events: KEvent[]
  assignments: Map<number, Assignment[]>
  /** While assignments load, pins do not claim an event has nobody on it */
  assignmentsLoading?: boolean
  selectedEventId?: number | null
  onEventClick?: (event: KEvent) => void
  onShiftClick?: (shift: Shift) => void
  onAddShift?: (zoneId: number) => void
}

/**
 * Visible hours: at least 09–18, widened to fit every shift and event of the day. A night
 * shift widens it past 24:00, up to 48:00 at most; the previous night starts it at 00:00.
 */
function hourRange(shifts: Shift[], previousNight: Shift[], events: KEvent[]) {
  let lo = 9 * 60
  let hi = 18 * 60
  for (const s of shifts) {
    const start = minutes(s.startTime)
    lo = Math.min(lo, start)
    hi = Math.max(hi, start + spanMinutes(s.startTime, s.endTime))
  }
  for (const s of previousNight) {
    lo = 0
    hi = Math.max(hi, minutes(s.endTime))
  }
  for (const e of events) {
    const t = minutes(eventTime(e.dateTime))
    lo = Math.min(lo, t - 30)
    hi = Math.max(hi, t + 60)
  }
  return { lo: Math.max(0, Math.floor(lo / 60)), hi: Math.min(48, Math.ceil(hi / 60)) }
}

/** A bar on the board: a shift of the day, or the part after midnight of last night's shift */
interface Bar {
  shift: Shift
  start: number
  end: number
  carried: boolean
}

/**
 * The day board. Each worker's shift is a bar across the hours of its zone. Every event
 * drops a coverage line at its start time: the bars that line crosses are the people who
 * can work it, which is exactly the rule the API enforces on assignments.
 *
 * The day is a service day: a shift that ends after midnight is drawn whole, on an axis that
 * runs on past 24:00 with "+1" on the hours of the next day. The night shifts of the day
 * before are drawn from 00:00 to their end, so an event in the small hours shows its cover.
 */
export function Board({
  zones,
  people,
  shifts,
  previousNight = [],
  events,
  assignments,
  assignmentsLoading = false,
  selectedEventId,
  onEventClick,
  onShiftClick,
  onAddShift,
}: BoardProps) {
  const t = useT()
  const [hoverEvent, setHoverEvent] = useState<number | null>(null)
  const { lo, hi } = useMemo(() => hourRange(shifts, previousNight, events), [shifts, previousNight, events])
  const span = (hi - lo) * 60
  const x = (mins: number) => `${((mins - lo * 60) / span) * 100}%`
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  const step = hi - lo > 14 ? 2 : 1
  const pastMidnight = hi > 24
  const personById = new Map(people.map((p) => [p.userId, p]))
  const focus = hoverEvent ?? selectedEventId ?? null
  const focusEvent = events.find((e) => e.id === focus) ?? null

  const bars: Bar[] = [
    ...previousNight.map((s) => ({ shift: s, start: 0, end: minutes(s.endTime), carried: true })),
    ...shifts.map((s) => {
      const start = minutes(s.startTime)
      return { shift: s, start, end: start + spanMinutes(s.startTime, s.endTime), carried: false }
    }),
  ]

  const gridlines = (
    <div className="board-gridlines">
      {hours.map((h) => (
        <div key={h} className={h === 24 ? 'board-gridline midnight' : 'board-gridline'} style={{ left: x(h * 60) }} />
      ))}
    </div>
  )

  return (
    <div className="board">
      <div className="board-inner">
        <div className="board-axis">
          <div className="board-axis-note">{pastMidnight ? t.board.nextDayLegend : null}</div>
          <div className="board-ticks">
            {/* Every second hour on long days, on even hours so midnight always gets a label */}
            {hours
              .filter((h) => h % step === 0 && h > lo && h < hi)
              .map((h) => (
                <span key={h} className="board-tick" style={{ left: x(h * 60) }}>
                  {String(h % 24).padStart(2, '0')}:00
                  {h >= 24 && <NextDay />}
                </span>
              ))}
          </div>
        </div>

        {zones.map((zone) => {
          const zoneBars = bars.filter((b) => b.shift.zoneId === zone.id)
          const zoneEvents = events.filter((e) => e.zoneId === zone.id)
          const workerIds = [...new Set(zoneBars.map((b) => b.shift.workerId))].sort((a, b) =>
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
                    const at = minutes(eventTime(ev.dateTime))
                    const pos = (at - lo * 60) / span
                    const staffed = assignments.get(ev.id)?.length ?? 0
                    const style = pos > 0.72 ? { right: `${(1 - pos) * 100}%` } : { left: x(at) }
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
                        <span className="staffed">{assignmentsLoading ? '…' : t.board.staffed(staffed)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                {workerIds.length === 0 && !onAddShift && (
                  <div className="board-empty-zone">
                    <span>{t.board.noShifts}</span>
                    <div className="board-lane">{gridlines}</div>
                  </div>
                )}

                {workerIds.map((workerId) => {
                  const person = personById.get(workerId)
                  const name = person?.name ?? t.common.unknownPerson(workerId)
                  const rowBars = zoneBars.filter((b) => b.shift.workerId === workerId)
                  return (
                    <div key={workerId} className="board-row">
                      <div className="board-person">
                        <Avatar size="sm" initials={person?.initials ?? '?'} />
                        <span>{name}</span>
                      </div>
                      <div className="board-lane">
                        {gridlines}
                        {rowBars.map(({ shift: s, start, end, carried }) => {
                          const covering = focusEvent ? shiftCovers(s, focusEvent) : false
                          const from = hhmm(s.startTime)
                          const to = hhmm(s.endTime)
                          const overnight = endsNextDay(s.startTime, s.endTime)
                          // Coverage is also said in words, not only by the accent colour
                          const label = carried
                            ? t.board.carryLabel(name, from, to)
                            : overnight
                              ? t.board.shiftLabelNextDay(name, from, to)
                              : t.board.shiftLabel(name, from, to)
                          const cls = ['shift-bar', carried && 'carried', overnight && !carried && 'overnight', covering && 'covering']
                            .filter(Boolean)
                            .join(' ')
                          return (
                            <button
                              key={`${s.id}${carried ? '-carried' : ''}`}
                              className={cls}
                              style={{ left: x(start), width: `${((end - start) / span) * 100}%` }}
                              onClick={() => onShiftClick?.(s)}
                              disabled={!onShiftClick}
                              aria-label={covering && focusEvent ? `${label}, ${t.board.covers(focusEvent.title)}` : label}
                              title={`${from}–${to}${overnight ? ` (+1)` : ''}`}
                            >
                              {carried ? (
                                <span className="start">{t.board.until(to)}</span>
                              ) : (
                                <>
                                  <span className="start">{from}</span>
                                  <span className="end">
                                    –{to}
                                    {overnight && <NextDay />}
                                  </span>
                                </>
                              )}
                            </button>
                          )
                        })}
                        {zoneEvents.map((ev) =>
                          assignments.get(ev.id)?.some((a) => a.workerId === workerId) ? (
                            <span
                              key={ev.id}
                              className="assigned-tick"
                              style={{ left: x(minutes(eventTime(ev.dateTime))) }}
                              role="img"
                              aria-label={t.board.assignedTo(ev.title)}
                              title={t.board.assignedTo(ev.title)}
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                  )
                })}

                {onAddShift && (
                  <div className="board-add-row">
                    <div className="board-add-cell">
                      <Button variant="ghost" size="sm" icon={Plus} onClick={() => onAddShift(zone.id)}>
                        {t.board.addShift}
                      </Button>
                    </div>
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
