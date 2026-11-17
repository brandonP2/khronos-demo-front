import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Assignment, EventInput, KEvent, Shift, Zone } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { useInvalidate, type StaffMember } from '../lib/queries'
import { eventDate, eventTime, hhmm, minutes, shiftCovers, toDateTime, today } from '../lib/time'
import { Avatar, Button, ConfirmDialog, Dialog, Drawer, ErrorNote, Field, useToast } from './ui'
import type { ShiftDraft } from './ShiftDialogs'

/**
 * One event, who is on it, and who could be. "Can work it" mirrors the API rule: an active
 * person with a shift in the event's zone, on its date, running at its start time.
 */
export function EventDrawer({
  event,
  staff,
  shifts,
  assignments,
  assignmentsLoading: isLoading,
  onClose,
  onEdit,
  onAddShift,
}: {
  event: KEvent
  staff: StaffMember[]
  shifts: Shift[]
  /** Who is on this event, from the page's assignments for the venue */
  assignments: Assignment[]
  assignmentsLoading: boolean
  onClose: () => void
  onEdit: () => void
  onAddShift: (draft: ShiftDraft) => void
}) {
  const t = useT()
  const fmt = useFmt()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const assignedIds = new Set(assignments.map((a) => a.workerId))
  const coveringShift = (workerId: number) => shifts.find((s) => s.workerId === workerId && shiftCovers(s, event))
  const assigned = assignments.map((a) => ({ a, person: staff.find((s) => s.userId === a.workerId) }))
  const available = staff.filter((s) => s.isActive && !assignedIds.has(s.userId) && coveringShift(s.userId))
  const notOnShift = staff.filter((s) => s.isActive && !assignedIds.has(s.userId) && !coveringShift(s.userId))
  const isPast = eventDate(event.dateTime) < today()

  const assign = useMutation({
    mutationFn: (workerIds: number[]) =>
      api.assignments.create(workerIds.map((workerId) => ({ workerId, eventId: event.id }))),
    onSuccess: async (created) => {
      await invalidate.schedule()
      toast(t.eventDrawer.assigned(created.length))
    },
  })

  const unassign = useMutation({
    mutationFn: (id: number) => api.assignments.remove(id),
    onSuccess: () => invalidate.schedule(),
  })

  if (confirmDelete) {
    return (
      <ConfirmDialog
        title={t.eventDrawer.deleteTitle(event.title)}
        confirmLabel={t.eventDrawer.deleteConfirm}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api.events.remove(event.id)
          await invalidate.schedule()
          toast(t.eventDrawer.deleted)
          onClose()
        }}
      >
        {t.eventDrawer.deleteBody(assignments.length)}
      </ConfirmDialog>
    )
  }

  const time = eventTime(event.dateTime)
  const suggestedEnd = `${String(Math.min(23, Math.floor(minutes(time) / 60) + 4)).padStart(2, '0')}:${time.slice(3)}`

  return (
    <Drawer
      title={event.title}
      sub={`${fmt.relative(eventDate(event.dateTime))} · ${time} · ${event.zoneName}`}
      onClose={onClose}
      busy={assign.isPending || unassign.isPending}
      footer={
        <>
          <Button variant="danger" icon={Trash2} className="spacer" onClick={() => setConfirmDelete(true)}>
            {t.eventDrawer.delete}
          </Button>
          <Button icon={Pencil} onClick={onEdit}>
            {t.eventDrawer.edit}
          </Button>
        </>
      }
    >
      <dl className="kv">
        <dt>{t.eventDrawer.guests}</dt>
        <dd className="num">{event.peopleNumber}</dd>
        {event.description && (
          <>
            <dt>{t.eventDrawer.notes}</dt>
            <dd>{event.description}</dd>
          </>
        )}
      </dl>

      <section>
        <div className="group-label">
          {t.eventDrawer.onEvent} <span className="mono">{assignments.length}</span>
        </div>
        {isLoading ? null : assigned.length === 0 ? (
          <p className="unstaffed" style={{ margin: 0 }}>
            {t.eventDrawer.nobodyYet}
          </p>
        ) : (
          assigned.map(({ a, person }) => {
            const s = coveringShift(a.workerId)
            return (
              <div key={a.id} className="pick-row">
                <Avatar size="sm" initials={person?.initials ?? '?'} />
                <span className="grow">
                  {person?.name ?? t.common.unknownPerson(a.workerId)}
                  {s && <span className="sub">{t.eventDrawer.shift(hhmm(s.startTime), hhmm(s.endTime))}</span>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  loading={unassign.isPending && unassign.variables === a.id}
                  onClick={() => unassign.mutate(a.id)}
                >
                  {t.eventDrawer.takeOff}
                </Button>
              </div>
            )
          })
        )}
      </section>

      <section>
        <div className="group-label">
          <span>{t.eventDrawer.onShiftAt(time)}</span>
          {available.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => assign.mutate(available.map((s) => s.userId))} disabled={assign.isPending}>
              {t.eventDrawer.assignAll(available.length)}
            </Button>
          )}
        </div>
        {available.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t.eventDrawer.nobodyElse(event.zoneName, time)}
          </p>
        ) : (
          available.map((s) => {
            const shift = coveringShift(s.userId)!
            return (
              <div key={s.userId} className="pick-row">
                <Avatar size="sm" initials={s.initials} />
                <span className="grow">
                  {s.name}
                  <span className="sub">{t.eventDrawer.shift(hhmm(shift.startTime), hhmm(shift.endTime))}</span>
                </span>
                <Button
                  size="sm"
                  icon={Plus}
                  loading={assign.isPending && assign.variables?.length === 1 && assign.variables[0] === s.userId}
                  onClick={() => assign.mutate([s.userId])}
                >
                  {t.eventDrawer.assign}
                </Button>
              </div>
            )
          })
        )}
        <ErrorNote error={assign.error ?? unassign.error} />
      </section>

      {notOnShift.length > 0 && !isPast && (
        <section>
          <div className="group-label">
            <span>{t.eventDrawer.notOnShift}</span>
            <span className="mono">{notOnShift.length}</span>
          </div>
          {notOnShift.map((s) => (
            <div key={s.userId} className="pick-row">
              <Avatar size="sm" initials={s.initials} />
              <span className="grow secondary">{s.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onAddShift({
                    workerIds: [s.userId],
                    zoneId: event.zoneId,
                    dates: [eventDate(event.dateTime)],
                    startTime: time,
                    endTime: suggestedEnd,
                  })
                }
              >
                {t.eventDrawer.addShift}
              </Button>
            </div>
          ))}
        </section>
      )}
    </Drawer>
  )
}

interface EventRow {
  title: string
  date: string
  time: string
  zoneId: number | ''
  peopleNumber: string
  description: string
}

function emptyRow(date: string, zoneId: number | ''): EventRow {
  return { title: '', date, time: '19:00', zoneId, peopleNumber: '', description: '' }
}

/** Creates several events in one request, or edits one when an event is passed in */
export function EventFormDialog({
  zones,
  event,
  defaultDate,
  onClose,
}: {
  zones: Zone[]
  event?: KEvent
  defaultDate: string
  onClose: () => void
}) {
  const t = useT()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [rows, setRows] = useState<EventRow[]>(() =>
    event
      ? [
          {
            title: event.title,
            date: eventDate(event.dateTime),
            time: eventTime(event.dateTime),
            zoneId: event.zoneId,
            peopleNumber: String(event.peopleNumber),
            description: event.description ?? '',
          },
        ]
      : [emptyRow(defaultDate < today() ? today() : defaultDate, zones[0]?.id ?? '')],
  )

  const toInput = (r: EventRow): EventInput => ({
    title: r.title.trim(),
    dateTime: toDateTime(r.date, r.time),
    zoneId: Number(r.zoneId),
    peopleNumber: Number(r.peopleNumber),
    description: r.description.trim() || null,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (event) return [await api.events.update(event.id, toInput(rows[0]))]
      return api.events.create(rows.map(toInput))
    },
    onSuccess: async (saved) => {
      await invalidate.schedule()
      toast(event ? t.eventForm.updated : t.eventForm.added(saved.length))
      onClose()
    },
  })

  const err = mutation.error instanceof ApiError ? mutation.error : null
  const failedIndex = err?.batchIndex ?? null
  const fieldError = (i: number, field: string) =>
    err?.fieldErrors[`[${i}].${field}`] ?? (rows.length === 1 ? err?.fieldErrors[field] : undefined)

  const set = (i: number, patch: Partial<EventRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const valid = rows.every((r) => r.title.trim() && r.date && r.time && r.zoneId && Number(r.peopleNumber) > 0)
  const single = rows.length === 1

  return (
    <Dialog
      title={event ? t.eventForm.editTitle : t.eventForm.newTitle}
      sub={event ? t.eventForm.editSub : t.eventForm.newSub}
      onClose={onClose}
      busy={mutation.isPending}
      wide
      footer={
        <>
          {!event && (
            <Button
              variant="ghost"
              icon={Plus}
              className="spacer"
              onClick={() => {
                const last = rows[rows.length - 1]
                setRows((rs) => [...rs, { ...emptyRow(last.date, last.zoneId), time: last.time }])
              }}
            >
              {t.eventForm.another}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!valid} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {event ? t.common.save : t.eventForm.submit(rows.length)}
          </Button>
        </>
      }
    >
      <div className="form">
        {single ? (
          <SingleEventFields row={rows[0]} zones={zones} onChange={(p) => set(0, p)} error={(f) => fieldError(0, f)} />
        ) : (
          <div className="batch-rows">
            <div className="batch-head">
              <span>{t.eventForm.title}</span>
              <span>{t.eventForm.date}</span>
              <span>{t.eventForm.time}</span>
              <span>{t.eventForm.zone}</span>
              <span>{t.eventForm.guests}</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className={i === failedIndex ? 'batch-row failed' : 'batch-row'}>
                <input
                  className="input"
                  placeholder={t.eventForm.title}
                  aria-label={t.eventForm.title}
                  value={r.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                  aria-invalid={!!fieldError(i, 'title')}
                />
                <input
                  className="input mono"
                  type="date"
                  aria-label={t.eventForm.date}
                  value={r.date}
                  onChange={(e) => set(i, { date: e.target.value })}
                />
                <input
                  className="input mono"
                  type="time"
                  aria-label={t.eventForm.time}
                  value={r.time}
                  onChange={(e) => set(i, { time: e.target.value })}
                />
                <select
                  className="select"
                  aria-label={t.eventForm.zone}
                  value={r.zoneId}
                  onChange={(e) => set(i, { zoneId: Number(e.target.value) })}
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  aria-label={t.eventForm.guests}
                  placeholder="0"
                  value={r.peopleNumber}
                  onChange={(e) => set(i, { peopleNumber: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={X}
                  aria-label={t.eventForm.removeRow}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  style={{ marginTop: 3 }}
                />
              </div>
            ))}
          </div>
        )}
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}

function SingleEventFields({
  row,
  zones,
  onChange,
  error,
}: {
  row: EventRow
  zones: Zone[]
  onChange: (patch: Partial<EventRow>) => void
  error: (field: string) => string | undefined
}) {
  const t = useT()
  return (
    <>
      <Field label={t.eventForm.title} error={error('title')}>
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder={t.eventForm.titlePlaceholder}
            value={row.title}
            maxLength={100}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        )}
      </Field>
      <div className="row-2">
        <Field label={t.eventForm.date} error={error('dateTime')}>
          {(id) => <input id={id} type="date" className="input mono" value={row.date} onChange={(e) => onChange({ date: e.target.value })} />}
        </Field>
        <Field label={t.eventForm.starts} hint={t.eventForm.startsHint}>
          {(id) => <input id={id} type="time" className="input mono" value={row.time} onChange={(e) => onChange({ time: e.target.value })} />}
        </Field>
      </div>
      <div className="row-2">
        <Field label={t.eventForm.zone}>
          {(id) => (
            <select id={id} className="select" value={row.zoneId} onChange={(e) => onChange({ zoneId: Number(e.target.value) })}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t.eventForm.guests} error={error('peopleNumber')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              className="input mono"
              placeholder="120"
              value={row.peopleNumber}
              onChange={(e) => onChange({ peopleNumber: e.target.value })}
            />
          )}
        </Field>
      </div>
      <Field label={t.eventForm.notes} hint={t.eventForm.notesHint} error={error('description')}>
        {(id) => (
          <textarea
            id={id}
            className="textarea"
            maxLength={500}
            placeholder={t.eventForm.notesPlaceholder}
            value={row.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
      </Field>
    </>
  )
}
