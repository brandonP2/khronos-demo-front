// The business summary: each figure against the period before, and the scale of the daily chart.
import type { SummaryDay, SummaryPrevious } from '../api/types'
import { fromCents, toCents } from './money'

export interface Trend {
  direction: 'up' | 'down' | 'flat'
  /** current - previous, in the figure's own unit */
  delta: number
  /** The change as a percentage of the previous value; null when that was 0 */
  percent: number | null
}

/** null when either side is missing, so nothing is compared */
export function trend(current: number | null, previous: number | null): Trend | null {
  if (current === null || previous === null) return null
  const delta = fromCents(toCents(current) - toCents(previous))
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  // Against the size of the previous value, so a smaller loss reads as going up
  const percent = previous === 0 ? null : (delta / Math.abs(previous)) * 100
  return { direction, delta, percent }
}

/** A share in percent with one decimal, or null when the whole is 0 or the part is unknown */
export function percentOf(part: number | null, whole: number): number | null {
  if (part === null || whole === 0) return null
  return Math.round((part / whole) * 1000) / 10
}

/** The period before had nothing at all in it: there is nothing to compare with */
export function isEmptyPrevious(previous: SummaryPrevious): boolean {
  return previous.sales === 0 && previous.expenses === 0 && (previous.laborCost ?? 0) === 0
}

/** Expenses plus staff cost; staff cost counts as 0 when it is unknown */
export function dayCost(day: SummaryDay): number {
  return fromCents(toCents(day.expenses) + toCents(day.laborCost ?? 0))
}

/** A day with no sales, no expenses, no staff cost and no closing */
export function isEmptyDay(day: SummaryDay): boolean {
  return day.sales === 0 && day.expenses === 0 && !day.laborCost && (day.closingStatus === 'NONE' || day.closingStatus === 'MISSING')
}

/** The smallest round number at or above the value whose half is round too: 1234 to 2000, 4100 to 5000 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 0
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 4, 5, 10].find((m) => m * power >= value) ?? 10
  return step * power
}

/** The top of the chart's axis and its three gridlines (0, half, top) */
export function chartScale(days: SummaryDay[]): { max: number; ticks: number[] } {
  const highest = Math.max(0, ...days.flatMap((d) => [d.sales, dayCost(d)]))
  const max = niceCeiling(highest)
  return { max, ticks: max ? [0, max / 2, max] : [0] }
}

/** A bar's height as a percentage of the axis; 0 on an empty axis */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return Math.min(100, (value / max) * 100)
}
