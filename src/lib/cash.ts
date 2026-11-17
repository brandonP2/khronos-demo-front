// The cash count at the end of service, worked out live while the owner types it, the same way
// the API does: what should be in the till, and how far the count is from it.
import { toCents, fromCents } from './money'
import { addDays, zonedTime, zonedToday } from './time'

/** Above this difference, in euros, closing needs a reason. The API's default; it can be set higher or lower. */
export const DIFFERENCE_REASON_LIMIT = 5

/** Before this time on the venue's clock, the service being closed is the one that started yesterday */
export const SERVICE_DAY_STARTS_AT = '06:00'

export interface CashCount {
  openingFloat: number
  cashSales: number
  cardSales: number
  otherSales: number
  cashWithdrawals: number
  /** null until the cash has been counted */
  countedCash: number | null
  /** The day's expenses paid in cash, from the API */
  cashExpenses: number
}

export interface CashFigures {
  /** cash + card + other */
  totalSales: number
  /** opening float + cash sales - cash expenses - withdrawals */
  expectedCash: number
  /** counted - expected: positive when there is more cash than expected, negative when some is missing */
  difference: number | null
}

export function cashFigures(count: CashCount): CashFigures {
  const c = (n: number) => toCents(n)
  const expected = c(count.openingFloat) + c(count.cashSales) - c(count.cashExpenses) - c(count.cashWithdrawals)
  return {
    totalSales: fromCents(c(count.cashSales) + c(count.cardSales) + c(count.otherSales)),
    expectedCash: fromCents(expected),
    difference: count.countedCash === null ? null : fromCents(c(count.countedCash) - expected),
  }
}

/** More than 5,00 € either way needs a reason to close */
export function needsDifferenceReason(difference: number | null, limit = DIFFERENCE_REASON_LIMIT): boolean {
  return difference !== null && Math.abs(toCents(difference)) > toCents(limit)
}

/**
 * The service day to close by default: today on the venue's clock, or yesterday in the small
 * hours, when the night's service is still being closed.
 */
export function suggestedServiceDay(timeZone: string, now: number = Date.now()): { day: string; lateNight: boolean } {
  const today = zonedToday(timeZone, now)
  const lateNight = zonedTime(now, timeZone) < SERVICE_DAY_STARTS_AT
  return { day: lateNight ? addDays(today, -1) : today, lateNight }
}
