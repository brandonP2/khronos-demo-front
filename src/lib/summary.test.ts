import { describe, expect, it } from 'vitest'
import type { SummaryDay } from '../api/types'
import { barPercent, chartScale, dayCost, dayCostBesidesStaff, isEmptyDay, isEmptyPrevious, niceCeiling, percentOf, trend } from './summary'

const day = (date: string, patch: Partial<SummaryDay> = {}): SummaryDay => ({
  date,
  sales: 0,
  expenses: 0,
  laborCost: 0,
  margin: 0,
  closingStatus: 'NONE',
  cashDifference: null,
  ...patch,
})

describe('comparing with the period before', () => {
  it('gives the signed change and its percentage', () => {
    expect(trend(1200, 1000)).toEqual({ direction: 'up', delta: 200, percent: 20 })
    expect(trend(750, 1000)).toEqual({ direction: 'down', delta: -250, percent: -25 })
    expect(trend(1000, 1000)).toEqual({ direction: 'flat', delta: 0, percent: 0 })
  })

  it('does not divide by zero when the period before had nothing', () => {
    expect(trend(350, 0)).toEqual({ direction: 'up', delta: 350, percent: null })
  })

  it('compares nothing when a side is missing', () => {
    expect(trend(null, 100)).toBeNull()
    expect(trend(100, null)).toBeNull()
  })

  it('reads a smaller loss as going up', () => {
    expect(trend(-50, -200)).toEqual({ direction: 'up', delta: 150, percent: 75 })
  })

  it('works in cents, so float noise is not a change', () => {
    expect(trend(0.1 + 0.2, 0.3)?.direction).toBe('flat')
  })

  it('knows when the period before was empty', () => {
    const previous = { from: '', to: '', laborCost: null, laborCostSource: 'PAYROLL_EXPENSES' as const }
    expect(isEmptyPrevious({ ...previous, sales: 0, expenses: 0, grossMargin: 0 })).toBe(true)
    expect(isEmptyPrevious({ ...previous, sales: 0, expenses: 12, grossMargin: -12 })).toBe(false)
  })

  it('works out a share with one decimal', () => {
    expect(percentOf(320, 1000)).toBe(32)
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(100, 0)).toBeNull()
    expect(percentOf(null, 100)).toBeNull()
  })
})

describe('chart scale', () => {
  it('rounds the top of the axis up to a round number with a round half', () => {
    expect(niceCeiling(1234)).toBe(2000)
    expect(niceCeiling(4100)).toBe(5000)
    expect(niceCeiling(980)).toBe(1000)
    expect(niceCeiling(300)).toBe(400)
    expect(niceCeiling(0)).toBe(0)
  })

  it('takes the higher of sales and total cost', () => {
    const days = [
      day('2026-11-16', { sales: 900, expenses: 300, laborCost: 400, margin: 200 }),
      day('2026-11-17', { sales: 200, expenses: 1500, laborCost: null, margin: -1300 }),
    ]
    expect(dayCost(days[1])).toBe(1500)
    expect(chartScale(days)).toEqual({ max: 2000, ticks: [0, 1000, 2000] })
  })

  it('draws heights in proportion, and nothing on an empty axis', () => {
    expect(barPercent(500, 2000)).toBe(25)
    expect(barPercent(2000, 2000)).toBe(100)
    expect(barPercent(0, 2000)).toBe(0)
    expect(barPercent(10, 0)).toBe(0)
    expect(chartScale([day('2026-11-16')])).toEqual({ max: 0, ticks: [0] })
  })
})

describe("a day's total cost", () => {
  it('is what the margin takes off the sales, so payroll is not counted twice with the hours', () => {
    // 500 € of expenses, 200 € of them payroll, and 300 € of staff from the hours: the margin
    // takes off 300 € of other expenses and the 300 € of staff, not 800 €
    const withHours = day('2026-11-16', { sales: 1000, expenses: 500, laborCost: 300, margin: 400 })
    expect(dayCost(withHours)).toBe(600)
    expect(dayCostBesidesStaff(withHours)).toBe(300)
    expect(withHours.sales - dayCost(withHours)).toBe(withHours.margin)
  })

  it('is every expense, payroll included, when there are no rates', () => {
    const byPayroll = day('2026-11-16', { sales: 1000, expenses: 500, laborCost: null, margin: 500 })
    expect(dayCost(byPayroll)).toBe(500)
    expect(dayCostBesidesStaff(byPayroll)).toBeNull()
  })

  it('works in cents', () => {
    expect(dayCost(day('2026-11-16', { sales: 0.3, margin: 0.1 }))).toBe(0.2)
  })
})

describe('empty days', () => {
  it('is a day with no activity and nothing in it', () => {
    expect(isEmptyDay(day('2026-11-16'))).toBe(true)
    expect(isEmptyDay(day('2026-11-16', { laborCost: null }))).toBe(true)
    expect(isEmptyDay(day('2026-11-16', { expenses: 12 }))).toBe(false)
  })

  it('never is a day with activity and no closing, whatever its figures', () => {
    expect(isEmptyDay(day('2026-11-16', { closingStatus: 'MISSING' }))).toBe(false)
    expect(isEmptyDay(day('2026-11-16', { closingStatus: 'MISSING', laborCost: null }))).toBe(false)
  })
})
