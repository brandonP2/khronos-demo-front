import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Download, History } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { TimeEntry, WorkerDay, Zone } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { DayStatusLabel, Difference, EntryTags, EntryTimes, HistoryDialog } from '../../components/TimeEntries'
import { Button, Empty, ErrorNote, Loading, NextDay, PageHead } from '../../components/ui'
import { useDownload } from '../../lib/download'
import { useFmt, useT } from '../../lib/i18n'
import { keys, useMyVenue, useWorkerDays } from '../../lib/queries'
import { endsNextDay, hhmm, minutesLabel, venueTimeZone, zonedTime, zonedToday } from '../../lib/time'

/**
 * A worker's own record: their clock-ins by period, planned against worked, the status of each
 * day and every correction made to an entry. Workers never see rates or costs.
 */
export default function MyHours() {
  const t = useT()
  const me = useMe()
  const { worker, venue } = useMyVenue(me.id)
  const venueId = worker.data?.establishmentId
  const loading = worker.isLoading || (!!venueId && venue.isLoading)
  const error = worker.error ?? venue.error

  // "This week" depends on the venue's time zone, so the period waits for the venue
  if (loading || error || !venueId) {
    return (
      <div className="page" style={{ maxWidth: 1040 }}>
        <PageHead title={t.myHours.title} sub={t.myHours.sub} />
        {error ? <ErrorNote error={error} /> : <Loading rows={4} />}
      </div>
    )
  }
  return <MyHoursBody venueId={venueId} timeZone={venueTimeZone(venue.data)} />
}

function MyHoursBody({ venueId, timeZone }: { venueId: number; timeZone: string }) {
  const t = useT()
  const fmt = useFmt()
  const me = useMe()
  const on = zonedToday(timeZone)
  const { value, setValue, period } = usePeriod(undefined, on)
  const report = useWorkerDays(me.id, period)
  const zones = useQuery({ queryKey: keys.zones(venueId), queryFn: () => api.zones.byEstablishment(venueId) })
  const download = useDownload()
  const [historyOf, setHistoryOf] = useState<TimeEntry | null>(null)

  const days = [...(report.data?.days ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const shiftsCount = days.reduce((n, d) => n + d.shifts.length, 0)
  const entriesCount = days.reduce((n, d) => n + d.entries.filter((e) => e.status !== 'VOIDED').length, 0)

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead title={t.myHours.title} sub={t.myHours.sub}>
        <Button
          icon={Download}
          disabled={!period}
          loading={download.isPending}
          onClick={() =>
            period &&
            download.mutate({
              fetchFile: () => api.reports.workerTimeEntriesCsv(me.id, period),
              fallbackName: t.myHours.fileName(period.from, period.to),
            })
          }
        >
          {t.myHours.download}
        </Button>
      </PageHead>

      <PeriodPicker value={value} onChange={setValue} on={on} />
      <ErrorNote error={download.error} />

      {!period ? null : report.isLoading ? (
        <Loading rows={4} />
      ) : report.error ? (
        <ErrorNote error={report.error} />
      ) : days.length === 0 ? (
        <div className="card">
          <Empty icon={Clock} title={t.myHours.empty}>
            {t.myHours.emptyBody}
          </Empty>
        </div>
      ) : (
        <>
          <div className="stats stats-3" aria-busy={report.isPlaceholderData || undefined}>
            <div className="card stat">
              <span className="label">{t.myHours.planned}</span>
              <span className="figure">{fmt.hours(report.data?.plannedMinutes ?? 0)}</span>
              <span className="meta">{t.myHours.shiftsCount(shiftsCount)}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.myHours.worked}</span>
              <span className="figure">{fmt.hours(report.data?.workedMinutes ?? 0)}</span>
              <span className="meta">{t.myHours.entriesCount(entriesCount)}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.myHours.difference}</span>
              <span className="figure">
                <Difference minutes={report.data?.differenceMinutes ?? 0} />
              </span>
              <span className="meta">{t.myHours.differenceMeta}</span>
            </div>
          </div>

          <div className="agenda">
            {days.map((day) => (
              <div key={day.date} className="agenda-day">
                <div className="agenda-date">
                  <div className="d">{fmt.agenda(day.date, on).title}</div>
                  <div className="w">{fmt.agenda(day.date, on).sub}</div>
                </div>
                <div className="agenda-items">
                  <DayCard day={day} zones={zones.data ?? []} timeZone={timeZone} onHistory={setHistoryOf} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {historyOf && <HistoryDialog entry={historyOf} timeZone={timeZone} onClose={() => setHistoryOf(null)} />}
    </div>
  )
}

function DayCard({
  day,
  zones,
  timeZone,
  onHistory,
}: {
  day: WorkerDay
  zones: Zone[]
  timeZone: string
  onHistory: (entry: TimeEntry) => void
}) {
  const t = useT()
  const zoneName = (id: number) => zones.find((z) => z.id === id)?.name ?? ''
  return (
    <div className="card day-card">
      <div className="day-card-head">
        <DayStatusLabel status={day.status} />
        <span className="muted mono" style={{ fontSize: 12 }}>
          {t.myHours.dayLine(minutesLabel(day.plannedMinutes), minutesLabel(day.workedMinutes))}
        </span>
      </div>
      {day.shifts.map((s) => (
        <div key={`shift-${s.id}`} className="day-line secondary">
          <span>
            {t.entries.shift(`${hhmm(s.startTime)}–${hhmm(s.endTime)}`, zoneName(s.zoneId))}
            {endsNextDay(s.startTime, s.endTime) && <NextDay />}
          </span>
        </div>
      ))}
      {day.entries.map((e) => (
        <div key={`entry-${e.id}`} className={e.status === 'VOIDED' ? 'day-line entry voided' : 'day-line entry'}>
          <EntryTimes entry={e} timeZone={timeZone} />
          {e.breakMinutes > 0 && <span className="muted">{t.entries.breakShort(e.breakMinutes)}</span>}
          {e.workedMinutes !== null && <span className="mono">{minutesLabel(e.workedMinutes)}</span>}
          <EntryTags entry={e} />
          <Button
            size="sm"
            variant="ghost"
            icon={History}
            className="btn-compact day-line-action"
            aria-label={`${t.entries.history}: ${zonedTime(e.clockIn, timeZone)}`}
            title={t.entries.history}
            onClick={() => onHistory(e)}
          >
            <span className="btn-label">{t.entries.history}</span>
          </Button>
        </div>
      ))}
    </div>
  )
}
