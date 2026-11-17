import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HoursReport, HoursReportRow } from '../api/types'
import { LocaleProvider } from '../lib/i18n'
import { sortHoursRows } from '../lib/hours'
import { json, mockApi, renderApp, user } from '../test/helpers'
import { HoursTable } from './HoursTable'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

function row(workerId: number, firstName: string, patch: Partial<HoursReportRow> = {}): HoursReportRow {
  return {
    workerId,
    firstName,
    lastName: 'Ruiz',
    isActive: true,
    plannedMinutes: 0,
    workedMinutes: 0,
    differenceMinutes: 0,
    shiftsCount: 0,
    entriesCount: 0,
    lateCount: 0,
    missedShiftsCount: 0,
    unplannedCount: 0,
    openEntriesCount: 0,
    currentHourlyRate: null,
    plannedCost: null,
    actualCost: null,
    ...patch,
  }
}

const report: HoursReport = {
  from: '2026-11-16',
  to: '2026-11-22',
  currency: 'EUR',
  workers: [
    row(1, 'Marta', { plannedMinutes: 2400, workedMinutes: 2310, differenceMinutes: -90, shiftsCount: 5, entriesCount: 5, lateCount: 2, currentHourlyRate: 12.5, plannedCost: 500, actualCost: 481.25 }),
    row(2, 'Álvaro', { plannedMinutes: 1200, workedMinutes: 1500, differenceMinutes: 300, shiftsCount: 3, entriesCount: 4, unplannedCount: 1, currentHourlyRate: 11, plannedCost: 220, actualCost: 275 }),
    row(3, 'Bea', { plannedMinutes: 480, workedMinutes: 0, differenceMinutes: -480, shiftsCount: 1, missedShiftsCount: 1, isActive: false }),
  ],
  totals: { plannedMinutes: 4080, workedMinutes: 3810, differenceMinutes: -270, plannedCost: 720, actualCost: 756.25 },
}

function renderTable() {
  return render(
    <MemoryRouter>
      <LocaleProvider initialLocale="es">
        <HoursTable report={report} personHref={(id) => `/team/${id}?from=2026-11-16&to=2026-11-22`} />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

const names = () =>
  within(document.querySelector('.hours-table tbody') as HTMLElement)
    .getAllByRole('link')
    .filter((a) => a.classList.contains('person-link'))
    .map((a) => a.textContent)

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ')

describe('HoursTable', () => {
  it('starts in name order and sorts by any column, both ways', () => {
    renderTable()
    expect(names()).toEqual(['Álvaro Ruiz', 'Bea Ruiz', 'Marta Ruiz'])

    fireEvent.click(screen.getByRole('button', { name: 'Trabajado' }))
    expect(names()).toEqual(['Marta Ruiz', 'Álvaro Ruiz', 'Bea Ruiz'])
    expect(screen.getByRole('columnheader', { name: 'Trabajado' }).getAttribute('aria-sort')).toBe('descending')

    fireEvent.click(screen.getByRole('button', { name: 'Trabajado' }))
    expect(names()).toEqual(['Bea Ruiz', 'Álvaro Ruiz', 'Marta Ruiz'])
    expect(screen.getByRole('columnheader', { name: 'Trabajado' }).getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(screen.getByRole('button', { name: 'Diferencia' }))
    expect(names()).toEqual(['Álvaro Ruiz', 'Marta Ruiz', 'Bea Ruiz'])
  })

  it('puts people without a rate last whichever way the cost is sorted', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'Coste' }))
    expect(names()).toEqual(['Marta Ruiz', 'Álvaro Ruiz', 'Bea Ruiz'])
    fireEvent.click(screen.getByRole('button', { name: 'Coste' }))
    expect(names()).toEqual(['Álvaro Ruiz', 'Marta Ruiz', 'Bea Ruiz'])
  })

  it('shows the totals of the report and signed differences', () => {
    renderTable()
    const total = screen.getByRole('rowheader', { name: 'Total' }).closest('tr')!
    const cells = within(total).getAllByRole('cell').map((c) => plain(c.textContent))
    expect(cells).toContain('68h')
    expect(cells).toContain('63h 30m')
    expect(cells).toContain('−4h 30m menos de lo planificado')
    expect(cells).toContain('756,25 €previsto 720,00 €')
    // Counts add up across people
    expect(cells.filter((c) => c === '2' || c === '1')).toHaveLength(3)

    const alvaro = screen.getByRole('link', { name: 'Álvaro Ruiz' }).closest('tr')!
    expect(within(alvaro).getByText('+5h')).toBeTruthy()
    expect(plain(within(alvaro).getByText(/\/h$/).textContent)).toBe('11,00 €/h')
    expect(within(alvaro).getByRole('img', { name: 'Trabajado 25h de 20h planificadas' })).toBeTruthy()
  })

  it('offers to add a rate for someone without one, and marks inactive people', () => {
    renderTable()
    const bea = screen.getByRole('link', { name: 'Bea Ruiz' }).closest('tr')!
    expect(within(bea).getByRole('link', { name: 'Añadir tarifa' }).getAttribute('href')).toBe('/team/3?from=2026-11-16&to=2026-11-22')
    expect(within(bea).getByText('Inactivo')).toBeTruthy()
  })

  it('shows a dash with the reason when a rate is missing for part of the period', () => {
    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <HoursTable
            report={{
              ...report,
              // A rate that started mid-period: the API gives no cost rather than one that falls short
              workers: [row(4, 'Sara', { workedMinutes: 600, entriesCount: 2, currentHourlyRate: 12, plannedCost: null, actualCost: null })],
              totals: { plannedMinutes: 0, workedMinutes: 600, differenceMinutes: 600, plannedCost: null, actualCost: null },
            }}
            personHref={(id) => `/team/${id}`}
          />
        </LocaleProvider>
      </MemoryRouter>,
    )
    const sara = screen.getByRole('link', { name: 'Sara Ruiz' }).closest('tr')!
    const cost = within(sara).getAllByTitle('Falta tarifa para parte del periodo')[0]
    expect(plain(cost.textContent)).toBe('— Falta tarifa para parte del periodo')
    expect(within(sara).getByText('Falta tarifa para parte del periodo', { selector: '.cell-sub' })).toBeTruthy()
    const total = screen.getByRole('rowheader', { name: 'Total' }).closest('tr')!
    expect(within(total).getByTitle('Falta tarifa para parte del periodo')).toBeTruthy()
  })

  it('sorts with nulls last in the helper too', () => {
    const sorted = sortHoursRows(report.workers, { key: 'rate', direction: 'asc' })
    expect(sorted.map((r) => r.workerId)).toEqual([2, 1, 3])
  })
})

describe('Hours page', () => {
  const owner = user(2, 'OWNER', 'Ana', 'Gil')
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

  it('shows the summary and exports both CSV files with the token', async () => {
    const calls = mockApi((call) => {
      if (call.path === '/users/me') return json(200, owner)
      if (call.path === '/establishments/owner/2') return json(200, [venue])
      if (call.path.startsWith('/reports/establishment/1/hours?')) return json(200, report)
      if (call.path.startsWith('/reports/establishment/1/hours.csv?') || call.path.startsWith('/reports/establishment/1/time-entries.csv?')) {
        return new Response('a;b', { status: 200, headers: { 'Content-Type': 'text/csv' } })
      }
    })
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    try {
      renderApp('/hours')
      expect(await screen.findByRole('heading', { name: 'Horas' })).toBeTruthy()
      // The cost card and the total row
      expect(await screen.findAllByText('756,25 €', { normalizer: plain })).toHaveLength(2)
      expect(
        screen.getByText('1 persona no tiene tarifa por hora para todo el periodo: su coste sale «—» y no se suma al total.'),
      ).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Exportar horas (CSV)' }))
      fireEvent.click(screen.getByRole('button', { name: 'Exportar registro de jornada (CSV)' }))
      await vi.waitFor(() => expect(saved).toHaveLength(2))

      const csv = calls.filter((c) => c.path.includes('.csv'))
      expect(csv.map((c) => c.path.split('?')[0])).toEqual([
        '/reports/establishment/1/hours.csv',
        '/reports/establishment/1/time-entries.csv',
      ])
      expect(csv.every((c) => c.headers.Authorization === 'Bearer test-token')).toBe(true)
      expect(saved[0]).toMatch(/^horas_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/)
      expect(saved[1]).toMatch(/^registro-de-jornada_/)
      // An owner's session never asks for the worker's own clock endpoints, which answer 403 to it
      expect(calls.some((c) => c.path.startsWith('/time-entries/me') || c.path.startsWith('/time-entries/clock'))).toBe(false)
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })

  it('says when the period has nothing in it', async () => {
    mockApi((call) => {
      if (call.path === '/users/me') return json(200, owner)
      if (call.path === '/establishments/owner/2') return json(200, [venue])
      if (call.path.startsWith('/reports/establishment/1/hours?')) {
        return json(200, { ...report, workers: [row(1, 'Marta')], totals: { plannedMinutes: 0, workedMinutes: 0, differenceMinutes: 0, plannedCost: null, actualCost: null } })
      }
    })
    renderApp('/hours')
    expect(await screen.findByText('No hay turnos ni fichajes en este periodo')).toBeTruthy()
  })

  it('shows an API error instead of the table', async () => {
    mockApi((call) => {
      if (call.path === '/users/me') return json(200, owner)
      if (call.path === '/establishments/owner/2') return json(200, [venue])
      if (call.path.startsWith('/reports/establishment/1/hours?')) return json(400, { status: 400, message: 'Range too long' })
    })
    renderApp('/hours')
    expect(await screen.findByText('Range too long')).toBeTruthy()
  })
})
