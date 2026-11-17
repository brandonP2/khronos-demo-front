// What an owner can do to someone's time entries. Nothing is deleted: entries are added,
// corrected or voided, and each of those asks for a reason that stays in the entry's history.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Ban, Moon } from 'lucide-react'
import { api } from '../api/endpoints'
import type { TimeEntry } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { useInvalidate } from '../lib/queries'
import { addDays, minutes, minutesLabel, zonedDate, zonedInstant, zonedTime, zonedToday } from '../lib/time'
import { Button, Dialog, ErrorNote, Field, useToast } from './ui'

export const REASON_MIN = 3
export const REASON_MAX = 255

/** The reason is required: 3 to 255 characters once trimmed */
export function isReasonInvalid(reason: string): boolean {
  const length = reason.trim().length
  return length < REASON_MIN || length > REASON_MAX
}

function ReasonField({
  value,
  onChange,
  touched,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  touched: boolean
  onBlur: () => void
}) {
  const t = useT()
  return (
    <Field label={t.entryForm.reason} hint={t.entryForm.reasonHint} error={touched && isReasonInvalid(value) ? t.entryForm.reasonError : undefined}>
      {(id) => (
        <textarea
          id={id}
          className="textarea"
          required
          maxLength={REASON_MAX}
          value={value}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

/**
 * Adds a day that was not clocked, or corrects an entry. Times are typed on the venue's clock;
 * a clock-out at or before the clock-in is on the next day, as with shifts.
 */
export function EntryFormDialog({
  workerId,
  workerName,
  timeZone,
  entry,
  onClose,
}: {
  workerId: number
  workerName: string
  timeZone: string
  /** Corrects this entry; without it a new one is added */
  entry?: TimeEntry
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [date, setDate] = useState(entry ? zonedDate(entry.clockIn, timeZone) : zonedToday(timeZone))
  const [clockIn, setClockIn] = useState(entry ? zonedTime(entry.clockIn, timeZone) : '')
  const [clockOut, setClockOut] = useState(entry?.clockOut ? zonedTime(entry.clockOut, timeZone) : '')
  const [stillIn, setStillIn] = useState(entry ? entry.clockOut === null : false)
  const [breakText, setBreakText] = useState(String(entry?.breakMinutes ?? 0))
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)

  const now = Date.now()
  const inInstant = date && clockIn ? zonedInstant(date, clockIn, timeZone) : null
  const nextDay = !!clockIn && !!clockOut && minutes(clockOut) <= minutes(clockIn)
  const outInstant = !stillIn && date && clockOut ? zonedInstant(nextDay ? addDays(date, 1) : date, clockOut, timeZone) : null
  const span = inInstant && outInstant ? Math.round((Date.parse(outInstant) - Date.parse(inInstant)) / 60_000) : null
  const breakMinutes = /^\d+$/.test(breakText.trim()) ? Number(breakText.trim()) : NaN

  const inError = inInstant && Date.parse(inInstant) > now ? t.entryForm.future : undefined
  const outError = outInstant && Date.parse(outInstant) > now ? t.entryForm.future : undefined
  const breakInvalid = !Number.isInteger(breakMinutes) || breakMinutes > 600 || (span !== null && breakMinutes > span)
  const valid =
    !!inInstant && (stillIn || !!outInstant) && !inError && !outError && !breakInvalid && !isReasonInvalid(reason)

  const mutation = useMutation({
    mutationFn: () => {
      const input = { clockIn: inInstant!, clockOut: stillIn ? null : outInstant, breakMinutes, reason: reason.trim() }
      return entry ? api.timeEntries.update(entry.id, input) : api.timeEntries.create({ workerId, ...input })
    },
    onSuccess: async () => {
      await invalidate.timeEntries()
      toast(entry ? t.entryForm.corrected : t.entryForm.added)
      onClose()
    },
  })

  const submit = () => {
    setReasonTouched(true)
    if (valid) mutation.mutate()
  }

  return (
    <Dialog
      title={entry ? t.entryForm.correctTitle : t.entryForm.addTitle(workerName)}
      sub={entry ? t.entryForm.correctSub(workerName, fmt.long(entry.businessDate)) : t.entryForm.addSub}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <span className="spacer muted">{span !== null && !breakInvalid ? t.entryForm.worked(minutesLabel(span - breakMinutes)) : ''}</span>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!valid} loading={mutation.isPending} onClick={submit}>
            {entry ? t.entryForm.submitCorrect : t.entryForm.submitAdd}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="row-3">
          <Field label={t.entryForm.date}>
            {(id) => (
              <input id={id} type="date" className="input mono" required value={date} max={zonedToday(timeZone)} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <Field label={t.entryForm.clockIn} error={inError}>
            {(id) => <input id={id} type="time" className="input mono" required value={clockIn} onChange={(e) => setClockIn(e.target.value)} />}
          </Field>
          <Field label={t.entryForm.clockOut} error={outError} hint={nextDay && !stillIn ? t.shiftBatch.nextDayHint : undefined}>
            {(id) => (
              <input
                id={id}
                type="time"
                className="input mono"
                disabled={stillIn}
                value={stillIn ? '' : clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            )}
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={stillIn} onChange={(e) => setStillIn(e.target.checked)} />
          {t.entryForm.stillIn}
        </label>
        <div aria-live="polite">
          {nextDay && !stillIn && (
            <div className="notice info">
              <Moon size={16} strokeWidth={1.5} />
              <span>{t.entryForm.nextDay}</span>
            </div>
          )}
        </div>
        <div className="row-2">
          <Field label={t.entryForm.breakMinutes} error={breakInvalid ? t.entryForm.breakError : undefined}>
            {(id) => (
              <input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                className="input mono"
                value={breakText}
                onChange={(e) => setBreakText(e.target.value)}
              />
            )}
          </Field>
        </div>
        <ReasonField value={reason} onChange={setReason} touched={reasonTouched} onBlur={() => setReasonTouched(true)} />
        <span className="hint muted" style={{ fontSize: 12 }}>
          {t.entryForm.timesNote(timeZone)}
        </span>
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** Voids an entry: it stops counting but is kept, with its history */
export function VoidEntryDialog({
  entry,
  workerName,
  onClose,
}: {
  entry: TimeEntry
  workerName: string
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.timeEntries.voidEntry(entry.id, reason.trim()),
    onSuccess: async () => {
      await invalidate.timeEntries()
      toast(t.voidEntry.done)
      onClose()
    },
  })
  const submit = () => {
    setTouched(true)
    if (!isReasonInvalid(reason)) mutation.mutate()
  }

  return (
    <Dialog
      title={t.voidEntry.title}
      sub={t.voidEntry.sub(workerName, fmt.long(entry.businessDate))}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" icon={Ban} disabled={isReasonInvalid(reason)} loading={mutation.isPending} onClick={submit}>
            {t.voidEntry.confirm}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p className="secondary" style={{ margin: 0 }}>
          {t.voidEntry.body}
        </p>
        <ReasonField value={reason} onChange={setReason} touched={touched} onBlur={() => setTouched(true)} />
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
