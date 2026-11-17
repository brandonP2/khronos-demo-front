import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LocaleProvider } from '../lib/i18n'
import { Button, Dialog, Field } from './ui'

afterEach(cleanup)

function Harness({ busy = false, onClose }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => {
    onClose?.()
    setOpen(false)
  }
  return (
    <LocaleProvider initialLocale="es">
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      {open && (
        <Dialog title="Editar turno" onClose={close} busy={busy} footer={<Button>Guardar</Button>}>
          <input aria-label="Primero" />
          <input aria-label="Segundo" />
        </Dialog>
      )}
    </LocaleProvider>
  )
}

function openDialog(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />)
  const trigger = screen.getByRole('button', { name: 'Abrir' })
  trigger.focus()
  fireEvent.click(trigger)
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Editar turno' }) }
}

describe('Dialog', () => {
  it('moves focus to the first field when it opens', () => {
    openDialog()
    expect(document.activeElement).toBe(screen.getByLabelText('Primero'))
  })

  it('keeps Tab inside the dialog in both directions', () => {
    openDialog()
    const close = screen.getByRole('button', { name: 'Cerrar' })
    const save = screen.getByRole('button', { name: 'Guardar' })

    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)
  })

  it('closes on Escape and gives focus back to the button that opened it', () => {
    const onClose = vi.fn()
    const { trigger } = openDialog({ onClose })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('stays open on Escape, overlay click and close button while busy', () => {
    const onClose = vi.fn()
    openDialog({ busy: true, onClose })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(document.querySelector('.overlay')!)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('is labelled by its title and marked modal', () => {
    const { dialog } = openDialog()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})

describe('Field', () => {
  it('links the error to the input and marks it invalid', () => {
    render(
      <LocaleProvider initialLocale="es">
        <Field label="Email" error="No es un email válido">
          {(id) => <input id={id} />}
        </Field>
      </LocaleProvider>,
    )
    const input = screen.getByLabelText('Email')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const note = document.getElementById(input.getAttribute('aria-describedby')!)
    expect(note?.textContent).toBe('No es un email válido')
  })

  it('links the hint when there is no error', () => {
    render(
      <LocaleProvider initialLocale="es">
        <Field label="Teléfono" hint="Opcional">
          {(id) => <input id={id} />}
        </Field>
      </LocaleProvider>,
    )
    const input = screen.getByLabelText('Teléfono')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Opcional')
  })
})
