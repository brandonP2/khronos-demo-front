import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TimeEntry } from '../api/types'
import type { StaffMember } from '../lib/queries'
import { zonedTime } from '../lib/time'
import { json, mockApi, user, wrap } from '../test/helpers'
import { NowCard } from './NowCard'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function member(id: number, firstName: string, lastName: string, isActive = true): StaffMember {
  const u = user(id, 'WORKER', firstName, lastName)
  return { userId: id, establishmentId: 1, isActive, user: u, name: `${firstName} ${lastName}`, initials: `${firstName[0]}${lastName[0]}` }
}

const staff = [member(1, 'Lucía', 'Romero'), member(2, 'Marco', 'Bianchi'), member(3, 'Bea', 'Ruiz', false)]

const open: TimeEntry = {
  id: 40,
  workerId: 1,
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
  isStale: true,
  note: null,
}

function renderCard() {
  wrap(
    <MemoryRouter>
      <NowCard venueId={1} staff={staff} timeZone="Europe/Madrid" />
    </MemoryRouter>,
  )
}

describe('Now on the schedule', () => {
  it('lists who is in, since when on the venue clock, and flags a forgotten clock-out', async () => {
    mockApi((call) => (call.path === '/time-entries/establishment/1/open' ? json(200, [open]) : undefined))
    renderCard()
    expect(await screen.findByText('1 dentro')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Lucía Romero' }).getAttribute('href')).toBe('/team/1')
    expect(screen.getByText(/^desde las 18:02 · /)).toBeTruthy()
    expect(screen.getByText('Salida olvidada')).toBeTruthy()
  })

  it('says when nobody is in', async () => {
    mockApi((call) => (call.path === '/time-entries/establishment/1/open' ? json(200, []) : undefined))
    renderCard()
    expect(await screen.findByText('Nadie ha fichado la entrada ahora mismo.')).toBeTruthy()
  })

  it('clocks someone out now through the clock-out of their entry, with the default reason', async () => {
    const recent = { ...open, clockIn: new Date(Date.now() - 3 * 60 * 60_000).toISOString(), isStale: false }
    const calls = mockApi((call) => {
      if (call.path === '/time-entries/establishment/1/open') return json(200, [recent])
      if (call.method === 'POST' && call.path === '/time-entries/40/clock-out') {
        return json(200, { ...recent, clockOut: '2026-11-21T01:10:00Z', status: 'CLOSED', workedMinutes: 180 })
      }
    })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar la salida de Lucía Romero' }))
    const dialog = screen.getByRole('dialog', { name: 'Fichar la salida de Lucía Romero' })
    expect((within(dialog).getByLabelText('Motivo') as HTMLTextAreaElement).value).toBe('Fichado por el encargado')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fichar salida' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    // The server sets the time: only the break and the reason are sent
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ breakMinutes: 0, reason: 'Fichado por el encargado' })
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    expect(await screen.findByText('Lucía Romero: salida a las 02:10')).toBeTruthy()
  })

  it('sends an entry open for more than 24 hours to a correction with the real time', async () => {
    const clockIn = new Date(Date.now() - 30 * 60 * 60_000).toISOString()
    const forgotten = { ...open, clockIn }
    const calls = mockApi((call) => (call.path === '/time-entries/establishment/1/open' ? json(200, [forgotten]) : undefined))
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar la salida de Lucía Romero' }))
    const dialog = screen.getByRole('dialog', { name: 'Fichar la salida de Lucía Romero' })
    const since = zonedTime(clockIn, 'Europe/Madrid')
    expect(within(dialog).getByText(new RegExp(`^Está dentro desde el .+ a las ${since}, hace más de 24 horas`))).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Fichar salida' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Corregir con la hora real' }))
    const correction = screen.getByRole('dialog', { name: 'Corregir fichaje' })
    // Opens with the clock-out to fill in, not "still in"
    expect((within(correction).getByLabelText('Todavía no ha salido') as HTMLInputElement).checked).toBe(false)
    expect((within(correction).getByLabelText('Salida') as HTMLInputElement).value).toBe('')
    expect((within(correction).getByLabelText('Entrada') as HTMLInputElement).value).toBe(since)
    expect(calls.some((c) => c.method !== 'GET')).toBe(false)
  })

  it('turns the 409 of an entry that just passed 24 hours into the same advice', async () => {
    const almost = { ...open, clockIn: new Date(Date.now() - (24 * 60 - 1) * 60_000).toISOString() }
    mockApi((call) => {
      if (call.path === '/time-entries/establishment/1/open') return json(200, [almost])
      if (call.path === '/time-entries/40/clock-out') {
        return json(409, { status: 409, message: 'This time entry has been open for more than 24 hours; correct it instead' })
      }
    })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Fichar la salida de Lucía Romero' }))
    const dialog = screen.getByRole('dialog', { name: 'Fichar la salida de Lucía Romero' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fichar salida' }))
    expect(await within(dialog).findByRole('button', { name: 'Corregir con la hora real' })).toBeTruthy()
    expect(within(dialog).getByText(/hace más de 24 horas/)).toBeTruthy()
  })

  it('clocks in someone who is not in yet, never an inactive person, and needs a reason', async () => {
    const calls = mockApi((call) => {
      if (call.path === '/time-entries/establishment/1/open') return json(200, [open])
      if (call.method === 'POST' && call.path === '/time-entries') {
        return json(201, { ...open, id: 41, workerId: 2, clockIn: String((call.body as { clockIn: string }).clockIn), isStale: false, source: 'MANAGER' })
      }
    })
    renderCard()
    await screen.findByText('1 dentro')
    fireEvent.click(screen.getByRole('button', { name: 'Fichar entrada' }))
    const dialog = screen.getByRole('dialog', { name: 'Fichar la entrada de alguien' })
    const options = within(dialog).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Marco Bianchi'])

    const reason = within(dialog).getByLabelText('Motivo')
    const submit = within(dialog).getByRole('button', { name: 'Fichar entrada' }) as HTMLButtonElement
    fireEvent.change(reason, { target: { value: '' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(reason, { target: { value: 'Llegó sin batería' } })
    fireEvent.click(submit)

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const body = calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>
    expect(body).toMatchObject({ workerId: 2, reason: 'Llegó sin batería' })
    // Cut to the minute, so a device clock a little fast is not a clock-in in the future
    expect(String(body.clockIn)).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/)
    expect(body).not.toHaveProperty('clockOut')
  })
})
