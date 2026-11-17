import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronsUpDown } from 'lucide-react'
import type { HoursReport, HoursReportRow } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { defaultDirection, HOURS_SORT_KEYS, rowName, sortHoursRows, type HoursSort, type HoursSortKey } from '../lib/hours'
import { initials } from '../lib/queries'
import { minutesLabel } from '../lib/time'
import { Cost, Difference } from './TimeEntries'
import { Avatar, Button } from './ui'

/** Planned against worked on one scale for the whole table, with the plan as a thin accent line */
function HoursBar({ planned, worked, max }: { planned: number; worked: number; max: number }) {
  const t = useT()
  return (
    <div className="hours-bar" role="img" aria-label={t.hours.bar(minutesLabel(worked), minutesLabel(planned))}>
      <span className="hours-bar-fill" style={{ width: `${(worked / max) * 100}%` }} />
      {planned > 0 && <span className="hours-bar-plan" style={{ left: `${(planned / max) * 100}%` }} />}
    </div>
  )
}

/** A count that only stands out when it is not zero */
function Count({ value, tone }: { value: number; tone?: 'warn' | 'bad' }) {
  return <span className={value === 0 ? 'muted' : tone === 'bad' ? 'count-bad' : tone === 'warn' ? 'count-warn' : ''}>{value}</span>
}

/**
 * One row per person: planned, worked, the difference, punctuality, rate and cost. Every
 * column sorts; on phones the rows turn into cards and a picker does the sorting.
 */
export function HoursTable({ report, personHref }: { report: HoursReport; personHref: (workerId: number) => string }) {
  const t = useT()
  const fmt = useFmt()
  const sortId = useId()
  const [sort, setSort] = useState<HoursSort>({ key: 'name', direction: 'asc' })
  const rows = useMemo(() => sortHoursRows(report.workers, sort, fmt.locale), [report.workers, sort, fmt.locale])
  const max = Math.max(1, ...report.workers.flatMap((r) => [r.plannedMinutes, r.workedMinutes]))
  const sum = (pick: (r: HoursReportRow) => number) => report.workers.reduce((n, r) => n + pick(r), 0)
  const label = t.hours.columns

  const toggle = (key: HoursSortKey) =>
    setSort((s) =>
      s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: defaultDirection(key) },
    )

  const header = (key: HoursSortKey, className = '') => {
    const active = sort.key === key
    const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
    return (
      <th className={className} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button className={active ? 'sort-button active' : 'sort-button'} onClick={() => toggle(key)}>
          {label[key]}
          <Icon size={12} strokeWidth={1.5} aria-hidden />
        </button>
      </th>
    )
  }

  return (
    <>
      <div className="hours-sort">
        <label className="label" htmlFor={sortId}>
          {t.hours.sortBy}
        </label>
        <select
          id={sortId}
          className="select"
          value={sort.key}
          onChange={(e) => {
            const key = e.target.value as HoursSortKey
            setSort({ key, direction: defaultDirection(key) })
          }}
        >
          {HOURS_SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {label[key]}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          iconOnly
          icon={ArrowUpDown}
          aria-label={t.hours.reverse}
          title={t.hours.reverse}
          onClick={() => setSort((s) => ({ ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }))}
        />
      </div>
      <table className="table hours-table">
        <thead>
          <tr>
            {header('name')}
            {header('planned', 'right')}
            {header('worked', 'right')}
            <th className="cell-bar">
              <span className="visually-hidden">{t.hours.progress}</span>
            </th>
            {header('difference', 'right')}
            {header('late', 'right')}
            {header('missed', 'right')}
            {header('unplanned', 'right')}
            {header('open', 'right')}
            {header('rate', 'right')}
            {header('cost', 'right')}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = rowName(row)
            return (
              <tr key={row.workerId}>
                <td className="cell-person">
                  <div className={row.isActive ? 'person' : 'person inactive'}>
                    <Avatar initials={initials({ firstName: row.firstName, lastName: row.lastName, username: name })} />
                    <div className="person-text">
                      <Link className="name person-link" to={personHref(row.workerId)} title={t.hours.openPerson(name)}>
                        {name}
                      </Link>
                      {!row.isActive && <span className="tag">{t.hours.inactive}</span>}
                    </div>
                  </div>
                </td>
                <td className="right mono" data-label={label.planned}>
                  {minutesLabel(row.plannedMinutes)}
                </td>
                <td className="right mono" data-label={label.worked}>
                  {minutesLabel(row.workedMinutes)}
                </td>
                <td className="cell-bar">
                  <HoursBar planned={row.plannedMinutes} worked={row.workedMinutes} max={max} />
                </td>
                <td className="right mono" data-label={label.difference}>
                  <Difference minutes={row.differenceMinutes} />
                </td>
                <td className="right mono" data-label={label.late}>
                  <Count value={row.lateCount} tone="warn" />
                </td>
                <td className="right mono" data-label={label.missed}>
                  <Count value={row.missedShiftsCount} tone="bad" />
                </td>
                <td className="right mono" data-label={label.unplanned}>
                  <Count value={row.unplannedCount} />
                </td>
                <td className="right mono" data-label={label.open}>
                  <Count value={row.openEntriesCount} />
                </td>
                <td className="right mono" data-label={label.rate}>
                  {row.currentHourlyRate === null ? (
                    <Link className="muted" to={personHref(row.workerId)}>
                      {t.hours.addRate}
                    </Link>
                  ) : (
                    t.hours.perHour(fmt.money(row.currentHourlyRate))
                  )}
                </td>
                <td className="right mono" data-label={label.cost}>
                  <div>
                    <Cost value={row.actualCost} />
                  </div>
                  {row.actualCost === null && row.currentHourlyRate !== null && (
                    <div className="muted cell-sub" aria-hidden>
                      {t.hours.missingRate}
                    </div>
                  )}
                  {row.plannedCost !== null && <div className="muted cell-sub">{t.hours.plannedCost(fmt.money(row.plannedCost))}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="cell-person">
              {t.hours.total}
            </th>
            <td className="right mono" data-label={label.planned}>
              {minutesLabel(report.totals.plannedMinutes)}
            </td>
            <td className="right mono" data-label={label.worked}>
              {minutesLabel(report.totals.workedMinutes)}
            </td>
            <td className="cell-bar" />
            <td className="right mono" data-label={label.difference}>
              <Difference minutes={report.totals.differenceMinutes} />
            </td>
            <td className="right mono" data-label={label.late}>
              {sum((r) => r.lateCount)}
            </td>
            <td className="right mono" data-label={label.missed}>
              {sum((r) => r.missedShiftsCount)}
            </td>
            <td className="right mono" data-label={label.unplanned}>
              {sum((r) => r.unplannedCount)}
            </td>
            <td className="right mono" data-label={label.open}>
              {sum((r) => r.openEntriesCount)}
            </td>
            <td className="right" />
            <td className="right mono" data-label={label.cost}>
              <div>
                <Cost value={report.totals.actualCost} />
              </div>
              {report.totals.plannedCost !== null && (
                <div className="muted cell-sub">{t.hours.plannedCost(fmt.money(report.totals.plannedCost))}</div>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  )
}
