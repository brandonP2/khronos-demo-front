// Checks on the real stylesheet for what would widen the page on a phone. jsdom does no layout,
// so these read the styles that keep a block inside the page rather than measure it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import css from './app.css?raw'
import { PeriodPicker } from '../components/PeriodPicker'
import { LocaleProvider } from '../lib/i18n'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
})

afterEach(cleanup)

const period = { preset: 'this-week' as const, from: '2026-11-16', to: '2026-11-22' }

describe('on a phone', () => {
  it('keeps the period picker inside the page wherever it sits, its shortcuts scrolling inside it', () => {
    // As a flex item (the filters of Expenses), where it kept the width of all its shortcuts
    render(
      <LocaleProvider initialLocale="es">
        <div className="filters">
          <PeriodPicker value={period} onChange={() => {}} on="2026-11-17" />
        </div>
      </LocaleProvider>,
    )
    const picker = screen.getByRole('group', { name: 'Periodo' })
    const box = getComputedStyle(picker.parentElement!)
    expect(box.minWidth).toBe('0px')
    expect(box.maxWidth).toBe('100%')
    const shortcuts = getComputedStyle(picker)
    expect(shortcuts.maxWidth).toBe('100%')
    expect(shortcuts.overflowX).toBe('auto')
  })

  it('hides blocks with a box that clips what is inside it', () => {
    render(
      <div className="visually-hidden" data-testid="hidden">
        <table>
          <tbody>
            <tr>
              <td>A cell far wider than one pixel</td>
            </tr>
          </tbody>
        </table>
      </div>,
    )
    const hidden = getComputedStyle(screen.getByTestId('hidden'))
    expect(hidden.width).toBe('1px')
    expect(hidden.overflow).toBe('hidden')
    expect(hidden.clipPath).toBe('inset(50%)')
  })
})
