// Cash: the end-of-day cash closing, made to be done on the phone after service, and the
// closings of a period, with the days that had activity and no closing. The day being closed
// lives in the URL (?date=), so the summary can link to a day.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Wallet } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { CashClosing } from '../../api/types'
import { CashClosingForm, CashDifference, ClosedClosing, ClosingStatusTag } from '../../components/CashClosing'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { suggestedServiceDay } from '../../lib/cash'
import { useDownload } from '../../lib/download'
import { useFmt, useT } from '../../lib/i18n'
import { useCashClosings, useExpenses, useInvalidate, useSummary } from '../../lib/queries'
import { addDays, presetPeriod, venueTimeZone, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default function CashPage() {
  const t = useT()
  const fmt = useFmt()
  const { venue } = useVenue()
  const timeZone = venueTimeZone(venue)
  const suggested = suggestedServiceDay(timeZone)
  const today = zonedToday(timeZone)
  const [search, setSearch] = useSearchParams()
  const asked = search.get('date')
  // A day from a link, never one that has not come yet; else the service being closed now
  const day = asked && ISO_DATE.test(asked) ? (asked > today ? today : asked) : suggested.day

  // A conflict reloads the closing and starts the form again from what is stored
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const invalidate = useInvalidate()

  const dayRange = { from: day, to: day }
  const dayClosing = useCashClosings(venue?.id, dayRange)
  const dayExpenses = useExpenses(venue?.id, dayRange)
  const closing = dayClosing.data?.[0] ?? null

  const goTo = (next: string) => {
    setNotice(null)
    setSearch({ date: next })
  }
  // Waits for the stored closing before the form starts again from it
  const reloaded = async (message: string | null) => {
    await invalidate.cash()
    setNotice(message)
    setReload((n) => n + 1)
  }

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <PageHead title={t.cash.title} sub={t.cash.sub} />

      <div className="cash-day">
        <Button variant="ghost" iconOnly icon={ChevronLeft} aria-label={t.cash.previousDay} onClick={() => goTo(addDays(day, -1))} />
        <input
          type="date"
          className="input mono"
          aria-label={t.cash.day}
          value={day}
          max={today}
          onChange={(e) => e.target.value && goTo(e.target.value)}
        />
        <Button
          variant="ghost"
          iconOnly
          icon={ChevronRight}
          aria-label={t.cash.nextDay}
          disabled={day >= today}
          onClick={() => goTo(addDays(day, 1))}
        />
        <span className="secondary">{fmt.relative(day, today)}</span>
      </div>
      {suggested.lateNight && day === suggested.day && !asked && <p className="muted cash-note">{t.cash.lateNight}</p>}

      <section className="card">
        <div className="card-head">
          <h2>{t.cash.closingOf(fmt.long(day))}</h2>
          {!dayClosing.isLoading && <ClosingStatusTag status={closing?.status ?? 'NEW'} />}
        </div>
        <div className="card-body">
          {notice && (
            <div className="notice info" role="status" style={{ marginBottom: 16 }}>
              <span>{notice}</span>
            </div>
          )}
          {!venue || dayClosing.isLoading || dayExpenses.isLoading || dayExpenses.isPlaceholderData ? (
            <Loading rows={4} />
          ) : dayClosing.error || dayExpenses.error ? (
            <ErrorNote error={dayClosing.error ?? dayExpenses.error} />
          ) : closing?.status === 'CLOSED' ? (
            <ClosedClosing key={`${closing.id}:${reload}`} closing={closing} timeZone={timeZone} onReopened={reloaded} />
          ) : (
            <CashClosingForm
              key={`${day}:${reload}`}
              venueId={venue.id}
              day={day}
              closing={closing}
              dayExpenses={dayExpenses.data ?? []}
              onConflict={reloaded}
            />
          )}
        </div>
      </section>
      <p className="muted cash-note">{t.cash.internal}</p>

      {venue && <ClosingList venueId={venue.id} today={today} selected={day} onOpen={goTo} />}
    </div>
  )
}

/** The period's closings, and the days that had activity but no closing, newest first */
function ClosingList({
  venueId,
  today,
  selected,
  onOpen,
}: {
  venueId: number
  today: string
  selected: string
  onOpen: (day: string) => void
}) {
  const t = useT()
  const fmt = useFmt()
  const { value, setValue, period } = usePeriod(presetPeriod('this-month', today), today)
  const closings = useCashClosings(venueId, period)
  // Only the summary knows which days had shifts or clock-ins and no closing. It is the Summary
  // page's own query (same key), so a period loaded there in the last 30 seconds is not asked again.
  const summary = useSummary(venueId, period)
  const file = useDownload()

  const rows: { date: string; closing: CashClosing | null }[] = [
    ...(closings.data ?? []).map((c) => ({ date: c.businessDate, closing: c })),
    ...(summary.data?.days ?? [])
      .filter((d) => d.closingStatus === 'MISSING' && !(closings.data ?? []).some((c) => c.businessDate === d.date))
      .map((d) => ({ date: d.date, closing: null })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const open = (date: string) => {
    onOpen(date)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t.cash.list}</h2>
        <Button
          size="sm"
          icon={Download}
          disabled={!period}
          loading={file.isPending}
          onClick={() =>
            period &&
            file.mutate({
              fetchFile: () => api.reports.cashClosingsCsv(venueId, period),
              fallbackName: t.cash.file(period.from, period.to),
            })
          }
        >
          {t.cash.export}
        </Button>
      </div>
      <div className="card-body cash-list-filters">
        <PeriodPicker value={value} onChange={setValue} on={today} />
        <ErrorNote error={file.error} />
      </div>
      {!period ? null : closings.isLoading ? (
        <div className="card-body">
          <Loading rows={3} />
        </div>
      ) : closings.error ? (
        <div className="card-body">
          <ErrorNote error={closings.error} />
        </div>
      ) : rows.length === 0 ? (
        <Empty icon={Wallet} title={t.cash.listEmpty} />
      ) : (
        <ul className="list cash-list">
          {rows.map(({ date, closing }) => (
            <li key={date} className={date === selected ? 'list-row cash-row selected' : 'list-row cash-row'}>
              <span className="entry-day">{fmt.day(date)}</span>
              <span className="cash-row-status">
                {closing ? <ClosingStatusTag status={closing.status} /> : <span className="tag warn">{t.closingStatus.MISSING}</span>}
              </span>
              <span className="mono cash-row-sales">
                {closing && (
                  <>
                    <span className="visually-hidden">{t.cash.columns.sales}: </span>
                    {fmt.money(closing.totalSales)}
                  </>
                )}
              </span>
              <span className="mono cash-row-difference">
                {closing && (
                  <>
                    <span className="visually-hidden">{t.cash.columns.difference}: </span>
                    {closing.difference === null ? (
                      <span className="muted">{t.cash.uncounted}</span>
                    ) : (
                      <CashDifference value={closing.difference} />
                    )}
                  </>
                )}
              </span>
              <Button size="sm" variant={closing ? 'ghost' : 'default'} aria-label={t.cash.open(fmt.long(date))} onClick={() => open(date)}>
                {closing ? t.cash.openShort : t.cash.makeClosing}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
