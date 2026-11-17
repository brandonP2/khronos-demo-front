// Adding and editing an expense. A cash expense counts in that day's cash closing, so once the
// closing is closed the API refuses to change it (409): the dialog says to reopen that day's
// closing first, with a link to it.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Expense, ExpenseCategory, ExpenseInput, PaymentMethod } from '../api/types'
import { cashRefusal, refusalDay } from '../lib/apiMessages'
import { useFmt, useT } from '../lib/i18n'
import { parseAmount } from '../lib/money'
import { useInvalidate } from '../lib/queries'
import { AmountInput } from './AmountInput'
import { Button, Dialog, ErrorNote, Field, useToast } from './ui'

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'SUPPLIES',
  'UTILITIES',
  'RENT',
  'PAYROLL',
  'MAINTENANCE',
  'MARKETING',
  'TAXES',
  'OTHER',
]

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER']

export const DESCRIPTION_MAX = 150
export const SUPPLIER_MAX = 100
export const EXPENSE_NOTES_MAX = 500

/**
 * The day whose closed till stopped a change, from a 409 CASH_DAY_CLOSED: the day the API gives
 * (in its details, else in its message), else the new day of a cash expense, else the day it was
 * on when it was paid in cash. null for any other 409.
 */
export function lockedDay(
  error: unknown,
  input: Pick<ExpenseInput, 'date' | 'paymentMethod'>,
  before?: Pick<Expense, 'date' | 'paymentMethod'>,
): string | null {
  if (!(error instanceof ApiError) || error.status !== 409 || cashRefusal(error) !== 'CASH_DAY_CLOSED') return null
  const day = refusalDay(error)
  if (day) return day
  if (input.paymentMethod === 'CASH') return input.date
  return before?.paymentMethod === 'CASH' ? before.date : null
}

/** The explanation for a 409 on a cash expense, with a link to that day's till */
export function DayClosedNote({ day }: { day: string }) {
  const t = useT()
  const fmt = useFmt()
  return (
    <div className="notice" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} />
      <span>
        {t.expenses.dayClosed(fmt.long(day))}{' '}
        <Link to={`/cash?date=${day}`}>{t.expenses.goToCash(fmt.short(day))}</Link>
      </span>
    </div>
  )
}

export function ExpenseFormDialog({
  venueId,
  today,
  expense,
  onClose,
}: {
  venueId: number
  /** The venue's today, the latest day an expense can have */
  today: string
  /** Edits this expense; without it a new one is added */
  expense?: Expense
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [date, setDate] = useState(expense?.date ?? today)
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'SUPPLIES')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [supplier, setSupplier] = useState(expense?.supplier ?? '')
  const [amountText, setAmountText] = useState(expense ? fmt.amount(expense.amount) : '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(expense?.paymentMethod ?? 'CARD')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)

  const amount = parseAmount(amountText)
  const errors = {
    date: !date ? t.expenses.dateRequired : date > today ? t.expenses.futureDate : undefined,
    description: description.trim().length === 0 || description.trim().length > DESCRIPTION_MAX ? t.expenses.descriptionError : undefined,
    amount: amount === null || amount <= 0 ? t.expenses.amountError : undefined,
  }
  const valid = !errors.date && !errors.description && !errors.amount

  const input: ExpenseInput = {
    establishmentId: venueId,
    date,
    category,
    description: description.trim(),
    supplier: supplier.trim() || null,
    amount: amount ?? 0,
    paymentMethod,
    notes: notes.trim() || null,
  }

  const mutation = useMutation({
    mutationFn: () => (expense ? api.expenses.update(expense.id, input) : api.expenses.create(input)),
    onSuccess: async () => {
      await invalidate.expenses()
      toast(expense ? t.expenses.saved : t.expenses.added)
      onClose()
    },
  })
  const closedDay = lockedDay(mutation.error, input, expense)

  const submit = () => {
    setSubmitted(true)
    if (valid) mutation.mutate()
  }
  const shown = (error: string | undefined) => (submitted ? error : undefined)

  return (
    <Dialog
      title={expense ? t.expenses.editTitle : t.expenses.addTitle}
      sub={t.expenses.formSub}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {expense ? t.common.save : t.expenses.add}
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
        <div className="row-2">
          <Field label={t.expenses.amount} error={shown(errors.amount)}>
            {(id) => (
              <AmountInput id={id} value={amountText} placeholder={t.expenses.amountPlaceholder} onChange={setAmountText} required />
            )}
          </Field>
          <Field label={t.expenses.method}>
            {(id) => (
              <select id={id} className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t.paymentMethods[m]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label={t.expenses.description} error={shown(errors.description)}>
          {(id) => (
            <input
              id={id}
              className="input"
              required
              maxLength={DESCRIPTION_MAX}
              placeholder={t.expenses.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <div className="row-2">
          <Field label={t.expenses.category} hint={t.categoryHints[category]}>
            {(id) => (
              <select id={id} className="select" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.categories[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t.expenses.date} hint={t.expenses.dateHint} error={shown(errors.date)}>
            {(id) => (
              <input id={id} type="date" className="input mono" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label={t.expenses.supplier} hint={t.expenses.supplierHint}>
          {(id) => <input id={id} className="input" maxLength={SUPPLIER_MAX} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}
        </Field>
        <Field label={t.expenses.notes} hint={t.expenses.notesHint}>
          {(id) => (
            <textarea id={id} className="textarea" maxLength={EXPENSE_NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {closedDay ? <DayClosedNote day={closedDay} /> : <ErrorNote error={mutation.error} />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
