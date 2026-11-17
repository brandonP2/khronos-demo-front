import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product, StockMovement } from '../api/types'
import { product } from '../test/inventory'
import { clearDrafts } from './drafts'
import { dictionaries } from './i18n'
import {
  applyMovements,
  clearCountDraft,
  countSummary,
  filterProducts,
  groupByCategory,
  loadCountDraft,
  movementInput,
  movementIssues,
  orderTotal,
  parseQuantity,
  proposeOrderLines,
  quantityText,
  quantityValue,
  roundUpQuantity,
  saveCountDraft,
  stockChange,
  suggestedQuantity,
  withStock,
  type MovementDraft,
} from './stock'
import { makeFmt } from './time'

const es = quantityText(makeFmt('es-ES', dictionaries.es.dates), dictionaries.es)
const en = quantityText(makeFmt('en-GB', dictionaries.en.dates), dictionaries.en)
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('quantities typed by hand', () => {
  it.each([
    ['4,5', 4.5],
    ['4.5', 4.5],
    ['0,25', 0.25],
    ['0,125', 0.125],
    ['12', 12],
    [' 3 ', 3],
    ['0', 0],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    // A lone separator is the decimal mark: quantities have three decimals
    ['1,500', 1.5],
    ['0,1', 0.1],
  ])('reads %s as %s', (text, value) => {
    expect(parseQuantity(text)).toBe(value)
  })

  it.each(['', '  ', 'abc', '-2', '1,2345', '4,', ',5', '1.2.3', '1.234.5', '2 botellas'])('refuses %j', (text) => {
    expect(parseQuantity(text)).toBeNull()
  })
})

describe('quantities with their unit', () => {
  it('writes the plural when it is not exactly one, with a decimal comma and no trailing zeros', () => {
    expect(es.quantity(1, 'BOTTLE')).toBe('1 botella')
    expect(es.quantity(4.5, 'BOTTLE')).toBe('4,5 botellas')
    expect(es.quantity(0.5, 'BOTTLE')).toBe('0,5 botellas')
    expect(es.quantity(0, 'UNIT')).toBe('0 unidades')
    expect(es.quantity(1, 'UNIT')).toBe('1 unidad')
    expect(es.quantity(2.25, 'KG')).toBe('2,25 kg')
    expect(es.quantity(1, 'L')).toBe('1 l')
    expect(es.quantity(3, 'BOX')).toBe('3 cajas')
    expect(es.quantity(1, 'KEG')).toBe('1 barril')
    expect(es.quantity(2, 'KEG')).toBe('2 barriles')
    expect(es.quantity(4.125, 'KG')).toBe('4,125 kg')
    expect(es.quantity(4.5000000001, 'BOTTLE')).toBe('4,5 botellas')
  })

  it('signs a change, and a negative stock, with a real minus', () => {
    expect(es.quantity(-2, 'BOTTLE')).toBe('−2 botellas')
    expect(es.quantity(-1, 'BOTTLE')).toBe('−1 botella')
    expect(es.signed(6, 'BOTTLE')).toBe('+6 botellas')
    expect(es.signed(-1.5, 'BOTTLE')).toBe('−1,5 botellas')
    expect(es.signed(0, 'BOTTLE')).toBe('0 botellas')
    expect(es.signed(-0.0001, 'KG')).toBe('0 kg')
  })

  it('writes the cost per unit with the unit in the singular', () => {
    expect(plain(es.perUnit(12.5, 'BOTTLE'))).toBe('12,50 €/botella')
    expect(plain(es.perUnit(3.2, 'KG'))).toBe('3,20 €/kg')
  })

  it('words English too', () => {
    expect(en.quantity(1, 'BOX')).toBe('1 box')
    expect(en.quantity(2, 'BOX')).toBe('2 boxes')
    expect(en.quantity(4.5, 'BOTTLE')).toBe('4.5 bottles')
    expect(en.signed(2, 'KEG')).toBe('+2 kegs')
  })

  it('values a quantity to the cent, and gives null with no cost', () => {
    expect(quantityValue(4.5, 12.5)).toBe(56.25)
    expect(quantityValue(0.333, 10)).toBe(3.33)
    expect(quantityValue(-1.5, 3.33)).toBe(-5)
    expect(quantityValue(3, null)).toBeNull()
    expect(quantityValue(0, 9)).toBe(0)
  })
})

describe('the stock list', () => {
  const list = [
    product(1, { name: 'Ginebra Puerto', isLowStock: true }),
    product(2, { name: 'Café en grano', category: 'COFFEE' }),
    product(3, { name: 'Tónica', category: 'SOFT_DRINKS', isActive: false }),
    product(4, { name: 'Agua', category: 'SOFT_DRINKS', isLowStock: true }),
    product(5, { name: 'Bombay', category: 'SPIRITS' }),
  ]
  const names = (ps: Product[]) => ps.map((p) => p.name)

  it('searches by name, without minding accents or case', () => {
    expect(names(filterProducts(list, { search: 'cafe', lowOnly: false, includeInactive: false }))).toEqual(['Café en grano'])
    expect(names(filterProducts(list, { search: 'GINEBRA pu', lowOnly: false, includeInactive: false }))).toEqual(['Ginebra Puerto'])
    expect(filterProducts(list, { search: 'ron', lowOnly: false, includeInactive: false })).toEqual([])
  })

  it('leaves inactive products out unless asked, and can show only the low ones', () => {
    expect(names(filterProducts(list, { search: '', lowOnly: false, includeInactive: false }))).not.toContain('Tónica')
    expect(names(filterProducts(list, { search: '', lowOnly: false, includeInactive: true }))).toContain('Tónica')
    expect(names(filterProducts(list, { search: '', lowOnly: true, includeInactive: true }))).toEqual(['Ginebra Puerto', 'Agua'])
  })

  it('groups by category in a fixed order, each by name', () => {
    const groups = groupByCategory(list)
    expect(groups.map((g) => g.category)).toEqual(['SPIRITS', 'SOFT_DRINKS', 'COFFEE'])
    expect(names(groups[0].products)).toEqual(['Bombay', 'Ginebra Puerto'])
  })

  it('works out the value and the low mark again after a movement', () => {
    const gin = product(1, { minStock: 3, unitCost: 10, currentStock: 5, stockValue: 50 })
    expect(withStock(gin, 2.5)).toMatchObject({ currentStock: 2.5, stockValue: 25, isLowStock: true })
    expect(withStock(gin, -1)).toMatchObject({ stockValue: 0, isLowStock: true })
    expect(withStock(gin, 8, 12)).toMatchObject({ unitCost: 12, stockValue: 96, isLowStock: false })
    expect(withStock(product(2), 4)).toMatchObject({ stockValue: null, isLowStock: false })
  })

  it('takes the stock from the latest movement of each product', () => {
    const movement = (id: number, productId: number, stockAfter: number, patch: Partial<StockMovement> = {}): StockMovement => ({
      id,
      productId,
      productName: '',
      unit: 'BOTTLE',
      type: 'COUNT',
      quantity: 0,
      unitCost: null,
      value: null,
      reason: null,
      date: '2026-11-17',
      createdAt: '2026-11-17T10:00:00Z',
      createdByName: 'Ana Gil',
      purchaseOrderId: null,
      stockAfter,
      ...patch,
    })
    const after = applyMovements(
      [product(1, { currentStock: 5, unitCost: 2 }), product(2, { currentStock: 1 })],
      [movement(8, 1, 7, { type: 'PURCHASE', unitCost: 3 }), movement(7, 1, 6)],
    )
    expect(after[0]).toMatchObject({ currentStock: 7, unitCost: 3, stockValue: 21 })
    expect(after[1].currentStock).toBe(1)
  })
})

describe('movements', () => {
  const draft = (patch: Partial<MovementDraft>): MovementDraft => ({
    type: 'PURCHASE',
    quantity: 2,
    direction: 'add',
    unitCost: null,
    reason: '',
    date: '2026-11-17',
    ...patch,
  })
  const today = '2026-11-17'

  it('needs a quantity above 0 for every type', () => {
    for (const type of ['PURCHASE', 'WASTE', 'CONSUMPTION', 'ADJUSTMENT'] as const) {
      expect(movementIssues(draft({ type, quantity: null, reason: 'Rotura' }), today).quantity).toBe(true)
      expect(movementIssues(draft({ type, quantity: 0, reason: 'Rotura' }), today).quantity).toBe(true)
      expect(movementIssues(draft({ type, quantity: 0.001, reason: 'Rotura' }), today).quantity).toBeUndefined()
    }
  })

  it('needs a reason of 3 to 255 characters for waste and adjustments only', () => {
    expect(movementIssues(draft({ type: 'WASTE', reason: '  ' }), today).reason).toBe(true)
    expect(movementIssues(draft({ type: 'WASTE', reason: 'ab' }), today).reason).toBe(true)
    expect(movementIssues(draft({ type: 'WASTE', reason: 'Rotura' }), today).reason).toBeUndefined()
    expect(movementIssues(draft({ type: 'ADJUSTMENT', reason: '' }), today).reason).toBe(true)
    expect(movementIssues(draft({ type: 'ADJUSTMENT', reason: 'x'.repeat(256) }), today).reason).toBe(true)
    expect(movementIssues(draft({ type: 'PURCHASE', reason: '' }), today)).toEqual({})
    expect(movementIssues(draft({ type: 'CONSUMPTION', reason: '' }), today)).toEqual({})
  })

  it('refuses a future day and a cost that is not an amount', () => {
    expect(movementIssues(draft({ date: '2026-11-18' }), today).date).toBe(true)
    expect(movementIssues(draft({ unitCost: 'invalid' }), today).unitCost).toBe(true)
  })

  it('sends a positive quantity and lets the type give the sign, except an adjustment', () => {
    expect(movementInput(1, draft({ type: 'PURCHASE', quantity: 6, unitCost: 9.5 }))).toEqual({
      productId: 1,
      type: 'PURCHASE',
      quantity: 6,
      unitCost: 9.5,
      reason: null,
      date: '2026-11-17',
    })
    expect(movementInput(1, draft({ type: 'WASTE', quantity: 1, reason: ' Rotura ', unitCost: 3 }))).toMatchObject({
      quantity: 1,
      unitCost: null,
      reason: 'Rotura',
    })
    expect(movementInput(1, draft({ type: 'CONSUMPTION', quantity: 0.5, reason: 'ignored' })).reason).toBeNull()
    expect(movementInput(1, draft({ type: 'ADJUSTMENT', quantity: 1.5, direction: 'remove', reason: 'Error' })).quantity).toBe(-1.5)
    expect(movementInput(1, draft({ type: 'ADJUSTMENT', quantity: 2, direction: 'add', reason: 'Error' })).quantity).toBe(2)
  })

  it('previews how the stock changes', () => {
    expect(stockChange(draft({ type: 'PURCHASE', quantity: 2 }))).toBe(2)
    expect(stockChange(draft({ type: 'WASTE', quantity: 2 }))).toBe(-2)
    expect(stockChange(draft({ type: 'CONSUMPTION', quantity: 0.5 }))).toBe(-0.5)
    expect(stockChange(draft({ type: 'ADJUSTMENT', quantity: 3, direction: 'remove' }))).toBe(-3)
  })
})

describe('a physical count', () => {
  const products = [
    product(1, { name: 'Ginebra', currentStock: 4.5, unitCost: 12 }),
    product(2, { name: 'Café', unit: 'KG', currentStock: 2, unitCost: 15 }),
    product(3, { name: 'Hielo', unit: 'KG', currentStock: 10, unitCost: null }),
    product(4, { name: 'Tónica', unit: 'UNIT', currentStock: 24, unitCost: 0.6 }),
  ]

  it('only takes the products typed in, and works out each difference', () => {
    const summary = countSummary(products, { '1': '3', '2': '2,25', '3': '', '4': '24' })
    expect(summary.lines.map((l) => [l.product.id, l.counted, l.difference, l.value])).toEqual([
      [1, 3, -1.5, -18],
      [2, 2.25, 0.25, 3.75],
      [4, 24, 0, 0],
    ])
    expect(summary.changed.map((l) => l.product.id)).toEqual([1, 2])
    expect(summary.invalid).toEqual([])
  })

  it('adds the differences per unit and in value, and says which have no cost', () => {
    const summary = countSummary(products, { '1': '3', '2': '2,5', '3': '8,5', '4': '20' })
    expect(summary.byUnit).toEqual([
      { unit: 'BOTTLE', difference: -1.5 },
      { unit: 'KG', difference: -1 },
      { unit: 'UNIT', difference: -4 },
    ])
    // −18 + 7,50 − 2,40; the ice has no cost
    expect(summary.value).toBe(-12.9)
    expect(summary.unvalued).toBe(1)
  })

  it('counts 0 as counted and marks what is not a quantity', () => {
    const summary = countSummary(products, { '1': '0', '2': 'dos' })
    expect(summary.lines.map((l) => l.counted)).toEqual([0])
    expect(summary.invalid).toEqual([2])
  })
})

describe('the count draft', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('is kept per venue in this tab, and an empty one is not kept', () => {
    saveCountDraft(1, 5, { date: '2026-11-17', notes: '', counts: { '1': '3' } })
    expect(loadCountDraft(1, 5)).toEqual({ date: '2026-11-17', notes: '', counts: { '1': '3' } })
    expect(loadCountDraft(2, 5)).toBeNull()
    saveCountDraft(1, 5, { date: '2026-11-17', notes: ' ', counts: { '1': '' } })
    expect(loadCountDraft(1, 5)).toBeNull()
    saveCountDraft(1, 5, { date: '2026-11-17', notes: 'Cierre', counts: {} })
    clearCountDraft(1)
    expect(loadCountDraft(1, 5)).toBeNull()
  })

  it('is only offered to the person who typed it, and thrown away for anyone else', () => {
    saveCountDraft(1, 5, { date: '2026-11-17', notes: '', counts: { '1': '3' } })
    expect(loadCountDraft(1, 6)).toBeNull()
    expect(sessionStorage.getItem('khronos.stockCount.1')).toBeNull()
    expect(loadCountDraft(1, 5)).toBeNull()
    // A draft from before drafts said whose they were is nobody's
    sessionStorage.setItem('khronos.stockCount.1', JSON.stringify({ date: '2026-11-17', notes: '', counts: { '1': '3' } }))
    expect(loadCountDraft(1, 5)).toBeNull()
  })

  it('is forgotten with every other draft when the session ends', () => {
    saveCountDraft(1, 5, { date: '2026-11-17', notes: '', counts: { '1': '3' } })
    saveCountDraft(2, 5, { date: '2026-11-17', notes: 'Barra', counts: {} })
    sessionStorage.setItem('khronos.session', 'kept')
    clearDrafts()
    expect(loadCountDraft(1, 5)).toBeNull()
    expect(loadCountDraft(2, 5)).toBeNull()
    expect(sessionStorage.getItem('khronos.session')).toBe('kept')
  })

  it('ignores what it cannot read, and storage that refuses', () => {
    sessionStorage.setItem('khronos.stockCount.1', '{not json')
    expect(loadCountDraft(1, 5)).toBeNull()
    sessionStorage.setItem('khronos.stockCount.1', JSON.stringify({ userId: 5, date: 1, counts: [] }))
    expect(loadCountDraft(1, 5)).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => saveCountDraft(1, 5, { date: '2026-11-17', notes: '', counts: { '1': '3' } })).not.toThrow()
    expect(loadCountDraft(1, 5)).toBeNull()
    expect(() => clearDrafts()).not.toThrow()
  })
})

describe('purchase orders', () => {
  it('rounds whole units up to the next one, and kilos and litres to the half', () => {
    expect(roundUpQuantity(2.1, 'BOTTLE')).toBe(3)
    expect(roundUpQuantity(2, 'BOX')).toBe(2)
    expect(roundUpQuantity(1.2, 'KG')).toBe(1.5)
    expect(roundUpQuantity(1.5, 'L')).toBe(1.5)
    expect(roundUpQuantity(1.6, 'L')).toBe(2)
  })

  it('suggests what brings the stock back to the minimum, and at least 1', () => {
    expect(suggestedQuantity({ minStock: 6, currentStock: 2.5, unit: 'BOTTLE' })).toBe(4)
    expect(suggestedQuantity({ minStock: 6, currentStock: 6, unit: 'BOTTLE' })).toBe(1)
    expect(suggestedQuantity({ minStock: 6, currentStock: -2, unit: 'BOTTLE' })).toBe(8)
    expect(suggestedQuantity({ minStock: 5, currentStock: 3.8, unit: 'KG' })).toBe(1.5)
  })

  it('proposes the supplier’s active products at or under their minimum', () => {
    const products = [
      product(1, { name: 'Ron', supplierId: 7, isLowStock: true, minStock: 4, currentStock: 1, unitCost: 11 }),
      product(2, { name: 'Ginebra', supplierId: 7, isLowStock: false, minStock: 2, currentStock: 5 }),
      product(3, { name: 'Café', category: 'COFFEE', unit: 'KG', supplierId: 7, isLowStock: true, minStock: 3, currentStock: 2.2 }),
      product(4, { name: 'Agua', supplierId: 8, isLowStock: true, minStock: 10, currentStock: 0 }),
      product(5, { name: 'Anís', supplierId: 7, isLowStock: true, minStock: 2, currentStock: 0, isActive: false }),
    ]
    expect(proposeOrderLines(products, 7)).toEqual([
      { productId: 1, quantity: 3, unitCost: 11 },
      { productId: 3, quantity: 1, unitCost: null },
    ])
    expect(proposeOrderLines(products, 9)).toEqual([])
  })

  it('adds up the lines with a cost and counts the ones without', () => {
    const line = (quantity: number | null, unitCost: number | null, hasProduct = true) => ({ hasProduct, quantity, unitCost })
    expect(orderTotal([line(3, 11.4), line(1.5, 2.35)])).toEqual({ total: 37.73, withoutCost: 0 })
    expect(orderTotal([line(3, 10), line(2, null)])).toEqual({ total: 30, withoutCost: 1 })
    expect(orderTotal([line(3, null)])).toEqual({ total: null, withoutCost: 1 })
    expect(orderTotal([])).toEqual({ total: null, withoutCost: 0 })
  })

  it('leaves out of both the lines still being filled in and the ones received with 0', () => {
    const line = (quantity: number | null, unitCost: number | null, hasProduct = true) => ({ hasProduct, quantity, unitCost })
    // No product yet, no quantity yet, a quantity that is not one, 0: none of them is "without cost"
    expect(orderTotal([line(3, 10), line(2, null, false), line(null, null), line(0, null), line(0, 4)])).toEqual({
      total: 30,
      withoutCost: 0,
    })
    expect(orderTotal([line(null, 4), line(1, 4, false)])).toEqual({ total: null, withoutCost: 0 })
  })
})
