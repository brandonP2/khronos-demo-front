import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Shift, ShiftInput, Zone } from '../api/types'
import { useInvalidate, type StaffMember } from '../lib/queries'
import { addDays, durationLabel, fmt, hhmm, minutes, today, weekDays } from '../lib/time'
import { Avatar, Button, ConfirmDialog, Dialog, ErrorNote, Field, pluralize, useToast } from './ui'

export interface ShiftDraft {
  workerIds?: number[]
  zoneId?: number
  dates?: string[]
  startTime?: string
  endTime?: string
}

/**
 * Schedules several people on several days in one go. The API saves the batch in a single
 * transaction, so if one shift clashes nothing is saved and the failing row is pointed out.
 */
export function ShiftBatchDialog({
  staff,
  zones,
  anchorDate,
  draft,
  onClose,
}: {
  staff: StaffMember[]
  zones: Zone[]
  anchorDate: string
  draft?: ShiftDraft
  onClose: () => void
}) {
  const invalidate = useInvalidate()
  const toast = useToast()
  const active = staff.filter((s) => s.isActive)
  const [week, setWeek] = useState(anchorDate)
  const [workerIds, setWorkerIds] = useState<number[]>(draft?.workerIds ?? [])
  const [zoneId, setZoneId] = useState<number | ''>(draft?.zoneId ?? zones[0]?.id ?? '')
  const [dates, setDates] = useState<string[]>(draft?.dates ?? [anchorDate])
  const [startTime, setStartTime] = useState(draft?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(draft?.endTime ?? '17:00')
  const [failedIndex, setFailedIndex] = useState<number | null>(null)

  const timeError = startTime && endTime && minutes(endTime) <= minutes(startTime) ? 'Ends before it starts' : undefined

  const batch: ShiftInput[] = useMemo(() => {
    if (!zoneId) return []
    const sortedDates = [...dates].sort()
    return sortedDates.flatMap((date) =>
      workerIds.map((workerId) => ({ workerId, zoneId, date, startTime, endTime })),
    )
  }, [dates, workerIds, zoneId, startTime, endTime])

  const mutation = useMutation({
    mutationFn: () => api.shifts.create(batch),
    onMutate: () => setFailedIndex(null),
    onSuccess: async (created) => {
      await invalidate.schedule()
      toast(`${pluralize(created.length, 'shift')} added`)
      onClose()
    },
    onError: (e) => setFailedIndex(e instanceof ApiError ? e.batchIndex : null),
  })

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const nameOf = (id: number) => staff.find((s) => s.userId === id)?.name ?? `Worker ${id}`
  const zoneName = zones.find((z) => z.id === zoneId)?.name
  const canSave = batch.length > 0 && !timeError

  return (
    <Dialog
      title="Add shifts"
      sub="Pick the people and the days. One shift is made for each person on each day."
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer muted">
            {batch.length > 0 ? `${pluralize(batch.length, 'shift')} · ${durationLabel(startTime, endTime)} each` : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {batch.length > 1 ? `Add ${batch.length} shifts` : 'Add shift'}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="label">People</span>
          {active.length === 0 ? (
            <span className="hint">Nobody active on the team yet. Add people from the Team page first.</span>
          ) : (
            <div className="chips">
              {active.map((s) => (
                <button
                  key={s.userId}
                  className="chip"
                  aria-pressed={workerIds.includes(s.userId)}
                  onClick={() => setWorkerIds((w) => toggle(w, s.userId))}
                >
                  <Avatar size="sm" initials={s.initials} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <div className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Days</span>
            <span className="actions">
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" />
              <span className="mono muted" style={{ fontSize: 12 }}>
                {fmt.week(week)}
              </span>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" />
            </span>
          </div>
          <div className="chips">
            {weekDays(week).map((d) => (
              <button
                key={d}
                className="chip plain"
                aria-pressed={dates.includes(d)}
                onClick={() => setDates((list) => toggle(list, d))}
                disabled={d < today()}
              >
                {fmt.weekday(d)} <span className="sub">{fmt.dayNumber(d)}</span>
              </button>
            ))}
          </div>
          {dates.some((d) => !weekDays(week).includes(d)) && (
            <span className="hint">
              Also selected:{' '}
              {dates
                .filter((d) => !weekDays(week).includes(d))
                .sort()
                .map(fmt.day)
                .join(', ')}
            </span>
          )}
        </div>

        <div className="row-3">
          <Field label="Zone">
            {(id) => (
              <select id={id} className="select" value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Starts">
            {(id) => (
              <input id={id} type="time" className="input mono" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            )}
          </Field>
          <Field label="Ends" error={timeError} hint="Same day, before midnight">
            {(id) => (
              <input
                id={id}
                type="time"
                className="input mono"
                value={endTime}
                aria-invalid={!!timeError}
                onChange={(e) => setEndTime(e.target.value)}
              />
            )}
          </Field>
        </div>

        {batch.length > 0 && (
          <div className="field">
            <span className="label">Preview</span>
            <div className="batch-preview">
              {batch.map((s, i) => (
                <div key={`${s.workerId}-${s.date}`} className={i === failedIndex ? 'list-row failed' : 'list-row'}>
                  <span style={{ flex: 1 }}>{nameOf(s.workerId)}</span>
                  <span className="muted">{zoneName}</span>
                  <span className="mono secondary" style={{ minWidth: 200, textAlign: 'right' }}>
                    {fmt.day(s.date)} · {s.startTime}–{s.endTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}

export function ShiftEditDialog({
  shift,
  staff,
  zones,
  onClose,
}: {
  shift: Shift
  staff: StaffMember[]
  zones: Zone[]
  onClose: () => void
}) {
  const invalidate = useInvalidate()
  const toast = useToast()
  const [form, setForm] = useState<ShiftInput>({
    workerId: shift.workerId,
    zoneId: shift.zoneId,
    date: shift.date,
    startTime: hhmm(shift.startTime),
    endTime: hhmm(shift.endTime),
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof ShiftInput>(k: K, v: ShiftInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const timeError = minutes(form.endTime) <= minutes(form.startTime) ? 'Ends before it starts' : undefined

  const save = useMutation({
    mutationFn: () => api.shifts.update(shift.id, form),
    onSuccess: async () => {
      await invalidate.schedule()
      toast('Shift updated')
      onClose()
    },
  })

  if (confirmDelete) {
    return (
      <ConfirmDialog
        title="Remove this shift"
        confirmLabel="Remove shift"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api.shifts.remove(shift.id)
          await invalidate.schedule()
          toast('Shift removed')
          onClose()
        }}
      >
        {staff.find((s) => s.userId === shift.workerId)?.name ?? 'This person'} will get an email, and any events this
        shift covered will lose them.
      </ConfirmDialog>
    )
  }

  return (
    <Dialog
      title="Edit shift"
      sub="If the new times no longer cover an event this person is on, they are taken off it."
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" icon={Trash2} className="spacer" onClick={() => setConfirmDelete(true)}>
            Remove
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!!timeError} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="row-2">
          <Field label="Person">
            {(id) => (
              <select id={id} className="select" value={form.workerId} onChange={(e) => set('workerId', Number(e.target.value))}>
                {staff
                  .filter((s) => s.isActive || s.userId === shift.workerId)
                  .map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label="Zone">
            {(id) => (
              <select id={id} className="select" value={form.zoneId} onChange={(e) => set('zoneId', Number(e.target.value))}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="row-3">
          <Field label="Date">
            {(id) => <input id={id} type="date" className="input mono" value={form.date} onChange={(e) => set('date', e.target.value)} />}
          </Field>
          <Field label="Starts">
            {(id) => (
              <input id={id} type="time" className="input mono" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            )}
          </Field>
          <Field label="Ends" error={timeError}>
            {(id) => (
              <input
                id={id}
                type="time"
                className="input mono"
                value={form.endTime}
                aria-invalid={!!timeError}
                onChange={(e) => set('endTime', e.target.value)}
              />
            )}
          </Field>
        </div>
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  )
}

/** Repeats last week's rota on the week shown, skipping people who are no longer active */
export function CopyWeekDialog({
  shifts,
  staff,
  zones,
  targetWeekDate,
  onClose,
}: {
  shifts: Shift[]
  staff: StaffMember[]
  zones: Zone[]
  targetWeekDate: string
  onClose: () => void
}) {
  const invalidate = useInvalidate()
  const toast = useToast()
  const target = weekDays(targetWeekDate)
  const source = weekDays(addDays(targetWeekDate, -7))
  const activeIds = new Set(staff.filter((s) => s.isActive).map((s) => s.userId))
  const sourceShifts = shifts.filter((s) => source.includes(s.date))
  const batch: ShiftInput[] = sourceShifts
    .filter((s) => activeIds.has(s.workerId) && addDays(s.date, 7) >= today())
    .map((s) => ({
      workerId: s.workerId,
      zoneId: s.zoneId,
      date: addDays(s.date, 7),
      startTime: hhmm(s.startTime),
      endTime: hhmm(s.endTime),
    }))
  const skipped = sourceShifts.length - batch.length
  const alreadyThere = shifts.filter((s) => target.includes(s.date)).length
  const [failedIndex, setFailedIndex] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.shifts.create(batch),
    onMutate: () => setFailedIndex(null),
    onSuccess: async (created) => {
      await invalidate.schedule()
      toast(`${pluralize(created.length, 'shift')} copied`)
      onClose()
    },
    onError: (e) => setFailedIndex(e instanceof ApiError ? e.batchIndex : null),
  })

  const nameOf = (id: number) => staff.find((s) => s.userId === id)?.name ?? `Worker ${id}`
  const zoneOf = (id: number) => zones.find((z) => z.id === id)?.name ?? ''

  return (
    <Dialog
      title="Copy last week"
      sub={`Repeats the rota of ${fmt.week(source[0])} on ${fmt.week(target[0])}.`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={batch.length === 0} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {batch.length ? `Copy ${pluralize(batch.length, 'shift')}` : 'Nothing to copy'}
          </Button>
        </>
      }
    >
      <div className="form">
        {sourceShifts.length === 0 ? (
          <div className="notice info">Last week has no shifts in this venue.</div>
        ) : (
          <>
            {(skipped > 0 || alreadyThere > 0) && (
              <div className="notice info">
                <span>
                  {skipped > 0 && `${pluralize(skipped, 'shift')} left out because the person is inactive or the day has passed. `}
                  {alreadyThere > 0 &&
                    `This week already has ${pluralize(alreadyThere, 'shift')}; any copy that overlaps one stops the whole copy.`}
                </span>
              </div>
            )}
            <div className="batch-preview">
              {batch.map((s, i) => (
                <div key={i} className={i === failedIndex ? 'list-row failed' : 'list-row'}>
                  <span style={{ flex: 1 }}>{nameOf(s.workerId)}</span>
                  <span className="muted">{zoneOf(s.zoneId)}</span>
                  <span className="mono secondary" style={{ minWidth: 200, textAlign: 'right' }}>
                    {fmt.day(s.date)} · {s.startTime}–{s.endTime}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
