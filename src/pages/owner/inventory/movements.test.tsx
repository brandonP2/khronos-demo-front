import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { movement, product } from '../../../test/inventory'
import { json, ownerApi, plain, renderApp, type Route } from '../../../test/helpers'

const list = [
  movement(9, {
    productId: 1,
    productName: 'Ginebra Puerto',
    type: 'WASTE',
    quantity: -1,
    unitCost: 12.5,
    value: 12.5,
    reason: 'Rotura',
    date: '2026-11-15',
    createdAt: '2026-11-15T22:40:00Z',
    stockAfter: 3.5,
  }),
  movement(8, {
    productId: 1,
    productName: 'Ginebra Puerto',
    type: 'PURCHASE',
    quantity: 6,
    unitCost: 12.5,
    value: 75,
    date: '2026-11-14',
    createdAt: '2026-11-14T09:05:00Z',
    purchaseOrderId: 12,
    stockAfter: 4.5,
  }),
  movement(7, { productId: 3, productName: 'Café en grano', unit: 'KG', type: 'COUNT', quantity: 0.25, date: '2026-11-13', stockAfter: 2.25 }),
]

function movementsApi(extra: Route = () => undefined) {
  return ownerApi(async (call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.path.startsWith('/products/establishment/1?')) {
      return json(200, [product(1, { name: 'Ginebra Puerto' }), product(3, { name: 'Café en grano', isActive: false })])
    }
    if (call.path.startsWith('/stock-movements/establishment/1?')) {
      const type = new URLSearchParams(call.path.split('?')[1]).get('type')
      return json(200, type ? list.filter((m) => m.type === type) : list)
    }
  })
}

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('stock movements', () => {
  it('lists signed quantities, values, reasons, who and when, the stock left and the order it came from', async () => {
    const calls = movementsApi()
    renderApp('/inventory/movements')
    expect(await screen.findByText('Rotura')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Movimientos' }).getAttribute('aria-current')).toBe('page')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const waste = plain(rows[0].textContent)
    expect(waste).toContain('Merma')
    expect(waste).toContain('−1 botella')
    expect(waste).toContain('12,50 €')
    expect(waste).toContain('Ana Gil · 15 nov 23:40')
    expect(waste).toContain('3,5 botellas')
    expect(within(rows[1]).getByText('+6 botellas')).toBeTruthy()
    expect(within(rows[1]).getByRole('link', { name: 'Pedido #12' }).getAttribute('href')).toBe('/inventory/orders/12')
    expect(within(rows[2]).getByText('+0,25 kg')).toBeTruthy()
    expect(within(rows[2]).getByText('Recuento')).toBeTruthy()
    // No editing or deleting: corrections are adjustments
    expect(screen.getByText(/Los movimientos no se editan ni se borran/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Editar|Eliminar|Borrar/ })).toBeNull()
    expect(calls.some((c) => /^\/stock-movements\/establishment\/1\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/.test(c.path))).toBe(true)
    // Inactive products keep their history and can be picked
    expect(within(screen.getByLabelText('Producto')).getByRole('option', { name: 'Café en grano (inactivo)' })).toBeTruthy()
  })

  it('filters by type and by the product a link asks for', async () => {
    const calls = movementsApi()
    renderApp('/inventory/movements?productId=1')
    await screen.findByText('Rotura')
    expect((screen.getByLabelText('Producto') as HTMLSelectElement).value).toBe('1')
    expect(calls.some((c) => c.path.startsWith('/stock-movements/establishment/1?') && c.path.endsWith('&productId=1'))).toBe(true)

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'WASTE' } })
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    expect(calls.some((c) => c.path.endsWith('&productId=1&type=WASTE'))).toBe(true)

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ADJUSTMENT' } })
    expect(await screen.findByText('No hay movimientos con estos filtros')).toBeTruthy()
  })

  it('downloads the period’s movements as CSV', async () => {
    const calls = movementsApi((call) =>
      call.path.startsWith('/reports/establishment/1/stock-movements.csv?')
        ? new Response('fecha;producto', { status: 200, headers: { 'Content-Type': 'text/csv' } })
        : undefined,
    )
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    try {
      renderApp('/inventory/movements')
      fireEvent.click(await screen.findByRole('button', { name: 'Exportar movimientos (CSV)' }))
      await waitFor(() => expect(saved).toHaveLength(1))
      expect(saved[0]).toMatch(/^movimientos-de-stock_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/)
      expect(calls.find((c) => c.path.includes('stock-movements.csv'))!.path).toMatch(/\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/)
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })
})
