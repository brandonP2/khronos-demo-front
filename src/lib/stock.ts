// Stock quantities and the figures worked out from them: quantities typed by hand (up to three
// decimals: "4,5" bottles), the checks the API makes on a movement, a physical count's
// differences and the draft that keeps it, the quantities proposed for an order and its total.
// Quantities are worked out in thousandths and money in cents, so 0,1 + 0,2 is 0,3.
import type {
  ManualMovementType,
  Product,
  ProductCategory,
  PurchaseOrderLineInput,
  StockMovement,
  StockUnit,
} from '../api/types'
import { useFmt, useT, type Messages } from './i18n'
import { fromCents, toCents } from './money'
import type { Fmt } from './time'

export const PRODUCT_CATEGORIES: ProductCategory[] = ['SPIRITS', 'BEER', 'WINE', 'SOFT_DRINKS', 'COFFEE', 'FOOD', 'SUPPLIES', 'OTHER']

export const STOCK_UNITS: StockUnit[] = ['BOTTLE', 'UNIT', 'KG', 'L', 'BOX', 'KEG']

export const MOVEMENT_TYPES: ManualMovementType[] = ['PURCHASE', 'WASTE', 'CONSUMPTION', 'ADJUSTMENT']

/** Limits the API checks */
export const NAME_MAX = 100
export const REASON_MIN = 3
export const REASON_MAX = 255
export const COUNT_NOTES_MAX = 255
export const ORDER_NOTES_MAX = 500
export const COUNT_ITEMS_MAX = 500
export const ORDER_LINES_MAX = 200

/* ---------- Quantities ---------- */

/** Units counted whole: a proposal rounds them up to the next whole one */
const WHOLE_UNITS: StockUnit[] = ['BOTTLE', 'UNIT', 'BOX', 'KEG']

/** A quantity in thousandths */
export const toMilli = (quantity: number) => Math.round(quantity * 1000)

export const fromMilli = (milli: number) => milli / 1000

/** a - b, without the float noise of 4.5 - 4.4 */
export function subtractQuantities(a: number, b: number): number {
  return fromMilli(toMilli(a) - toMilli(b))
}

/**
 * A quantity typed by hand, or null when it is not one (an empty field included). Up to three
 * decimals, never negative. A lone separator is always the decimal mark ("4,5", "4.5", "0,250"),
 * since quantities have three decimals; with both kinds the last one is ("1.234,5").
 */
export function parseQuantity(text: string): number | null {
  const plain = text.replace(/[\s\u00a0\u202f]/g, '')
  if (!/^\d[\d.,]*$/.test(plain)) return null
  const last = Math.max(plain.lastIndexOf('.'), plain.lastIndexOf(','))
  const separators = plain.replace(/\d/g, '')
  let whole = plain
  let decimals = ''
  if (separators.length === 1) {
    whole = plain.slice(0, last)
    decimals = plain.slice(last + 1)
  } else if (separators.length > 1) {
    // Thousands grouped by the other kind of separator, then the decimal mark
    const mark = plain[last]
    whole = plain.slice(0, last)
    decimals = plain.slice(last + 1)
    if (whole.includes(mark) || !/^\d{1,3}([.,]\d{3})+$/.test(whole)) return null
    whole = whole.replace(/[.,]/g, '')
  }
  if (!/^\d+$/.test(whole) || (separators.length > 0 && !/^\d{1,3}$/.test(decimals))) return null
  return fromMilli(Number(whole) * 1000 + Number(decimals.padEnd(3, '0') || 0))
}

/** How a quantity reads with its unit, in the current language */
export interface QuantityText {
  /** "4,5 botellas", "1 botella", "−2 kg" */
  quantity: (n: number, unit: StockUnit) => string
  /** Always signed, so it reads without colour: "+6 botellas", "−1,5 botellas", "0 botellas" */
  signed: (n: number, unit: StockUnit) => string
  /** "12,50 €/botella", "3,20 €/kg" */
  perUnit: (cost: number, unit: StockUnit) => string
}

export function quantityText(fmt: Fmt, t: Messages): QuantityText {
  const quantity = (n: number, unit: StockUnit) => {
    const abs = Math.abs(fromMilli(toMilli(n)))
    return `${n < 0 && abs > 0 ? '−' : ''}${fmt.quantity(abs)} ${t.units[unit](abs)}`
  }
  return {
    quantity,
    signed: (n, unit) => `${toMilli(n) > 0 ? '+' : ''}${quantity(n, unit)}`,
    perUnit: (cost, unit) => `${fmt.money(cost)}/${t.units[unit](1)}`,
  }
}

/** quantityText for the current language */
export function useQuantityText(): QuantityText {
  return quantityText(useFmt(), useT())
}

/** quantity × cost per unit, rounded to the cent (half away from zero); null with no cost */
export function quantityValue(quantity: number, unitCost: number | null): number | null {
  if (unitCost === null) return null
  const cents = Math.round((Math.abs(toMilli(quantity)) * toCents(unitCost)) / 1000)
  return cents === 0 ? 0 : fromCents(quantity < 0 ? -cents : cents)
}

/* ---------- The stock list ---------- */

/** Lower case and without accents, so "cafe" finds "Café" */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

export interface StockFilter {
  search: string
  /** Only products at or under their minimum */
  lowOnly: boolean
  includeInactive: boolean
}

export function filterProducts(products: Product[], filter: StockFilter): Product[] {
  const words = normalizeText(filter.search).split(/\s+/).filter(Boolean)
  return products.filter((p) => {
    if (!filter.includeInactive && !p.isActive) return false
    if (filter.lowOnly && !p.isLowStock) return false
    const name = normalizeText(p.name)
    return words.every((w) => name.includes(w))
  })
}

/** Products by category, in the categories' order, each by name; empty categories left out */
export function groupByCategory<T extends { category: ProductCategory; name: string }>(
  products: T[],
): { category: ProductCategory; products: T[] }[] {
  return PRODUCT_CATEGORIES.map((category) => ({
    category,
    products: products.filter((p) => p.category === category).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.products.length > 0)
}

/** Negative stock: more went out than came in, which most often means a purchase was not recorded */
export const isNegative = (p: Pick<Product, 'currentStock'>) => toMilli(p.currentStock) < 0

/** The product as the API would give it back with another stock, and a new cost when a purchase brought one */
export function withStock(product: Product, stock: number, unitCost?: number | null): Product {
  const cost = unitCost ?? product.unitCost
  return {
    ...product,
    currentStock: stock,
    unitCost: cost,
    stockValue: cost === null ? null : toMilli(stock) <= 0 ? 0 : quantityValue(stock, cost),
    isLowStock: product.minStock !== null && toMilli(stock) <= toMilli(product.minStock),
  }
}

/** The products after some movements, each with the stock the API reported right after it */
export function applyMovements(products: Product[], movements: StockMovement[]): Product[] {
  const last = new Map<number, StockMovement>()
  for (const m of movements) {
    const seen = last.get(m.productId)
    if (!seen || m.id > seen.id) last.set(m.productId, m)
  }
  return products.map((p) => {
    const m = last.get(p.id)
    return m ? withStock(p, m.stockAfter, m.type === 'PURCHASE' ? m.unitCost : undefined) : p
  })
}

/* ---------- Movements ---------- */

export interface MovementDraft {
  type: ManualMovementType
  /** The quantity typed, never signed; null when it is not a quantity */
  quantity: number | null
  /** ADJUSTMENT only: add to the stock or take from it */
  direction: 'add' | 'remove'
  /** PURCHASE only; null when left empty, 'invalid' when it is not an amount */
  unitCost: number | null | 'invalid'
  reason: string
  date: string
}

export type MovementIssues = Partial<Record<'quantity' | 'unitCost' | 'reason' | 'date', true>>

/** The checks the API makes: a quantity above 0, a reason for waste and adjustments, no future day */
export function movementIssues(draft: MovementDraft, today: string): MovementIssues {
  const issues: MovementIssues = {}
  if (draft.quantity === null || toMilli(draft.quantity) <= 0) issues.quantity = true
  if (draft.type === 'PURCHASE' && draft.unitCost === 'invalid') issues.unitCost = true
  const reason = draft.reason.trim().length
  if (needsReason(draft.type) && (reason < REASON_MIN || reason > REASON_MAX)) issues.reason = true
  if (!draft.date || draft.date > today) issues.date = true
  return issues
}

export const needsReason = (type: ManualMovementType) => type === 'WASTE' || type === 'ADJUSTMENT'

/** How the movement changes the stock: purchases add, waste and consumption take, adjustments either */
export function stockChange(draft: Pick<MovementDraft, 'type' | 'quantity' | 'direction'>): number {
  const q = draft.quantity ?? 0
  if (draft.type === 'PURCHASE') return q
  if (draft.type === 'ADJUSTMENT') return draft.direction === 'add' ? q : -q
  return -q
}

/** The request: the quantity is positive and the type gives the sign, except an adjustment's */
export function movementInput(productId: number, draft: MovementDraft) {
  return {
    productId,
    type: draft.type,
    quantity: draft.type === 'ADJUSTMENT' ? stockChange(draft) : (draft.quantity ?? 0),
    unitCost: draft.type === 'PURCHASE' && typeof draft.unitCost === 'number' ? draft.unitCost : null,
    reason: needsReason(draft.type) ? draft.reason.trim() : null,
    date: draft.date || null,
  }
}

/* ---------- A physical count ---------- */

/** What has been typed per product id, as text */
export type CountTexts = Record<string, string>

export interface CountLine {
  product: Product
  counted: number
  /** counted - current stock */
  difference: number
  /** The difference valued at the product's cost; null with no cost */
  value: number | null
}

export interface CountSummary {
  /** Only the products with something typed in; empty fields are left out */
  lines: CountLine[]
  /** Product ids whose field holds something that is not a quantity */
  invalid: number[]
  /** Lines whose difference is not 0 */
  changed: CountLine[]
  /** The net difference per unit, as units cannot be added together */
  byUnit: { unit: StockUnit; difference: number }[]
  /** Net value of the differences of the products with a cost */
  value: number
  /** Changed lines with no cost, which do not add to the value */
  unvalued: number
}

export function countSummary(products: Product[], texts: CountTexts): CountSummary {
  const lines: CountLine[] = []
  const invalid: number[] = []
  for (const product of products) {
    const text = texts[String(product.id)] ?? ''
    if (text.trim() === '') continue
    const counted = parseQuantity(text)
    if (counted === null) {
      invalid.push(product.id)
      continue
    }
    const difference = subtractQuantities(counted, product.currentStock)
    lines.push({ product, counted, difference, value: quantityValue(difference, product.unitCost) })
  }
  const changed = lines.filter((l) => toMilli(l.difference) !== 0)
  const byUnit = new Map<StockUnit, number>()
  for (const l of changed) byUnit.set(l.product.unit, (byUnit.get(l.product.unit) ?? 0) + toMilli(l.difference))
  return {
    lines,
    invalid,
    changed,
    byUnit: [...byUnit].filter(([, milli]) => milli !== 0).map(([unit, milli]) => ({ unit, difference: fromMilli(milli) })),
    value: fromCents(changed.reduce((sum, l) => sum + toCents(l.value ?? 0), 0)),
    unvalued: changed.filter((l) => l.value === null).length,
  }
}

/** The count being typed, kept in this tab so a slip of the finger does not lose it */
export interface CountDraft {
  date: string
  notes: string
  counts: CountTexts
}

const countDraftKey = (venueId: number) => `khronos.stockCount.${venueId}`

export function isEmptyCountDraft(draft: CountDraft): boolean {
  return draft.notes.trim() === '' && Object.values(draft.counts).every((text) => text.trim() === '')
}

/** The stored draft, or null when there is none or it cannot be read */
export function loadCountDraft(venueId: number): CountDraft | null {
  try {
    const raw = sessionStorage.getItem(countDraftKey(venueId))
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    const { date, notes, counts } = data as Record<string, unknown>
    if (typeof date !== 'string' || typeof notes !== 'string' || !counts || typeof counts !== 'object') return null
    const texts: CountTexts = {}
    for (const [id, text] of Object.entries(counts)) if (typeof text === 'string') texts[id] = text
    const draft = { date, notes, counts: texts }
    return isEmptyCountDraft(draft) ? null : draft
  } catch {
    return null
  }
}

/** Stores the draft; an empty one is removed. Storage that is full or blocked is ignored. */
export function saveCountDraft(venueId: number, draft: CountDraft) {
  try {
    if (isEmptyCountDraft(draft)) sessionStorage.removeItem(countDraftKey(venueId))
    else sessionStorage.setItem(countDraftKey(venueId), JSON.stringify(draft))
  } catch {
    // Not kept across a reload, which only matters if the page is left by mistake
  }
}

export function clearCountDraft(venueId: number) {
  try {
    sessionStorage.removeItem(countDraftKey(venueId))
  } catch {
    // Nothing to clear
  }
}

/* ---------- Purchase orders ---------- */

/** Up to a sensible amount to buy: whole bottles, units, boxes and kegs; half kilos and litres */
export function roundUpQuantity(quantity: number, unit: StockUnit): number {
  const step = WHOLE_UNITS.includes(unit) ? 1000 : 500
  return fromMilli(Math.ceil(toMilli(quantity) / step) * step)
}

/** What it takes to get back to the minimum, rounded up, and at least 1 */
export function suggestedQuantity(product: Pick<Product, 'minStock' | 'currentStock' | 'unit'>): number {
  const missing = subtractQuantities(product.minStock ?? 0, product.currentStock)
  return Math.max(1, roundUpQuantity(missing, product.unit))
}

/** The supplier's active products at or under their minimum, with the quantity that brings them back to it */
export function proposeOrderLines(products: Product[], supplierId: number): PurchaseOrderLineInput[] {
  return groupByCategory(products.filter((p) => p.isActive && p.isLowStock && p.supplierId === supplierId))
    .flatMap((g) => g.products)
    .map((p) => ({ productId: p.id, quantity: suggestedQuantity(p), unitCost: p.unitCost }))
}

/** The order's total and how many lines leave it out; null when no line has a cost */
export function orderTotal(lines: { quantity: number | null; unitCost: number | null }[]): {
  total: number | null
  withoutCost: number
} {
  const valued = lines.map((l) => (l.quantity === null ? null : quantityValue(l.quantity, l.unitCost)))
  const known = valued.filter((v): v is number => v !== null)
  return {
    total: known.length ? fromCents(known.reduce((sum, v) => sum + toCents(v), 0)) : null,
    withoutCost: valued.length - known.length,
  }
}
