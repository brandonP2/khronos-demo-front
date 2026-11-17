import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { TimeEntry } from '../../api/types'
import { parseRate } from '../../lib/hours'
import { addDays, zonedToday } from '../../lib/time'
import { json, mockApi, renderApp, user, type Call, type Route } from '../../test/helpers'

const owner = user(2, 'OWNER', 'Ana', 'Gil')
const lucia = user(5, 'WORKER')
const venue = {
  id: 1,
  establishmentName: 'Casa Lucía',
  establishmentAddress: 'Calle Mayor 1',
  ownerId: 2,
  ownerName: 'Ana Gil',
  ownerEmail: 'a@g.es',
  ownerPhone: null,
  timeZone: 'Europe/Madrid',
}

function entry(patch: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 41,
    workerId: 5,
    workerFirstName: 'Lucía',
    workerLastName: 'Romero',
    establishmentId: 1,
    businessDate: '2025-11-14',
    clockIn: '2025-11-14T17:10:00Z',
    clockOut: '2025-11-15T01:00:00Z',
    breakMinutes: 0,
    workedMinutes: 470,
    shiftId: 9,
    source: 'WORKER',
    status: 'CLOSED',
    isEdited: false,
    isStale: false,
    note: null,
    ...patch,
  }
}

const daysReport = {
  workerId: 5,
  firstName: 'Lucía',
  lastName: 'Romero',
  from: '2025-11-10',
  to: '2025-11-16',
  plannedMinutes: 480,
  workedMinutes: 470,
  differenceMinutes: -10,
  plannedCost: 100,
  actualCost: 97.92,
  days: [
    { date: '2025-11-14', plannedMinutes: 480, workedMinutes: 470, status: 'LATE', shifts: [], entries: [entry()] },
    { date: '2025-11-12', plannedMinutes: 360, workedMinutes: 0, status: 'MISSED', shifts: [], entries: [] },
  ],
}

function ownerApi(extra: Route = () => undefined, rates: unknown[] = []) {
  return mockApi(async (call: Call) => {
    const answer = await extra(call)
    if (answer) return answer
    if (call.path === '/users/me') return json(200, owner)
    if (call.path === '/establishments/owner/2') return json(200, [venue])
    if (call.path === '/workers/establishment/1') return json(200, [{ userId: 5, establishmentId: 1, isActive: true }])
    if (call.path === '/users/establishment/1') return json(200, [lucia])
    if (call.path === '/workers/5/rates') return json(200, rates)
    if (call.path.startsWith('/reports/worker/5/days?')) return json(200, daysReport)
    if (call.path.startsWith('/time-entries/worker/5?')) {
      return json(200, [entry(), entry({ id: 42, businessDate: '2025-11-11', clockIn: '2025-11-11T08:00:00Z', clockOut: '2025-11-11T12:00:00Z', status: 'VOIDED', workedMinutes: 240 })])
    }
    return undefined
  })
}

const PERSON = '/team/5?from=2025-11-10&to=2025-11-16'

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('person page', () => {
  it('shows the period from the link, day by day with the status in words, and the cost', async () => {
    const calls = ownerApi()
    renderApp(PERSON)
    expect(await screen.findByRole('heading', { name: 'Lucía Romero' })).toBeTruthy()
    expect(await screen.findByText('Turno sin fichar')).toBeTruthy()
    expect(screen.getByText('Con retraso')).toBeTruthy()
    expect(screen.getByText('97,92 €', { normalizer: (s) => s.replace(/\s/g, ' ') })).toBeTruthy()
    // The range from the link is not a preset, so it opens as a custom range
    expect(screen.getByRole('button', { name: 'Personalizado' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2025-11-10')
    await waitFor(() => expect(calls.some((c) => c.path === '/time-entries/worker/5?from=2025-11-10&to=2025-11-16&includeVoided=true')).toBe(true))
    expect(calls.some((c) => c.path === '/reports/worker/5/days?from=2025-11-10&to=2025-11-16')).toBe(true)
  })

  it('corrects an entry only with a reason, and sends the times as UTC instants', async () => {
    const calls = ownerApi((call) => (call.method === 'PUT' && call.path === '/time-entries/41' ? json(200, entry({ isEdited: true })) : undefined))
    renderApp(PERSON)
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir: fichaje del vie, 14 nov a las 18:10' }))
    const dialog = screen.getByRole('dialog', { name: 'Corregir fichaje' })
    // Prefilled on the venue clock; the clock-out is the next day
    expect((within(dialog).getByLabelText('Entrada') as HTMLInputElement).value).toBe('18:10')
    expect((within(dialog).getByLabelText('Salida') as HTMLInputElement).value).toBe('02:00')
    expect(within(dialog).getByText('Sale al día siguiente.')).toBeTruthy()

    const save = within(dialog).getByRole('button', { name: 'Guardar corrección' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    const reason = within(dialog).getByLabelText('Motivo')
    fireEvent.change(reason, { target: { value: 'ab' } })
    fireEvent.blur(reason)
    expect(within(dialog).getByText('Escribe el motivo: al menos 3 caracteres')).toBeTruthy()
    expect(save.disabled).toBe(true)

    fireEvent.change(reason, { target: { value: 'Olvidó fichar la pausa' } })
    fireEvent.change(within(dialog).getByLabelText('Pausa (minutos)'), { target: { value: '20' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      clockIn: '2025-11-14T17:10:00Z',
      clockOut: '2025-11-15T01:00:00Z',
      breakMinutes: 20,
      reason: 'Olvidó fichar la pausa',
    })
    expect(screen.getByText('Fichaje corregido')).toBeTruthy()
  })

  it('keeps the exact instants, seconds included, of the times the owner did not change', async () => {
    const precise = entry({ clockIn: '2025-11-14T17:10:45Z', clockOut: '2025-11-15T01:00:30Z' })
    const calls = mockApi((call) => {
      if (call.method === 'PUT') return json(200, precise)
      if (call.path.startsWith('/time-entries/worker/5?')) return json(200, [precise])
      if (call.path === '/users/me') return json(200, owner)
      if (call.path === '/establishments/owner/2') return json(200, [venue])
      if (call.path === '/workers/establishment/1') return json(200, [{ userId: 5, establishmentId: 1, isActive: true }])
      if (call.path === '/users/establishment/1') return json(200, [lucia])
      if (call.path === '/workers/5/rates') return json(200, [])
      if (call.path.startsWith('/reports/worker/5/days?')) return json(200, daysReport)
    })
    renderApp(PERSON)
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir: fichaje del vie, 14 nov a las 18:10' }))
    const dialog = screen.getByRole('dialog', { name: 'Corregir fichaje' })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Añade la pausa' } })
    fireEvent.change(within(dialog).getByLabelText('Pausa (minutos)'), { target: { value: '15' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar corrección' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      clockIn: '2025-11-14T17:10:45Z',
      clockOut: '2025-11-15T01:00:30Z',
      breakMinutes: 15,
    })
  })

  it('refuses a clock-out at the same time as the clock-in', async () => {
    ownerApi()
    renderApp(PERSON)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Añadir jornada' }))[0])
    const dialog = screen.getByRole('dialog', { name: 'Añadir jornada de Lucía Romero' })
    fireEvent.change(within(dialog).getByLabelText('Fecha de entrada'), { target: { value: '2025-11-13' } })
    fireEvent.change(within(dialog).getByLabelText('Entrada'), { target: { value: '08:00' } })
    fireEvent.change(within(dialog).getByLabelText('Salida'), { target: { value: '08:00' } })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Día olvidado' } })
    expect(within(dialog).getByText('La salida no puede ser a la misma hora que la entrada')).toBeTruthy()
    expect(within(dialog).queryByText('Sale al día siguiente.')).toBeNull()
    expect((within(dialog).getByRole('button', { name: 'Añadir jornada' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('voids an entry only with a reason; a voided one can no longer be corrected', async () => {
    const calls = ownerApi((call) =>
      call.method === 'PUT' && call.path === '/time-entries/41/void' ? json(200, entry({ status: 'VOIDED' })) : undefined,
    )
    renderApp(PERSON)
    expect(await screen.findByText('Anulado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Corregir: fichaje del mar, 11 nov/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Anular: fichaje del vie, 14 nov a las 18:10' }))
    const dialog = screen.getByRole('dialog', { name: 'Anular fichaje' })
    expect(within(dialog).getByText('Lucía Romero, viernes, 14 de noviembre.')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Anular fichaje' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Fichaje duplicado' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls.some((c) => c.path === '/time-entries/41/void')).toBe(true))
    expect(calls.find((c) => c.path === '/time-entries/41/void')!.body).toEqual({ reason: 'Fichaje duplicado' })
  })

  it('adds a day that was not clocked', async () => {
    const calls = ownerApi((call) =>
      call.method === 'POST' && call.path === '/time-entries' ? json(201, entry({ id: 50, source: 'MANAGER' })) : undefined,
    )
    renderApp(PERSON)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Añadir jornada' }))[0])
    const dialog = screen.getByRole('dialog', { name: 'Añadir jornada de Lucía Romero' })
    fireEvent.change(within(dialog).getByLabelText('Fecha de entrada'), { target: { value: '2025-11-13' } })
    fireEvent.change(within(dialog).getByLabelText('Entrada'), { target: { value: '10:00' } })
    fireEvent.change(within(dialog).getByLabelText('Salida'), { target: { value: '14:30' } })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'No tenía batería en el móvil' } })
    expect(within(dialog).getByText('Trabajado: 4h 30m')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir jornada' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/time-entries')).toBe(true))
    expect(calls.find((c) => c.method === 'POST' && c.path === '/time-entries')!.body).toEqual({
      workerId: 5,
      clockIn: '2025-11-13T09:00:00Z',
      clockOut: '2025-11-13T13:30:00Z',
      breakMinutes: 0,
      reason: 'No tenía batería en el móvil',
    })
  })

  it('adds an hourly rate and refuses a second one on the same day', async () => {
    const existing = [{ id: 1, workerId: 5, hourlyRate: 11, effectiveFrom: '2026-01-01', createdAt: '2026-01-01T10:00:00Z' }]
    const calls = ownerApi(
      (call) =>
        call.method === 'POST' && call.path === '/workers/5/rates'
          ? json(201, { id: 2, workerId: 5, hourlyRate: 12.5, effectiveFrom: '2026-12-01', createdAt: '2026-11-17T10:00:00Z' })
          : undefined,
      existing,
    )
    renderApp(PERSON)
    expect(await screen.findByText('Vigente')).toBeTruthy()
    // Inside a sentence the weekday stays in lower case
    expect(screen.getByText('desde el jueves, 1 de enero')).toBeTruthy()
    const amount = screen.getByLabelText('Euros por hora')
    const from = screen.getByLabelText('Se aplica desde')
    const add = screen.getByRole('button', { name: 'Añadir tarifa' }) as HTMLButtonElement

    fireEvent.change(amount, { target: { value: '12,505' } })
    expect(screen.getByText('Escribe un importe mayor que 0, con 2 decimales como mucho')).toBeTruthy()
    fireEvent.change(amount, { target: { value: '12,50' } })
    fireEvent.change(from, { target: { value: '2026-01-01' } })
    expect(screen.getByText('Ya hay una tarifa que empieza ese día')).toBeTruthy()
    expect(add.disabled).toBe(true)

    fireEvent.change(from, { target: { value: '2026-12-01' } })
    fireEvent.click(add)
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/workers/5/rates')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ hourlyRate: 12.5, effectiveFrom: '2026-12-01' })
  })

  it('asks before a rate from a past date changes the cost of the days worked since then', async () => {
    // A month before today on the venue's clock
    const past = addDays(zonedToday('Europe/Madrid'), -30)
    const calls = ownerApi((call) =>
      call.method === 'POST' && call.path === '/workers/5/rates'
        ? json(201, { id: 2, workerId: 5, hourlyRate: 12.5, effectiveFrom: past, createdAt: '2026-11-17T10:00:00Z' })
        : undefined,
    )
    renderApp(PERSON)
    expect(await screen.findByText(/Si empieza en una fecha pasada, cambia el coste de los días trabajados/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Euros por hora'), { target: { value: '12,50' } })
    fireEvent.change(screen.getByLabelText('Se aplica desde'), { target: { value: past } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir tarifa' }))

    const dialog = screen.getByRole('dialog', { name: 'Aplicar la tarifa desde una fecha pasada' })
    expect(within(dialog).getByText(/^Los días trabajados desde el [a-zé]+, .+ pasarán a calcularse con 12,50\s€\/h/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir tarifa' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Añadir tarifa' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([{ hourlyRate: 12.5, effectiveFrom: past }])
    expect(screen.getByText('Tarifa añadida')).toBeTruthy()
  })

  it('says so when the person is not on this venue', async () => {
    ownerApi()
    renderApp('/team/99')
    expect(await screen.findByText('Esta persona no está en el equipo de este local')).toBeTruthy()
  })
})

describe('parseRate', () => {
  it('reads Spanish and English decimals, and refuses the rest', () => {
    expect(parseRate('12,50')).toBe(12.5)
    expect(parseRate('12.5')).toBe(12.5)
    expect(parseRate(' 9 € ')).toBe(9)
    expect(parseRate('0')).toBeNull()
    expect(parseRate('12,505')).toBeNull()
    expect(parseRate('-3')).toBeNull()
    expect(parseRate('doce')).toBeNull()
  })
})
