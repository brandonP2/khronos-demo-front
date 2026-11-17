import { describe, expect, it } from 'vitest'
import { parseAmount, sumMoney } from './money'

describe('typed amounts', () => {
  it.each([
    ['1.234,50', 1234.5],
    ['1234,5', 1234.5],
    ['1234.50', 1234.5],
    ['1,234.50', 1234.5],
    ['1.234', 1234],
    ['1,234', 1234],
    // Three digits after a lone separator group thousands: money has two decimals at most
    ['12,345', 12345],
    ['12,5', 12.5],
    ['0,05', 0.05],
    ['12 €', 12],
    ['  45,90 ', 45.9],
    ['1.234.567,89', 1234567.89],
    ['0', 0],
  ])('reads %s as %s', (text, value) => {
    expect(parseAmount(text)).toBe(value)
  })

  it.each(['', '   ', 'abc', '-5', '1,2,3', '12,', ',5', '1.234.5', '1.23,45', '1,234,56'])('refuses %j', (text) => {
    expect(parseAmount(text)).toBeNull()
  })

  // A group of thousands never starts with 0: these are typos for 0,13 or 0,50, not 125 € or 500 €
  it.each(['0,125', '0.500', '0,125.50', '0.125,50', '00.125', '012.345', '0.000'])('refuses %j instead of reading thousands', (text) => {
    expect(parseAmount(text)).toBeNull()
  })

  it('still reads thousands that do not start with 0', () => {
    expect(parseAmount('100.000')).toBe(100000)
    expect(parseAmount('1.000,05')).toBe(1000.05)
    expect(parseAmount('0,50')).toBe(0.5)
  })

  it('adds money in cents', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([])).toBe(0)
  })
})
