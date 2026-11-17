import { describe, expect, it } from 'vitest'
import { cashFigures, differenceTone, needsDifferenceReason, suggestedServiceDay } from './cash'

const count = {
  openingFloat: 150,
  cashSales: 820.4,
  cardSales: 1310.1,
  otherSales: 45,
  cashWithdrawals: 200,
  countedCash: 731.9,
  cashExpenses: 38.5,
}

describe('cash closing figures', () => {
  it('reads a difference as cash over, short or balanced, in cents', () => {
    expect(differenceTone(0.5)).toBe('over')
    expect(differenceTone(-0.01)).toBe('short')
    expect(differenceTone(0)).toBe('even')
    // Float noise below half a cent is no difference
    expect(differenceTone(0.1 + 0.2 - 0.3)).toBe('even')
  })

  it('works out total sales, expected cash and the difference like the API', () => {
    // 150 + 820,40 - 38,50 - 200 = 731,90
    expect(cashFigures(count)).toEqual({ totalSales: 2175.5, expectedCash: 731.9, difference: 0 })
    expect(cashFigures({ ...count, countedCash: 725.4 }).difference).toBe(-6.5)
    expect(cashFigures({ ...count, countedCash: 740 }).difference).toBe(8.1)
  })

  it('has no difference until the cash is counted', () => {
    expect(cashFigures({ ...count, countedCash: null }).difference).toBeNull()
  })

  it('asks for a reason only above 5,00 € either way', () => {
    expect(needsDifferenceReason(5)).toBe(false)
    expect(needsDifferenceReason(-5)).toBe(false)
    expect(needsDifferenceReason(5.01)).toBe(true)
    expect(needsDifferenceReason(-5.01)).toBe(true)
    expect(needsDifferenceReason(null)).toBe(false)
  })

  it('suggests last night’s service in the small hours of the venue’s clock', () => {
    // 01:30 in Madrid on 21 November (00:30 UTC)
    expect(suggestedServiceDay('Europe/Madrid', Date.parse('2026-11-21T00:30:00Z'))).toEqual({ day: '2026-11-20', lateNight: true })
    // 06:00 starts the new service day
    expect(suggestedServiceDay('Europe/Madrid', Date.parse('2026-11-21T05:00:00Z'))).toEqual({ day: '2026-11-21', lateNight: false })
    // 23:30 UTC is already the next day in Madrid, at 00:30
    expect(suggestedServiceDay('Europe/Madrid', Date.parse('2026-11-20T23:30:00Z'))).toEqual({ day: '2026-11-20', lateNight: true })
    // The Canaries are an hour behind: 06:30 in Madrid is 05:30 there
    expect(suggestedServiceDay('Atlantic/Canary', Date.parse('2026-11-21T05:30:00Z')).lateNight).toBe(true)
  })
})
