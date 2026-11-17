// Around midnight a device in another zone is on another day than the venue. What "today",
// the past and the future are follows the venue's clock, as clocking in does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { KEvent } from '../api/types'
import { today, zonedToday } from '../lib/time'
import { json, mockApi, noContent, renderApp, user, type Call } from '../test/helpers'

const owner = user(2, 'OWNER', 'Ana', 'Gil')
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

const FRIDAY = '2026-11-20'
const SATURDAY = '2026-11-21'
// 23:30 UTC: still Friday 18:30 on a phone in New York, already Saturday 00:30 at the venue in Madrid
const NEAR_MIDNIGHT = '2026-11-20T23:30:00Z'

function event(id: number, title: string, dateTime: string): KEvent {
  return { id, title, dateTime, zoneId: 7, zoneName: 'Sala', peopleNumber: 40, establishmentId: 1, description: null }
}

/** The owner's venue with one zone, Lucía on the team and no shifts; `events` answer every range */
function ownerApi(events: KEvent[] = []) {
  return mockApi((call: Call) => {
    if (call.path === '/users/me') return json(200, owner)
    if (call.path === '/establishments/owner/2') return json(200, [venue])
    if (call.path === '/zones/establishment/1') return json(200, [{ id: 7, name: 'Sala', establishmentId: 1 }])
    if (call.path === '/workers/establishment/1') return json(200, [{ userId: 5, establishmentId: 1, isActive: true }])
    if (call.path === '/users/establishment/1') return json(200, [lucia])
    if (call.path.startsWith('/events/establishment/1')) return json(200, events)
    if (call.method === 'GET') return json(200, [])
    return undefined
  })
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubEnv('TZ', 'America/New_York')
  // Only the clock is faked; timers stay real so queries and waitFor run as usual
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NEAR_MIDNIGHT))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("a device on another day than the venue, near midnight", () => {
  it('is set up with the device on Friday and the venue on Saturday', () => {
    expect(today()).toBe(FRIDAY)
    expect(zonedToday('Europe/Madrid')).toBe(SATURDAY)
  })

  it("opens the schedule on the venue's today and treats the device's as past", async () => {
    ownerApi()
    renderApp('/schedule')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoy' })).toBeTruthy()
    expect(screen.getByText('Sábado, 21 de noviembre')).toBeTruthy()
    expect(document.querySelector('.week-day.is-today .dn')?.textContent).toBe('21')

    fireEvent.click(screen.getByRole('button', { name: 'Añadir turnos' }))
    const dialog = screen.getByRole('dialog', { name: 'Añadir turnos' })
    expect((within(dialog).getByRole('button', { name: 'Vie 20' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: 'Sáb 21' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("splits the events on the venue's day and names them from it", async () => {
    const calls = ownerApi([event(1, 'Cena de empresa', `${FRIDAY}T22:00:00`), event(2, 'Brunch', `${SATURDAY}T11:00:00`)])
    renderApp('/events')
    expect(await screen.findByText('Brunch')).toBeTruthy()
    expect(screen.queryByText('Cena de empresa')).toBeNull()
    expect(calls.some((c) => c.path === `/events/establishment/1?from=${SATURDAY}`)).toBe(true)
    expect(document.querySelector('.agenda-date .d')?.textContent).toBe('Hoy')

    // Today's event can still be staffed with someone who has no shift yet
    fireEvent.click(screen.getByRole('button', { name: /Brunch/ }))
    let drawer = screen.getByRole('dialog', { name: 'Brunch' })
    expect(within(drawer).getByText('Hoy · 11:00 · Sala')).toBeTruthy()
    expect(within(drawer).getByText('Sin turno')).toBeTruthy()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cerrar' }))

    // The device's today is yesterday at the venue: past, and no shift is offered for it
    fireEvent.click(screen.getByRole('button', { name: 'Pasados' }))
    fireEvent.click(await screen.findByRole('button', { name: /Cena de empresa/ }))
    drawer = screen.getByRole('dialog', { name: 'Cena de empresa' })
    expect(within(drawer).getByText('Ayer · 22:00 · Sala')).toBeTruthy()
    expect(within(drawer).queryByText('Sin turno')).toBeNull()
  })

  it("shows a worker's shifts on the venue's day, waiting for the venue rather than flickering", async () => {
    let releaseVenue: () => void = () => {}
    const venueLoaded = new Promise<void>((resolve) => {
      releaseVenue = resolve
    })
    const calls = mockApi(async (call: Call) => {
      if (call.path === '/users/me') return json(200, lucia)
      if (call.path === '/workers/5') return json(200, { userId: 5, establishmentId: 1, isActive: true })
      if (call.path === '/establishments/1') {
        await venueLoaded
        return json(200, venue)
      }
      if (call.path === '/time-entries/me/open') return noContent()
      if (call.path === '/zones/establishment/1') return json(200, [{ id: 7, name: 'Sala', establishmentId: 1 }])
      if (call.path.startsWith('/worker-shifts/worker/5')) {
        return json(200, [
          { id: 1, workerId: 5, zoneId: 7, date: SATURDAY, startTime: '20:00:00', endTime: '23:00:00', endsNextDay: false, durationMinutes: 180 },
        ])
      }
      if (call.method === 'GET') return json(200, [])
      return undefined
    })
    renderApp('/')

    // Everything else is in, but the device's day ("tomorrow") is never shown while the venue loads
    await waitFor(() => expect(calls.some((c) => c.path.startsWith('/events/establishment/1'))).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('Mañana')).toBeNull()
    expect(screen.queryByText('Hoy')).toBeNull()

    releaseVenue()
    expect((await screen.findAllByText('Hoy')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Mañana')).toBeNull()
  })
})

describe('a night shift still running', () => {
  // Friday 18:00 to Saturday 02:00, with an event on each side of midnight
  const night = { id: 1, workerId: 5, zoneId: 7, date: FRIDAY, startTime: '18:00:00', endTime: '02:00:00', endsNextDay: true, durationMinutes: 480 }
  const dinner = event(1, 'Cena de empresa', `${FRIDAY}T22:00:00`)
  const party = event(2, 'Fiesta', `${SATURDAY}T01:00:00`)

  /** Lucía, on the night shift and on both events */
  function workerApi() {
    return mockApi((call: Call) => {
      if (call.path === '/users/me') return json(200, lucia)
      if (call.path === '/workers/5') return json(200, { userId: 5, establishmentId: 1, isActive: true })
      if (call.path === '/establishments/1') return json(200, venue)
      if (call.path === '/time-entries/me/open') return noContent()
      if (call.path === '/zones/establishment/1') return json(200, [{ id: 7, name: 'Sala', establishmentId: 1 }])
      if (call.path.startsWith('/worker-shifts/worker/5')) return json(200, [night])
      if (call.path.startsWith('/events/establishment/1')) return json(200, [dinner, party])
      if (call.path === '/worker-events/worker/5') return json(200, [{ id: 1, workerId: 5, eventId: 1 }, { id: 2, workerId: 5, eventId: 2 }])
      if (call.method === 'GET') return json(200, [])
      return undefined
    })
  }

  beforeEach(() => {
    // Phone and venue both in Madrid: what matters here is when the shift ends
    vi.stubEnv('TZ', 'Europe/Madrid')
  })

  it('stays ahead, as the current shift and with the events it covers, until it ends', async () => {
    // Saturday 01:00 in Madrid
    vi.setSystemTime(new Date('2026-11-21T00:00:00Z'))
    const calls = workerApi()
    renderApp('/')
    const label = await screen.findByText('Turno en curso', { selector: '.stat .label' })
    const stat = label.closest('.stat')!
    expect(within(stat as HTMLElement).getByText('Ayer')).toBeTruthy()
    expect(stat.querySelector('.meta')?.textContent).toBe('18:00–02:00+1 del día siguiente · Sala')
    expect(document.querySelector('.agenda-date .d')?.textContent).toBe('Ayer')
    expect(screen.getByText('2 eventos durante este turno')).toBeTruthy()
    expect(screen.getByText('Cena de empresa')).toBeTruthy()
    expect(screen.getByText('Fiesta')).toBeTruthy()
    // Fetched from yesterday on, even on a Saturday, whose week started on Monday
    expect(calls.some((c) => c.path === '/worker-shifts/worker/5?from=2026-11-16')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Pasados' }))
    expect(await screen.findByText('No hay turnos pasados')).toBeTruthy()
  })

  it('moves to the past once it has ended', async () => {
    // Saturday 02:30 in Madrid
    vi.setSystemTime(new Date('2026-11-21T01:30:00Z'))
    workerApi()
    renderApp('/')
    expect(await screen.findByText('Todavía no tienes turnos')).toBeTruthy()
    expect(screen.getByText('Próximo turno')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pasados' }))
    expect(await screen.findByText('2 eventos durante este turno')).toBeTruthy()
    expect(document.querySelector('.agenda-date .d')?.textContent).toBe('Ayer')
  })

  it('counts as ahead of a zone the owner is about to delete', async () => {
    vi.setSystemTime(new Date('2026-11-21T00:00:00Z'))
    mockApi((call: Call) => {
      if (call.path === '/users/me') return json(200, owner)
      if (call.path === '/establishments/owner/2') return json(200, [venue])
      if (call.path === '/zones/establishment/1') return json(200, [{ id: 7, name: 'Sala', establishmentId: 1 }])
      if (call.path.startsWith('/worker-shifts/owner/2')) return json(200, [night])
      if (call.method === 'GET') return json(200, [])
      return undefined
    })
    renderApp('/venue')
    expect(await screen.findByText('1 turno · 0 eventos por delante')).toBeTruthy()
  })
})
