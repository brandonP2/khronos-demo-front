// What an owner can do to someone's time entries. Nothing is deleted: entries are added,
// corrected or voided, and each of those asks for a reason that stays in the entry's history.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Ban, LogIn, LogOut, Moon, Pencil, TriangleAlert } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { TimeEntry } from '../api/types'
import { isAlreadyClockedOut, isOpenTooLong } from '../lib/apiMessages'
import { parseBreakMinutes } from '../lib/hours'
import { useFmt, useT } from '../lib/i18n'
import { useInvalidate, type StaffMember } from '../lib/queries'
import { addDays, minutes, minutesLabel, minutesSince, nowInstant, zonedDate, zonedInstant, zonedTime, zonedToday } from '../lib/time'
import { useNow } from '../lib/useNow'
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
  askClockOut = false,
  onClose,
}: {
  workerId: number
  workerName: string
  timeZone: string
  /** Corrects this entry; without it a new one is added */
  entry?: TimeEntry
  /** An open entry is corrected with the clock-out to fill in, instead of left open */
  askClockOut?: boolean
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [date, setDate] = useState(entry ? zonedDate(entry.clockIn, timeZone) : zonedToday(timeZone))
  const [clockIn, setClockIn] = useState(entry ? zonedTime(entry.clockIn, timeZone) : '')
  const [clockOut, setClockOut] = useState(entry?.clockOut ? zonedTime(entry.clockOut, timeZone) : '')
  const [stillIn, setStillIn] = useState(entry ? entry.clockOut === null && !askClockOut : false)
  const [breakText, setBreakText] = useState(String(entry?.breakMinutes ?? 0))
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)

  const now = Date.now()
  // The same time as the clock-in is the next day too, so 08:00 to 08:00 is 24 hours, which the API takes
  const nextDay = !!clockIn && !!clockOut && minutes(clockOut) <= minutes(clockIn)
  const outDate = nextDay ? addDays(date, 1) : date
  // The form shows whole minutes; a time the owner did not touch keeps its exact instant, seconds included
  const inInstant = !date || !clockIn
    ? null
    : entry && date === zonedDate(entry.clockIn, timeZone) && clockIn === zonedTime(entry.clockIn, timeZone)
      ? entry.clockIn
      : zonedInstant(date, clockIn, timeZone)
  const typedOut = stillIn || !date || !clockOut
    ? null
    : entry?.clockOut && outDate === zonedDate(entry.clockOut, timeZone) && clockOut === zonedTime(entry.clockOut, timeZone)
      ? entry.clockOut
      : zonedInstant(outDate, clockOut, timeZone)
  // Compared as instants, as the API does. A clock-out not after the clock-in can still be typed
  // on the night the clocks go forward: 02:30 does not exist and becomes 03:30, after 03:00.
  const notAfterIn = !!inInstant && !!typedOut && Date.parse(typedOut) <= Date.parse(inInstant)
  const outInstant = notAfterIn ? null : typedOut
  const span = inInstant && outInstant ? Math.round((Date.parse(outInstant) - Date.parse(inInstant)) / 60_000) : null
  const breakMinutes = parseBreakMinutes(breakText)

  const inError = inInstant && Date.parse(inInstant) > now ? t.entryForm.future : undefined
  const outError = notAfterIn
    ? t.entryForm.notAfterIn
    : outInstant && Date.parse(outInstant) > now
      ? t.entryForm.future
      : undefined
  const breakInvalid = breakMinutes === null || (span !== null && breakMinutes > span)
  const valid =
    !!inInstant && (stillIn || !!outInstant) && !inError && !outError && !breakInvalid && !isReasonInvalid(reason)

  const mutation = useMutation({
    mutationFn: () => {
      const input = { clockIn: inInstant!, clockOut: stillIn ? null : outInstant, breakMinutes: breakMinutes!, reason: reason.trim() }
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
      sub={entry ? t.entryForm.correctSub(workerName, fmt.longInSentence(entry.businessDate)) : t.entryForm.addSub}
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
      sub={t.voidEntry.sub(workerName, fmt.longInSentence(entry.businessDate))}
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

/** The owner clocks someone in at the current time, with a short reason that has a default */
export function ClockInForDialog({
  people,
  timeZone,
  onClose,
}: {
  /** Active people who are not in */
  people: StaffMember[]
  timeZone: string
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const now = useNow(10_000)
  const [picked, setPicked] = useState<number | ''>(people[0]?.userId ?? '')
  // The list refreshes while the dialog is open; someone just clocked in elsewhere drops out of it
  const workerId = people.some((p) => p.userId === picked) ? picked : (people[0]?.userId ?? '')
  const [reason, setReason] = useState(t.now.defaultReason)
  const [touched, setTouched] = useState(false)
  const name = people.find((p) => p.userId === workerId)?.name ?? ''

  const mutation = useMutation({
    mutationFn: () => api.timeEntries.create({ workerId: Number(workerId), clockIn: nowInstant(), reason: reason.trim() }),
    onSuccess: async (created) => {
      await invalidate.timeEntries()
      toast(t.now.clockedIn(name, zonedTime(created.clockIn, timeZone)))
      onClose()
    },
  })
  const valid = workerId !== '' && !isReasonInvalid(reason)
  const submit = () => {
    setTouched(true)
    if (valid) mutation.mutate()
  }

  return (
    <Dialog
      title={t.now.inTitle}
      sub={t.now.inSub(zonedTime(now, timeZone))}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={LogIn} disabled={!valid} loading={mutation.isPending} onClick={submit}>
            {t.now.clockIn}
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
        <Field label={t.now.person}>
          {(id) => (
            <select id={id} className="select" value={workerId} onChange={(e) => setPicked(Number(e.target.value))}>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ReasonField value={reason} onChange={setReason} touched={touched} onBlur={() => setTouched(true)} />
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** The API's limit: an entry open for longer cannot be clocked out, only corrected */
const MAX_OPEN_MINUTES = 24 * 60

/**
 * The owner clocks someone out at the current time; the server sets the time and the history
 * keeps it as a clock-out, with the reason. An entry open for more than 24 hours cannot be
 * clocked out: the dialog says so and offers to correct it with the real time instead. One
 * someone else clocked out meanwhile closes the dialog with a note.
 */
export function ClockOutForDialog({
  entry,
  name,
  timeZone,
  onClose,
  onCorrect,
}: {
  entry: TimeEntry
  name: string
  timeZone: string
  onClose: () => void
  /** Opens the correction of this entry, for one open too long to clock out */
  onCorrect: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const now = useNow(10_000)
  const [breakText, setBreakText] = useState(String(entry.breakMinutes))
  const [reason, setReason] = useState(t.now.defaultReason)
  const [touched, setTouched] = useState(false)
  const breakMinutes = parseBreakMinutes(breakText)
  const elapsed = minutesSince(entry.clockIn, now)
  const breakInvalid = breakMinutes === null || breakMinutes > elapsed

  const mutation = useMutation({
    mutationFn: () => api.timeEntries.clockOutFor(entry.id, { breakMinutes: breakMinutes!, reason: reason.trim() }),
    onSuccess: async (closed) => {
      await invalidate.timeEntries()
      toast(t.now.clockedOut(name, closed.clockOut ? zonedTime(closed.clockOut, timeZone) : zonedTime(Date.now(), timeZone)))
      onClose()
    },
    onError: (e) => {
      // Whatever went wrong, the entry may have changed elsewhere, so who is in is asked again
      void invalidate.timeEntries()
      // Someone else clocked the person out first: what the owner wanted is done, so say so and close
      if (e instanceof ApiError && e.status === 409 && isAlreadyClockedOut(e.message)) {
        toast(t.now.alreadyOut(name))
        onClose()
      }
    },
  })
  // Known before sending from the clock-in, or learnt from the API's 409 right at the limit
  const refused = mutation.error instanceof ApiError && mutation.error.status === 409 && isOpenTooLong(mutation.error.message)
  const tooLong = elapsed > MAX_OPEN_MINUTES || refused
  const valid = !breakInvalid && !isReasonInvalid(reason)
  const submit = () => {
    setTouched(true)
    if (valid && !tooLong) mutation.mutate()
  }

  return (
    <Dialog
      title={t.now.outTitle(name)}
      sub={tooLong ? undefined : t.now.outSub(zonedTime(entry.clockIn, timeZone), zonedTime(now, timeZone))}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        tooLong ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" icon={Pencil} onClick={onCorrect} data-autofocus>
              {t.now.correctInstead}
            </Button>
          </>
        ) : (
          <>
            <span className="spacer muted">{!breakInvalid ? t.entryForm.worked(minutesLabel(elapsed - breakMinutes)) : ''}</span>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" icon={LogOut} disabled={!valid} loading={mutation.isPending} onClick={submit}>
              {t.now.clockOut}
            </Button>
          </>
        )
      }
    >
      {tooLong ? (
        <div className="notice info" role="status">
          <TriangleAlert size={16} strokeWidth={1.5} />
          <span>{t.now.openTooLong(fmt.short(zonedDate(entry.clockIn, timeZone)), zonedTime(entry.clockIn, timeZone))}</span>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
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
          <ReasonField value={reason} onChange={setReason} touched={touched} onBlur={() => setTouched(true)} />
          <ErrorNote error={mutation.error} />
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}
