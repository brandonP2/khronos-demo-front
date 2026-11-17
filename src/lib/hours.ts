// Sorting the rows of the hours report. People without a rate (null cost) always go last.
import type { HoursReportRow } from '../api/types'

export type HoursSortKey =
  | 'name'
  | 'planned'
  | 'worked'
  | 'difference'
  | 'late'
  | 'missed'
  | 'unplanned'
  | 'open'
  | 'rate'
  | 'cost'

export type SortDirection = 'asc' | 'desc'

export interface HoursSort {
  key: HoursSortKey
  direction: SortDirection
}

export const HOURS_SORT_KEYS: HoursSortKey[] = [
  'name',
  'planned',
  'worked',
  'difference',
  'late',
  'missed',
  'unplanned',
  'open',
  'rate',
  'cost',
]

/** "12,50", "12.5" or "12 €" to 12.5; null unless above 0 with two decimals at most */
export function parseRate(text: string): number | null {
  const plain = text.trim().replace(/[\s€]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null
  const value = Number(plain)
  return value > 0 ? value : null
}

/** The API takes a break of 0 to 600 minutes */
export const MAX_BREAK_MINUTES = 600

/** The minutes of break typed in a field: a whole number from 0 to 600, else null */
export function parseBreakMinutes(text: string): number | null {
  const plain = text.trim()
  if (!/^\d+$/.test(plain)) return null
  const value = Number(plain)
  return value <= MAX_BREAK_MINUTES ? value : null
}

export const rowName = (row: Pick<HoursReportRow, 'firstName' | 'lastName'>) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ').trim()

function sortValue(row: HoursReportRow, key: Exclude<HoursSortKey, 'name'>): number | null {
  switch (key) {
    case 'planned':
      return row.plannedMinutes
    case 'worked':
      return row.workedMinutes
    case 'difference':
      return row.differenceMinutes
    case 'late':
      return row.lateCount
    case 'missed':
      return row.missedShiftsCount
    case 'unplanned':
      return row.unplannedCount
    case 'open':
      return row.openEntriesCount
    case 'rate':
      return row.currentHourlyRate
    case 'cost':
      return row.actualCost
  }
}

/** Names read A to Z first; numbers read largest first, which is what an owner looks for */
export function defaultDirection(key: HoursSortKey): SortDirection {
  return key === 'name' ? 'asc' : 'desc'
}

export function sortHoursRows(rows: HoursReportRow[], sort: HoursSort, locale?: string): HoursReportRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const byName = (a: HoursReportRow, b: HoursReportRow) => rowName(a).localeCompare(rowName(b), locale)
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * byName(a, b)
    const x = sortValue(a, sort.key)
    const y = sortValue(b, sort.key)
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1
    return sign * (x - y) || byName(a, b)
  })
}
