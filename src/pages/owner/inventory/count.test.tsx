import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { inventoryReport, movement, product } from '../../../test/inventory'
import { json, ownerApi, plain, renderApp, type Route } from '../../../test/helpers'
import * as stock from '../../../lib/stock'
import { zonedToday } from '../../../lib/time'

// Each count row reads its quantities through this hook, so its calls count the rows rendered
vi.mock('../../../lib/stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/stock')>()
  return { ...actual, useQuantityText: vi.fn(actual.useQuantityText) }
})

const today = zonedToday('Europe/Madrid')

const products = [
  product(1, { name: 'Ginebra Puerto', currentStock: 4.5, unitCost: 12.5 }),
  product(2, { name: 'Ron Brugal', currentStock: 3, unitCost: 11 }),
  product(3, { name: 'Café en grano', category: 'COFFEE', unit: 'KG', currentStock: 2, unitCost: 15 }),
  product(4, { name: 'Hielo', category: 'SUPPLIES', unit: 'KG', currentStock: 10 }),
]

function countApi(extra: Route = () => undefined) {
  return ownerApi(async (call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.method === 'GET' && call.path.startsWith('/products/establishment/1?')) return json(200, products)
    if (call.path === '/suppliers/establishment/1') return json(200, [])
    if (call.path.startsWith('/reports/establishment/1/inventory?')) return json(200, inventoryReport())
  })
}

const field = (name: string) => screen.getByLabelText(`Contado de ${name}`) as HTMLInputElement
const rowOf = (name: string) => field(name).closest('li') as HTMLElement

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the physical count', () => {
  it('shows each expected stock and works out the difference as it is typed', async () => {
    countApi()
    renderApp('/inventory/count')
    expect(await screen.findByRole('heading', { name: 'Recuento' })).toBeTruthy()
    await screen.findByLabelText('Contado de Ginebra Puerto')
    expect(within(rowOf('Ginebra Puerto')).getByText('Teórico: 4,5 botellas')).toBeTruthy()
    expect(screen.getByText('0 de 4 contados')).toBeTruthy()

    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3' } })
    expect(plain(rowOf('Ginebra Puerto').querySelector('.count-diff')!.textContent)).toBe('−1,5 botellasfalta')
    fireEvent.change(field('Café en grano'), { target: { value: '2,25' } })
    expect(plain(rowOf('Café en grano').querySelector('.count-diff')!.textContent)).toBe('+0,25 kgsobra')
    fireEvent.change(field('Ron Brugal'), { target: { value: '3' } })
    expect(plain(rowOf('Ron Brugal').querySelector('.count-diff')!.textContent)).toBe('0 botellascuadra')
    expect(screen.getByText('3 de 4 contados')).toBeTruthy()
  })

  it('reviews the differences in units and value, and sends only the products typed in', async () => {
    let saved = false
    const calls = countApi((call) => {
      if (call.method === 'POST' && call.path === '/stock-counts') {
        saved = true
        return json(201, [
          movement(60, { productId: 1, type: 'COUNT', quantity: -1.5, stockAfter: 3 }),
          movement(61, { productId: 3, unit: 'KG', type: 'COUNT', quantity: 0.25, stockAfter: 2.25 }),
        ])
      }
      if (saved && call.method === 'GET' && call.path.startsWith('/products/')) return new Promise<undefined>(() => {})
    })
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y confirmar' }))
    expect(screen.getByText('Escribe la cantidad contada de al menos un producto.')).toBeTruthy()

    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3' } })
    fireEvent.change(field('Café en grano'), { target: { value: '2,25' } })
    fireEvent.change(field('Hielo'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y confirmar' }))

    const dialog = screen.getByRole('dialog', { name: 'Confirmar recuento' })
    const figures = [...dialog.querySelectorAll('.cash-figure')].map((f) => plain(f.textContent))
    // −1,5 × 12,50 + 0,25 × 15,00
    expect(figures).toEqual([
      'Productos contados2',
      'Con diferencia2',
      'Diferencia en unidades−1,5 botellas · +0,25 kg',
      'Diferencia en valor−15,00 €',
    ])
    expect(plain(within(dialog).getByText('Ginebra Puerto').closest('li')!.textContent)).toBe('Ginebra Puerto−1,5 botellas · −18,75 €')
    fireEvent.change(within(dialog).getByLabelText('Notas'), { target: { value: ' Cierre del domingo ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar recuento' }))

    expect(await screen.findByText('Recuento guardado: 2 productos')).toBeTruthy()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      establishmentId: 1,
      date: today,
      notes: 'Cierre del domingo',
      items: [
        { productId: 1, countedQuantity: 3 },
        { productId: 3, countedQuantity: 2.25 },
      ],
    })
    // Back on the stock, with the counted figures and no draft left
    const ginRow = await screen.findByTestId('product-1')
    expect(within(ginRow).getByText('3 botellas')).toBeTruthy()
    expect(sessionStorage.getItem('khronos.stockCount.1')).toBeNull()
  })

  it('counts 0 as counted, and stops on what is not a quantity', async () => {
    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    fireEvent.change(field('Hielo'), { target: { value: 'dos' } })
    fireEvent.change(field('Ron Brugal'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y confirmar' }))
    expect(screen.getByRole('alert').textContent).toBe('Hay 1 cantidad que no se entiende. Corrígela para seguir.')
    expect(field('Hielo').getAttribute('aria-invalid')).toBe('true')
    expect(within(rowOf('Hielo')).getByText('Escribe 0 o más, con 3 decimales como mucho')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.change(field('Hielo'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y confirmar' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmar recuento' })
    expect(plain(dialog.querySelector('.cash-figure')!.textContent)).toBe('Productos contados1')
  })

  it('keeps what was typed in this tab when the page is left, and can start again', async () => {
    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3,5' } })
    await waitFor(() => expect(sessionStorage.getItem('khronos.stockCount.1')).toContain('3,5'))
    cleanup()

    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    expect(field('Ginebra Puerto').value).toBe('3,5')
    expect(screen.getByText('Se ha recuperado el recuento que tenías a medias en esta pestaña.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Empezar de cero' }))
    expect(field('Ginebra Puerto').value).toBe('')
    expect(sessionStorage.getItem('khronos.stockCount.1')).toBeNull()
  })

  it('forgets a count half typed when the session ends, and never offers someone else\'s', async () => {
    // Left in this tab by another person
    sessionStorage.setItem('khronos.stockCount.1', JSON.stringify({ userId: 9, date: today, notes: '', counts: { '1': '7' } }))
    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    expect(field('Ginebra Puerto').value).toBe('')
    expect(screen.queryByText('Se ha recuperado el recuento que tenías a medias en esta pestaña.')).toBeNull()

    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3,5' } })
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('khronos.stockCount.1')!)).toMatchObject({ userId: 2 }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0])
    await waitFor(() => expect(sessionStorage.getItem('khronos.stockCount.1')).toBeNull())
  })

  it('renders only the row being typed in, not the whole list', async () => {
    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    const rows = vi.mocked(stock.useQuantityText)
    rows.mockClear()
    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3' } })
    expect(rows).toHaveBeenCalledTimes(1)
    fireEvent.change(field('Ginebra Puerto'), { target: { value: '3,5' } })
    fireEvent.blur(field('Ginebra Puerto'))
    expect(rows).toHaveBeenCalledTimes(2)
    expect(plain(rowOf('Ginebra Puerto').querySelector('.count-diff')!.textContent)).toBe('−1 botellafalta')
  })

  it('finds a product by name without losing the rest of the count', async () => {
    countApi()
    renderApp('/inventory/count')
    await screen.findByLabelText('Contado de Ginebra Puerto')
    fireEvent.change(field('Ginebra Puerto'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'hielo' } })
    expect(screen.queryByLabelText('Contado de Ginebra Puerto')).toBeNull()
    expect(screen.getByText('1 de 4 contados')).toBeTruthy()
  })
})
