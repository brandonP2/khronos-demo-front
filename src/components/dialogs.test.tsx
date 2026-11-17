import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KEvent, Shift, Zone } from '../api/types'
import { LocaleProvider } from '../lib/i18n'
import type { StaffMember } from '../lib/queries'
import { addDays, today } from '../lib/time'
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
        onClose={() => {}}
        onEdit={() => {}}
        onAddShift={onAddShift}
      />,
    )
    return onAddShift
  }

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

  it('suggests a shift end after a late event, not equal to it', () => {
    const onAddShift = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Darle un turno' }))
    expect(onAddShift).toHaveBeenCalledWith(expect.objectContaining({ workerIds: [3], startTime: '23:30', endTime: '23:59' }))
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

    fireEvent.change(next, { target: { value: 'x'.repeat(73) } })
    expect(screen.getByText('Puede tener 72 caracteres como máximo')).toBeTruthy()

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
