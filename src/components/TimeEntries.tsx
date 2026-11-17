// Pieces shared by every screen that shows clock-ins: the worker's own hours, the owner's
// hours page and a person's page. Times are always read on the venue's clock.
import type { DayStatus, TimeEntry, TimeEntryChange } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { useEntryHistory } from '../lib/queries'
import { signedMinutesLabel, zonedDate, zonedTime } from '../lib/time'
import { Dialog, ErrorNote, Loading, NextDay } from './ui'

/** An instant as "02:10", with "+1" when it falls on the calendar day after `after` */
export function ZonedTime({ instant, timeZone, after }: { instant: string; timeZone: string; after?: string }) {
  const later = after !== undefined && zonedDate(instant, timeZone) > zonedDate(after, timeZone)
  return (
    <>
      {zonedTime(instant, timeZone)}
      {later && <NextDay />}
    </>
  )
}

/** "18:02–02:10+1", or "18:02 – sigue dentro" while open */
export function EntryTimes({
  entry,
  timeZone,
}: {
  entry: Pick<TimeEntry, 'clockIn' | 'clockOut'>
  timeZone: string
}) {
  const t = useT()
  return (
    <span className="mono">
      {zonedTime(entry.clockIn, timeZone)}–
      {entry.clockOut ? <ZonedTime instant={entry.clockOut} timeZone={timeZone} after={entry.clockIn} /> : <span className="muted">{t.entries.stillIn}</span>}
    </span>
  )
}

/** Corrected, voided, open and forgotten entries say so in words */
export function EntryTags({ entry }: { entry: TimeEntry }) {
  const t = useT()
  return (
    <>
      {entry.status === 'VOIDED' && <span className="tag bad">{t.entries.voided}</span>}
      {entry.status === 'OPEN' && !entry.isStale && <span className="tag good">{t.entries.open}</span>}
      {entry.isStale && entry.status === 'OPEN' && <span className="tag warn">{t.entries.stale}</span>}
      {entry.isEdited && <span className="tag">{t.entries.edited}</span>}
    </>
  )
}

const STATUS_DOT: Record<DayStatus, string> = {
  OK: 'dot on',
  LATE: 'dot accent',
  MISSED: 'dot bad',
  UNPLANNED: 'dot',
  OPEN: 'dot on',
  UPCOMING: 'dot',
}

/** The day's status with its name, never by colour alone */
export function DayStatusLabel({ status }: { status: DayStatus }) {
  const t = useT()
  return (
    <span className="status">
      <span className={STATUS_DOT[status]} />
      {t.dayStatus[status]}
    </span>
  )
}

/** Worked minus planned: sign, colour and, for screen readers, words */
export function Difference({ minutes }: { minutes: number }) {
  const t = useT()
  const cls = minutes > 0 ? 'diff over' : minutes < 0 ? 'diff under' : 'diff'
  const words = minutes > 0 ? t.entries.overPlan : minutes < 0 ? t.entries.underPlan : t.entries.onPlan
  return (
    <span className={cls}>
      {signedMinutesLabel(minutes)}
      <span className="visually-hidden"> {words}</span>
    </span>
  )
}

/**
 * A cost, or "—" when some of its minutes fall on days with no hourly rate (the API then gives
 * null rather than a sum that falls short). The reason is in the title and read out.
 */
export function Cost({ value }: { value: number | null }) {
  const t = useT()
  const fmt = useFmt()
  if (value !== null) return <>{fmt.money(value)}</>
  return (
    <span title={t.hours.missingRate}>
      —<span className="visually-hidden"> {t.hours.missingRate}</span>
    </span>
  )
}

/** Every change made to an entry, oldest first, with who made it and why */
export function HistoryDialog({ entry, timeZone, onClose }: { entry: TimeEntry; timeZone: string; onClose: () => void }) {
  const t = useT()
  const fmt = useFmt()
  const history = useEntryHistory(entry.id)
  return (
    <Dialog title={t.entries.historyTitle} sub={t.entries.historySub(fmt.longInSentence(entry.businessDate))} onClose={onClose}>
      {history.isLoading ? (
        <Loading rows={2} />
      ) : history.error ? (
        <ErrorNote error={history.error} />
      ) : (history.data ?? []).length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t.entries.noChanges}
        </p>
      ) : (
        <ol className="history">
          {(history.data ?? []).map((change) => (
            <HistoryItem key={change.id} change={change} timeZone={timeZone} />
          ))}
        </ol>
      )}
    </Dialog>
  )
}

function HistoryItem({ change, timeZone }: { change: TimeEntryChange; timeZone: string }) {
  const t = useT()
  const fmt = useFmt()
  const when = `${fmt.day(zonedDate(change.changedAt, timeZone))} ${zonedTime(change.changedAt, timeZone)}`
  const clockOut = change.clockOut ? zonedTime(change.clockOut, timeZone) : null
  const nextDay = change.clockOut && zonedDate(change.clockOut, timeZone) > zonedDate(change.clockIn, timeZone)
  return (
    <li className="history-item">
      <div className="history-head">
        <span className="history-action">{t.entries.actions[change.action]}</span>
        <span className="muted mono">{t.entries.by(change.changedByName, when)}</span>
      </div>
      {change.reason && (
        <p className="history-reason">
          <span className="visually-hidden">{t.entries.reason}: </span>«{change.reason}»
        </p>
      )}
      {change.action !== 'VOIDED' && (
        <span className="muted mono" style={{ fontSize: 12 }}>
          {t.entries.values(zonedTime(change.clockIn, timeZone), clockOut, change.breakMinutes)}
          {nextDay && <NextDay />}
        </span>
      )}
    </li>
  )
}
