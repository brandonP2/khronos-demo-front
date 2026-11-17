import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { CashClosing, CashClosingChange, CashClosingInput, Expense, SummaryDay } from '../../api/types'
import { cashFigures } from '../../lib/cash'
import { json, noContent, ownerApi, plain, renderApp, type Call } from '../../test/helpers'

/** A Monday in the past, so it can always be closed */
const DAY = '2026-11-16'
const CASH_EXPENSES = 45

const cashExpense: Expense = {
  id: 1,
  establishmentId: 1,
  date: DAY,
  category: 'SUPPLIES',
  description: 'Hielo',
  supplier: null,
  amount: CASH_EXPENSES,
  paymentMethod: 'CASH',
  notes: null,
  createdAt: '2026-11-16T10:00:00Z',
  createdByName: 'Ana Gil',
}
const cardExpense: Expense = { ...cashExpense, id: 2, description: 'Bebidas', amount: 100, paymentMethod: 'CARD' }

const baseInput: CashClosingInput = {
  establishmentId: 1,
  businessDate: DAY,
  openingFloat: 100,
  cashSales: 1234.5,
  cardSales: 200.5,
  otherSales: 0,
  cashWithdrawals: 0,
  countedCash: 1280.5,
  tips: null,
  notes: null,
}

/** What the API would answer for a stored closing, its figures worked out the same way */
function closingFrom(input: CashClosingInput, patch: Partial<CashClosing> = {}): CashClosing {
  const figures = cashFigures({ ...input, cashExpenses: CASH_EXPENSES })
  return {
    ...input,
    id: 77,
    status: 'DRAFT',
    cashExpenses: CASH_EXPENSES,
    totalSales: figures.totalSales,
    expectedCash: figures.expectedCash,
    difference: figures.difference ?? 0,
    differenceReason: null,
    closedAt: null,
    closedByName: null,
    createdAt: '2026-11-16T22:00:00Z',
    updatedAt: '2026-11-16T22:00:00Z',
    ...patch,
  }
}

const history: CashClosingChange[] = [
  { id: 1, action: 'CREATED', changedAt: '2026-11-16T22:00:00Z', changedByUserId: 2, changedByName: 'Ana Gil', reason: null, totalSales: 1435, countedCash: 1280.5, difference: -9 },
  { id: 2, action: 'CLOSED', changedAt: '2026-11-16T22:30:00Z', changedByUserId: 2, changedByName: 'Ana Gil', reason: 'Billete roto', totalSales: 1435, countedCash: 1280.5, difference: -9 },
]

interface Hooks {
  create?: (call: Call) => Response | undefined
  close?: (call: Call) => Response | undefined
  list?: CashClosing[]
  days?: SummaryDay[]
}

/** A fake API that keeps one closing for DAY, and the owner's usual calls */
function cashServer(initial: CashClosing | null, hooks: Hooks = {}) {
  let stored = initial
  let saves = 0
  const calls = ownerApi((call) => {
    const { method, path } = call
    const body = call.body as Record<string, unknown>
    if (method === 'GET' && path === `/cash-closings/establishment/1?from=${DAY}&to=${DAY}`) return json(200, stored ? [stored] : [])
    if (method === 'GET' && path.startsWith('/cash-closings/establishment/1?')) return json(200, hooks.list ?? (stored ? [stored] : []))
    if (method === 'GET' && path === `/expenses/establishment/1?from=${DAY}&to=${DAY}`) return json(200, [cashExpense, cardExpense])
    if (method === 'GET' && path.startsWith('/expenses/establishment/1?')) return json(200, [])
    if (method === 'GET' && path.startsWith('/reports/establishment/1/summary?')) {
      return json(200, { days: hooks.days ?? [], totals: {}, expensesByCategory: [], previous: {} })
    }
    if (method === 'POST' && path === '/cash-closings') {
      const refused = hooks.create?.(call)
      if (refused) return refused
      stored = closingFrom(body as unknown as CashClosingInput)
      return json(201, stored)
    }
    if (method === 'PUT' && path === '/cash-closings/77') {
      stored = closingFrom(body as unknown as CashClosingInput, { updatedAt: `2026-11-16T22:0${++saves}:00Z` })
      return json(200, stored)
    }
    if (method === 'PUT' && path === '/cash-closings/77/close') {
      const refused = hooks.close?.(call)
      if (refused) return refused
      stored = { ...stored!, status: 'CLOSED', differenceReason: (body.differenceReason as string) ?? null, closedAt: '2026-11-16T22:30:00Z', closedByName: 'Ana Gil' }
      return json(200, stored)
    }
    if (method === 'PUT' && path === '/cash-closings/77/reopen') {
      stored = { ...stored!, status: 'DRAFT', closedAt: null, closedByName: null }
      return json(200, stored)
    }
    if (method === 'GET' && path === '/cash-closings/77/history') return json(200, history)
    if (method === 'DELETE' && path === '/cash-closings/77') {
      stored = null
      return noContent()
    }
  })
  return calls
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })

/** A figure of the live panel by the start of its label */
function figure(label: string): string {
  const rows = [...document.querySelectorAll('.cash-figure')]
  const row = rows.find((r) => r.querySelector('dt')!.textContent!.startsWith(label))
  if (!row) throw new Error(`No figure ${label}`)
  return plain(row.querySelector('dd')!.textContent)
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET')

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cash closing form', () => {
  it('works out sales, expected cash and the difference while amounts are typed, commas and empty fields included', async () => {
    cashServer(null)
    renderApp(`/cash?date=${DAY}`)
    expect(await screen.findByRole('heading', { name: 'Cierre de caja del Lunes, 16 de noviembre' })).toBeTruthy()
    type('Ventas en efectivo', '1.234,50')
    type('Ventas con tarjeta', '200,5')
    type('Fondo de caja inicial', '100')

    expect(figure('Total de ventas')).toBe('1.435,00 €')
    // Only the cash expense of the day counts, not the one paid by card
    expect(figure('Gastos en efectivo del día')).toBe('−45,00 €')
    expect(figure('Efectivo esperado')).toBe('1.289,50 €')
    expect(figure('Descuadre')).toBe('Escribe el efectivo contado para ver el descuadre')

    type('Efectivo contado', '1290')
    expect(figure('Descuadre')).toBe('+0,50 € Sobra dinero')
    expect(screen.queryByLabelText('Motivo del descuadre')).toBeNull()

    type('Efectivo contado', '1289.50')
    expect(figure('Descuadre')).toBe('0,00 € Cuadra')

    type('Efectivo contado', '1280,5')
    expect(figure('Descuadre')).toBe('−9,00 € Falta dinero')
    expect(field('Motivo del descuadre')).toBeTruthy()

    // Shown back in the local format once the field is left
    fireEvent.blur(field('Ventas con tarjeta'))
    expect(field('Ventas con tarjeta').value).toBe('200,50')

    type('Otros medios', 'doce')
    fireEvent.blur(field('Otros medios'))
    expect(screen.getByText('Escribe un importe, como 1.234,50')).toBeTruthy()
    expect(figure('Total de ventas')).toBe('1.435,00 €')
  })

  it('asks for the reason of a difference over 5,00 € before closing, then saves and closes', async () => {
    const calls = cashServer(null)
    renderApp(`/cash?date=${DAY}`)
    await screen.findByLabelText('Ventas en efectivo')
    type('Ventas en efectivo', '1.234,50')
    type('Ventas con tarjeta', '200,5')
    type('Fondo de caja inicial', '100')
    type('Efectivo contado', '1280,5')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
    expect(screen.getByText('Explica el descuadre para poder cerrar la caja')).toBeTruthy()
    expect(writes(calls)).toHaveLength(0)

    type('Motivo del descuadre', 'Billete roto')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))

    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeTruthy()
    const [create, close] = writes(calls)
    expect(create).toMatchObject({ method: 'POST', path: '/cash-closings' })
    expect(create.body).toEqual(baseInput)
    expect(close).toMatchObject({ method: 'PUT', path: '/cash-closings/77/close', body: { differenceReason: 'Billete roto' } })
    expect(screen.getByText('Cerrado', { selector: '.card-head .tag' })).toBeTruthy()
    expect(screen.getByText('Caja del Lunes, 16 de noviembre cerrada')).toBeTruthy()
  })

  it('brings up the reason when the API asks for one below 5,00 €', async () => {
    const calls = cashServer(closingFrom({ ...baseInput, countedCash: 1286.5 }), {
      close: (call) =>
        (call.body as { differenceReason?: string }).differenceReason
          ? undefined
          : json(409, { status: 409, message: 'A reason is required for a difference of more than 2.00' }),
    })
    renderApp(`/cash?date=${DAY}`)
    await screen.findByLabelText('Ventas en efectivo')
    expect(figure('Descuadre')).toBe('−3,00 € Falta dinero')
    expect(screen.queryByLabelText('Motivo del descuadre')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
    expect(await screen.findByText('Con este descuadre hace falta un motivo para cerrar. Escríbelo y vuelve a cerrar.')).toBeTruthy()
    type('Motivo del descuadre', 'Cambio mal dado')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeTruthy()
    // Nothing changed in the draft, so it was only closed, twice asked
    expect(writes(calls).map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /cash-closings/77/close', 'PUT /cash-closings/77/close'])
    expect(writes(calls)[1].body).toEqual({ differenceReason: 'Cambio mal dado' })
  })

  it('needs the counted cash to close', async () => {
    const calls = cashServer(null)
    renderApp(`/cash?date=${DAY}`)
    await screen.findByLabelText('Ventas en efectivo')
    type('Ventas en efectivo', '300')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
    expect(screen.getByText('Escribe el efectivo contado para poder cerrar la caja')).toBeTruthy()
    expect(writes(calls)).toHaveLength(0)
  })

  it('saves a draft only when something changed', async () => {
    const calls = cashServer(closingFrom(baseInput))
    renderApp(`/cash?date=${DAY}`)
    await screen.findByLabelText('Ventas en efectivo')
    expect(screen.getByText('Borrador', { selector: '.card-head .tag' })).toBeTruthy()
    // The stored amounts, in the local format
    expect(field('Ventas en efectivo').value).toBe('1.234,50')
    expect(field('Propinas').value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Borrador guardado')).toBeTruthy()
    expect(writes(calls)).toHaveLength(0)

    type('Ventas con tarjeta', '250')
    type('Propinas', '12,40')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    expect(writes(calls)[0]).toMatchObject({ method: 'PUT', path: '/cash-closings/77', body: { ...baseInput, cardSales: 250, tips: 12.4 } })
  })

  it('loads the closing someone else saved for the day, instead of creating a second one', async () => {
    const existing = closingFrom({ ...baseInput, cashSales: 999 })
    let created = false
    cashServer(null, {
      create: () => {
        created = true
        return json(409, { status: 409, message: 'A cash closing already exists for this day' })
      },
    })
    // After the 409 the day's closing is there
    const fetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const original = fetch.getMockImplementation() as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      created && String(input).endsWith(`/cash-closings/establishment/1?from=${DAY}&to=${DAY}`)
        ? json(200, [existing])
        : original(input, init),
    )
    renderApp(`/cash?date=${DAY}`)
    await screen.findByLabelText('Ventas en efectivo')
    type('Ventas en efectivo', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText(/Ya había un cierre para este día y se ha cargado/)).toBeTruthy()
    await waitFor(() => expect(field('Ventas en efectivo').value).toBe('999,00'))
  })
})

describe('a closed day', () => {
  const closed = closingFrom(baseInput, {
    status: 'CLOSED',
    differenceReason: 'Billete roto',
    closedAt: '2026-11-16T22:30:00Z',
    closedByName: 'Ana Gil',
  })

  it('is read only, and reopens only with a reason', async () => {
    const calls = cashServer(closed)
    renderApp(`/cash?date=${DAY}`)
    expect(await screen.findByText('Cerrada el 16 nov 23:30 por Ana Gil')).toBeTruthy()
    expect(screen.queryByLabelText('Ventas en efectivo')).toBeNull()
    expect(screen.getByText('«Billete roto»')).toBeTruthy()
    expect(figure('Descuadre')).toBe('−9,00 € Falta dinero')

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Reabrir el cierre del Lunes, 16 de noviembre' })
    const submit = within(dialog).getByRole('button', { name: 'Reabrir' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Faltaba un ticket' } })
    fireEvent.click(submit)

    expect(await screen.findByLabelText('Ventas en efectivo')).toBeTruthy()
    expect(writes(calls)).toEqual([expect.objectContaining({ method: 'PUT', path: '/cash-closings/77/reopen', body: { reason: 'Faltaba un ticket' } })])
    expect(screen.getByText('Borrador', { selector: '.card-head .tag' })).toBeTruthy()
    expect(field('Ventas en efectivo').value).toBe('1.234,50')
  })

  it('shows its history, with who did what and why', async () => {
    cashServer(closed)
    renderApp(`/cash?date=${DAY}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Historial' }))
    const dialog = await screen.findByRole('dialog', { name: 'Historial del cierre' })
    expect(await within(dialog).findByText('Creado')).toBeTruthy()
    expect(within(dialog).getByText('Cerrado')).toBeTruthy()
    expect(within(dialog).getByText('«Billete roto»')).toBeTruthy()
    expect(within(dialog).getAllByText(/Ventas 1\.435,00 € · Contado 1\.280,50 € · Descuadre −9,00 €/)).toHaveLength(2)
  })
})

describe('closings of the period', () => {
  it('lists closings with their status, and the days with activity and no closing', async () => {
    const draft = closingFrom(baseInput)
    const closedDay = closingFrom({ ...baseInput, businessDate: '2026-11-14', countedCash: 1289.5 }, { id: 70, status: 'CLOSED' })
    const missing = (date: string): SummaryDay => ({ date, sales: 0, expenses: 0, laborCost: 0, margin: 0, closingStatus: 'MISSING', cashDifference: null })
    cashServer(draft, { list: [draft, closedDay], days: [missing('2026-11-13'), missing('2026-11-15')] })
    renderApp(`/cash?date=${DAY}`)

    const list = (await screen.findAllByText('Sin cierre', { selector: '.tag' }))[0].closest('ul') as HTMLElement
    const rows = within(list).getAllByRole('listitem').map((li) => plain(li.textContent).replace(/ /g, ''))
    expect(rows).toEqual([
      'lun, 16 nov Borrador Ventas: 1.435,00 € Descuadre: −9,00 € Falta dinero Abrir',
      'dom, 15 nov Sin cierre Hacer el cierre',
      'sáb, 14 nov Cerrado Ventas: 1.435,00 € Descuadre: 0,00 € Cuadra Abrir',
      'vie, 13 nov Sin cierre Hacer el cierre',
    ].map((r) => r.replace(/ /g, '')))

    fireEvent.click(within(list).getByRole('button', { name: 'Abrir el cierre del Domingo, 15 de noviembre' }))
    expect(await screen.findByRole('heading', { name: 'Cierre de caja del Domingo, 15 de noviembre' })).toBeTruthy()
  })
})
