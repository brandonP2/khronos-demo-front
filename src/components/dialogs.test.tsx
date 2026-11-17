import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KEvent, Shift, Zone } from '../api/types'
import { LocaleProvider } from '../lib/i18n'
import type { StaffMember } from '../lib/queries'
import { addDays, deviceTimeZone, today } from '../lib/time'
import { EventDrawer } from './EventDialogs'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { ShiftBatchDialog } from './ShiftDialogs'
import { ToastProvider } from './ui'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="es">
        <ToastProvider>{node}</ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

function person(userId: number, firstName: string, lastName: string): StaffMember {
  return {
    userId,
    establishmentId: 1,
    isActive: true,
    user: { id: userId, username: firstName.toLowerCase(), firstName, lastName, phoneNumber: null, email: 'x@y.es', role: 'WORKER' },
    name: `${firstName} ${lastName}`,
    initials: `${firstName[0]}${lastName[0]}`,
  }
}

const zones: Zone[] = [{ id: 7, name: 'Sala', establishmentId: 1 }]
// The dates here are the device's, so the venue is in the device's zone
const timeZone = deviceTimeZone()
const lucia = person(1, 'Lucía', 'Romero')
const marco = person(2, 'Marco', 'Bianchi')
const tomas = person(3, 'Tomás', 'Vidal')

describe('ShiftBatchDialog', () => {
  it('never sends days that have already passed', async () => {
    const posted: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)))
        return new Response('[]', { status: 201 })
      }),
    )
    const yesterday = addDays(today(), -1)
    const tomorrow = addDays(today(), 1)
    wrap(
      <ShiftBatchDialog
        staff={[lucia]}
        zones={zones}
        anchorDate={yesterday}
        draft={{ workerIds: [1], zoneId: 7, dates: [yesterday, tomorrow], startTime: '18:00', endTime: '23:00' }}
        timeZone={timeZone}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Los días que ya han pasado no se incluyen.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir turno' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual([{ workerId: 1, zoneId: 7, date: tomorrow, startTime: '18:00', endTime: '23:00' }])
  })
})

describe('EventDrawer', () => {
  const day = addDays(today(), 1)
  const shift = (id: number, workerId: number): Shift => ({
    id,
    workerId,
    zoneId: 7,
    date: day,
    startTime: '18:00:00',
    endTime: '23:59:00',
    endsNextDay: false,
    durationMinutes: 359,
  })
  const event: KEvent = {
    id: 9,
    title: 'Cena de boda',
    dateTime: `${day}T23:30:00`,
    zoneId: 7,
    zoneName: 'Sala',
    peopleNumber: 80,
    establishmentId: 1,
    description: null,
  }

  function renderDrawer(onAddShift = vi.fn()) {
    wrap(
      <EventDrawer
        event={event}
        staff={[lucia, marco, tomas]}
        shifts={[shift(1, 1), shift(2, 2)]}
        assignments={[]}
        assignmentsLoading={false}
        timeZone={timeZone}
        onClose={() => {}}
        onEdit={() => {}}
        onAddShift={onAddShift}
      />,
    )
    return onAddShift
  }

  it('holds the lists and their actions until the assignments are in', () => {
    wrap(
      <EventDrawer
        event={event}
        staff={[lucia, marco, tomas]}
        shifts={[shift(1, 1), shift(2, 2)]}
        assignments={[]}
        assignmentsLoading
        timeZone={timeZone}
        onClose={() => {}}
        onEdit={() => {}}
        onAddShift={() => {}}
      />,
    )
    expect(screen.getByText('Cargando asignaciones…')).toBeTruthy()
    expect(screen.queryByText('Lucía Romero')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Asignar a los/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Darle un turno' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('never suggests a shift that ends when it starts', () => {
    const onAddShift = vi.fn()
    wrap(
      <EventDrawer
        event={{ ...event, dateTime: `${day}T23:59:00` }}
        staff={[lucia, marco, tomas]}
        shifts={[shift(1, 1), shift(2, 2)]}
        assignments={[]}
        assignmentsLoading={false}
        timeZone={timeZone}
        onClose={() => {}}
        onEdit={() => {}}
        onAddShift={onAddShift}
      />,
    )
    // Still listed, so the owner sees who is not on shift
    expect(screen.getByText('Tomás Vidal')).toBeTruthy()
    for (const button of screen.queryAllByRole('button', { name: 'Darle un turno' })) fireEvent.click(button)
    for (const [draft] of onAddShift.mock.calls) expect(draft.endTime).not.toBe(draft.startTime)
  })

  it('names the person a failed "assign all" stopped at, and offers to assign the rest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ status: 409, message: 'Assignment [1]: Worker is already assigned to this event' }), {
          status: 409,
        }),
      ),
    )
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a los 2' }))
    expect(await screen.findByText('Marco Bianchi: Worker is already assigned to this event')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Asignar al resto (1)' })).toBeTruthy()
  })

  it('suggests four hours after a late event, ending the next day', () => {
    const onAddShift = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Darle un turno' }))
    expect(onAddShift).toHaveBeenCalledWith(expect.objectContaining({ workerIds: [3], startTime: '23:30', endTime: '03:30' }))
  })

  it("counts last night's shift as cover for an event in the small hours", () => {
    const night: Shift = { ...shift(3, 3), date: addDays(day, -1), startTime: '20:00:00', endTime: '02:00:00', endsNextDay: true, durationMinutes: 360 }
    wrap(
      <EventDrawer
        event={{ ...event, dateTime: `${day}T01:00:00` }}
        staff={[lucia, marco, tomas]}
        shifts={[night]}
        assignments={[]}
        assignmentsLoading={false}
        timeZone={timeZone}
        onClose={() => {}}
        onEdit={() => {}}
        onAddShift={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Asignar' })).toBeTruthy()
    expect(screen.getByText('Tomás Vidal')).toBeTruthy()
    expect(screen.getByText(/Turno 20:00–02:00/)).toBeTruthy()
  })
})

describe('ResetPasswordDialog', () => {
  it('checks length and repeat before sending the new password', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init })
        return new Response(null, { status: 204 })
      }),
    )
    const onClose = vi.fn()
    wrap(<ResetPasswordDialog userId={5} name="Lucía Romero" onClose={onClose} />)
    const submit = screen.getByRole('button', { name: 'Restablecer contraseña' }) as HTMLButtonElement
    const next = screen.getByLabelText('Nueva contraseña')
    const repeat = screen.getByLabelText('Repite la nueva contraseña')

    fireEvent.change(next, { target: { value: 'corta' } })
    fireEvent.change(repeat, { target: { value: 'corta' } })
    expect(screen.getByText('Tiene que tener al menos 8 caracteres')).toBeTruthy()
    expect(submit.disabled).toBe(true)

    const tooLong = /^Es demasiado larga/
    fireEvent.change(next, { target: { value: 'x'.repeat(73) } })
    expect(screen.getByText(tooLong)).toBeTruthy()

    // 40 characters, but 80 bytes: the API would refuse it
    fireEvent.change(next, { target: { value: 'ñ'.repeat(40) } })
    fireEvent.change(repeat, { target: { value: 'ñ'.repeat(40) } })
    expect(screen.getByText(tooLong)).toBeTruthy()
    expect(submit.disabled).toBe(true)

    fireEvent.change(next, { target: { value: 'nueva-clave-segura' } })
    fireEvent.change(repeat, { target: { value: 'otra-clave' } })
    expect(screen.getByText('No coincide')).toBeTruthy()
    expect(submit.disabled).toBe(true)

    fireEvent.change(repeat, { target: { value: 'nueva-clave-segura' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls[0].url).toBe('/api/users/5/password/reset')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ newPassword: 'nueva-clave-segura' })
  })
})
