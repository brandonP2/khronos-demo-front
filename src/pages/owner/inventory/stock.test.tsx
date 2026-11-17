import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Product } from '../../../api/types'
import { inventoryReport, movement, product, supplier } from '../../../test/inventory'
import { json, noContent, ownerApi, plain, renderApp, type Route } from '../../../test/helpers'
import { zonedToday } from '../../../lib/time'

const today = zonedToday('Europe/Madrid')

const gin = product(1, {
  name: 'Ginebra Puerto',
  currentStock: 4.5,
  minStock: 6,
  unitCost: 12.5,
  stockValue: 56.25,
  isLowStock: true,
  supplierId: 7,
  supplierName: 'Distribuciones Sur',
})
const rum = product(2, {
  name: 'Ron Brugal',
  currentStock: -2,
  minStock: 2,
  unitCost: 11,
  stockValue: 0,
  isLowStock: true,
  supplierId: 7,
  supplierName: 'Distribuciones Sur',
})
const coffee = product(3, {
  name: 'Café en grano',
  category: 'COFFEE',
  unit: 'KG',
  currentStock: 2.25,
  minStock: 1,
  unitCost: 15,
  stockValue: 33.75,
  supplierId: 8,
  supplierName: 'Cafés Lola',
})
const limes = product(4, { name: 'Limas', category: 'FOOD', unit: 'UNIT', currentStock: 0 })
const tonic = product(5, { name: 'Tónica', category: 'SOFT_DRINKS', unit: 'UNIT', isActive: false })
const all: Product[] = [gin, rum, coffee, limes, tonic]
const suppliers = [supplier(7, 'Distribuciones Sur'), supplier(8, 'Cafés Lola')]

const report = inventoryReport({
  stockValue: 90,
  productsCount: 4,
  lowStockCount: 2,
  negativeStockCount: 1,
  purchasesValue: 420.5,
  wasteValue: 37.5,
  countDifferenceValue: -18,
  wasteByProduct: [
    { productId: 1, productName: 'Ginebra Puerto', unit: 'BOTTLE', quantity: 2, value: 25 },
    { productId: 4, productName: 'Limas', unit: 'UNIT', quantity: 6, value: null },
  ],
  lowStock: [
    { productId: 1, productName: 'Ginebra Puerto', unit: 'BOTTLE', currentStock: 4.5, minStock: 6, supplierId: 7, supplierName: 'Distribuciones Sur' },
    { productId: 2, productName: 'Ron Brugal', unit: 'BOTTLE', currentStock: -2, minStock: 2, supplierId: 7, supplierName: 'Distribuciones Sur' },
    { productId: 9, productName: 'Hielo', unit: 'KG', currentStock: 1, minStock: 5, supplierId: null, supplierName: null },
  ],
})

/** The stock screen's API; `extra` answers first */
function stockApi(extra: Route = () => undefined) {
  return ownerApi(async (call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.method === 'GET' && call.path.startsWith('/products/establishment/1?')) {
      return json(200, call.path.endsWith('includeInactive=true') ? all : all.filter((p) => p.isActive))
    }
    if (call.path === '/suppliers/establishment/1') return json(200, suppliers)
    if (call.path.startsWith('/reports/establishment/1/inventory?')) return json(200, report)
  })
}

const row = (id: number) => screen.getByTestId(`product-${id}`)
const stat = (label: string) => screen.getByText(label, { selector: '.stat .label' }).closest('.stat') as HTMLElement

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('stock', () => {
  it('shows the report’s figures and the products by category, with units, costs and values', async () => {
    const calls = stockApi()
    renderApp('/inventory')
    expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeTruthy()
    await screen.findByTestId('product-1')
    expect(screen.getByRole('link', { name: 'Stock' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Inventario' }).className).toContain('active')

    expect(plain(stat('Valor del stock').textContent)).toContain('90,00 €')
    expect(plain(stat('Productos').textContent)).toContain('4')
    expect(plain(stat('Con stock bajo').textContent)).toContain('2')
    expect(plain(stat('Con stock negativo').textContent)).toContain('1')

    const groups = screen.getAllByRole('rowheader').map((h) => plain(h.textContent))
    expect(groups).toEqual(['Destilados · 2 productos', 'Café · 1 producto', 'Comida · 1 producto'])
    const ginRow = plain(row(1).textContent)
    expect(ginRow).toContain('Ginebra Puerto')
    expect(ginRow).toContain('Stock bajo')
    expect(ginRow).toContain('Distribuciones Sur')
    expect(within(row(1)).getByText('4,5 botellas')).toBeTruthy()
    expect(within(row(1)).getByText('6 botellas')).toBeTruthy()
    expect(plain(within(row(1)).getByText(/€\/botella/).textContent)).toBe('12,50 €/botella')
    expect(plain(within(row(1)).getByText(/56,25/).textContent)).toBe('56,25 €')
    expect(within(row(3)).getByText('2,25 kg')).toBeTruthy()
    // No minimum and no cost read as a dash
    expect(within(row(4)).getAllByText('—')).toHaveLength(3)
    expect(within(row(4)).getByText('0 unidades')).toBeTruthy()

    // Negative stock is marked in words and its likely cause explained
    expect(within(row(2)).getByText('Stock negativo')).toBeTruthy()
    expect(within(row(2)).getByText('−2 botellas')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/Suele indicar una compra sin anotar/)
    expect(screen.getByText(/no descuenta el stock con las ventas/)).toBeTruthy()
    // Inactive products stay out until asked for
    expect(screen.queryByText('Tónica')).toBeNull()
    expect(calls.some((c) => c.path === '/products/establishment/1?includeInactive=false')).toBe(true)
  })

  it('searches by name and filters to low stock or inactive products', async () => {
    const calls = stockApi()
    renderApp('/inventory')
    await screen.findByTestId('product-1')

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'cafe' } })
    expect(screen.queryByTestId('product-1')).toBeNull()
    expect(screen.getByTestId('product-3')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Stock bajo'))
    expect(screen.getAllByTestId(/^product-/).map((r) => r.dataset.testid)).toEqual(['product-1', 'product-2'])

    fireEvent.click(screen.getByLabelText('Stock bajo'))
    fireEvent.click(screen.getByLabelText('Incluir inactivos'))
    const tonicRow = await screen.findByTestId('product-5')
    expect(within(tonicRow).getByText('Inactivo')).toBeTruthy()
    expect(within(tonicRow).getByRole('button', { name: 'Activar Tónica' })).toBeTruthy()
    expect(within(tonicRow).queryByRole('button', { name: /Merma/ })).toBeNull()
    expect(calls.some((c) => c.path === '/products/establishment/1?includeInactive=true')).toBe(true)

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'whisky' } })
    expect(screen.getByText('Ningún producto coincide con la búsqueda')).toBeTruthy()
  })

  it('opens on low stock from a link, and offers to order it by supplier', async () => {
    stockApi()
    renderApp('/inventory?low=1')
    await screen.findByTestId('product-1')
    expect((screen.getByLabelText('Stock bajo') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByTestId('product-3')).toBeNull()

    const toOrder = screen.getByRole('heading', { name: 'Para pedir' }).closest('section') as HTMLElement
    expect(plain(toOrder.textContent)).toContain('Distribuciones Sur · 2 productos')
    expect(plain(toOrder.textContent)).toContain('1 producto sin proveedor habitual')
    expect(within(toOrder).getByRole('link', { name: 'Preparar pedido a Distribuciones Sur' }).getAttribute('href')).toBe(
      '/inventory/orders/new?supplierId=7&propose=1',
    )
  })

  it('reports the period’s purchases, waste and count differences', async () => {
    const calls = stockApi()
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    const block = screen.getByRole('heading', { name: 'Informe del periodo' }).closest('section') as HTMLElement
    expect(plain(within(block).getByText('Compras').closest('.stat')!.textContent)).toContain('420,50 €')
    expect(plain(within(block).getByText('Mermas').closest('.stat')!.textContent)).toContain('37,50 €')
    const counts = plain(within(block).getByText('Diferencia de recuentos').closest('.stat')!.textContent)
    expect(counts).toContain('−18,00 €')
    expect(counts).toContain('Faltó género')
    const waste = [...block.querySelectorAll('.category-row')].map((li) => plain(li.textContent))
    expect(waste).toEqual(['Ginebra Puerto25,00 €2 botellas', 'Limassin coste6 unidades'])

    fireEvent.click(within(block).getByRole('button', { name: 'Mes pasado' }))
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith('/reports/establishment/1/inventory?')).length).toBe(2))
  })

  it('downloads the stock as CSV', async () => {
    const calls = stockApi((call) =>
      call.path === '/reports/establishment/1/inventory.csv'
        ? new Response('producto;stock', { status: 200, headers: { 'Content-Type': 'text/csv' } })
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
      renderApp('/inventory')
      fireEvent.click(await screen.findByRole('button', { name: 'Exportar stock (CSV)' }))
      await waitFor(() => expect(saved).toEqual([`stock_${today}.csv`]))
      expect(calls.find((c) => c.path.endsWith('inventory.csv'))!.headers.Authorization).toBe('Bearer test-token')
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })

  it('offers to add the first product when there are none', async () => {
    ownerApi((call) => {
      if (call.path.startsWith('/products/establishment/1?')) return json(200, [])
      if (call.path === '/suppliers/establishment/1') return json(200, [])
      if (call.path.startsWith('/reports/establishment/1/inventory?')) return json(200, inventoryReport())
    })
    renderApp('/inventory')
    expect(await screen.findByText('Todavía no hay productos')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Añadir producto' })[1])
    expect(screen.getByRole('dialog', { name: 'Añadir producto' })).toBeTruthy()
  })
})

describe('quick movements', () => {
  it('records waste with a reason picked from the suggestions, and shows the new stock at once', async () => {
    let saved = false
    const calls = stockApi((call) => {
      if (call.method === 'POST' && call.path === '/stock-movements') {
        saved = true
        return json(201, movement(50, { productId: 1, productName: 'Ginebra Puerto', type: 'WASTE', quantity: -1, stockAfter: 3.5 }))
      }
      // After saving, the refetch never answers: what shows is what the API said after the movement
      if (saved && call.method === 'GET' && call.path.startsWith('/products/')) return new Promise<undefined>(() => {})
    })
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Merma de Ginebra Puerto' }))
    const dialog = screen.getByRole('dialog', { name: 'Merma de Ginebra Puerto' })

    fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '1' } })
    expect(plain(dialog.querySelector('.movement-preview')!.textContent)).toBe('Stock después 4,5 botellas → 3,5 botellas')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar merma' }))
    expect(within(dialog).getByText('Escribe el motivo: al menos 3 caracteres')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotura' }))
    expect((within(dialog).getByLabelText('Motivo') as HTMLInputElement).value).toBe('Rotura')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar merma' }))

    expect(await screen.findByText('Merma anotada. Ginebra Puerto: 3,5 botellas')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      productId: 1,
      type: 'WASTE',
      quantity: 1,
      unitCost: null,
      reason: 'Rotura',
      date: today,
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(row(1)).getByText('3,5 botellas')).toBeTruthy()
  })

  it('records stock in with an optional cost, and a quantity with a decimal comma', async () => {
    const calls = stockApi((call) =>
      call.method === 'POST' && call.path === '/stock-movements'
        ? json(201, movement(51, { productId: 3, unit: 'KG', type: 'PURCHASE', quantity: 2.5, unitCost: 16, stockAfter: 4.75 }))
        : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-3')
    fireEvent.click(within(row(3)).getByRole('button', { name: 'Entrada de Café en grano' }))
    const dialog = screen.getByRole('dialog', { name: 'Entrada de Café en grano' })
    expect(plain(within(dialog).getByText(/Ahora es/).textContent)).toContain('15,00 €/kg')
    expect(within(dialog).queryByLabelText('Motivo')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar entrada' }))
    expect(within(dialog).getByText('Escribe una cantidad mayor que 0, con 3 decimales como mucho')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '2,5' } })
    fireEvent.change(within(dialog).getByLabelText('Coste por unidad'), { target: { value: '16' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar entrada' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      productId: 3,
      type: 'PURCHASE',
      quantity: 2.5,
      unitCost: 16,
      reason: null,
      date: today,
    })
  })

  it('records usage without a reason, saying stock does not go down with sales on its own', async () => {
    const calls = stockApi((call) =>
      call.method === 'POST' && call.path === '/stock-movements' ? json(201, movement(52, { stockAfter: 4 })) : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Consumo de Ginebra Puerto' }))
    const dialog = screen.getByRole('dialog', { name: 'Consumo de Ginebra Puerto' })
    expect(within(dialog).getAllByText(/no hay TPV conectado/).length).toBeGreaterThan(0)
    fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '0,5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar consumo' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ type: 'CONSUMPTION', quantity: 0.5, reason: null })
  })

  it('sends an adjustment with its sign and a reason, and warns when the stock goes negative', async () => {
    const calls = stockApi((call) =>
      call.method === 'POST' && call.path === '/stock-movements' ? json(201, movement(53, { productId: 2, stockAfter: -3.5 })) : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-2')
    fireEvent.click(within(row(2)).getByRole('button', { name: 'Ajuste de Ron Brugal' }))
    const dialog = screen.getByRole('dialog', { name: 'Ajuste de Ron Brugal' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restar del stock' }))
    expect(within(dialog).getByRole('button', { name: 'Restar del stock' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '1.5' } })
    expect(plain(dialog.querySelector('.movement-preview')!.textContent)).toBe('Stock después −2 botellas → −3,5 botellas')
    expect(within(dialog).getByText(/El stock quedará en negativo/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar ajuste' }))
    expect(within(dialog).getByText('Escribe el motivo: al menos 3 caracteres')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Botella rota sin anotar' } })
    fireEvent.change(within(dialog).getByLabelText('Día'), { target: { value: '2999-01-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar ajuste' }))
    expect(within(dialog).getByText('No puede ser un día futuro')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Día'), { target: { value: today } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anotar ajuste' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      productId: 2,
      type: 'ADJUSTMENT',
      quantity: -1.5,
      unitCost: null,
      reason: 'Botella rota sin anotar',
      date: today,
    })
  })
})

describe('products', () => {
  it('adds a product with its unit, minimum, cost and supplier', async () => {
    const calls = stockApi((call) =>
      call.method === 'POST' && call.path === '/products' ? json(201, product(9, { name: 'Vermut Yzaguirre' })) : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    fireEvent.click(screen.getByRole('button', { name: 'Añadir producto' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir producto' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir producto' }))
    expect(within(dialog).getByText('Escribe un nombre de hasta 100 caracteres')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: ' Vermut Yzaguirre ' } })
    fireEvent.change(within(dialog).getByLabelText('Categoría'), { target: { value: 'SPIRITS' } })
    fireEvent.change(within(dialog).getByLabelText('Unidad'), { target: { value: 'L' } })
    fireEvent.change(within(dialog).getByLabelText('Stock mínimo'), { target: { value: '1,5' } })
    fireEvent.change(within(dialog).getByLabelText('Coste por unidad'), { target: { value: '9,8' } })
    fireEvent.change(within(dialog).getByLabelText('Proveedor habitual'), { target: { value: '7' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir producto' }))

    expect(await screen.findByText('«Vermut Yzaguirre» añadido al inventario')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      name: 'Vermut Yzaguirre',
      category: 'SPIRITS',
      unit: 'L',
      minStock: 1.5,
      unitCost: 9.8,
      supplierId: 7,
    })
  })

  it('says when the name is taken', async () => {
    stockApi((call) =>
      call.method === 'POST' && call.path === '/products'
        ? json(409, { status: 409, message: 'A product with that name already exists in this establishment' })
        : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    fireEvent.click(screen.getByRole('button', { name: 'Añadir producto' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir producto' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'ginebra puerto' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir producto' }))
    expect(await within(dialog).findByText('Ya hay un producto con ese nombre en este local.')).toBeTruthy()
  })

  it('locks the unit of a product with stock, and goes back to it when the API refuses a change', async () => {
    const calls = stockApi((call) =>
      call.method === 'PUT' && call.path === '/products/4'
        ? json(409, { status: 409, message: 'The unit of a product with stock movements cannot be changed' })
        : undefined,
    )
    renderApp('/inventory')
    await screen.findByTestId('product-1')

    // With stock, it has movements: the unit cannot change
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Ginebra Puerto' }))
    const drawer = screen.getByRole('dialog', { name: 'Ginebra Puerto' })
    expect(within(drawer).getByRole('link', { name: 'Ver movimientos' }).getAttribute('href')).toBe('/inventory/movements?productId=1')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Editar' }))
    let dialog = screen.getByRole('dialog', { name: 'Editar producto' })
    expect((within(dialog).getByLabelText('Unidad') as HTMLSelectElement).disabled).toBe(true)
    expect(within(dialog).getByText('Ya tiene movimientos, así que la unidad no se puede cambiar.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    // With 0 it may still have some: the API has the last word
    fireEvent.click(within(row(4)).getByRole('button', { name: 'Limas' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Limas' })).getByRole('button', { name: 'Editar' }))
    dialog = screen.getByRole('dialog', { name: 'Editar producto' })
    const unit = within(dialog).getByLabelText('Unidad') as HTMLSelectElement
    expect(unit.disabled).toBe(false)
    fireEvent.change(unit, { target: { value: 'KG' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByText(/ya tiene movimientos, así que su unidad no se puede cambiar/)).toBeTruthy()
    expect(unit.value).toBe('UNIT')
    expect(unit.disabled).toBe(true)
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ name: 'Limas', unit: 'KG' })
    expect(calls.find((c) => c.method === 'PUT')!.body).not.toHaveProperty('establishmentId')
  })

  it('recommends deactivating a product the API will not delete, and deactivates it', async () => {
    const calls = stockApi((call) => {
      if (call.method === 'DELETE' && call.path === '/products/1') {
        return json(409, { status: 409, message: 'Cannot delete a product that has stock movements; deactivate it instead' })
      }
      if (call.method === 'PUT' && call.path === '/products/1/active') return json(200, { ...gin, isActive: false })
    })
    renderApp('/inventory')
    await screen.findByTestId('product-1')
    fireEvent.click(within(row(1)).getByRole('button', { name: 'Ginebra Puerto' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ginebra Puerto' })).getByRole('button', { name: 'Borrar' }))
    const dialog = screen.getByRole('dialog', { name: 'Borrar «Ginebra Puerto»' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar producto' }))
    expect(await within(dialog).findByText(/tiene movimientos o está en algún pedido.*Desactívalo en su lugar/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(within(row(1)).getByRole('button', { name: 'Ginebra Puerto' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ginebra Puerto' })).getByRole('button', { name: 'Desactivar' }))
    const confirm = screen.getByRole('dialog', { name: 'Desactivar «Ginebra Puerto»' })
    expect(confirm.textContent).toMatch(/Su historial se conserva/)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Desactivar' }))
    expect(await screen.findByText('Producto desactivado')).toBeTruthy()
    expect(calls.find((c) => c.path === '/products/1/active')!.body).toEqual({ active: false })
  })

  it('deletes a product with no history', async () => {
    const calls = stockApi((call) => (call.method === 'DELETE' && call.path === '/products/4' ? noContent() : undefined))
    renderApp('/inventory')
    await screen.findByTestId('product-4')
    fireEvent.click(within(row(4)).getByRole('button', { name: 'Limas' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Limas' })).getByRole('button', { name: 'Borrar' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Borrar «Limas»' })).getByRole('button', { name: 'Borrar producto' }))
    expect(await screen.findByText('Producto borrado')).toBeTruthy()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/products/4')).toBe(true)
  })
})
