import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { BusinessSummary, SummaryDay } from '../../api/types'
import { json, ownerApi, plain, renderApp } from '../../test/helpers'

const day = (date: string, patch: Partial<SummaryDay> = {}): SummaryDay => ({
  date,
  sales: 0,
  expenses: 0,
  laborCost: 0,
  margin: 0,
  closingStatus: 'NONE',
  cashDifference: null,
  ...patch,
})

function summary(patch: Partial<BusinessSummary> = {}, totals: Partial<BusinessSummary['totals']> = {}): BusinessSummary {
  return {
    from: '2026-11-09',
    to: '2026-11-15',
    currency: 'EUR',
    totals: {
      sales: 4200,
      cashSales: 1500,
      cardSales: 2500,
      otherSales: 200,
      tips: 80,
      expenses: 1800,
      payrollExpenses: 600,
      laborCost: 1300,
      laborCostPartial: false,
      workersWithoutCost: 0,
      plannedLaborCost: 1250,
      grossMargin: 1700,
      laborCostSource: 'HOURS',
      laborCostPercent: 31,
      cashDifference: -12.5,
      draftCashDifference: 0,
      closedDays: 4,
      draftDays: 1,
      missingClosingDays: 2,
      ...totals,
    },
    days: [
      day('2026-11-09', { sales: 1000, expenses: 200, laborCost: 300, margin: 500, closingStatus: 'CLOSED', cashDifference: -2.5 }),
      day('2026-11-10', { sales: 2000, expenses: 400, laborCost: 600, margin: 1000, closingStatus: 'CLOSED', cashDifference: -10 }),
      day('2026-11-11', { closingStatus: 'MISSING' }),
      day('2026-11-12', { sales: 600, expenses: 1200, laborCost: null, margin: -600, closingStatus: 'DRAFT', cashDifference: 0 }),
      day('2026-11-13', { closingStatus: 'MISSING' }),
      day('2026-11-14'),
      day('2026-11-15'),
    ],
    expensesByCategory: [
      { category: 'SUPPLIES', amount: 900 },
      { category: 'PAYROLL', amount: 600 },
      { category: 'UTILITIES', amount: 300 },
    ],
    previous: { from: '2026-11-02', to: '2026-11-08', sales: 3500, expenses: 2000, laborCost: 1300, grossMargin: 1000, laborCostSource: 'HOURS' },
    ...patch,
  }
}

function summaryApi(body: BusinessSummary | (() => Response)) {
  return ownerApi((call) => {
    if (call.path.startsWith('/reports/establishment/1/summary?')) return typeof body === 'function' ? body() : json(200, body)
  })
}

/** A stat card by its label, with its text flattened */
const stat = (label: string) => screen.getByText(label, { selector: '.stat .label' }).closest('.stat') as HTMLElement

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('summary cards', () => {
  it('compares each figure with the period before, with a sign, an arrow and words', async () => {
    summaryApi(summary())
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeTruthy()
    await screen.findByText('Ventas', { selector: '.stat .label' })

    const sales = stat('Ventas')
    expect(plain(sales.textContent)).toContain('4.200,00 €')
    expect(plain(sales.querySelector('.trend')!.textContent)).toBe('+700,00 € (+20,0 %) más que en el periodo anterior')
    expect(sales.querySelector('.trend')!.classList.contains('good')).toBe(true)
    expect(sales.querySelector('.trend svg')).toBeTruthy()

    // Fewer expenses is good news
    const expenses = stat('Gastos')
    expect(plain(expenses.querySelector('.trend')!.textContent)).toBe('−200,00 € (−10,0 %) menos que en el periodo anterior')
    expect(expenses.querySelector('.trend')!.classList.contains('good')).toBe(true)

    expect(plain(stat('Coste de personal').textContent)).toContain('Igual que en el periodo anterior')

    const margin = stat('Margen estimado')
    expect(plain(margin.textContent)).toContain('1.700,00 €')
    expect(plain(margin.textContent)).toContain('Ventas − gastos sin nóminas − coste de personal por las horas fichadas')
    expect(margin.textContent).not.toMatch(/beneficio/i)

    // Staff cost over sales went from 37,1 % to 31,0 %: a fall in points, which is good news
    const share = stat('Coste de personal sobre ventas')
    expect(plain(share.textContent)).toContain('31,0 %')
    expect(plain(share.querySelector('.trend')!.textContent)).toBe('−6,1 puntos menos que en el periodo anterior')
    expect(share.querySelector('.trend')!.classList.contains('good')).toBe(true)
  })

  it('marks a rise in costs as bad news, still in words', async () => {
    summaryApi(summary({ previous: { from: '2026-11-02', to: '2026-11-08', sales: 4200, expenses: 1500, laborCost: 1300, grossMargin: 2000, laborCostSource: 'HOURS' } }))
    renderApp('/')
    await screen.findByText('Gastos', { selector: '.stat .label' })
    const trend = stat('Gastos').querySelector('.trend')!
    expect(trend.classList.contains('bad')).toBe(true)
    expect(plain(trend.textContent)).toBe('+300,00 € (+20,0 %) más que en el periodo anterior')
    expect(plain(stat('Margen estimado').querySelector('.trend')!.textContent)).toBe('−300,00 € (−15,0 %) menos que en el periodo anterior')
  })

  it('says when there is nothing to compare with, and never divides by zero', async () => {
    summaryApi(summary({ previous: { from: '2026-11-02', to: '2026-11-08', sales: 0, expenses: 0, laborCost: null, grossMargin: 0, laborCostSource: 'PAYROLL_EXPENSES' } }))
    renderApp('/')
    await screen.findByText('Ventas', { selector: '.stat .label' })
    expect(screen.getAllByText('Sin datos del periodo anterior')).toHaveLength(5)
    cleanup()

    // Expenses but no sales the period before: sales went up from 0, with no percentage
    summaryApi(summary({ previous: { from: '2026-11-02', to: '2026-11-08', sales: 0, expenses: 100, laborCost: null, grossMargin: -100, laborCostSource: 'PAYROLL_EXPENSES' } }))
    renderApp('/')
    await screen.findByText('Ventas', { selector: '.stat .label' })
    expect(plain(stat('Ventas').querySelector('.trend')!.textContent)).toBe('+4.200,00 € más que en el periodo anterior')
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/)
  })

  it('takes the staff cost from the payroll expenses when no rates are set, and says so', async () => {
    summaryApi(
      summary({}, { laborCost: null, workersWithoutCost: 3, laborCostSource: 'PAYROLL_EXPENSES', laborCostPercent: null, grossMargin: 2400 }),
    )
    renderApp('/')
    await screen.findByText('Coste de personal', { selector: '.stat .label' })
    const labor = stat('Coste de personal')
    // What the margin took off: the 600,00 € of payroll, not a cost from the hours
    expect(plain(labor.querySelector('.figure')!.textContent)).toBe('600,00 €')
    expect(within(labor).getByRole('link', { name: 'Según gastos de nóminas: faltan tarifas por hora' }).getAttribute('href')).toBe('/team')
    expect(labor.querySelector('.trend')).toBeNull()
    expect(plain(stat('Margen estimado').querySelector('.stat-help')!.textContent)).toBe(
      'Ventas − gastos, nóminas incluidas. Sin tarifas por hora, el coste de personal son los gastos de nóminas.',
    )
    const share = stat('Coste de personal sobre ventas')
    expect(share.querySelector('.figure')!.textContent).toBe('—')
    expect(within(share).getByRole('link', { name: 'Fija las tarifas por hora en Equipo' }).getAttribute('href')).toBe('/team')
  })

  it('marks a staff cost that leaves someone out as partial, and does not compare it', async () => {
    summaryApi(summary({}, { laborCostPartial: true, workersWithoutCost: 2 }))
    renderApp('/')
    await screen.findByText('Coste de personal', { selector: '.stat .label' })
    const labor = stat('Coste de personal')
    expect(plain(labor.querySelector('.figure')!.textContent)).toBe('1.300,00 €Parcial')
    expect(within(labor).getByRole('link', { name: 'Parcial: 2 personas sin tarifa' }).getAttribute('href')).toBe('/team')
    expect(labor.querySelector('.trend')).toBeNull()
    expect(plain(stat('Margen estimado').textContent)).toContain('Con un coste de personal parcial: faltan tarifas')
    expect(plain(stat('Margen estimado').querySelector('.stat-help')!.textContent)).toBe(
      'Ventas − gastos sin nóminas − coste de personal por las horas fichadas. Las nóminas no se restan dos veces.',
    )
    const share = stat('Coste de personal sobre ventas')
    expect(plain(share.textContent)).toContain('31,0 %')
    expect(plain(share.textContent)).toContain('Parcial: falta la tarifa de parte del equipo')
    expect(share.querySelector('.trend')).toBeNull()
  })

  it('names one person without a rate in the singular', async () => {
    summaryApi(summary({}, { laborCostPartial: true, workersWithoutCost: 1 }))
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Parcial: 1 persona sin tarifa' })).toBeTruthy()
  })

  it('offers the first steps when the period has no sales and no expenses', async () => {
    const empty = summary(
      { days: [day('2026-11-09')], expensesByCategory: [] },
      { sales: 0, cashSales: 0, cardSales: 0, otherSales: 0, tips: 0, expenses: 0, payrollExpenses: 0, laborCost: null, grossMargin: 0, laborCostPercent: null, cashDifference: 0, closedDays: 0, draftDays: 0, missingClosingDays: 0 },
    )
    summaryApi(empty)
    renderApp('/')
    expect(await screen.findByText('Todavía no hay ventas ni gastos en este periodo')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Haz el primer cierre de caja' }).getAttribute('href')).toBe('/cash')
    expect(screen.getByRole('link', { name: 'Añade un gasto' }).getAttribute('href')).toBe('/expenses?new=1')
    expect(screen.getByText('Todo al día: no falta ningún cierre de caja ni hay borradores.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: /Ventas y coste total por día/ })).toBeNull()
  })

  it('shows an error with a way to try again', async () => {
    let fail = true
    summaryApi(() => (fail ? json(500, { status: 500, message: 'Database down' }) : json(200, summary())))
    renderApp('/')
    expect(await screen.findByText('Database down')).toBeTruthy()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ventas', { selector: '.stat .label' })).toBeTruthy()
  })
})

describe('summary alerts', () => {
  it('links every day with no closing and every draft to that day on Cash, and shows the cash difference', async () => {
    summaryApi(summary())
    renderApp('/')
    expect(await screen.findByText('2 días con actividad y sin cierre de caja')).toBeTruthy()
    const missing = screen.getByRole('link', { name: 'Cerrar la caja del Viernes, 13 de noviembre' })
    expect(missing.getAttribute('href')).toBe('/cash?date=2026-11-13')
    expect(screen.getByRole('link', { name: 'Cerrar la caja del Miércoles, 11 de noviembre' })).toBeTruthy()
    expect(screen.getByText('1 cierre de caja en borrador')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Revisar el cierre del Jueves, 12 de noviembre' }).getAttribute('href')).toBe('/cash?date=2026-11-12')
    const difference = screen.getByText(/Descuadre de los cierres cerrados/).closest('.alert-item') as HTMLElement
    expect(plain(difference.textContent)).toContain('−12,50 € (Falta dinero)')
    // The drafts add nothing here: no provisional line
    expect(screen.queryByText(/Descuadre de los borradores/)).toBeNull()
    // Who is clocked in now, from the schedule's Now card
    expect(await screen.findByText('Nadie ha fichado la entrada ahora mismo.')).toBeTruthy()
  })

  it("shows the drafts' difference apart, as provisional", async () => {
    summaryApi(summary({}, { cashDifference: 0, draftCashDifference: 3 }))
    renderApp('/')
    const draft = (await screen.findByText(/Descuadre de los borradores/)).closest('.alert-item') as HTMLElement
    expect(plain(draft.querySelector('.alert-title')!.textContent)).toBe('Descuadre de los borradores: +3,00 € (Sobra dinero) Provisional')
    expect(within(draft).getByText('Provisional').classList.contains('tag')).toBe(true)
    expect(within(draft).getByText('Puede cambiar hasta que se cierren.')).toBeTruthy()
    // The closed days balance, so they have no line of their own
    expect(screen.queryByText(/Descuadre de los cierres cerrados/)).toBeNull()
  })

  it('splits the expenses by category with their amount and share', async () => {
    summaryApi(summary())
    renderApp('/')
    const list = (await screen.findByText('Género y bebidas')).closest('ul') as HTMLElement
    const rows = [...list.querySelectorAll('li')].map((li) => plain(li.textContent))
    expect(rows).toEqual([
      'Género y bebidas900,00 €50,0 % del total',
      'Nóminas y seguros sociales600,00 €33,3 % del total',
      'Suministros300,00 €16,7 % del total',
    ])
    const bars = [...list.querySelectorAll<HTMLElement>('.category-bar > span')].map((b) => b.style.width)
    expect(bars[0]).toBe('100%')
    expect(parseFloat(bars[2])).toBeCloseTo(33.33, 1)
  })
})

describe('summary chart', () => {
  it('draws sales and total cost in proportion on one axis', async () => {
    summaryApi(summary())
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const columns = within(chart).getAllByRole('button')
    expect(columns).toHaveLength(7)
    // The axis tops at 2.000 €: 1.000 € of sales is half the height, 500 € of cost a quarter
    const heights = (column: HTMLElement) =>
      [...column.querySelectorAll<HTMLElement>('.chart-bar')].map((bar) => bar.style.height)
    expect(heights(columns[0])).toEqual(['50%', '25%'])
    expect(heights(columns[1])).toEqual(['100%', '50%'])
    // With no staff cost the total cost is every expense
    expect(heights(columns[3])).toEqual(['30%', '60%'])
    expect(plain(columns[0].getAttribute('aria-label'))).toBe(
      'Lunes, 9 de noviembre: ventas 1.000,00 €, coste total 500,00 € (gastos sin nóminas 200,00 €, personal 300,00 €), margen 500,00 €',
    )
    // The axis labels, in full under 10.000 €
    expect([...document.querySelectorAll('.chart-axis span')].map((s) => plain(s.textContent))).toEqual(['0 €', '1.000 €', '2.000 €'])
  })

  it('says which days have no data, and walks the days with the keyboard', async () => {
    summaryApi(summary())
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const columns = within(chart).getAllByRole('button')
    expect(columns[6].getAttribute('aria-label')).toBe('Domingo, 15 de noviembre: sin datos')
    expect(columns[6].classList.contains('empty')).toBe(true)
    // A day with activity and no closing is never "no data", even with nothing to draw
    expect(plain(columns[2].getAttribute('aria-label'))).toBe(
      'Miércoles, 11 de noviembre: sin cierre de caja; ventas 0,00 €, coste total 0,00 € (gastos sin nóminas 0,00 €, personal 0,00 €), margen 0,00 €',
    )
    expect(columns[2].classList.contains('empty')).toBe(false)
    expect(columns[2].classList.contains('missing')).toBe(true)
    // One tab stop; the arrows move between days and the readout follows
    expect(columns.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    act(() => columns[0].focus())
    fireEvent.keyDown(columns[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(columns[1])
    const readout = document.querySelector('.chart-readout') as HTMLElement
    expect(plain(readout.textContent)).toBe('Martes, 10 de noviembre Ventas 2.000,00 € · Gastos 400,00 € · Personal 600,00 € · Margen 1.000,00 €')
    fireEvent.keyDown(columns[1], { key: 'ArrowRight' })
    expect(plain(readout.textContent)).toBe('Miércoles, 11 de noviembre Ventas 0,00 € · Gastos 0,00 € · Personal 0,00 € · Margen 0,00 € · Sin cierre de caja')
    fireEvent.keyDown(columns[2], { key: 'End' })
    expect(document.activeElement).toBe(columns[6])
    expect(plain(readout.textContent)).toBe('Domingo, 15 de noviembre Sin datos')
  })

  it('announces each day once, by the name of its column', async () => {
    summaryApi(summary())
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const columns = within(chart).getAllByRole('button')
    // No tooltip repeating the name, and the readout is not a live region that says it again
    expect(columns.some((c) => c.hasAttribute('title'))).toBe(false)
    const readout = document.querySelector('.chart-readout') as HTMLElement
    expect(readout.getAttribute('aria-live')).toBeNull()
    expect(readout.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelectorAll('.chart [aria-live]')).toHaveLength(0)
    // Every figure of the readout is in the name, so nothing is lost for a screen reader
    act(() => columns[3].focus())
    expect(plain(columns[3].getAttribute('aria-label'))).toBe(
      'Jueves, 12 de noviembre: ventas 600,00 €, coste total 1.200,00 € (gastos con nóminas; personal sin tarifa), margen -600,00 €',
    )
    expect(plain(readout.textContent)).toBe('Jueves, 12 de noviembre Ventas 600,00 € · Gastos 1.200,00 € · Personal sin tarifa · Margen -600,00 €')
  })

  it('shows a day with no closing and no rate, with the staff cost as missing rather than 0', async () => {
    const days = summary().days.map((d) => (d.date === '2026-11-13' ? { ...d, laborCost: null } : d))
    summaryApi(summary({ days }))
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const friday = within(chart).getAllByRole('button')[4]
    expect(friday.classList.contains('missing')).toBe(true)
    act(() => friday.focus())
    expect(plain(document.querySelector('.chart-readout')!.textContent)).toBe(
      'Viernes, 13 de noviembre Ventas 0,00 € · Gastos 0,00 € · Personal sin tarifa · Margen 0,00 € · Sin cierre de caja',
    )
    expect(screen.getByText('Sin cierre de caja', { selector: '.chart-legend li' })).toBeTruthy()
  })

  it('draws the cost the margin takes off, so payroll is not counted twice with the hours', async () => {
    // 1.000 € of sales, 500 € of expenses (200 € of them payroll) and 300 € of staff from the hours:
    // the margin takes off 300 € of other expenses and the staff, so the cost is 600 €, not 800 €
    const days = summary().days.map((d) =>
      d.date === '2026-11-09' ? { ...d, sales: 1000, expenses: 500, laborCost: 300, margin: 400 } : d,
    )
    summaryApi(summary({ days }))
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const monday = within(chart).getAllByRole('button')[0]
    expect([...monday.querySelectorAll<HTMLElement>('.chart-bar')].map((bar) => bar.style.height)).toEqual(['50%', '30%'])
    expect(plain(monday.getAttribute('aria-label'))).toBe(
      'Lunes, 9 de noviembre: ventas 1.000,00 €, coste total 600,00 € (gastos sin nóminas 300,00 €, personal 300,00 €), margen 400,00 €',
    )
    expect(plain(screen.getByText(/^Coste total/, { selector: '.chart-legend li' }).textContent)).toBe('Coste total (gastos sin nóminas + personal)')
    const table = screen.getByRole('table', { name: 'Ventas, gastos, coste de personal y margen estimado por día' })
    expect(within(table).getByRole('columnheader', { name: 'Coste total (gastos sin nóminas + personal)' })).toBeTruthy()
    expect(plain(within(table).getAllByRole('row')[1].textContent)).toBe('Lunes, 9 de noviembre1.000,00 €500,00 €300,00 €600,00 €400,00 €Cerrado')
  })

  it('says the cost is every expense, payroll included, when the payroll stands in for the staff cost', async () => {
    const days = summary().days.map((d) => ({ ...d, laborCost: null, margin: d.sales - d.expenses }))
    summaryApi(summary({ days }, { laborCost: null, laborCostSource: 'PAYROLL_EXPENSES', laborCostPercent: null }))
    renderApp('/')
    const chart = await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    const monday = within(chart).getAllByRole('button')[0]
    expect(plain(monday.getAttribute('aria-label'))).toBe(
      'Lunes, 9 de noviembre: ventas 1.000,00 €, coste total 200,00 € (gastos con nóminas; personal sin tarifa), margen 800,00 €',
    )
    expect(plain(screen.getByText(/^Coste total/, { selector: '.chart-legend li' }).textContent)).toBe('Coste total (gastos, nóminas incluidas)')
  })

  it('has a table with every value behind the chart', async () => {
    summaryApi(summary())
    renderApp('/')
    const table = await screen.findByRole('table', { name: 'Ventas, gastos, coste de personal y margen estimado por día' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(8)
    expect(plain(rows[4].textContent)).toBe('Jueves, 12 de noviembre600,00 €1.200,00 €sin tarifa1.200,00 €-600,00 €Borrador')
    // Hidden by a clipping wrapper: a hidden table itself would still widen the page on a phone
    expect(table.classList.contains('visually-hidden')).toBe(false)
    expect(table.parentElement!.tagName).toBe('DIV')
    expect(table.parentElement!.classList.contains('visually-hidden')).toBe(true)
  })
})

describe('the chart on the venue\'s clock', () => {
  beforeEach(() => {
    // Friday 18:30 on a phone in New York, already Saturday 00:30 at the venue in Madrid
    vi.stubEnv('TZ', 'America/New_York')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T23:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("starts on the venue's today, not the device's", async () => {
    const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
    const calls = summaryApi(
      summary({
        from: week[0],
        to: week[6],
        days: week.map((d) => (d === '2026-11-20' || d === '2026-11-21' ? day(d, { sales: 500, closingStatus: 'CLOSED' }) : day(d))),
      }),
    )
    renderApp('/')
    await screen.findByRole('group', { name: /Ventas y coste total por día/ })
    expect(calls.some((c) => c.path === '/reports/establishment/1/summary?from=2026-11-16&to=2026-11-22')).toBe(true)
    expect(plain(document.querySelector('.chart-readout-day')!.textContent)).toBe('Sábado, 21 de noviembre')
  })
})

describe('summary export', () => {
  it('downloads the summary as CSV with the name the server gives', async () => {
    const calls = ownerApi((call) => {
      if (call.path.startsWith('/reports/establishment/1/summary.csv?')) {
        return new Response('fecha;ventas', {
          status: 200,
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="resumen_casa-lucia.csv"' },
        })
      }
      if (call.path.startsWith('/reports/establishment/1/summary?')) return json(200, summary())
    })
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    try {
      renderApp('/')
      fireEvent.click(await screen.findByRole('button', { name: 'Exportar resumen (CSV)' }))
      await waitFor(() => expect(saved).toEqual(['resumen_casa-lucia.csv']))
      const csv = calls.find((c) => c.path.includes('summary.csv'))!
      expect(csv.path).toMatch(/^\/reports\/establishment\/1\/summary\.csv\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/)
      expect(csv.headers.Authorization).toBe('Bearer test-token')
      // An owner never asks for the worker's own clock endpoints
      expect(calls.some((c) => c.path.startsWith('/time-entries/me'))).toBe(false)
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })
})
