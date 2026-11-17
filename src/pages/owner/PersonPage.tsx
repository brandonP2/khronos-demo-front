import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, Clock, History, Pencil, Plus, UserX } from 'lucide-react'
import type { TimeEntry } from '../../api/types'
import { EntryFormDialog, VoidEntryDialog } from '../../components/EntryDialogs'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { RatesCard } from '../../components/RatesCard'
import { DayStatusLabel, Difference, EntryTags, EntryTimes, HistoryDialog } from '../../components/TimeEntries'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useFmt, useT } from '../../lib/i18n'
import { useStaff, useWorkerDays, useWorkerEntries } from '../../lib/queries'
import { minutesLabel, venueTimeZone, zonedTime, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal =
  | { kind: 'add' }
  | { kind: 'correct'; entry: TimeEntry }
  | { kind: 'void'; entry: TimeEntry }
  | { kind: 'history'; entry: TimeEntry }
  | null

/**
 * One person's work: their details and hourly rate, planned against worked for a period, day
 * by day, and every time entry with what the owner can do about it (add a day, correct, void,
 * see the history). Opened from Team and from Hours, which passes its period in the URL.
 */
export default function PersonPage() {
  const t = useT()
  const fmt = useFmt()
  const params = useParams()
  const [search] = useSearchParams()
  const workerId = Number(params.workerId)
  const { venue } = useVenue()
  const timeZone = venueTimeZone(venue)
  const on = zonedToday(timeZone)
  const staff = useStaff(venue?.id)
  const member = staff.data?.find((s) => s.userId === workerId) ?? null
  const { value, setValue, period } = usePeriod({ from: search.get('from'), to: search.get('to') }, on)
  const days = useWorkerDays(workerId, member ? period : null)
  const entries = useWorkerEntries(workerId, { ...(period ?? {}), includeVoided: true }, !!member && !!period)
  const [modal, setModal] = useState<Modal>(null)

  const back = (
    <Link to="/team" className="back-link">
      <ArrowLeft size={14} strokeWidth={1.5} />
      {t.person.back}
    </Link>
  )

  if (staff.isLoading || staff.error || !member) {
    return (
      <div className="page" style={{ maxWidth: 1040 }}>
        {back}
        {staff.isLoading ? (
          <Loading rows={4} />
        ) : staff.error ? (
          <ErrorNote error={staff.error} />
        ) : (
          <div className="card">
            <Empty icon={UserX} title={t.person.notFound}>
              {t.person.notFoundBody}
            </Empty>
          </div>
        )}
      </div>
    )
  }

  const report = days.data
  const dayList = [...(report?.days ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const entryList = entries.data ?? []
  const label = (action: string, e: TimeEntry) =>
    t.person.entryLabel(action, fmt.day(e.businessDate), zonedTime(e.clockIn, timeZone))

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      {back}
      <PageHead
        title={member.name}
        sub={
          <span className="person-sub">
            <span className="status">
              <span className={member.isActive ? 'dot on' : 'dot'} />
              {member.isActive ? t.team.active : t.team.inactive}
            </span>
            <span className="mono">{member.user.username}</span>
            <span>{member.user.email}</span>
            {member.user.phoneNumber && <span className="mono">{member.user.phoneNumber}</span>}
          </span>
        }
      >
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
          {t.person.addEntry}
        </Button>
      </PageHead>

      <RatesCard workerId={workerId} today={on} />

      <PeriodPicker value={value} onChange={setValue} on={on} />

      {!period ? null : days.isLoading ? (
        <Loading rows={3} />
      ) : days.error ? (
        <ErrorNote error={days.error} />
      ) : (
        report && (
          <div className="stats" aria-busy={days.isPlaceholderData || undefined}>
            <div className="card stat">
              <span className="label">{t.hours.planned}</span>
              <span className="figure">{fmt.hours(report.plannedMinutes)}</span>
              <span className="meta">{t.hours.plannedMeta(dayList.reduce((n, d) => n + d.shifts.length, 0))}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.worked}</span>
              <span className="figure">{fmt.hours(report.workedMinutes)}</span>
              <span className="meta">
                {t.hours.workedMeta(dayList.reduce((n, d) => n + d.entries.filter((e) => e.status !== 'VOIDED').length, 0))}
              </span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.difference}</span>
              <span className="figure">
                <Difference minutes={report.differenceMinutes} />
              </span>
              <span className="meta">{t.hours.differenceMeta}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.cost}</span>
              <span className="figure">{report.actualCost === null ? '—' : fmt.money(report.actualCost)}</span>
              <span className="meta">{t.hours.costMeta(report.plannedCost === null ? null : fmt.money(report.plannedCost))}</span>
            </div>
          </div>
        )
      )}

      {period && report && (
        <section className="card" style={{ overflowX: 'auto' }}>
          <div className="card-head">
            <h2>{t.person.days}</h2>
            <span className="muted mono" style={{ fontSize: 12 }}>
              {dayList.length}
            </span>
          </div>
          {dayList.length === 0 ? (
            <Empty icon={Clock} title={t.person.noDays} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t.person.dayColumns.date}</th>
                  <th className="right">{t.person.dayColumns.planned}</th>
                  <th className="right">{t.person.dayColumns.worked}</th>
                  <th className="right hide-xs">{t.person.dayColumns.difference}</th>
                  <th>{t.person.dayColumns.status}</th>
                </tr>
              </thead>
              <tbody>
                {dayList.map((d) => (
                  <tr key={d.date}>
                    <td>{fmt.day(d.date)}</td>
                    <td className="right mono">{minutesLabel(d.plannedMinutes)}</td>
                    <td className="right mono">{minutesLabel(d.workedMinutes)}</td>
                    <td className="right mono hide-xs">
                      <Difference minutes={d.workedMinutes - d.plannedMinutes} />
                    </td>
                    <td>
                      <DayStatusLabel status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {period && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t.person.entries}</h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                {t.person.entriesHint}
              </p>
            </div>
            <Button size="sm" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
              {t.person.addEntry}
            </Button>
          </div>
          {entries.isLoading ? (
            <div className="card-body">
              <Loading rows={2} />
            </div>
          ) : entries.error ? (
            <div className="card-body">
              <ErrorNote error={entries.error} />
            </div>
          ) : entryList.length === 0 ? (
            <Empty icon={Clock} title={t.person.noEntries} />
          ) : (
            <div className="list">
              {entryList.map((e) => (
                <div key={e.id} className={e.status === 'VOIDED' ? 'list-row entry-row voided' : 'list-row entry-row'}>
                  <div className="entry-main">
                    <div className="entry-line">
                      <span className="entry-day">{fmt.day(e.businessDate)}</span>
                      <EntryTimes entry={e} timeZone={timeZone} />
                      {e.workedMinutes !== null && <span className="mono">{minutesLabel(e.workedMinutes)}</span>}
                      {e.breakMinutes > 0 && <span className="muted">{t.entries.breakShort(e.breakMinutes)}</span>}
                    </div>
                    <div className="entry-meta">
                      <span className="muted">{t.entries.source[e.source]}</span>
                      <EntryTags entry={e} />
                      {e.note && <span className="muted">· {e.note}</span>}
                    </div>
                  </div>
                  <div className="actions entry-actions">
                    {e.status !== 'VOIDED' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          className="btn-compact"
                          aria-label={label(t.person.correct, e)}
                          title={t.person.correct}
                          onClick={() => setModal({ kind: 'correct', entry: e })}
                        >
                          <span className="btn-label">{t.person.correct}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Ban}
                          className="btn-compact"
                          aria-label={label(t.person.void, e)}
                          title={t.person.void}
                          onClick={() => setModal({ kind: 'void', entry: e })}
                        >
                          <span className="btn-label">{t.person.void}</span>
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={History}
                      className="btn-compact"
                      aria-label={label(t.entries.history, e)}
                      title={t.entries.history}
                      onClick={() => setModal({ kind: 'history', entry: e })}
                    >
                      <span className="btn-label">{t.entries.history}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {modal?.kind === 'add' && (
        <EntryFormDialog workerId={workerId} workerName={member.name} timeZone={timeZone} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'correct' && (
        <EntryFormDialog
          workerId={workerId}
          workerName={member.name}
          timeZone={timeZone}
          entry={modal.entry}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'void' && <VoidEntryDialog entry={modal.entry} workerName={member.name} onClose={() => setModal(null)} />}
      {modal?.kind === 'history' && <HistoryDialog entry={modal.entry} timeZone={timeZone} onClose={() => setModal(null)} />}
    </div>
  )
}
