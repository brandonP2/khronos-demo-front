import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { json, mockApi, renderApp, user } from '../../test/helpers'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

const admin = user(1, 'PLATFORM_ADMIN', 'Admin', 'Khronos')
const venue = {
  id: 3,
  establishmentName: 'Casa Lucía',
  establishmentAddress: 'Calle Mayor 1',
  ownerId: 2,
  ownerName: 'Ana Gil',
  ownerEmail: 'a@g.es',
  ownerPhone: null,
  timeZone: 'Europe/Madrid',
}

describe('Deleting a venue', () => {
  it('explains that a venue with time entries is kept, and to deactivate instead', async () => {
    mockApi((call) => {
      if (call.path === '/users/me') return json(200, admin)
      if (call.path === '/users') return json(200, [admin, user(2, 'OWNER', 'Ana', 'Gil')])
      if (call.path === '/establishments') return json(200, [venue])
      if (call.method === 'DELETE' && call.path === '/establishments/3') {
        return json(409, { status: 409, message: 'The establishment has time entries; deactivate its workers instead' })
      }
    })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Casa Lucía' }))
    const dialog = screen.getByRole('dialog', { name: 'Eliminar Casa Lucía' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar local' }))
    expect(
      await within(dialog).findByText(
        'Casa Lucía tiene fichajes registrados y no se puede eliminar sin perder su registro de jornada. Desactiva a las personas de su equipo en lugar de eliminar el local.',
      ),
    ).toBeTruthy()
  })
})
