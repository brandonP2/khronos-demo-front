import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, TriangleAlert } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Shift, TimeEntry, Zone } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { isNoOpenEntry } from '../lib/apiMessages'
import { useT } from '../lib/i18n'
import { keys, useInvalidate, useMyOpenEntry } from '../lib/queries'
import { addDays, endsNextDay, hhmm, minutesLabel, minutesSince, shiftWindow, zonedTime, zonedToday } from '../lib/time'
import { useNow } from '../lib/useNow'
import { Button, Dialog, ErrorNote, Field, NextDay, useToast } from './ui'

const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409
const isNothingOpen = (e: unknown) => isConflict(e) && isNoOpenEntry((e as ApiError).message)

/** The shift running now, else today's next one, else today's last one */
export function pickShift(shifts: Shift[], day: string, timeZone: string, now: number) {
  const windows = shifts.map((shift) => ({ shift, ...shiftWindow(shift, timeZone) }))
  const running = windows.find((w) => w.start <= now && now < w.end)
  if (running) return { shift: running.shift, running: true }
  const todays = windows.filter((w) => w.shift.date === day).sort((a, b) => a.start - b.start)
  const next = todays.find((w) => w.start > now) ?? todays[todays.length - 1]
  return next ? { shift: next.shift, running: false } : null
}

/**
 * Clocking in and out from the phone. Shows whether the person is in, since when and for how
 * long, and today's planned shift. The server sets the time; no location is ever sent.
 */
export function ClockCard({ timeZone, zones }: { timeZone: string; zones: Zone[] }) {
  const t = useT()
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const invalidate = useInvalidate()
  const titleId = useId()
  const now = useNow(10_000)
  const open = useMyOpenEntry()
  // Yesterday too: a night shift that started then may still be running
  const day = zonedToday(timeZone, now)
  const range = { from: addDays(day, -1), to: day }
  const shifts = useQuery({ queryKey: keys.workerShifts(me.id, range), queryFn: () => api.shifts.byWorker(me.id, range) })
  const [notice, setNotice] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const entry = open.data ?? null
  const planned = pickShift(shifts.data ?? [], day, timeZone, now)
  const zoneName = (id: number) => zones.find((z) => z.id === id)?.name ?? ''

  const clockIn = useMutation({
    mutationFn: () => api.timeEntries.clockIn(),
    onMutate: () => setNotice(null),
    onSuccess: async (created) => {
      qc.setQueryData(keys.myOpenEntry(), created)
      toast(t.clock.clockedIn(zonedTime(created.clockIn, timeZone)))
      await invalidate.timeEntries()
    },
    onError: async (e) => {
      if (!isConflict(e)) return
      // Most often already clocked in, on another phone or by the manager; any other reason is
      // shown as the API words it. A deactivated account gets a 401 and is signed out instead.
      const current = await qc.fetchQuery({ queryKey: keys.myOpenEntry(), queryFn: api.timeEntries.myOpen, staleTime: 0 })
      if (current) setNotice(t.clock.alreadyIn(zonedTime(current.clockIn, timeZone)))
    },
  })

  const clockedOut = async (closed: TimeEntry) => {
    setClosing(false)
    setNotice(null)
    qc.setQueryData(keys.myOpenEntry(), null)
    toast(t.clock.clockedOut(closed.clockOut ? zonedTime(closed.clockOut, timeZone) : '', minutesLabel(closed.workedMinutes ?? 0)))
    await invalidate.timeEntries()
  }

  const error = notice ?? clockIn.error ?? open.error

  return (
    <section className="card clock-card" aria-labelledby={titleId}>
      <div className="clock-main">
        <div className="clock-state">
          <h2 id={titleId} className="clock-title">
            {t.clock.title}
          </h2>
          {open.isLoading ? (
            <span className="status" aria-busy="true">
              <span className="dot" />…
            </span>
          ) : entry ? (
            <>
              <span className="status">
                <span className="dot on" />
                {t.clock.inSince(zonedTime(entry.clockIn, timeZone))}
              </span>
              <span className="clock-figure">
                <span className="visually-hidden">{t.clock.elapsed}: </span>
                {minutesLabel(minutesSince(entry.clockIn, now))}
              </span>
            </>
          ) : (
            <span className="status">
              <span className="dot" />
              {t.clock.out}
            </span>
          )}
        </div>
        {!open.isLoading && !entry?.isStale && (
          <Button
            variant="primary"
            className="clock-button"
            icon={entry ? LogOut : LogIn}
            loading={clockIn.isPending}
            onClick={() => (entry ? setClosing(true) : clockIn.mutate())}
          >
            {entry ? t.clock.clockOut : t.clock.clockIn}
          </Button>
        )}
      </div>

      {entry?.isStale && (
        <div className="notice" role="alert">
          <TriangleAlert size={16} strokeWidth={1.5} />
          <span>{t.clock.stale}</span>
        </div>
      )}

      <div className="clock-foot">
        <span className="clock-shift">
          {planned ? (
            <>
              {planned.running ? t.clock.currentShift : t.clock.todayShift}:{' '}
              <span className="mono">
                {hhmm(planned.shift.startTime)}–{hhmm(planned.shift.endTime)}
                {endsNextDay(planned.shift.startTime, planned.shift.endTime) && <NextDay />}
              </span>
              {zoneName(planned.shift.zoneId) && ` · ${zoneName(planned.shift.zoneId)}`}
            </>
          ) : shifts.isLoading ? null : (
            t.clock.noShiftToday
          )}
        </span>
        <ErrorNote error={error} />
        <span className="muted" style={{ fontSize: 12 }}>
          {t.clock.privacy}
        </span>
      </div>

      {closing && entry && (
        <ClockOutDialog
          entry={entry}
          timeZone={timeZone}
          onClose={() => setClosing(false)}
          onDone={clockedOut}
          onNothingOpen={() => {
            // Someone closed it already: say so on the card, which then shows the person out
            setClosing(false)
            setNotice(t.clock.notIn)
            void qc.invalidateQueries({ queryKey: keys.myOpenEntry() })
          }}
        />
      )}
    </section>
  )
}

/** Asks for the break taken (0 by default) and an optional note, then clocks out */
function ClockOutDialog({
  entry,
  timeZone,
  onClose,
  onDone,
  onNothingOpen,
}: {
  entry: TimeEntry
  timeZone: string
  onClose: () => void
  onDone: (closed: TimeEntry) => void
  /** The API answered 409 because there was no open entry to close */
  onNothingOpen: () => void
}) {
  const t = useT()
  const now = useNow(10_000)
  const [breakText, setBreakText] = useState('0')
  const [note, setNote] = useState('')

  const elapsed = minutesSince(entry.clockIn, now)
  const breakMinutes = /^\d+$/.test(breakText.trim()) ? Number(breakText.trim()) : NaN
  const breakError =
    !Number.isInteger(breakMinutes) || breakMinutes > 600
      ? t.clock.breakError
      : breakMinutes > elapsed
        ? t.clock.breakTooLong
        : undefined

  const mutation = useMutation({
    mutationFn: () => api.timeEntries.clockOut({ breakMinutes, note: note.trim() || undefined }),
    onSuccess: onDone,
    onError: (e) => {
      if (isNothingOpen(e)) onNothingOpen()
    },
  })
  // Any other 409, such as an entry open for more than 24 hours, stays in the dialog
  const error = isNothingOpen(mutation.error) ? null : mutation.error
  const submit = () => !breakError && mutation.mutate()

  return (
    <Dialog
      title={t.clock.outTitle}
      sub={t.clock.outSub(zonedTime(entry.clockIn, timeZone), minutesLabel(elapsed))}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={LogOut} disabled={!!breakError} loading={mutation.isPending} onClick={submit}>
            {t.clock.clockOut}
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
        <Field label={t.clock.breakLabel} hint={t.clock.breakHint} error={breakError}>
          {(id) => (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              step={1}
              className="input mono"
              value={breakText}
              onChange={(e) => setBreakText(e.target.value)}
            />
          )}
        </Field>
        <Field label={t.clock.noteLabel} hint={t.clock.noteHint}>
          {(id) => <input id={id} className="input" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {!breakError && <p className="secondary" style={{ margin: 0 }}>{t.clock.willCount(minutesLabel(elapsed - breakMinutes))}</p>}
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
