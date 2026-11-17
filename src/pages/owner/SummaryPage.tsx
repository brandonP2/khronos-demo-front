// The owner's home: how the business is doing for a period, at a glance. Sales, expenses, staff
// cost, margin and staff cost over sales against the period before; a chart by day; expenses by
// category; what needs doing (days with no cash closing, drafts, the cash difference, products
// low on stock); and who is clocked in now.
import { Link } from 'react-router-dom'
import { Coins, Download, FileClock, Package, ReceiptText, TriangleAlert, Wallet } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { BusinessSummary, ClosingDayStatus } from '../../api/types'
import { CashDifference } from '../../components/CashClosing'
import { NowCard } from '../../components/NowCard'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { SummaryChart } from '../../components/SummaryChart'
import { CategoryBars, TrendLine } from '../../components/SummaryParts'
import { Button, Empty, ErrorNote, Loading, PageHead } from '../../components/ui'
import { useDownload } from '../../lib/download'
import { useFmt, useT } from '../../lib/i18n'
import { toCents } from '../../lib/money'
import { useProducts, useStaff, useSummary } from '../../lib/queries'
import { isEmptyPrevious, percentOf, trend } from '../../lib/summary'
import { venueTimeZone, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

/** How many days are linked one by one before "and N more" */
const DAYS_LISTED = 6

export default function SummaryPage() {
  const t = useT()
  const { venue } = useVenue()
  const timeZone = venueTimeZone(venue)
  const on = zonedToday(timeZone)
  const { value, setValue, period } = usePeriod(undefined, on)
  const summary = useSummary(venue?.id, period)
  const staff = useStaff(venue?.id)
  // The same list as the inventory's stock, so a visit there and back asks for nothing new
  const products = useProducts(venue?.id)
  const lowStock = (products.data ?? []).filter((p) => p.isActive && p.isLowStock).length
  const file = useDownload()

  return (
    <div className="page">
      <PageHead title={t.summary.title} sub={t.summary.sub}>
        <Button
          icon={Download}
          disabled={!period || !venue}
          loading={file.isPending}
          onClick={() =>
            period &&
            venue &&
            file.mutate({
              fetchFile: () => api.reports.summaryCsv(venue.id, period),
              fallbackName: t.summary.file(period.from, period.to),
            })
          }
        >
          {t.summary.export}
        </Button>
      </PageHead>

      <PeriodPicker value={value} onChange={setValue} on={on} />
      <ErrorNote error={file.error} />

      {!period ? null : summary.isLoading ? (
        <Loading rows={5} />
      ) : summary.error ? (
        <div className="form">
          <ErrorNote error={summary.error} />
          <div>
            <Button onClick={() => void summary.refetch()}>{t.common.retry}</Button>
          </div>
        </div>
      ) : (
        summary.data && <SummaryBody data={summary.data} refreshing={summary.isPlaceholderData} today={on} lowStock={lowStock} />
      )}

      {venue && <NowCard venueId={venue.id} staff={staff.data ?? []} timeZone={timeZone} />}
    </div>
  )
}

function SummaryBody({
  data,
  refreshing,
  today,
  lowStock,
}: {
  data: BusinessSummary
  refreshing: boolean
  today: string
  lowStock: number
}) {
  const t = useT()
  const fmt = useFmt()
  const { totals, previous } = data
  const closings = totals.closedDays + totals.draftDays
  // Staff cost from the payroll expenses (no rates at all), or from the hours leaving someone out
  const byPayroll = totals.laborCostSource === 'PAYROLL_EXPENSES'
  const partial = !byPayroll && totals.laborCost !== null && totals.laborCostPartial
  const empty = closings === 0 && totals.sales === 0 && totals.expenses === 0
  // A period before with nothing in it is not compared with
  const before = <T,>(value: T): T | null => (isEmptyPrevious(previous) ? null : value)
  const previousPercent = percentOf(previous.laborCost, previous.sales)
  const signedPoints = (delta: number) => t.trend.points(`${delta > 0 ? '+' : '−'}${fmt.points(Math.abs(delta))}`)

  return (
    <>
      <p className="muted compare-note">{t.summary.comparedWith(fmt.range(previous.from, previous.to))}</p>

      {empty ? (
        <div className="card">
          <Empty
            icon={Wallet}
            title={t.summary.emptyTitle}
            action={
              <div className="actions">
                <Link to="/cash" className="btn btn-primary">
                  {t.summary.firstClosing}
                </Link>
                <Link to="/expenses?new=1" className="btn">
                  {t.summary.addExpense}
                </Link>
              </div>
            }
          >
            {t.summary.emptyBody}
          </Empty>
        </div>
      ) : (
        <div className="stats stats-5" aria-busy={refreshing || undefined}>
          <div className="card stat">
            <span className="label">{t.summary.sales}</span>
            <span className="figure">{fmt.money(totals.sales)}</span>
            <TrendLine trend={trend(totals.sales, before(previous.sales))} upIsGood format={fmt.signedMoney} />
            <span className="meta">{t.summary.salesMeta(closings)}</span>
          </div>
          <div className="card stat">
            <span className="label">{t.summary.expenses}</span>
            <span className="figure">{fmt.money(totals.expenses)}</span>
            <TrendLine trend={trend(totals.expenses, before(previous.expenses))} upIsGood={false} format={fmt.signedMoney} />
          </div>
          <div className="card stat">
            <span className="label">{t.summary.laborCost}</span>
            {byPayroll ? (
              // No one's cost from the hours is known: the margin took off the payroll expenses instead
              <>
                <span className="figure">{fmt.money(totals.payrollExpenses)}</span>
                <Link className="meta" to="/team">
                  {t.summary.laborFromPayroll}
                </Link>
              </>
            ) : totals.laborCost === null ? (
              <>
                <span className="figure">—</span>
                <Link className="meta" to="/team">
                  {t.summary.noRates}
                </Link>
              </>
            ) : (
              <>
                <span className="figure">
                  {fmt.money(totals.laborCost)}
                  {partial && <span className="tag warn figure-tag">{t.summary.partial}</span>}
                </span>
                {partial ? (
                  // Not the whole cost, so it is not compared with the period before either
                  <Link className="meta warn" to="/team">
                    {t.summary.laborPartial(totals.workersWithoutCost)}
                  </Link>
                ) : (
                  <TrendLine trend={trend(totals.laborCost, before(previous.laborCost))} upIsGood={false} format={fmt.signedMoney} />
                )}
              </>
            )}
          </div>
          <div className="card stat">
            <span className="label">{t.summary.margin}</span>
            <span className={totals.grossMargin < 0 ? 'figure negative' : 'figure'}>{fmt.money(totals.grossMargin)}</span>
            <TrendLine trend={trend(totals.grossMargin, before(previous.grossMargin))} upIsGood format={fmt.signedMoney} />
            {partial && <span className="meta">{t.summary.marginPartial}</span>}
            <span className="meta stat-help">{byPayroll ? t.summary.marginHelpPayroll : t.summary.marginHelp}</span>
          </div>
          <div className="card stat">
            <span className="label">{t.summary.laborPercent}</span>
            <span className="figure">{totals.laborCostPercent === null ? '—' : fmt.percent(totals.laborCostPercent)}</span>
            {totals.laborCostPercent === null ? (
              totals.sales === 0 ? (
                <span className="meta">{t.summary.noSales}</span>
              ) : (
                <Link className="meta" to="/team">
                  {t.summary.noRates}
                </Link>
              )
            ) : partial ? (
              <span className="meta">{t.summary.percentPartial}</span>
            ) : (
              <TrendLine
                trend={trend(totals.laborCostPercent, before(previousPercent))}
                upIsGood={false}
                format={signedPoints}
                showPercent={false}
              />
            )}
          </div>
        </div>
      )}

      <Alerts data={data} lowStock={lowStock} />

      {!empty && (
        <>
          <section className="card chart-card" aria-busy={refreshing || undefined}>
            <SummaryChart key={`${data.from}_${data.to}`} days={data.days} today={today} laborCostSource={totals.laborCostSource} />
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{t.summary.byCategory}</h2>
              <span className="muted mono" style={{ fontSize: 12 }}>
                {fmt.money(totals.expenses)}
              </span>
            </div>
            {data.expensesByCategory.length === 0 ? (
              <Empty icon={ReceiptText} title={t.summary.noExpenses} />
            ) : (
              <div className="card-body">
                <CategoryBars items={data.expensesByCategory} total={totals.expenses} />
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}

/** What needs doing: days with no cash closing, drafts left open, the cash difference and low stock */
function Alerts({ data, lowStock }: { data: BusinessSummary; lowStock: number }) {
  const t = useT()
  const fmt = useFmt()
  const { totals } = data
  const datesWith = (status: ClosingDayStatus) =>
    data.days
      .filter((d) => d.closingStatus === status)
      .map((d) => d.date)
      .reverse()
  const missing = datesWith('MISSING')
  const drafts = datesWith('DRAFT')
  // Closed days only; the drafts' difference can still change, so it is shown apart
  const difference = toCents(totals.cashDifference)
  const draftDifference = toCents(totals.draftCashDifference)

  const dayLinks = (dates: string[], label: (day: string) => string) => (
    <div className="chips">
      {dates.slice(0, DAYS_LISTED).map((d) => (
        <Link key={d} to={`/cash?date=${d}`} className="chip" aria-label={label(fmt.longInSentence(d))}>
          {fmt.day(d)}
        </Link>
      ))}
      {dates.length > DAYS_LISTED && <span className="muted">{t.summary.more(dates.length - DAYS_LISTED)}</span>}
    </div>
  )

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t.summary.alerts}</h2>
      </div>
      <ul className="alert-list">
        {totals.missingClosingDays > 0 && (
          <li className="alert-item">
            <TriangleAlert size={16} strokeWidth={1.5} className="alert-icon warn" aria-hidden />
            <div className="grow">
              <span className="alert-title">{t.summary.missingDays(totals.missingClosingDays)}</span>
              {dayLinks(missing, t.summary.closeDay)}
            </div>
          </li>
        )}
        {totals.draftDays > 0 && (
          <li className="alert-item">
            <FileClock size={16} strokeWidth={1.5} className="alert-icon" aria-hidden />
            <div className="grow">
              <span className="alert-title">{t.summary.draftDays(totals.draftDays)}</span>
              {dayLinks(drafts, t.summary.reviewDay)}
            </div>
          </li>
        )}
        {difference !== 0 && (
          <li className="alert-item">
            <Coins size={16} strokeWidth={1.5} className="alert-icon" aria-hidden />
            <div className="grow">
              <span className="alert-title">
                {t.summary.cashDifference}: <CashDifference value={totals.cashDifference} wordsShown />
              </span>
            </div>
            <Link to="/cash" className="btn btn-sm btn-ghost">
              {t.summary.seeClosings}
            </Link>
          </li>
        )}
        {draftDifference !== 0 && (
          <li className="alert-item">
            <Coins size={16} strokeWidth={1.5} className="alert-icon" aria-hidden />
            <div className="grow">
              <span className="alert-title">
                {t.summary.draftCashDifference}: <CashDifference value={totals.draftCashDifference} wordsShown />{' '}
                <span className="tag">{t.summary.provisional}</span>
              </span>
              <span className="alert-note">{t.summary.draftCashDifferenceHint}</span>
            </div>
          </li>
        )}
        {lowStock > 0 && (
          <li className="alert-item">
            <Package size={16} strokeWidth={1.5} className="alert-icon warn" aria-hidden />
            <div className="grow">
              <span className="alert-title">{t.summary.lowStock(lowStock)}</span>
            </div>
            <Link to="/inventory?low=1" className="btn btn-sm btn-ghost">
              {t.summary.seeLowStock}
            </Link>
          </li>
        )}
        {totals.missingClosingDays === 0 && totals.draftDays === 0 && difference === 0 && lowStock === 0 && (
          <li className="alert-item muted">{t.summary.allClear}</li>
        )}
      </ul>
    </section>
  )
}
