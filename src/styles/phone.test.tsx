// Checks on the real stylesheet, as a phone 390px wide applies it, for what would widen the page
// or leave a word no room on a phone. jsdom does no layout, so these read the styles that keep a
// block inside the page rather than measure it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import css from './app.css?raw'
import { PeriodPicker } from '../components/PeriodPicker'
import { QuickActions } from '../components/StockDialogs'
import { LocaleProvider } from '../lib/i18n'
import { product } from '../test/inventory'

const PHONE_WIDTH = 390

/** jsdom's window is always 1024px wide, so the stylesheet's width queries are decided here for the phone */
function asOnAPhone(stylesheet: string) {
  return stylesheet.replace(/@media ([^{]*width[^{]*)\{/g, (_, query: string) => {
    const applies = [...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([, bound, px]) =>
      bound === 'min' ? PHONE_WIDTH >= Number(px) : PHONE_WIDTH <= Number(px),
    )
    return `@media ${applies ? 'all' : 'not all'} {`
  })
}

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = asOnAPhone(css)
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

  it("sets a product's quick actions two by two, 40px tall, each word shown beside its icon", () => {
    // In English, the longest words: "Adjustment" alone is wider than a quarter of the card
    render(
      <LocaleProvider initialLocale="en">
        <table className="table stock-table">
          <tbody>
            <tr className="stock-row">
              <td className="stock-actions-cell">
                <QuickActions product={product(1, { name: 'Gin' })} onAction={() => {}} />
              </td>
            </tr>
          </tbody>
        </table>
      </LocaleProvider>,
    )
    const actions = screen.getAllByRole('button')
    expect(actions.map((action) => action.textContent)).toEqual(['Stock in', 'Waste', 'Usage', 'Adjustment'])
    expect(getComputedStyle(actions[0].parentElement!).gridTemplateColumns).toBe('repeat(2, minmax(0px, 1fr))')
    for (const action of actions) {
      expect(getComputedStyle(action).height).toBe('40px')
      expect(getComputedStyle(action.querySelector('.btn-label')!).display).not.toBe('none')
    }
  })
})
