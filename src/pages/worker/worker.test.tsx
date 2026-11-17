import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { TimeEntry } from '../../api/types'
import { addDays, zonedTime } from '../../lib/time'
import { json, mockApi, noContent, renderApp, user, type Call, type Route } from '../../test/helpers'

const lucia = user(5, 'WORKER')
const venue = {
  id: 1,
  establishmentName: 'Casa Lucía',
  establishmentAddress: 'Calle Mayor 1',
  ownerId: 2,
  ownerName: 'Ana Gil',
  ownerEmail: null,
  ownerPhone: null,
  timeZone: 'Europe/Madrid',
}

function entry(patch: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 40,
    workerId: 5,
    workerFirstName: 'Lucía',
    workerLastName: 'Romero',
    establishmentId: 1,
    businessDate: '2026-11-20',
    clockIn: '2026-11-20T17:02:00Z',
    clockOut: null,
    breakMinutes: 0,
    workedMinutes: null,
    shiftId: null,
    source: 'WORKER',
    status: 'OPEN',
    isEdited: false,
    isStale: false,
    note: null,
    ...patch,
  }
}

/** A signed-in worker with an empty schedule; `extra` answers the calls under test first */
function workerApi(extra: Route) {
  return mockApi(async (call: Call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.path === '/users/me') return json(200, lucia)
    if (call.path === '/workers/5') return json(200, { userId: 5, establishmentId: 1, isActive: true })
    if (call.path === '/establishments/1') return json(200, venue)
    if (call.path === '/zones/establishment/1') return json(200, [{ id: 7, name: 'Sala', establishmentId: 1 }])
    if (call.path.startsWith('/worker-shifts/worker/5')) return json(200, [])
    if (call.path.startsWith('/worker-events/worker/5')) return json(200, [])
    if (call.path.startsWith('/events/establishment/1')) return json(200, [])
    return undefined
  })
}

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('clocking in from the phone', () => {
  it('shows the person is out, clocks in with one tap and says so straight away', async () => {
    let open: TimeEntry | null = null
    const calls = workerApi((call) => {
      if (call.path === '/time-entries/me/open') return open ? json(200, open) : noContent()
      if (call.method === 'POST' && call.path === '/time-entries/clock-in') {
        open = entry()
        return json(201, open)
      }
    })
    renderApp('/')
    expect(await screen.findByText('Fuera')).toBeTruthy()
    expect(screen.getByText('Solo se guarda la hora. Khronos no usa tu ubicación.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fichar entrada' }))
    // Shown on the venue's clock (Madrid), whatever the device's zone
    expect(await screen.findByText('Dentro desde las 18:02')).toBeTruthy()
    expect(screen.getByText('Entrada fichada a las 18:02')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fichar salida' })).toBeTruthy()
    const post = calls.find((c) => c.path === '/time-entries/clock-in')!
    expect(post.body).toEqual({})
    expect(post.headers.Authorization).toBe('Bearer test-token')
  })

  it('shows how long the person has been in and asks for the break on the way out', async () => {
    const clockIn = new Date(Date.now() - 135 * 60_000).toISOString()
    let open: TimeEntry | null = entry({ clockIn })
    const calls = workerApi((call) => {
      if (call.path === '/time-entries/me/open') return open ? json(200, open) : noContent()
      if (call.method === 'POST' && call.path === '/time-entries/clock-out') {
        const closed = entry({
          clockIn,
          clockOut: new Date().toISOString(),
          breakMinutes: 15,
          workedMinutes: 120,
          status: 'CLOSED',
        })
        open = null
        return json(200, closed)
      }
    })
    renderApp('/')
    expect(await screen.findByText(`Dentro desde las ${zonedTime(clockIn, 'Europe/Madrid')}`)).toBeTruthy()
    expect(screen.getByText('2h 15m')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fichar salida' }))
    const dialog = screen.getByRole('dialog', { name: 'Fichar salida' })
    const breakInput = within(dialog).getByLabelText('Minutos de pausa') as HTMLInputElement
    expect(breakInput.value).toBe('0')
    expect(within(dialog).getByText('Se registrarán 2h 15m trabajadas.')).toBeTruthy()

    fireEvent.change(breakInput, { target: { value: '700' } })
    expect(within(dialog).getByText('Escribe un número entero entre 0 y 600')).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Fichar salida' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(breakInput, { target: { value: '15' } })
    fireEvent.change(within(dialog).getByLabelText('Nota'), { target: { value: 'Cierre de caja' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fichar salida' }))

    expect(await screen.findByText('Fuera')).toBeTruthy()
    expect(screen.getByText(/Salida fichada a las \d\d:\d\d · 2h trabajadas/)).toBeTruthy()
    expect(calls.find((c) => c.path === '/time-entries/clock-out')!.body).toEqual({ breakMinutes: 15, note: 'Cierre de caja' })
  })

  it('warns about a forgotten clock-out and sends the person to their manager', async () => {
    workerApi((call) => {
      if (call.path === '/time-entries/me/open') return json(200, entry({ clockIn: '2026-11-18T17:02:00Z', isStale: true }))
    })
    renderApp('/')
    expect(await screen.findByText(/Parece que olvidaste fichar la salida. Avisa a tu encargado/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fichar salida' })).toBeNull()
  })

  it('explains a 409 when the person was already clocked in', async () => {
    let calledOpen = 0
    workerApi((call) => {
      if (call.path === '/time-entries/me/open') return calledOpen++ === 0 ? noContent() : json(200, entry())
      if (call.path === '/time-entries/clock-in') return json(409, { status: 409, message: 'Worker already has an open time entry' })
    })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar entrada' }))
    expect(await screen.findByText('Ya tenías la entrada fichada desde las 18:02.')).toBeTruthy()
    expect(screen.getByText('Dentro desde las 18:02')).toBeTruthy()
  })

  it('explains a 409 for a deactivated record', async () => {
    workerApi((call) => {
      if (call.path === '/time-entries/me/open') return noContent()
      if (call.path === '/time-entries/clock-in') return json(409, { status: 409, message: 'Worker is inactive' })
    })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar entrada' }))
    expect(await screen.findByText('No se ha podido fichar: tu ficha está desactivada. Habla con tu encargado.')).toBeTruthy()
  })

  it('explains a 409 on the way out when the entry was already closed', async () => {
    let open: TimeEntry | null = entry({ clockIn: new Date(Date.now() - 60 * 60_000).toISOString() })
    workerApi((call) => {
      if (call.path === '/time-entries/me/open') return open ? json(200, open) : noContent()
      if (call.path === '/time-entries/clock-out') {
        open = null
        return json(409, { status: 409, message: 'No open time entry' })
      }
    })
    renderApp('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar salida' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fichar salida' }))
    expect(
      await screen.findByText('No tenías ninguna entrada abierta: puede que tu encargado ya la haya cerrado.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Fuera')).toBeTruthy()
  })

  it("shows today's planned shift, a night one with its +1", async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
    workerApi((call) => {
      if (call.path === '/time-entries/me/open') return noContent()
      if (call.path === `/worker-shifts/worker/5?from=${addDays(today, -1)}&to=${today}`) {
        return json(200, [
          { id: 1, workerId: 5, zoneId: 7, date: today, startTime: '23:00:00', endTime: '23:30:00', endsNextDay: false, durationMinutes: 30 },
          { id: 2, workerId: 5, zoneId: 7, date: today, startTime: '23:45:00', endTime: '02:00:00', endsNextDay: true, durationMinutes: 135 },
        ])
      }
    })
    renderApp('/')
    const line = await screen.findByText(/Tu turno de hoy|Turno en curso/)
    expect(line.textContent).toMatch(/23:(00–23:30|45–02:00\+1 del día siguiente) · Sala/)
  })
})

describe('My hours', () => {
  it('lists the days of the period with their status, corrections and history, and never asks for costs', async () => {
    const corrected = entry({
      id: 41,
      businessDate: '2026-11-20',
      clockIn: '2026-11-20T17:10:00Z',
      clockOut: '2026-11-21T01:00:00Z',
      breakMinutes: 20,
      workedMinutes: 450,
      status: 'CLOSED',
      isEdited: true,
      shiftId: 9,
    })
    const calls = workerApi((call) => {
      if (call.path === '/time-entries/me/open') return noContent()
      if (call.path.startsWith('/reports/worker/5/days?')) {
        return json(200, {
          workerId: 5,
          firstName: 'Lucía',
          lastName: 'Romero',
          from: '2026-11-16',
          to: '2026-11-22',
          plannedMinutes: 480,
          workedMinutes: 450,
          differenceMinutes: -30,
          plannedCost: null,
          actualCost: null,
          days: [
            {
              date: '2026-11-20',
              plannedMinutes: 480,
              workedMinutes: 450,
              status: 'LATE',
              shifts: [{ id: 9, workerId: 5, zoneId: 7, date: '2026-11-20', startTime: '18:00:00', endTime: '02:00:00', endsNextDay: true, durationMinutes: 480 }],
              entries: [corrected],
            },
          ],
        })
      }
      if (call.path === '/time-entries/41/history') {
        return json(200, [
          { id: 1, action: 'CREATED', changedAt: '2026-11-20T17:10:00Z', changedByUserId: 5, changedByName: 'Lucía Romero', reason: null, clockIn: '2026-11-20T17:10:00Z', clockOut: null, breakMinutes: 0 },
          { id: 2, action: 'CORRECTED', changedAt: '2026-11-21T09:00:00Z', changedByUserId: 2, changedByName: 'Ana Gil', reason: 'Olvidó fichar la pausa', clockIn: '2026-11-20T17:10:00Z', clockOut: '2026-11-21T01:00:00Z', breakMinutes: 20 },
        ])
      }
    })
    renderApp('/hours')
    expect(await screen.findByRole('heading', { name: 'Mis horas' })).toBeTruthy()
    expect(await screen.findByText('Con retraso')).toBeTruthy()
    expect(screen.getByText('−30m')).toBeTruthy()
    expect(screen.getByText('Corregido')).toBeTruthy()
    // 17:10Z is 18:10 in Madrid; the clock-out falls on the next calendar day
    const line = screen.getByText('pausa 20 min').closest('.day-line')!
    expect(line.textContent).toContain('18:10–02:00+1')

    fireEvent.click(screen.getByRole('button', { name: 'Historial: 18:10' }))
    const dialog = await screen.findByRole('dialog', { name: 'Historial de cambios' })
    expect(await within(dialog).findByText('«Olvidó fichar la pausa»')).toBeTruthy()
    expect(within(dialog).getByText(/Ana Gil/)).toBeTruthy()

    await waitFor(() => expect(calls.some((c) => c.path.startsWith('/reports/worker/5/days'))).toBe(true))
    expect(calls.some((c) => c.path.includes('/rates') || c.path.includes('/reports/establishment'))).toBe(false)
    expect(screen.queryByText(/€/)).toBeNull()
  })
})
