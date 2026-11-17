import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LocaleProvider } from '../lib/i18n'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

let shouldThrow = true

function Fragile() {
  if (shouldThrow) throw new Error('boom')
  return <p>Cuadrante</p>
}

function Harness() {
  const [key, setKey] = useState('a')
  return (
    <LocaleProvider initialLocale="es">
      <button onClick={() => setKey('b')}>Otra página</button>
      <ErrorBoundary resetKey={key}>
        <Fragile />
      </ErrorBoundary>
    </LocaleProvider>
  )
}

describe('ErrorBoundary', () => {
  it('shows a message instead of a blank screen and recovers on retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shouldThrow = true
    render(<Harness />)
    expect(screen.getByRole('alert').textContent).toContain('Algo ha fallado en esta pantalla')

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('Cuadrante')).toBeTruthy()
  })

  it('clears the error when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shouldThrow = true
    render(<Harness />)
    expect(screen.getByRole('alert')).toBeTruthy()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Otra página' }))
    expect(screen.getByText('Cuadrante')).toBeTruthy()
  })
})
