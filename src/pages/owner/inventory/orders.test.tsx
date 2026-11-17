import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PurchaseOrder } from '../../../api/types'
import { order, orderLine, product, supplier } from '../../../test/inventory'
import { json, noContent, ownerApi, plain, renderApp, type Route } from '../../../test/helpers'
import { zonedToday } from '../../../lib/time'

const today = zonedToday('Europe/Madrid')

const products = [
  product(1, { name: 'Ginebra Puerto', currentStock: 4.5, minStock: 6, unitCost: 12.5, isLowStock: true, supplierId: 7 }),
  product(2, { name: 'Ron Brugal', currentStock: -2, minStock: 2, unitCost: 11, isLowStock: true, supplierId: 7 }),
  product(3, { name: 'Vodka', currentStock: 8, minStock: 2, unitCost: 9, supplierId: 7 }),
  product(4, { name: 'Café en grano', category: 'COFFEE', unit: 'KG', currentStock: 3, minStock: 1, supplierId: 8 }),
  product(5, { name: 'Hielo', category: 'SUPPLIES', unit: 'KG', currentStock: 1, minStock: 5, isLowStock: true }),
]
const suppliers = [supplier(8, 'Cafés Lola', { phone: '600 111 222', email: 'pedidos@lola.es' }), supplier(7, 'Distribuciones Sur')]

const ordered = order(12, {
  status: 'ORDERED',
  orderDate: '2026-11-16',
  expectedDate: '2026-11-18',
  lines: [
    orderLine(101, { productId: 1, productName: 'Ginebra Puerto', quantity: 2, unitCost: 12.5, lineTotal: 25 }),
    orderLine(102, { productId: 2, productName: 'Ron Brugal', quantity: 4, unitCost: 11, lineTotal: 44 }),
  ],
  total: 69,
})

function ordersApi(extra: Route = () => undefined) {
  return ownerApi(async (call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.method === 'GET' && call.path.startsWith('/products/establishment/1?')) return json(200, products)
    if (call.path === '/suppliers/establishment/1') return json(200, suppliers)
    if (call.method === 'GET' && call.path === '/purchase-orders/12') return json(200, ordered)
  })
}

const lineFields = () =>
  [...document.querySelectorAll('.order-line')].map((li) => {
    const inputs = li.querySelectorAll('input')
    const select = li.querySelector('select') as HTMLSelectElement
    return [select.value, (inputs[0] as HTMLInputElement).value, (inputs[1] as HTMLInputElement).value]
  })
const total = () => plain(document.querySelector('[data-testid="order-total"]')!.textContent)

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('purchase orders', () => {
  it('lists orders with their status, supplier, expected date and total, filtered by status', async () => {
    const list: PurchaseOrder[] = [
      ordered,
      order(11, { status: 'DRAFT', lines: [orderLine(90)], total: null }),
      order(10, { status: 'RECEIVED', supplierName: 'Cafés Lola', total: 32.4, receivedDate: '2026-11-10' }),
    ]
    const calls = ordersApi((call) =>
      call.path.startsWith('/purchase-orders/establishment/1') ? json(200, call.path.includes('status=DRAFT') ? [list[1]] : list) : undefined,
    )
    renderApp('/inventory/orders')
    const link = await screen.findByRole('link', { name: 'Abrir el pedido #12 a Distribuciones Sur' })
    expect(link.getAttribute('href')).toBe('/inventory/orders/12')
    const rows = [...document.querySelectorAll('.order-row')].map((r) => plain(r.textContent))
    expect(rows[0]).toBe('#12Distribuciones Sur2 líneasPedidoFecha prevista: 18 novTotal: 69,00 €')
    expect(rows[1]).toContain('Borrador')
    expect(rows[1]).toContain('Total: —')
    expect(rows[2]).toContain('Recibido')

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'DRAFT' } })
    await waitFor(() => expect(document.querySelectorAll('.order-row')).toHaveLength(1))
    expect(calls.some((c) => c.path === '/purchase-orders/establishment/1?status=DRAFT')).toBe(true)
  })

  it('proposes the supplier’s low stock, with the quantity back to the minimum, and works out the total', async () => {
    const calls = ordersApi((call) => {
      if (call.method === 'POST' && call.path === '/purchase-orders') return json(201, order(31, { status: 'DRAFT' }))
      if (call.method === 'GET' && call.path === '/purchase-orders/31') {
        return json(200, order(31, { lines: [orderLine(1, { productId: 1, quantity: 2, unitCost: 12.5 })] }))
      }
    })
    renderApp('/inventory/orders/new?supplierId=7&propose=1')
    expect(await screen.findByRole('heading', { name: 'Nuevo pedido' })).toBeTruthy()
    expect((screen.getByLabelText('Proveedor') as HTMLSelectElement).value).toBe('7')
    expect(screen.getByText('2 productos propuestos')).toBeTruthy()
    // 6 − 4,5 = 1,5, up to 2 bottles; 2 − (−2) = 4
    expect(lineFields()).toEqual([
      ['1', '2', '12,50'],
      ['2', '4', '11,00'],
    ])
    expect(total()).toBe('69,00 €')

    // The total follows what is typed, and a line with no cost is left out of it
    const second = document.querySelectorAll('.order-line')[1] as HTMLElement
    fireEvent.change(within(second).getByLabelText('Coste por unidad'), { target: { value: '' } })
    expect(total()).toBe('25,00 €')
    expect(screen.getByText('1 línea sin coste no suma')).toBeTruthy()
    fireEvent.change(within(second).getByLabelText('Coste por unidad'), { target: { value: '10,5' } })
    expect(total()).toBe('67,00 €')
    // A line still being filled in is not a line without cost
    fireEvent.click(screen.getByRole('button', { name: 'Añadir línea' }))
    expect(screen.queryByText(/sin coste no suma/)).toBeNull()
    fireEvent.change(within(document.querySelectorAll('.order-line')[2] as HTMLElement).getByLabelText('Producto'), { target: { value: '3' } })
    expect(screen.queryByText(/sin coste no suma/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la línea 3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Pedido guardado como borrador')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      supplierId: 7,
      expectedDate: null,
      notes: null,
      lines: [
        { productId: 1, quantity: 2, unitCost: 12.5 },
        { productId: 2, quantity: 4, unitCost: 10.5 },
      ],
    })
    expect(await screen.findByRole('heading', { name: 'Pedido #31' })).toBeTruthy()
  })

  it('adds the proposal to the lines already there, and says when there is nothing low', async () => {
    ordersApi()
    renderApp('/inventory/orders/new')
    await screen.findByRole('heading', { name: 'Nuevo pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Proponer con stock bajo' }))
    expect(screen.getByText('Elige antes el proveedor')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Proponer con stock bajo' }))
    expect(screen.getByText('Ningún producto de este proveedor está en el mínimo o por debajo.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '7' } })
    const first = document.querySelector('.order-line') as HTMLElement
    fireEvent.change(within(first).getByLabelText('Producto'), { target: { value: '1' } })
    // The product's cost fills an empty cost
    expect((within(first).getByLabelText('Coste por unidad') as HTMLInputElement).value).toBe('12,50')
    fireEvent.change(within(first).getByLabelText('Cantidad'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Proponer con stock bajo' }))
    expect(screen.getByText('1 producto propuesto')).toBeTruthy()
    expect(lineFields()).toEqual([
      ['1', '12', '12,50'],
      ['2', '4', '11,00'],
    ])
    // The supplier's products come first
    const groups = [...within(first).getByLabelText('Producto').querySelectorAll('optgroup')].map((g) => g.label)
    expect(groups).toEqual(['De Distribuciones Sur', 'Otros productos'])
  })

  it('checks the supplier and the lines before saving, and marks a new order as ordered', async () => {
    const calls = ordersApi((call) => {
      if (call.method === 'POST' && call.path === '/purchase-orders') return json(201, order(32))
      if (call.method === 'PUT' && call.path === '/purchase-orders/32/order') return json(200, order(32, { status: 'ORDERED' }))
      if (call.method === 'GET' && call.path === '/purchase-orders/32') return json(200, order(32, { status: 'ORDERED', lines: [] }))
    })
    renderApp('/inventory/orders/new')
    await screen.findByRole('heading', { name: 'Nuevo pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedido' }))
    expect(screen.getByText('Elige el proveedor')).toBeTruthy()
    expect(screen.getByText('Elige el producto')).toBeTruthy()
    expect(screen.getByText('Escribe una cantidad mayor que 0, con 9 cifras enteras y 3 decimales como mucho')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Fecha prevista'), { target: { value: '2026-11-20' } })
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '1,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir línea' }))
    const second = document.querySelectorAll('.order-line')[1] as HTMLElement
    fireEvent.change(within(second).getByLabelText('Producto'), { target: { value: '4' } })
    fireEvent.change(within(second).getByLabelText('Cantidad'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedido' }))
    expect(screen.getByText('Este producto ya está en otra línea')).toBeTruthy()
    fireEvent.click(within(second).getByRole('button', { name: 'Quitar la línea 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedido' }))

    expect(await screen.findByText('Marcado como pedido')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      supplierId: 8,
      expectedDate: '2026-11-20',
      notes: null,
      lines: [{ productId: 4, quantity: 1.5, unitCost: null }],
    })
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /purchase-orders',
      'PUT /purchase-orders/32/order',
    ])
  })

  it('shows no unit until the product is chosen, and checks the quantity again when it is', async () => {
    ordersApi()
    renderApp('/inventory/orders/new')
    await screen.findByRole('heading', { name: 'Nuevo pedido' })
    const line = document.querySelector('.order-line') as HTMLElement
    expect(line.querySelector('.quantity-unit')).toBeNull()
    expect(screen.getByLabelText('Cantidad').getAttribute('aria-describedby')).toBeNull()
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '0' } })
    expect(screen.queryByText('Escribe una cantidad mayor que 0, con 9 cifras enteras y 3 decimales como mucho')).toBeNull()

    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '4' } })
    expect(line.querySelector('.quantity-unit')!.textContent).toBe('kg')
    expect(screen.getByText('Escribe una cantidad mayor que 0, con 9 cifras enteras y 3 decimales como mucho')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '1.50' } })
    expect(screen.queryByText('Escribe una cantidad mayor que 0, con 9 cifras enteras y 3 decimales como mucho')).toBeNull()
    // Another product keeps the quantity, written as this one reads it
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '1' } })
    expect((screen.getByLabelText('Cantidad') as HTMLInputElement).value).toBe('1,5')
    expect(line.querySelector('.quantity-unit')!.textContent).toBe('botellas')
  })

  it('retries marking a new order as ordered on the draft it already created', async () => {
    let refuse = true
    const calls = ordersApi((call) => {
      if (call.method === 'POST' && call.path === '/purchase-orders') return json(201, order(33, { supplierId: 8, supplierName: 'Cafés Lola' }))
      if (call.method === 'PUT' && call.path === '/purchase-orders/33') return json(200, order(33, { supplierId: 8, supplierName: 'Cafés Lola' }))
      if (call.method === 'PUT' && call.path === '/purchase-orders/33/order') {
        if (!refuse) return json(200, order(33, { status: 'ORDERED' }))
        refuse = false
        return json(500, { status: 500, message: 'Could not mark the order as ordered' })
      }
      if (call.method === 'GET' && call.path === '/purchase-orders/33') return json(200, order(33, { status: 'ORDERED' }))
      if (call.path.startsWith('/purchase-orders/establishment/1')) return json(200, [])
    })
    renderApp('/inventory/orders/new')
    await screen.findByRole('heading', { name: 'Nuevo pedido' })
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedido' }))

    // The draft exists now, so the form edits it and says which one it is
    expect(await screen.findByText('Could not mark the order as ordered')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pedido #33' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedido' }))
    expect(await screen.findByText('Marcado como pedido')).toBeTruthy()
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /purchase-orders',
      'PUT /purchase-orders/33/order',
      'PUT /purchase-orders/33',
      'PUT /purchase-orders/33/order',
    ])
    expect(calls.find((c) => c.method === 'PUT' && c.path === '/purchase-orders/33')!.body).not.toHaveProperty('establishmentId')
  })

  it('edits a draft, deletes it, and offers to add a supplier when there is none', async () => {
    const draft = order(20, { lines: [orderLine(1, { productId: 3, productName: 'Vodka', quantity: 6, unitCost: 9, lineTotal: 54 })], total: 54 })
    const calls = ordersApi((call) => {
      if (call.method === 'GET' && call.path === '/purchase-orders/20') return json(200, draft)
      if (call.method === 'PUT' && call.path === '/purchase-orders/20') return json(200, draft)
      if (call.method === 'DELETE' && call.path === '/purchase-orders/20') return noContent()
      if (call.path.startsWith('/purchase-orders/establishment/1')) return json(200, [])
    })
    renderApp('/inventory/orders/20')
    expect(await screen.findByRole('heading', { name: 'Pedido #20' })).toBeTruthy()
    expect(lineFields()).toEqual([['3', '6', '9,00']])
    fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Llamar antes de las 10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Borrador guardado')).toBeTruthy()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toMatchObject({ supplierId: 7, notes: 'Llamar antes de las 10' })
    expect(put.body).not.toHaveProperty('establishmentId')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar borrador' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Borrar este borrador' })).getByRole('button', { name: 'Borrar borrador' }))
    expect(await screen.findByText('Borrador borrado')).toBeTruthy()
    expect(await screen.findByText('Todavía no hay pedidos')).toBeTruthy()
  })
})

describe('receiving an order', () => {
  it('shows an ordered order with receive and cancel', async () => {
    const calls = ordersApi((call) =>
      call.method === 'PUT' && call.path === '/purchase-orders/12/cancel' ? json(200, { ...ordered, status: 'CANCELLED' }) : undefined,
    )
    renderApp('/inventory/orders/12')
    expect(await screen.findByRole('heading', { name: 'Pedido #12' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Recibir pedido' }).getAttribute('href')).toBe('/inventory/orders/12/receive')
    expect(total()).toBe('69,00 €')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cancelar el pedido #12' })).getByRole('button', { name: 'Cancelar pedido' }))
    expect(await screen.findByText('Pedido cancelado')).toBeTruthy()
    expect(calls.some((c) => c.path === '/purchase-orders/12/cancel')).toBe(true)
  })

  it('explains a closed till for a cash expense, receives once paid otherwise, and links to the expense', async () => {
    let refuse = true
    let received: PurchaseOrder | null = null
    const calls = ordersApi((call) => {
      if (call.method === 'PUT' && call.path === '/purchase-orders/12/receive') {
        if (refuse) {
          return json(409, {
            status: 409,
            code: 'CASH_DAY_CLOSED',
            details: { date: today },
            message: `The cash closing of ${today} is closed; reopen it to add, change or delete cash expenses of that day`,
          })
        }
        received = { ...ordered, status: 'RECEIVED', receivedDate: today, expenseId: 77, total: 58 }
        return json(200, received)
      }
      if (received && call.method === 'GET' && call.path === '/purchase-orders/12') return json(200, received)
    })
    renderApp('/inventory/orders/12/receive')
    expect(await screen.findByRole('heading', { name: 'Recibir el pedido #12' })).toBeTruthy()
    const gin = screen.getByLabelText('Recibido de Ginebra Puerto') as HTMLInputElement
    expect(gin.value).toBe('2')
    expect((screen.getByLabelText('Coste por unidad de Ron Brugal') as HTMLInputElement).value).toBe('11,00')
    expect(plain(screen.getByTestId('receive-total').textContent)).toBe('69,00 €')

    // Only 3 bottles of rum came
    fireEvent.change(screen.getByLabelText('Recibido de Ron Brugal'), { target: { value: '3' } })
    expect(plain(screen.getByTestId('receive-total').textContent)).toBe('58,00 €')
    expect((screen.getByLabelText('Crear el gasto correspondiente') as HTMLInputElement).checked).toBe(true)
    expect(plain(screen.getByText(/Un gasto de «Género y bebidas»/).textContent)).toContain('58,00 €')
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CASH' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))

    expect(await screen.findByText(/está cerrada, así que no se puede añadir un gasto en efectivo a ese día, y no se ha recibido nada/)).toBeTruthy()
    const toCash = screen.getByRole('link', { name: /^Ir a la caja del/ })
    expect(toCash.getAttribute('href')).toBe(`/cash?date=${today}`)

    refuse = false
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CARD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(await screen.findByText('Pedido recibido: el stock ya está sumado')).toBeTruthy()
    expect(calls.filter((c) => c.path === '/purchase-orders/12/receive').map((c) => c.body)).toEqual([
      {
        receivedDate: today,
        lines: [
          { lineId: 101, receivedQuantity: 2, unitCost: 12.5 },
          { lineId: 102, receivedQuantity: 3, unitCost: 11 },
        ],
        createExpense: true,
        paymentMethod: 'CASH',
      },
      {
        receivedDate: today,
        lines: [
          { lineId: 101, receivedQuantity: 2, unitCost: 12.5 },
          { lineId: 102, receivedQuantity: 3, unitCost: 11 },
        ],
        createExpense: true,
        paymentMethod: 'CARD',
      },
    ])
    const expense = await screen.findByRole('link', { name: 'Ver el gasto creado' })
    expect(expense.getAttribute('href')).toBe(`/expenses?from=${today}&to=${today}`)
  })

  it('goes straight to the received order, never saying it is not ordered on the way', async () => {
    let received = false
    ordersApi((call) => {
      if (call.method === 'PUT' && call.path === '/purchase-orders/12/receive') {
        received = true
        return json(200, { ...ordered, status: 'RECEIVED', receivedDate: today, lines: ordered.lines.map((l) => ({ ...l, receivedQuantity: l.quantity })) })
      }
      // Reloading the order after receiving it takes its time
      if (received && call.method === 'GET' && call.path === '/purchase-orders/12') return new Promise<Response>(() => {})
    })
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CARD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(await screen.findByText('Recibido: su stock ya está sumado.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pedido #12' })).toBeTruthy()
    expect(screen.queryByText('Solo se puede recibir un pedido marcado como pedido.')).toBeNull()
  })

  it('needs a total for the expense, and receives without one when it is not created', async () => {
    const noCost = { ...ordered, lines: ordered.lines.map((l) => ({ ...l, unitCost: null, lineTotal: null })), total: null }
    const calls = ordersApi((call) => {
      // Neither the lines nor their products have a cost
      if (call.method === 'GET' && call.path.startsWith('/products/establishment/1?')) return json(200, products.map((p) => ({ ...p, unitCost: null })))
      if (call.method === 'GET' && call.path === '/purchase-orders/12') return json(200, noCost)
      if (call.method === 'PUT' && call.path === '/purchase-orders/12/receive') return json(200, { ...noCost, status: 'RECEIVED' })
    })
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    fireEvent.change(screen.getByLabelText('Recibido de Ginebra Puerto'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(screen.getByText('Para crear el gasto, el total tiene que ser mayor que 0: añade el coste por unidad.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)

    fireEvent.click(screen.getByLabelText('Crear el gasto correspondiente'))
    expect(screen.queryByLabelText('Medio de pago')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      receivedDate: today,
      lines: [
        { lineId: 101, receivedQuantity: 0, unitCost: null },
        { lineId: 102, receivedQuantity: 4, unitCost: null },
      ],
      createExpense: false,
      paymentMethod: null,
    })
  })

  it('starts a line with no cost of its own at its product’s, and adds it to the expense', async () => {
    // The rum was ordered with no cost: it is received at the product's 11,00 € unless another is typed
    const mixed = { ...ordered, lines: [ordered.lines[0], { ...ordered.lines[1], unitCost: null, lineTotal: null }], total: 25 }
    const calls = ordersApi((call) => {
      if (call.method === 'GET' && call.path === '/purchase-orders/12') return json(200, mixed)
      if (call.method === 'PUT' && call.path === '/purchase-orders/12/receive') return json(200, { ...mixed, status: 'RECEIVED' })
    })
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    const rum = screen.getByLabelText('Coste por unidad de Ron Brugal') as HTMLInputElement
    expect(rum.value).toBe('11,00')
    expect(plain(screen.getByTestId('receive-total').textContent)).toBe('69,00 €')
    expect(screen.getByText(/Una línea solo queda fuera del total si tampoco el producto tiene coste/)).toBeTruthy()
    // Left empty, the same cost still applies, as the API picks it
    fireEvent.change(rum, { target: { value: '' } })
    expect(rum.getAttribute('placeholder')).toBe('11,00')
    expect(plain(screen.getByTestId('receive-total').textContent)).toBe('69,00 €')
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CARD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect((calls.find((c) => c.method === 'PUT')!.body as { lines: unknown[] }).lines).toEqual([
      { lineId: 101, receivedQuantity: 2, unitCost: 12.5 },
      { lineId: 102, receivedQuantity: 4, unitCost: null },
    ])
  })

  it('leaves a line received with 0 out, and sends it with no cost', async () => {
    const calls = ordersApi((call) =>
      call.method === 'PUT' && call.path === '/purchase-orders/12/receive' ? json(200, { ...ordered, status: 'RECEIVED' }) : undefined,
    )
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    fireEvent.change(screen.getByLabelText('Recibido de Ron Brugal'), { target: { value: '0' } })
    const rum = screen.getByLabelText('Coste por unidad de Ron Brugal') as HTMLInputElement
    expect(rum.disabled).toBe(true)
    expect(plain(rum.closest('li')!.querySelector('.receive-total')!.textContent)).toBe('No ha llegado: no entra')
    expect(plain(screen.getByTestId('receive-total').textContent)).toBe('25,00 €')
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CARD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect((calls.find((c) => c.method === 'PUT')!.body as { lines: unknown[] }).lines).toEqual([
      { lineId: 101, receivedQuantity: 2, unitCost: 12.5 },
      { lineId: 102, receivedQuantity: 0, unitCost: null },
    ])
  })

  it('says there is nothing to receive when every line is at 0, and offers to cancel the order', async () => {
    const calls = ordersApi((call) =>
      call.method === 'PUT' && call.path === '/purchase-orders/12/cancel' ? json(200, { ...ordered, status: 'CANCELLED' }) : undefined,
    )
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    fireEvent.change(screen.getByLabelText('Recibido de Ginebra Puerto'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Recibido de Ron Brugal'), { target: { value: '0' } })
    fireEvent.click(screen.getByLabelText('Crear el gasto correspondiente'))
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(screen.getByText('Todas las líneas están a 0, así que no hay nada que recibir. Si el pedido no va a llegar, cancélalo.')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cancelar el pedido #12' })).getByRole('button', { name: 'Cancelar pedido' }))
    expect(await screen.findByText('Pedido cancelado')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/purchase-orders/12/cancel'])
  })

  it('says why an order cannot be received when it changed meanwhile, or one of its products is inactive', async () => {
    let attempt = 0
    ordersApi((call) => {
      if (call.method === 'PUT' && call.path === '/purchase-orders/12/receive') {
        attempt += 1
        if (attempt === 1) return json(409, { status: 409, code: 'PRODUCT_INACTIVE', message: "Product 'Ron Brugal' is inactive; activate it first" })
        return json(409, { status: 409, code: 'PURCHASE_ORDER_WRONG_STATUS', message: 'Only an ordered purchase order can be received; this one is CANCELLED' })
      }
      if (attempt === 2 && call.method === 'GET' && call.path === '/purchase-orders/12') return json(200, { ...ordered, status: 'CANCELLED' })
    })
    renderApp('/inventory/orders/12/receive')
    await screen.findByRole('heading', { name: 'Recibir el pedido #12' })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'CARD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(await screen.findByText('«Ron Brugal» está inactivo: actívalo antes en Stock.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Recibir pedido' }))
    expect(await screen.findByText('Este pedido ha cambiado mientras tanto y ahora está «Cancelado». Vuelve a abrirlo para ver cómo está.')).toBeTruthy()
    expect(await screen.findByText('Solo se puede recibir un pedido marcado como pedido.')).toBeTruthy()
  })

  it('does not receive an order that is not marked as ordered', async () => {
    const calls = ordersApi((call) =>
      call.method === 'GET' && call.path === '/purchase-orders/12' ? json(200, { ...ordered, status: 'DRAFT' }) : undefined,
    )
    renderApp('/inventory/orders/12/receive')
    expect(await screen.findByText('Solo se puede recibir un pedido marcado como pedido.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Recibir pedido' })).toBeNull()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })
})

describe('suppliers', () => {
  it('lists suppliers with their contact and products, and adds one', async () => {
    const calls = ordersApi((call) =>
      call.method === 'POST' && call.path === '/suppliers' ? json(201, supplier(9, 'Hielos Norte')) : undefined,
    )
    renderApp('/inventory/suppliers')
    const lola = (await screen.findByText('Cafés Lola')).closest('li') as HTMLElement
    expect(within(lola).getByRole('link', { name: '600 111 222' }).getAttribute('href')).toBe('tel:600111222')
    expect(within(lola).getByRole('link', { name: 'pedidos@lola.es' }).getAttribute('href')).toBe('mailto:pedidos@lola.es')
    expect(within(lola).getByText('1 producto')).toBeTruthy()
    expect(within(screen.getByText('Distribuciones Sur').closest('li') as HTMLElement).getByText('3 productos')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Añadir proveedor' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir proveedor' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Hielos Norte' } })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'no-es-un-email' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir proveedor' }))
    expect(within(dialog).getByText('Escribe un email válido, como pedidos@proveedor.es')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: '' } })
    fireEvent.change(within(dialog).getByLabelText('Teléfono'), { target: { value: ' 911 222 333 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir proveedor' }))
    expect(await screen.findByText('Hielos Norte añadido')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      name: 'Hielos Norte',
      phone: '911 222 333',
      email: null,
      notes: null,
    })
  })

  it('says a supplier with orders cannot be deleted, and that a taken name is taken', async () => {
    ordersApi((call) => {
      if (call.method === 'DELETE' && call.path === '/suppliers/7') {
        return json(409, { status: 409, code: 'SUPPLIER_HAS_ORDERS', message: 'Cannot delete a supplier that has purchase orders' })
      }
      if (call.method === 'PUT' && call.path === '/suppliers/8') {
        // An API without codes: the message is read instead
        return json(409, { status: 409, message: "A supplier named 'Distribuciones Sur' already exists at this establishment" })
      }
    })
    renderApp('/inventory/suppliers')
    await screen.findByText('Cafés Lola')
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Distribuciones Sur' }))
    const dialog = screen.getByRole('dialog', { name: 'Borrar Distribuciones Sur' })
    expect(dialog.textContent).toMatch(/3 productos lo tienen como proveedor habitual y se quedarán sin él/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar proveedor' }))
    expect(await within(dialog).findByText('Distribuciones Sur tiene pedidos, así que no se puede borrar sin perder su historial.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Editar Cafés Lola' }))
    const edit = screen.getByRole('dialog', { name: 'Editar proveedor' })
    fireEvent.change(within(edit).getByLabelText('Nombre'), { target: { value: 'Distribuciones Sur' } })
    fireEvent.click(within(edit).getByRole('button', { name: 'Guardar' }))
    expect(await within(edit).findByText('Ya hay un proveedor con ese nombre en este local.')).toBeTruthy()
  })
})
