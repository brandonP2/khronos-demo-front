import { Clock, Download, FileText } from 'lucide-react'
import { api } from '../../api/endpoints'
import { HoursTable } from '../../components/HoursTable'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { Difference } from '../../components/TimeEntries'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useDownload } from '../../lib/download'
import { useFmt, useT } from '../../lib/i18n'
import { useHoursReport } from '../../lib/queries'
import { venueTimeZone, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

/**
 * The owner's view of the work done: for a period, planned against worked hours, punctuality
 * and staff cost per person, with both CSV exports. Each name opens that person's page.
 */
export default function HoursPage() {
  const t = useT()
  const fmt = useFmt()
  const { venue } = useVenue()
  const on = zonedToday(venueTimeZone(venue))
  const { value, setValue, period } = usePeriod(undefined, on)
  const report = useHoursReport(venue?.id, period)
  const hoursFile = useDownload()
  const recordFile = useDownload()

  const data = report.data
  const workers = data?.workers ?? []
  const nothing = workers.every((w) => w.shiftsCount === 0 && w.entriesCount === 0)
  const shifts = workers.reduce((n, w) => n + w.shiftsCount, 0)
  const entries = workers.reduce((n, w) => n + w.entriesCount, 0)
  const withoutRate = workers.filter((w) => w.currentHourlyRate === null && (w.shiftsCount > 0 || w.entriesCount > 0)).length
  const personHref = (workerId: number) => (period ? `/team/${workerId}?from=${period.from}&to=${period.to}` : `/team/${workerId}`)

  return (
    <div className="page">
      <PageHead title={t.hours.title} sub={t.hours.sub}>
        <Button
          icon={Download}
          disabled={!period || !venue}
          loading={hoursFile.isPending}
          onClick={() =>
            period &&
            venue &&
            hoursFile.mutate({
              fetchFile: () => api.reports.hoursCsv(venue.id, period),
              fallbackName: t.hours.hoursFile(period.from, period.to),
            })
          }
        >
          {t.hours.exportHours}
        </Button>
        <Button
          icon={FileText}
          disabled={!period || !venue}
          loading={recordFile.isPending}
          title={t.hours.recordNote}
          onClick={() =>
            period &&
            venue &&
            recordFile.mutate({
              fetchFile: () => api.reports.timeEntriesCsv(venue.id, period),
              fallbackName: t.hours.recordFile(period.from, period.to),
            })
          }
        >
          {t.hours.exportRecord}
        </Button>
      </PageHead>

      <PeriodPicker value={value} onChange={setValue} on={on} />
      <ErrorNote error={hoursFile.error ?? recordFile.error} />

      {!period ? null : report.isLoading ? (
        <Loading rows={5} />
      ) : report.error ? (
        <ErrorNote error={report.error} />
      ) : !data || nothing ? (
        <div className="card">
          <Empty icon={Clock} title={t.hours.empty}>
            {t.hours.emptyBody}
          </Empty>
        </div>
      ) : (
        <>
          <div className="stats" aria-busy={report.isPlaceholderData || undefined}>
            <div className="card stat">
              <span className="label">{t.hours.planned}</span>
              <span className="figure">{fmt.hours(data.totals.plannedMinutes)}</span>
              <span className="meta">{t.hours.plannedMeta(shifts)}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.worked}</span>
              <span className="figure">{fmt.hours(data.totals.workedMinutes)}</span>
              <span className="meta">{t.hours.workedMeta(entries)}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.difference}</span>
              <span className="figure">
                <Difference minutes={data.totals.differenceMinutes} />
              </span>
              <span className="meta">{t.hours.differenceMeta}</span>
            </div>
            <div className="card stat">
              <span className="label">{t.hours.cost}</span>
              <span className="figure">{data.totals.actualCost === null ? '—' : fmt.money(data.totals.actualCost)}</span>
              <span className="meta">
                {t.hours.costMeta(data.totals.plannedCost === null ? null : fmt.money(data.totals.plannedCost))}
              </span>
            </div>
          </div>

          {withoutRate > 0 && <div className="notice info">{t.hours.withoutRate(withoutRate)}</div>}

          <div className="card hours-card">
            <HoursTable report={data} personHref={personHref} />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t.hours.recordNote}
          </p>
        </>
      )}
    </div>
  )
}
