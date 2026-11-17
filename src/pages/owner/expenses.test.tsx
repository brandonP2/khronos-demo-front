import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Expense } from '../../api/types'
import { json, noContent, ownerApi, plain, renderApp, type Call, type Route } from '../../test/helpers'

function expense(id: number, patch: Partial<Expense> = {}): Expense {
  return {
    id,
    establishmentId: 1,
    date: '2026-11-12',
    category: 'SUPPLIES',
    description: 'Pedido de bebidas',
    supplier: 'Distribuciones Sur',
    amount: 120.4,
    paymentMethod: 'TRANSFER',
    notes: null,
    createdAt: '2026-11-12T10:00:00Z',
    createdByName: 'Ana Gil',
    ...patch,
  }
}

const all = [
  expense(3, { date: '2026-11-14', description: 'Hielo', supplier: null, amount: 25.5, paymentMethod: 'CASH' }),
  expense(2, { date: '2026-11-13', category: 'UTILITIES', description: 'Luz de octubre', supplier: 'Eléctrica', amount: 310 }),
  expense(1),
]

/** Answers the list with the category filter the API would apply; `extra` answers first */
function expensesApi(extra: Route = () => undefined) {
  return ownerApi(async (call: Call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.method === 'GET' && call.path.startsWith('/expenses/establishment/1?')) {
      const category = new URLSearchParams(call.path.split('?')[1]).get('category')
      return json(200, category ? all.filter((e) => e.category === category) : all)
    }
  })
}

const total = () =>
  [...document.querySelectorAll('.expenses-total h2, .expenses-total .figure, .expenses-total .muted')].map((e) => plain(e.textContent)).join(' ')

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('expenses', () => {
  it('lists the period newest first, filters by category and adds up the filter', async () => {
    const calls = expensesApi()
    renderApp('/expenses?from=2026-11-09&to=2026-11-15')
    expect(await screen.findByText('Hielo')).toBeTruthy()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByText(/Hielo|Luz|Pedido/).textContent)).toEqual(['Hielo', 'Luz de octubre', 'Pedido de bebidas'])
    expect(total()).toBe('Total 455,90 € 3 gastos · 25,50 € en efectivo')
    expect(calls.some((c) => c.path === '/expenses/establishment/1?from=2026-11-09&to=2026-11-15')).toBe(true)

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'UTILITIES' } })
    await waitFor(() => expect(total()).toBe('Total 310,00 € 1 gasto'))
    expect(calls.some((c) => c.path === '/expenses/establishment/1?from=2026-11-09&to=2026-11-15&category=UTILITIES')).toBe(true)
    expect(screen.queryByText('Hielo')).toBeNull()

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'MARKETING' } })
    expect(await screen.findByText('No hay gastos de esta categoría en este periodo')).toBeTruthy()
  })

  it('adds an expense typed with a comma, and says so', async () => {
    const calls = expensesApi((call) => (call.method === 'POST' && call.path === '/expenses' ? json(201, expense(9)) : undefined))
    renderApp('/expenses')
    await screen.findByText('Hielo')
    fireEvent.click(screen.getByRole('button', { name: 'Añadir gasto' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir gasto' })
    const add = within(dialog).getByRole('button', { name: 'Añadir gasto' })

    fireEvent.click(add)
    expect(within(dialog).getByText('Escribe un importe mayor que 0, como 45,90')).toBeTruthy()
    expect(within(dialog).getByText('Escribe una descripción de hasta 150 caracteres')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Importe'), { target: { value: '45,9' } })
    fireEvent.change(within(dialog).getByLabelText('Medio de pago'), { target: { value: 'CASH' } })
    fireEvent.change(within(dialog).getByLabelText('Descripción'), { target: { value: ' Fruta  ' } })
    fireEvent.change(within(dialog).getByLabelText('Categoría'), { target: { value: 'SUPPLIES' } })
    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '2026-11-14' } })
    fireEvent.click(add)

    expect(await screen.findByText('Gasto añadido')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      date: '2026-11-14',
      category: 'SUPPLIES',
      description: 'Fruta',
      supplier: null,
      amount: 45.9,
      paymentMethod: 'CASH',
      notes: null,
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('explains that a cash expense of a closed day needs that day’s till reopened, with a link to it', async () => {
    expensesApi((call) =>
      call.method === 'PUT' && call.path === '/expenses/3'
        ? json(409, { status: 409, message: 'The cash closing of 2026-11-14 is closed; reopen it to add, change or delete cash expenses of that day' })
        : undefined,
    )
    renderApp('/expenses')
    fireEvent.click(await screen.findByRole('button', { name: 'Editar «Hielo»' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar gasto' })
    expect((within(dialog).getByLabelText('Importe') as HTMLInputElement).value).toBe('25,50')
    fireEvent.change(within(dialog).getByLabelText('Importe'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(
      await within(dialog).findByText(/La caja del sábado, 14 de noviembre está cerrada, así que sus gastos en efectivo no se pueden cambiar/),
    ).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Ir a la caja del 14 nov' }).getAttribute('href')).toBe('/cash?date=2026-11-14')
  })

  it('links the day the API gives in its details for CASH_DAY_CLOSED', async () => {
    expensesApi((call) =>
      call.method === 'PUT' && call.path === '/expenses/3'
        ? json(409, { status: 409, message: 'That till is closed', code: 'CASH_DAY_CLOSED', details: { date: '2026-11-13' } })
        : undefined,
    )
    renderApp('/expenses')
    fireEvent.click(await screen.findByRole('button', { name: 'Editar «Hielo»' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar gasto' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByText(/La caja del viernes, 13 de noviembre está cerrada/)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Ir a la caja del 13 nov' }).getAttribute('href')).toBe('/cash?date=2026-11-13')
  })

  it('deletes after confirming, and explains a closed day there too', async () => {
    let refuse = true
    const calls = expensesApi((call) => {
      if (call.method === 'DELETE' && call.path === '/expenses/3') {
        return refuse ? json(409, { status: 409, message: 'The cash closing of 2026-11-14 is closed; reopen it to add, change or delete cash expenses of that day' }) : noContent()
      }
    })
    renderApp('/expenses')
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar «Hielo»' }))
    const dialog = screen.getByRole('dialog', { name: 'Eliminar este gasto' })
    expect(plain(dialog.textContent)).toContain('«Hielo», 25,50 €. No se puede deshacer.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar gasto' }))
    expect(await within(dialog).findByText(/La caja del sábado, 14 de noviembre está cerrada/)).toBeTruthy()

    refuse = false
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar gasto' }))
    expect(await screen.findByText('Gasto eliminado')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2)
  })

  it.each([
    ['by its message', { message: 'The expense date cannot be in the future' }],
    ['by its code', { message: 'Too early', code: 'FUTURE_DATE' }],
  ])('shows any other 409 as it is, worded in Spanish when the app knows it (%s)', async (_, refusal) => {
    expensesApi((call) => (call.method === 'PUT' && call.path === '/expenses/3' ? json(409, { status: 409, ...refusal }) : undefined))
    renderApp('/expenses')
    fireEvent.click(await screen.findByRole('button', { name: 'Editar «Hielo»' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar gasto' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByText('No puede ser un día que aún no ha llegado.')).toBeTruthy()
    expect(within(dialog).queryByRole('link')).toBeNull()
  })

  it('asks for the day when the date is left empty, and refuses a future one', async () => {
    const calls = expensesApi()
    renderApp('/expenses')
    await screen.findByText('Hielo')
    fireEvent.click(screen.getByRole('button', { name: 'Añadir gasto' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir gasto' })
    fireEvent.change(within(dialog).getByLabelText('Importe'), { target: { value: '12' } })
    fireEvent.change(within(dialog).getByLabelText('Descripción'), { target: { value: 'Hielo' } })
    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir gasto' }))
    expect(within(dialog).getByText('Elige el día del gasto')).toBeTruthy()
    expect(within(dialog).queryByText('No puede ser un día futuro')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: '2999-01-01' } })
    expect(within(dialog).getByText('No puede ser un día futuro')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('never asks for more than 366 days, the most the API lists', async () => {
    const calls = expensesApi()
    renderApp('/expenses?from=2025-11-16&to=2026-11-16')
    expect(await screen.findByText('Hielo')).toBeTruthy()
    // 366 days counting both ends: asked for
    expect(calls.some((c) => c.path === '/expenses/establishment/1?from=2025-11-16&to=2026-11-16')).toBe(true)

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-11-15' } })
    expect(screen.getByText('Elige un periodo de 366 días como máximo')).toBeTruthy()
    expect(calls.some((c) => c.path.startsWith('/expenses/establishment/1?from=2025-11-15'))).toBe(false)
    // Every list asks with both dates
    expect(calls.filter((c) => c.path.startsWith('/expenses/')).every((c) => /\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d/.test(c.path))).toBe(true)
  })

  it('opens the new expense straight away from a link', async () => {
    expensesApi()
    renderApp('/expenses?new=1')
    expect(await screen.findByRole('dialog', { name: 'Añadir gasto' })).toBeTruthy()
  })

  it('offers to add the first expense when there are none', async () => {
    ownerApi((call) => (call.path.startsWith('/expenses/establishment/1?') ? json(200, []) : undefined))
    renderApp('/expenses')
    expect(await screen.findByText('No hay gastos en este periodo')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Añadir gasto' })[1])
    expect(screen.getByRole('dialog', { name: 'Añadir gasto' })).toBeTruthy()
  })
})

describe('an expense from a received order', () => {
  const fromOrder = expense(4, {
    date: '2026-11-14',
    description: 'Pedido #12',
    supplier: 'Distribuciones Sur',
    amount: 58,
    paymentMethod: 'TRANSFER',
    purchaseOrderId: 12,
  })

  it('says which order it came from, cannot be edited, and can be deleted', async () => {
    const calls = ownerApi((call) => {
      if (call.method === 'GET' && call.path.startsWith('/expenses/establishment/1?')) return json(200, [fromOrder, ...all])
      if (call.method === 'DELETE' && call.path === '/expenses/4') return noContent()
    })
    renderApp('/expenses?from=2026-11-09&to=2026-11-15')
    expect(await screen.findByRole('link', { name: 'Del pedido #12' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Del pedido #12' }).getAttribute('href')).toBe('/inventory/orders/12')
    const edit = screen.getByRole('button', { name: 'Editar «Pedido #12»' }) as HTMLButtonElement
    expect(edit.disabled).toBe(true)
    expect(plain(document.getElementById(edit.getAttribute('aria-describedby')!)!.textContent)).toBe(
      'Del pedido #12 · No se puede editar: para corregirlo, bórralo y anótalo de nuevo',
    )
    // The others are edited as always
    expect((screen.getByRole('button', { name: 'Editar «Hielo»' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar «Pedido #12»' }))
    const dialog = screen.getByRole('dialog', { name: 'Eliminar este gasto' })
    expect(dialog.textContent).toMatch(/El pedido #12 sigue recibido y conserva su entrada de stock/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar gasto' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/expenses/4')).toBe(true))
  })

  it('words the API refusing to edit it', async () => {
    ownerApi((call) => {
      if (call.method === 'GET' && call.path.startsWith('/expenses/establishment/1?')) return json(200, [{ ...fromOrder, purchaseOrderId: undefined }])
      if (call.method === 'PUT' && call.path === '/expenses/4') {
        return json(409, {
          status: 409,
          code: 'EXPENSE_FROM_PURCHASE_ORDER',
          details: { purchaseOrderId: '12' },
          message: 'This expense was created when purchase order #12 was received and cannot be edited; to correct it, delete it and enter it again',
        })
      }
    })
    renderApp('/expenses?from=2026-11-09&to=2026-11-15')
    // An API that does not say where it came from yet: the 409 still explains it
    fireEvent.click(await screen.findByRole('button', { name: 'Editar «Pedido #12»' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(
      await within(dialog).findByText('Este gasto se creó al recibir el pedido #12 y no se puede editar. Para corregirlo, bórralo y anótalo de nuevo.'),
    ).toBeTruthy()
  })
})
