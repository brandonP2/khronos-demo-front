import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, LogOut } from 'lucide-react'
import type { TimeEntry } from '../api/types'
import { useT } from '../lib/i18n'
import { initials, useOpenEntries, type StaffMember } from '../lib/queries'
import { minutesLabel, minutesSince, zonedTime } from '../lib/time'
import { useNow } from '../lib/useNow'
import { ClockInForDialog, ClockOutForDialog, EntryFormDialog } from './EntryDialogs'
import { Avatar, Button, ErrorNote } from './ui'

type Modal =
  | { kind: 'in' }
  | { kind: 'out'; entry: TimeEntry; name: string }
  | { kind: 'correct'; entry: TimeEntry; name: string }
  | null

/**
 * Who is clocked in right now, since when, and quick actions for the owner: clock someone in,
 * or clock out someone who is in (or, past 24 hours, correct the entry with the real time).
 * Refreshed every minute and when the tab comes back into view.
 */
export function NowCard({ venueId, staff, timeZone }: { venueId: number; staff: StaffMember[]; timeZone: string }) {
  const t = useT()
  const titleId = useId()
  const now = useNow(30_000)
  const open = useOpenEntries(venueId)
  const [modal, setModal] = useState<Modal>(null)

  const entries = open.data ?? []
  const inIds = new Set(entries.map((e) => e.workerId))
  const canClockIn = staff.filter((s) => s.isActive && !inIds.has(s.userId))
  const nameOf = (e: TimeEntry) =>
    staff.find((s) => s.userId === e.workerId)?.name ?? ([e.workerFirstName, e.workerLastName].filter(Boolean).join(' ') || t.common.unknownPerson(e.workerId))

  return (
    <section className="card now-card" aria-labelledby={titleId}>
      <div className="card-head">
        <h2 id={titleId}>
          {t.now.title}
          <span className="muted mono now-count">{open.isLoading ? '…' : t.now.count(entries.length)}</span>
        </h2>
        <Button
          size="sm"
          icon={LogIn}
          disabled={open.isLoading || canClockIn.length === 0}
          title={canClockIn.length === 0 && !open.isLoading ? t.now.everyoneIn : undefined}
          onClick={() => setModal({ kind: 'in' })}
        >
          {t.now.clockIn}
        </Button>
      </div>
      {open.isLoading ? (
        <div className="now-list" aria-busy="true">
          <div className="skeleton" style={{ height: 40 }} />
        </div>
      ) : open.error ? (
        <div className="card-body">
          <ErrorNote error={open.error} />
        </div>
      ) : entries.length === 0 ? (
        <p className="now-empty muted">{t.now.nobody}</p>
      ) : (
        <ul className="now-list">
          {entries.map((e) => {
            const name = nameOf(e)
            return (
              <li key={e.id} className="now-item">
                <Avatar size="sm" initials={initials({ firstName: e.workerFirstName, lastName: e.workerLastName, username: name })} />
                <span className="grow">
                  <Link className="name person-link" to={`/team/${e.workerId}`}>
                    {name}
                  </Link>
                  <span className="sub">{t.now.since(zonedTime(e.clockIn, timeZone), minutesLabel(minutesSince(e.clockIn, now)))}</span>
                </span>
                {e.isStale && <span className="tag warn">{t.entries.stale}</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={LogOut}
                  className="btn-compact"
                  aria-label={t.now.clockOutFor(name)}
                  title={t.now.clockOutFor(name)}
                  onClick={() => setModal({ kind: 'out', entry: e, name })}
                >
                  <span className="btn-label">{t.now.clockOut}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {modal?.kind === 'in' && <ClockInForDialog people={canClockIn} timeZone={timeZone} onClose={() => setModal(null)} />}
      {modal?.kind === 'out' && (
        <ClockOutForDialog
          entry={modal.entry}
          name={modal.name}
          timeZone={timeZone}
          onClose={() => setModal(null)}
          onCorrect={() => setModal({ ...modal, kind: 'correct' })}
        />
      )}
      {modal?.kind === 'correct' && (
        <EntryFormDialog
          workerId={modal.entry.workerId}
          workerName={modal.name}
          timeZone={timeZone}
          entry={modal.entry}
          askClockOut
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}
