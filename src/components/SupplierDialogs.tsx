// Adding and editing a supplier: name, phone, email and notes. Used on the Suppliers tab and
// from an order, when there is no supplier to pick yet.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { isConflict } from '../api/client'
import { api } from '../api/endpoints'
import type { Supplier, SupplierInput } from '../api/types'
import { isNameTaken } from '../lib/apiMessages'
import { useT } from '../lib/i18n'
import { useInvalidate } from '../lib/queries'
import { NAME_MAX, ORDER_NOTES_MAX } from '../lib/stock'
import { Button, Dialog, ErrorNote, Field, useToast } from './ui'

export const PHONE_MAX = 30
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SupplierFormDialog({
  venueId,
  supplier,
  onClose,
  onSaved,
}: {
  venueId: number
  /** Edits this supplier; without it a new one is added */
  supplier?: Supplier
  onClose: () => void
  /** Called with the supplier as saved, before the dialog closes */
  onSaved?: (supplier: Supplier) => void
}) {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const sp = t.inventory.suppliers
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)

  const errors = {
    name: name.trim().length === 0 || name.trim().length > NAME_MAX ? sp.nameError : undefined,
    phone: phone.trim().length > PHONE_MAX ? sp.phoneError : undefined,
    email: email.trim() && !EMAIL.test(email.trim()) ? sp.emailError : undefined,
  }
  const valid = !errors.name && !errors.phone && !errors.email

  const input: SupplierInput = {
    ...(supplier ? {} : { establishmentId: venueId }),
    name: name.trim(),
    phone: phone.trim() || null,
    email: email.trim() || null,
    notes: notes.trim() || null,
  }

  const mutation = useMutation({
    mutationFn: () => (supplier ? api.suppliers.update(supplier.id, input) : api.suppliers.create(input)),
    onSuccess: async (saved) => {
      await invalidate.suppliers()
      toast(supplier ? sp.saved : sp.added(saved.name))
      onSaved?.(saved)
      onClose()
    },
  })
  const error = isConflict(mutation.error) && isNameTaken(mutation.error.message) ? sp.duplicate : mutation.error

  const submit = () => {
    setSubmitted(true)
    if (valid) mutation.mutate()
  }
  const shown = (text: string | undefined) => (submitted ? text : undefined)

  return (
    <Dialog
      title={supplier ? sp.editTitle : sp.addTitle}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {supplier ? t.common.save : sp.addTitle}
          </Button>
        </>
      }
    >
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={sp.name} error={shown(errors.name)}>
          {(id) => (
            <input
              id={id}
              className="input"
              required
              maxLength={NAME_MAX}
              placeholder={sp.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="row-2">
          <Field label={sp.phone} hint={sp.phoneHint} error={shown(errors.phone)}>
            {(id) => (
              <input
                id={id}
                type="tel"
                className="input"
                autoComplete="off"
                maxLength={PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
          </Field>
          <Field label={sp.email} hint={sp.emailHint} error={shown(errors.email)}>
            {(id) => (
              <input id={id} type="email" className="input" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label={sp.notes} hint={sp.notesHint}>
          {(id) => (
            <textarea id={id} className="textarea" maxLength={ORDER_NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
