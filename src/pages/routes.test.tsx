import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { json, mockApi, noContent, ownerApi, renderApp, testVenue, user } from '../test/helpers'

const emptySummary = {
  from: '2026-11-16',
  to: '2026-11-22',
  currency: 'EUR',
  totals: {
    sales: 0, cashSales: 0, cardSales: 0, otherSales: 0, tips: 0, expenses: 0, payrollExpenses: 0, laborCost: null,
    laborCostPartial: false, workersWithoutCost: 0, plannedLaborCost: null, grossMargin: 0, laborCostSource: 'PAYROLL_EXPENSES',
    laborCostPercent: null, cashDifference: 0, draftCashDifference: 0, closedDays: 0, draftDays: 0, missingClosingDays: 0,
  },
  days: [],
  expensesByCategory: [],
  previous: { from: '2026-11-09', to: '2026-11-15', sales: 0, expenses: 0, laborCost: null, grossMargin: 0, laborCostSource: 'PAYROLL_EXPENSES' },
}

/** A worker with an empty schedule, not clocked in */
function workerApi() {
  return mockApi((call) => {
    if (call.path === '/users/me') return json(200, user(5, 'WORKER'))
    if (call.path === '/workers/5') return json(200, { userId: 5, establishmentId: 1, isActive: true })
    if (call.path === '/establishments/1') return json(200, testVenue)
    if (call.path === '/zones/establishment/1') return json(200, [])
    if (call.path === '/time-entries/me/open') return noContent()
    if (call.path.startsWith('/worker-shifts/worker/5') || call.path.startsWith('/worker-events/worker/5') || call.path.startsWith('/events/')) {
      return json(200, [])
    }
    if (call.path.startsWith('/reports/worker/5/days')) {
      return json(200, { workerId: 5, firstName: 'Lucía', lastName: 'Romero', from: '', to: '', plannedMinutes: 0, workedMinutes: 0, differenceMinutes: 0, plannedCost: null, actualCost: null, days: [] })
    }
  })
}

const menu = () => within(screen.getByRole('navigation', { name: 'Principal' })).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('where each role starts', () => {
  it('sends the owner to the summary, first in the menu, with the schedule at /schedule', async () => {
    ownerApi((call) => (call.path.startsWith('/reports/establishment/1/summary?') ? json(200, emptySummary) : undefined))
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeTruthy()
    expect(menu()).toEqual([
      ['Resumen', '/'],
      ['Cuadrante', '/schedule'],
      ['Horas', '/hours'],
      ['Caja', '/cash'],
      ['Gastos', '/expenses'],
      ['Eventos', '/events'],
      ['Equipo', '/team'],
      ['Local y zonas', '/venue'],
    ])
  })

  it('takes the owner back to the summary from an address that does not exist', async () => {
    ownerApi((call) => (call.path.startsWith('/reports/establishment/1/summary?') ? json(200, emptySummary) : undefined))
    renderApp('/nothing-here')
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeTruthy()
  })

  it('keeps the worker on their schedule, with no summary, cash or expenses', async () => {
    workerApi()
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Mi horario' })).toBeTruthy()
    expect(menu()).toEqual([
      ['Mi horario', '/'],
      ['Mis horas', '/hours'],
    ])
  })

  it('keeps the admin on owners and venues', async () => {
    mockApi((call) => {
      if (call.path === '/users/me') return json(200, user(1, 'PLATFORM_ADMIN', 'Admin', 'Khronos'))
      if (call.path === '/users' || call.path === '/establishments') return json(200, [])
    })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Propietarios y locales' })).toBeTruthy()
    expect(menu()).toEqual([['Propietarios y locales', '/']])
  })
})

describe('a worker and the business pages', () => {
  it.each(['/cash', '/expenses', '/cash?date=2026-11-16', '/schedule'])('cannot open %s, and nothing of it is asked for', async (path) => {
    const calls = workerApi()
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Mi horario' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Caja' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Gastos' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Resumen' })).toBeNull()
    expect(calls.some((c) => /^\/(cash-closings|expenses|reports\/establishment)/.test(c.path))).toBe(false)
  })
})
