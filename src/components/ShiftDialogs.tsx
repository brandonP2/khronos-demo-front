import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Moon, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Shift, ShiftInput, Zone } from '../api/types'
import { useInvalidate, type StaffMember } from '../lib/queries'
import { useFmt, useT, type Messages } from '../lib/i18n'
import { addDays, durationLabel, endsNextDay, hhmm, shiftTimeIssue, today, weekDays } from '../lib/time'
import { Avatar, Button, ConfirmDialog, Dialog, ErrorNote, Field, ShiftTimes, useToast } from './ui'

/**
 * What the times of a shift mean. An end at or before the start is on the next day
 * (18:00–02:00 is 8 hours); the same time twice and more than 16 hours are refused.
 */
function shiftTimes(startTime: string, endTime: string, t: Messages) {
  const issue = shiftTimeIssue(startTime, endTime)
  const error = issue === 'same-time' ? t.shiftBatch.sameTime : issue === 'too-long' ? t.shiftBatch.tooLong : undefined
  const complete = !!startTime && !!endTime
  const duration = complete && !issue ? durationLabel(startTime, endTime) : ''
  const overnight = complete && !issue && endsNextDay(startTime, endTime)
  const hint = !duration ? undefined : overnight ? t.shiftBatch.nextDayHint : t.shiftBatch.lasts(duration)
  return { error, duration, overnight, hint }
}

/** Said out loud when a shift runs past midnight; the region is always there so the change is announced */
function OvernightNote({ overnight, endTime, duration }: { overnight: boolean; endTime: string; duration: string }) {
  const t = useT()
  return (
    <div aria-live="polite">
      {overnight && (
        <div className="notice info">
          <Moon size={16} strokeWidth={1.5} />
          <span>{t.shiftBatch.overnight(endTime, duration)}</span>
        </div>
      )}
    </div>
  )
}

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
  const t = useT()
  const fmt = useFmt()
  const invalidate = useInvalidate()
  const toast = useToast()
  const active = staff.filter((s) => s.isActive)
  const now = today()
  // Shifts cannot be planned in the past, so a past day from the board or a draft is dropped
  const requestedDates = draft?.dates ?? [anchorDate]
  const droppedPast = requestedDates.some((d) => d < now)
  const [week, setWeek] = useState(anchorDate < now ? now : anchorDate)
  const [workerIds, setWorkerIds] = useState<number[]>(draft?.workerIds ?? [])
  const [zoneId, setZoneId] = useState<number | ''>(draft?.zoneId ?? zones[0]?.id ?? '')
  const [dates, setDates] = useState<string[]>(() => requestedDates.filter((d) => d >= now))
  const [startTime, setStartTime] = useState(draft?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(draft?.endTime ?? '17:00')
  const [failedIndex, setFailedIndex] = useState<number | null>(null)

  const times = shiftTimes(startTime, endTime, t)
  const timeError = times.error

  const batch: ShiftInput[] = useMemo(() => {
    if (!zoneId) return []
    // Checked again here in case the dialog stays open past midnight
    const upcomingDates = dates.filter((d) => d >= now).sort()
    return upcomingDates.flatMap((date) =>
      workerIds.map((workerId) => ({ workerId, zoneId, date, startTime, endTime })),
    )
  }, [dates, workerIds, zoneId, startTime, endTime, now])

  const mutation = useMutation({
    mutationFn: () => api.shifts.create(batch),
    onMutate: () => setFailedIndex(null),
    onSuccess: async (created) => {
      await invalidate.schedule()
      toast(t.shiftBatch.added(created.length))
      onClose()
    },
    onError: (e) => setFailedIndex(e instanceof ApiError ? e.batchIndex : null),
  })

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const nameOf = (id: number) => staff.find((s) => s.userId === id)?.name ?? t.common.unknownPerson(id)
  const zoneName = zones.find((z) => z.id === zoneId)?.name
  const canSave = batch.length > 0 && !timeError

  return (
    <Dialog
      title={t.shiftBatch.title}
      sub={t.shiftBatch.sub}
      onClose={onClose}
      busy={mutation.isPending}
      wide
      footer={
        <>
          <span className="spacer muted">
            {batch.length > 0 && times.duration ? t.shiftBatch.summary(batch.length, times.duration) : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!canSave} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.shiftBatch.submit(batch.length)}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="label">{t.shiftBatch.people}</span>
          {active.length === 0 ? (
            <span className="hint">{t.shiftBatch.nobodyActive}</span>
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
            <span>{t.shiftBatch.days}</span>
            <span className="actions">
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} onClick={() => setWeek(addDays(week, -7))} aria-label={t.common.previousWeek} />
              <span className="mono muted" style={{ fontSize: 12 }}>
                {fmt.week(week)}
              </span>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} onClick={() => setWeek(addDays(week, 7))} aria-label={t.common.nextWeek} />
            </span>
          </div>
          <div className="chips">
            {weekDays(week).map((d) => (
              <button
                key={d}
                className="chip plain"
                aria-pressed={dates.includes(d)}
                onClick={() => setDates((list) => toggle(list, d))}
                disabled={d < now}
              >
                {fmt.weekday(d)} <span className="sub">{fmt.dayNumber(d)}</span>
              </button>
            ))}
          </div>
          {droppedPast && <span className="hint">{t.shiftBatch.pastSkipped}</span>}
          {dates.some((d) => !weekDays(week).includes(d)) && (
            <span className="hint">
              {t.shiftBatch.alsoSelected(
                dates
                  .filter((d) => !weekDays(week).includes(d))
                  .sort()
                  .map(fmt.day)
                  .join(', '),
              )}
            </span>
          )}
        </div>

        <div className="row-3">
          <Field label={t.shiftBatch.zone}>
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
          <Field label={t.shiftBatch.starts}>
            {(id) => (
              <input id={id} type="time" className="input mono" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            )}
          </Field>
          <Field label={t.shiftBatch.ends} error={timeError} hint={times.hint}>
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
        <OvernightNote overnight={times.overnight} endTime={endTime} duration={times.duration} />

        {batch.length > 0 && !timeError && (
          <div className="field">
            <span className="label">{t.shiftBatch.preview}</span>
            <div className="batch-preview">
              {batch.map((s, i) => (
                <div key={`${s.workerId}-${s.date}`} className={i === failedIndex ? 'list-row failed' : 'list-row'}>
                  <span style={{ flex: 1 }}>{nameOf(s.workerId)}</span>
                  <span className="muted">{zoneName}</span>
                  <span className="mono secondary when">
                    {fmt.day(s.date)} · <ShiftTimes startTime={s.startTime} endTime={s.endTime} />
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
  const t = useT()
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
  const times = shiftTimes(form.startTime, form.endTime, t)
  const timeError = times.error

  const save = useMutation({
    mutationFn: () => api.shifts.update(shift.id, form),
    onSuccess: async () => {
      await invalidate.schedule()
      toast(t.shiftEdit.updated)
      onClose()
    },
  })

  if (confirmDelete) {
    return (
      <ConfirmDialog
        title={t.shiftEdit.removeTitle}
        confirmLabel={t.shiftEdit.removeConfirm}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api.shifts.remove(shift.id)
          await invalidate.schedule()
          toast(t.shiftEdit.removed)
          onClose()
        }}
      >
        {t.shiftEdit.removeBody(staff.find((s) => s.userId === shift.workerId)?.name ?? null)}
      </ConfirmDialog>
    )
  }

  return (
    <Dialog
      title={t.shiftEdit.title}
      sub={t.shiftEdit.sub}
      onClose={onClose}
      busy={save.isPending}
      footer={
        <>
          <Button variant="danger" icon={Trash2} className="spacer" onClick={() => setConfirmDelete(true)}>
            {t.shiftEdit.remove}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!!timeError} onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="row-2">
          <Field label={t.shiftEdit.person}>
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
          <Field label={t.shiftBatch.zone}>
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
          <Field label={t.shiftEdit.date}>
            {(id) => <input id={id} type="date" className="input mono" value={form.date} onChange={(e) => set('date', e.target.value)} />}
          </Field>
          <Field label={t.shiftBatch.starts}>
            {(id) => (
              <input id={id} type="time" className="input mono" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            )}
          </Field>
          <Field label={t.shiftBatch.ends} error={timeError} hint={times.hint}>
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
        <OvernightNote overnight={times.overnight} endTime={form.endTime} duration={times.duration} />
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  )
}

/**
 * Repeats last week's rota on the week shown, skipping people who are no longer active.
 * Night shifts keep their times, so they still end the next day.
 */
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
  const t = useT()
  const fmt = useFmt()
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
      toast(t.copyWeek.copied(created.length))
      onClose()
    },
    onError: (e) => setFailedIndex(e instanceof ApiError ? e.batchIndex : null),
  })

  const nameOf = (id: number) => staff.find((s) => s.userId === id)?.name ?? t.common.unknownPerson(id)
  const zoneOf = (id: number) => zones.find((z) => z.id === id)?.name ?? ''

  return (
    <Dialog
      title={t.copyWeek.title}
      sub={t.copyWeek.sub(fmt.week(source[0]), fmt.week(target[0]))}
      onClose={onClose}
      busy={mutation.isPending}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={batch.length === 0} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.copyWeek.submit(batch.length)}
          </Button>
        </>
      }
    >
      <div className="form">
        {sourceShifts.length === 0 ? (
          <div className="notice info">{t.copyWeek.empty}</div>
        ) : (
          <>
            {(skipped > 0 || alreadyThere > 0) && (
              <div className="notice info">
                <span>
                  {skipped > 0 && t.copyWeek.skipped(skipped)}
                  {alreadyThere > 0 && t.copyWeek.alreadyThere(alreadyThere)}
                </span>
              </div>
            )}
            <div className="batch-preview">
              {batch.map((s, i) => (
                <div key={i} className={i === failedIndex ? 'list-row failed' : 'list-row'}>
                  <span style={{ flex: 1 }}>{nameOf(s.workerId)}</span>
                  <span className="muted">{zoneOf(s.zoneId)}</span>
                  <span className="mono secondary when">
                    {fmt.day(s.date)} · <ShiftTimes startTime={s.startTime} endTime={s.endTime} />
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
