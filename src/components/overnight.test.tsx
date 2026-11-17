import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KEvent, Shift, Zone } from '../api/types'
import { LocaleProvider } from '../lib/i18n'
import type { StaffMember } from '../lib/queries'
import { addDays, today, weekStart } from '../lib/time'
import { Board } from './Board'
import { CopyWeekDialog, ShiftBatchDialog, ShiftEditDialog } from './ShiftDialogs'
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

function capturePosts() {
  const posted: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)))
      return new Response('[]', { status: 201 })
    }),
  )
  return posted
}

const zones: Zone[] = [{ id: 7, name: 'Sala', establishmentId: 1 }]
const lucia: StaffMember = {
  userId: 1,
  establishmentId: 1,
  isActive: true,
  user: { id: 1, username: 'lucia', firstName: 'Lucía', lastName: 'Romero', phoneNumber: null, email: 'l@r.es', role: 'WORKER' },
  name: 'Lucía Romero',
  initials: 'LR',
}

function shift(id: number, date: string, startTime: string, endTime: string, workerId = 1): Shift {
  const overnight = endTime <= startTime
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const duration = eh * 60 + em - (sh * 60 + sm) + (overnight ? 24 * 60 : 0)
  return { id, workerId, zoneId: 7, date, startTime, endTime, endsNextDay: overnight, durationMinutes: duration }
}

describe('a shift that ends the next day', () => {
  const tomorrow = addDays(today(), 1)

  function renderBatch(startTime: string, endTime: string) {
    const posted = capturePosts()
    wrap(
      <ShiftBatchDialog
        staff={[lucia]}
        zones={zones}
        anchorDate={tomorrow}
        draft={{ workerIds: [1], zoneId: 7, dates: [tomorrow], startTime, endTime }}
        onClose={() => {}}
      />,
    )
    return posted
  }

  it('says it ends the next day, shows how long it lasts and sends the times as they are', async () => {
    const posted = renderBatch('18:00', '02:00')
    expect(screen.getByText('Termina al día siguiente, a las 02:00. Dura 8h.')).toBeTruthy()
    expect(screen.getByText('Al día siguiente')).toBeTruthy()
    expect(screen.getByText('1 turno · 8h cada uno')).toBeTruthy()
    // The preview marks the end with +1, read out as words
    expect(screen.getAllByText('del día siguiente').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir turno' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual([{ workerId: 1, zoneId: 7, date: tomorrow, startTime: '18:00', endTime: '02:00' }])
  })

  it('refuses a zero-length shift', () => {
    renderBatch('18:00', '18:00')
    expect(screen.getByText('Empieza y termina a la misma hora')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Añadir turno' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('refuses more than 16 hours', () => {
    renderBatch('08:00', '01:00')
    expect(screen.getByText('Un turno puede durar 16 horas como máximo')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Añadir turno' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps a same-day shift as it was', () => {
    renderBatch('09:00', '17:30')
    expect(screen.getByText('Dura 8h 30m')).toBeTruthy()
    expect(screen.queryByText(/Termina al día siguiente/)).toBeNull()
  })

  it('can be edited into a night shift', async () => {
    const posted = capturePosts()
    wrap(<ShiftEditDialog shift={shift(5, tomorrow, '12:00:00', '20:00:00')} staff={[lucia]} zones={zones} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Termina'), { target: { value: '01:30' } })
    expect(screen.getByText('Termina al día siguiente, a las 01:30. Dura 13h 30m.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({ workerId: 1, zoneId: 7, date: tomorrow, startTime: '12:00', endTime: '01:30' })
  })
})

describe('Copy last week', () => {
  it('keeps night shifts ending the next day', async () => {
    const posted = capturePosts()
    // Copy this week onto next week, so no copy falls in the past
    const thisMonday = weekStart(today())
    const nextMonday = addDays(thisMonday, 7)
    wrap(
      <CopyWeekDialog
        shifts={[shift(1, addDays(thisMonday, 4), '20:00:00', '03:00:00'), shift(2, addDays(thisMonday, 5), '12:00:00', '16:00:00')]}
        staff={[lucia]}
        zones={zones}
        targetWeekDate={nextMonday}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copiar 2 turnos' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual([
      { workerId: 1, zoneId: 7, date: addDays(nextMonday, 4), startTime: '20:00', endTime: '03:00' },
      { workerId: 1, zoneId: 7, date: addDays(nextMonday, 5), startTime: '12:00', endTime: '16:00' },
    ])
  })
})

describe('Board past midnight', () => {
  const friday = '2026-11-20'
  const saturday = '2026-11-21'
  const people = [{ userId: 1, name: 'Lucía Romero', initials: 'LR' }]
  const lateEvent: KEvent = {
    id: 3,
    title: 'Fiesta',
    dateTime: `${saturday}T01:00:00`,
    zoneId: 7,
    zoneName: 'Sala',
    peopleNumber: 40,
    establishmentId: 1,
    description: null,
  }

  it('draws a night shift whole, on an axis that runs into the next day', () => {
    wrap(<Board zones={zones} people={people} shifts={[shift(1, friday, '18:00:00', '02:00:00')]} events={[]} assignments={new Map()} />)
    expect(screen.getByRole('button', { name: 'Lucía Romero, de 18:00 a 02:00 del día siguiente' })).toBeTruthy()
    expect(screen.getByText('+1: día siguiente')).toBeTruthy()
    const ticks = [...document.querySelectorAll('.board-tick')].map((n) => n.textContent)
    expect(ticks).toContain('22:00')
    expect(ticks).toContain('00:00+1 del día siguiente')
    expect(ticks.some((tick) => tick?.startsWith('24'))).toBe(false)
    // The bar reaches the end of the axis instead of stopping at 24:00
    const bar = document.querySelector<HTMLElement>('.shift-bar')!
    expect(parseFloat(bar.style.left) + parseFloat(bar.style.width)).toBeCloseTo(100)
  })

  it("carries last night's shift into the small hours, where it covers an early event", () => {
    wrap(
      <Board
        zones={zones}
        people={people}
        shifts={[]}
        previousNight={[shift(1, friday, '18:00:00', '02:00:00')]}
        events={[lateEvent]}
        assignments={new Map()}
        selectedEventId={3}
      />,
    )
    const section = screen.getByRole('region', { name: 'Sala' })
    const bar = within(section).getByRole('button', {
      name: 'Lucía Romero, turno del día anterior de 18:00 a 02:00, sigue hasta las 02:00, cubre Fiesta',
    })
    expect(bar.textContent).toBe('hasta 02:00')
    expect(bar.style.left).toBe('0%')
  })
})
