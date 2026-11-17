// The summary's daily chart, drawn with plain elements: per day, sales next to the total cost
// (expenses plus staff), on one axis in euros. Keyboard and screen readers get every value:
// the days are one tab stop walked with the arrow keys, with a readout line, and a table
// with the same numbers sits behind the chart for screen readers.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SummaryDay } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { barPercent, chartScale, dayCost, isEmptyDay } from '../lib/summary'
import { parseISODate } from '../lib/time'

/** The last day up to today with something in it, else the last day up to today */
function defaultDay(days: SummaryDay[], today: string): number {
  let lastPast = -1
  while (lastPast + 1 < days.length && days[lastPast + 1].date <= today) lastPast++
  for (let i = lastPast; i >= 0; i--) if (!isEmptyDay(days[i])) return i
  return lastPast >= 0 ? lastPast : Math.max(0, days.length - 1)
}

export function SummaryChart({ days, today }: { days: SummaryDay[]; /** The venue's today */ today: string }) {
  const t = useT()
  const fmt = useFmt()
  const titleId = useId()
  const { max, ticks } = useMemo(() => chartScale(days), [days])
  const [active, setActive] = useState(() => defaultDay(days, today))
  const scroller = useRef<HTMLDivElement>(null)
  const columns = useRef<(HTMLButtonElement | null)[]>([])
  const current = days[Math.min(active, days.length - 1)]
  const size = days.length <= 14 ? 'wide' : days.length <= 31 ? 'mid' : 'dense'

  // Long periods scroll sideways: start at the most recent days
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days.length])

  const money = (n: number) => fmt.money(n)
  const labor = (d: SummaryDay) => (d.laborCost === null ? t.chart.noRate : money(d.laborCost))
  const label = (d: SummaryDay) =>
    isEmptyDay(d) ? t.chart.emptyDay(fmt.long(d.date)) : t.chart.day(fmt.long(d.date), money(d.sales), money(dayCost(d)))

  const move = (to: number) => {
    const next = Math.max(0, Math.min(days.length - 1, to))
    setActive(next)
    columns.current[next]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    if (step) move(active + step)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(days.length - 1)
    else return
    e.preventDefault()
  }

  const xLabel = (d: SummaryDay, i: number) => {
    if (size === 'wide') return [fmt.weekday(d.date), fmt.dayNumber(d.date)]
    if (size === 'mid') return [fmt.dayNumber(d.date)]
    // Long periods only mark the Mondays, and the first day
    return i === 0 || parseISODate(d.date).getDay() === 1 ? [fmt.short(d.date)] : []
  }

  if (!current) return null

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption className="chart-head">
        <h2 id={titleId}>{t.chart.title}</h2>
        <ul className="chart-legend" aria-hidden>
          <li>
            <span className="swatch sales" />
            {t.chart.sales}
          </li>
          <li>
            <span className="swatch cost" />
            {t.chart.cost} <span className="muted">({t.chart.costHint})</span>
          </li>
        </ul>
      </figcaption>

      <div className="chart-frame">
        <div className="chart-axis" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${barPercent(tick, max)}%` }}>
              {fmt.moneyShort(tick)}
            </span>
          ))}
        </div>
        <div className="chart-scroll" ref={scroller}>
          <div className={`chart-plot ${size}`} role="group" aria-label={t.chart.group} onKeyDown={onKeyDown} style={{ minWidth: `calc(${days.length} * var(--chart-col))` }}>
            <div className="chart-grid" aria-hidden>
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${barPercent(tick, max)}%` }} />
              ))}
            </div>
            {days.map((d, i) => (
              <button
                key={d.date}
                ref={(el) => {
                  columns.current[i] = el
                }}
                type="button"
                className={isEmptyDay(d) ? 'chart-day empty' : 'chart-day'}
                data-active={i === active || undefined}
                tabIndex={i === active ? 0 : -1}
                aria-label={label(d)}
                title={label(d)}
                onFocus={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <span className="chart-bars" aria-hidden>
                  <span className="chart-bar sales" style={{ height: `${barPercent(d.sales, max)}%` }} />
                  <span className="chart-bar cost" style={{ height: `${barPercent(dayCost(d), max)}%` }} />
                </span>
                <span className="chart-x" aria-hidden>
                  {xLabel(d, i).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="chart-readout" aria-live="polite">
        <span className="chart-readout-day">{fmt.long(current.date)}</span>{' '}
        <span className="mono">
          {isEmptyDay(current)
            ? t.chart.noData
            : t.chart.readout(money(current.sales), money(current.expenses), labor(current), money(current.margin))}
        </span>
      </p>

      <table className="visually-hidden">
        <caption>{t.chart.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.chart.columns.date}</th>
            <th scope="col">{t.chart.columns.sales}</th>
            <th scope="col">{t.chart.columns.expenses}</th>
            <th scope="col">{t.chart.columns.labor}</th>
            <th scope="col">{t.chart.columns.cost}</th>
            <th scope="col">{t.chart.columns.margin}</th>
            <th scope="col">{t.chart.columns.closing}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{fmt.long(d.date)}</th>
              <td>{money(d.sales)}</td>
              <td>{money(d.expenses)}</td>
              <td>{labor(d)}</td>
              <td>{money(dayCost(d))}</td>
              <td>{money(d.margin)}</td>
              <td>{t.closingStatus[d.closingStatus]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
