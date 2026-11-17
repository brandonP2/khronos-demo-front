// Checks on the real stylesheet for links: one that looks like a button (a page to go to, such as
// the inventory count) is never underlined, while a link in a sentence keeps its underline.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import css from './app.css?raw'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
})

afterEach(cleanup)

describe('links', () => {
  it('drawn as a button are not underlined, whatever the button', () => {
    render(
      <>
        <a href="/inventory/count" className="btn btn-primary">
          Hacer recuento
        </a>
        <a href="/inventory" className="btn">
          Volver al stock
        </a>
        <a href="/inventory/orders/new" className="btn btn-sm">
          Preparar pedido
        </a>
        <a href="/cash" className="btn btn-sm btn-ghost">
          Ir a caja
        </a>
      </>,
    )
    for (const link of screen.getAllByRole('link')) {
      expect(getComputedStyle(link).textDecorationLine, link.textContent!).toBe('none')
    }
  })

  it('in a sentence keep their underline', () => {
    render(
      <p>
        Desde el <a href="/inventory/orders/12">pedido #12</a>
      </p>,
    )
    expect(getComputedStyle(screen.getByRole('link')).textDecorationLine).toBe('underline')
  })
})
