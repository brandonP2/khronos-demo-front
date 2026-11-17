import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { AuthProvider } from '../../auth/AuthContext'
import { ToastProvider } from '../../components/ui'
import { LocaleProvider } from '../../lib/i18n'
import { addDays, today, weekDays } from '../../lib/time'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const owner = { id: 10, username: 'lucia', firstName: 'Lucía', lastName: 'Romero', phoneNumber: null, email: 'l@r.es', role: 'OWNER' }
const marco = { id: 2, username: 'marco', firstName: 'Marco', lastName: 'Bianchi', phoneNumber: null, email: 'm@b.es', role: 'WORKER' }
const venue = {
  id: 1,
  establishmentName: 'Casa Lucía',
  establishmentAddress: 'Calle Mayor 1',
  ownerId: 10,
  ownerName: 'Lucía Romero',
  ownerEmail: null,
  ownerPhone: null,
}
// The API's JSON, so it is left untyped and the test does not depend on every field of Shift
const shiftOn = (id: number, date: string) => ({
  id,
  workerId: 2,
  zoneId: 7,
  date,
  startTime: '18:00:00',
  endTime: '23:00:00',
  endsNextDay: false,
  durationMinutes: 300,
})

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  sessionStorage.setItem('khronos.session', JSON.stringify({ token: 'stored-token', expiresAt: Date.now() + 30 * 60_000 }))
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('SchedulePage', () => {
  it('does not show the week left behind as the new one while the new one loads', async () => {
    const nextWeek = weekDays(addDays(today(), 7))
    let release: (shifts: unknown[]) => void = () => {}
    const nextWeekShifts = new Promise<Response>((resolve) => {
      release = (shifts) => resolve(json(shifts))
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input).replace(/^.*\/api/, '')
        if (path === '/users/me') return json(owner)
        if (path === '/establishments/owner/10') return json([venue])
        if (path === '/zones/establishment/1') return json([{ id: 7, name: 'Sala', establishmentId: 1 }])
        if (path === '/workers/establishment/1') return json([{ userId: 2, establishmentId: 1, isActive: true }])
        if (path === '/users/establishment/1') return json([marco])
        if (path.startsWith('/worker-shifts/owner/10')) {
          return path.endsWith(`to=${nextWeek[6]}`) ? nextWeekShifts : json([shiftOn(1, today())])
        }
        return json([])
      }),
    )
    renderApp()

    expect(await screen.findByRole('region', { name: 'Sala' })).toBeTruthy()
    const copy = screen.getByRole('button', { name: 'Copiar semana anterior' }) as HTMLButtonElement
    expect(copy.disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }))

    // The shifts of the new week are still on their way
    expect(await screen.findAllByText('Cargando la semana…')).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Sala' })).toBeNull()
    expect(screen.queryByText('Sin turnos')).toBeNull()
    expect(copy.disabled).toBe(true)

    release([shiftOn(2, addDays(today(), 7))])
    expect(await screen.findByRole('region', { name: 'Sala' })).toBeTruthy()
    expect(screen.getByText('Marco Bianchi')).toBeTruthy()
    expect(screen.queryByText('Cargando la semana…')).toBeNull()
    expect(copy.disabled).toBe(false)
  })
})
