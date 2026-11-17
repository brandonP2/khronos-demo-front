// Expenses: what the venue pays for, filtered by period and category, with the filter's total.
// Added and edited in a dialog; on phones the table turns into cards. ?new=1 opens the dialog
// (from the summary), and ?from&to pick the period (from a day's cash closing or a received
// order). An expense created by receiving an order links to it and is deleted, never edited.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { Expense, ExpenseCategory } from '../../api/types'
import { EXPENSE_CATEGORIES, ExpenseFormDialog, lockedDay } from '../../components/ExpenseDialogs'
import { PeriodPicker, usePeriod } from '../../components/PeriodPicker'
import { Button, ConfirmDialog, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../components/ui'
import { useDownload } from '../../lib/download'
import { useFmt, useT } from '../../lib/i18n'
import { sumMoney } from '../../lib/money'
import { useExpenses, useInvalidate } from '../../lib/queries'
import { venueTimeZone, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal = { kind: 'add' } | { kind: 'edit'; expense: Expense } | { kind: 'delete'; expense: Expense } | null

export default function ExpensesPage() {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const { venue } = useVenue()
  const today = zonedToday(venueTimeZone(venue))
  const [search, setSearch] = useSearchParams()
  const { value, setValue, period } = usePeriod({ from: search.get('from'), to: search.get('to') }, today)
  const [category, setCategory] = useState<ExpenseCategory | ''>('')
  const expenses = useExpenses(venue?.id, period ? { ...period, category: category || undefined } : null)
  const file = useDownload()
  const [modal, setModal] = useState<Modal>(() => (search.get('new') ? { kind: 'add' } : null))

  const list = expenses.data ?? []
  const total = sumMoney(list.map((e) => e.amount))
  const inCash = sumMoney(list.filter((e) => e.paymentMethod === 'CASH').map((e) => e.amount))

  const close = () => {
    setModal(null)
    // Opened from a link: the address no longer asks for a new expense
    if (search.has('new')) {
      const next = new URLSearchParams(search)
      next.delete('new')
      setSearch(next, { replace: true })
    }
  }

  return (
    <div className="page">
      <PageHead title={t.expenses.title} sub={t.expenses.sub}>
        <Button
          icon={Download}
          disabled={!period || !venue}
          loading={file.isPending}
          onClick={() =>
            period &&
            venue &&
            file.mutate({
              fetchFile: () => api.reports.expensesCsv(venue.id, period),
              fallbackName: t.expenses.file(period.from, period.to),
            })
          }
        >
          {t.expenses.export}
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
          {t.expenses.add}
        </Button>
      </PageHead>

      <div className="filters">
        <PeriodPicker value={value} onChange={setValue} on={today} />
        <Field label={t.expenses.category}>
          {(id) => (
            <select id={id} className="select" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}>
              <option value="">{t.expenses.allCategories}</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <ErrorNote error={file.error} />

      {!period ? null : expenses.isLoading ? (
        <Loading rows={4} />
      ) : expenses.error ? (
        <ErrorNote error={expenses.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty
            icon={ReceiptText}
            title={category ? t.expenses.emptyFiltered : t.expenses.empty}
            action={
              <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
                {t.expenses.add}
              </Button>
            }
          >
            {category ? null : t.expenses.emptyBody}
          </Empty>
        </div>
      ) : (
        <section className="card expenses-card" aria-busy={expenses.isPlaceholderData || undefined}>
          <div className="card-head expenses-total">
            <h2>{t.expenses.total}</h2>
            <div className="expenses-total-figures">
              <span className="figure" data-testid="expenses-total">
                {fmt.money(total)}
              </span>
              <span className="muted">
                {t.expenses.count(list.length)}
                {inCash > 0 && ` · ${t.expenses.inCash(fmt.money(inCash))}`}
              </span>
            </div>
          </div>
          <table className="table expenses-table">
            <thead>
              <tr>
                <th>{t.expenses.columns.date}</th>
                <th>{t.expenses.columns.description}</th>
                <th>{t.expenses.columns.category}</th>
                <th>{t.expenses.columns.method}</th>
                <th className="right">{t.expenses.columns.amount}</th>
                <th>
                  <span className="visually-hidden">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="mono expense-date" data-label={t.expenses.columns.date}>
                    {fmt.day(e.date)}
                  </td>
                  <td className="expense-description">
                    <span className="name">{e.description}</span>
                    {(e.supplier || e.notes) && (
                      <span className="muted cell-sub">{[e.supplier, e.notes].filter(Boolean).join(' · ')}</span>
                    )}
                    {e.purchaseOrderId != null && (
                      <span className="muted cell-sub" id={`expense-order-${e.id}`}>
                        <Link to={`/inventory/orders/${e.purchaseOrderId}`}>{t.expenses.fromOrder(e.purchaseOrderId)}</Link>
                        {` · ${t.expenses.fromOrderLocked}`}
                      </span>
                    )}
                  </td>
                  <td data-label={t.expenses.columns.category}>{t.categories[e.category]}</td>
                  <td data-label={t.expenses.columns.method}>{t.paymentMethods[e.paymentMethod]}</td>
                  <td className="right mono expense-amount" data-label={t.expenses.columns.amount}>
                    {fmt.money(e.amount)}
                  </td>
                  <td className="expense-actions">
                    <div className="actions entry-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Pencil}
                        className="btn-compact"
                        aria-label={t.expenses.edit(e.description)}
                        title={e.purchaseOrderId != null ? t.expenses.fromOrderLocked : t.common.edit}
                        // Created by receiving an order: it is deleted and entered again, never edited
                        disabled={e.purchaseOrderId != null}
                        aria-describedby={e.purchaseOrderId != null ? `expense-order-${e.id}` : undefined}
                        onClick={() => setModal({ kind: 'edit', expense: e })}
                      >
                        <span className="btn-label">{t.common.edit}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        iconOnly
                        aria-label={t.expenses.remove(e.description)}
                        title={t.expenses.removeConfirm}
                        onClick={() => setModal({ kind: 'delete', expense: e })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {venue && modal?.kind === 'add' && <ExpenseFormDialog venueId={venue.id} today={today} onClose={close} />}
      {venue && modal?.kind === 'edit' && (
        <ExpenseFormDialog venueId={venue.id} today={today} expense={modal.expense} onClose={close} />
      )}
      {modal?.kind === 'delete' && (
        <ConfirmDialog
          title={t.expenses.removeTitle}
          confirmLabel={t.expenses.removeConfirm}
          onClose={close}
          onConfirm={async () => {
            const { expense } = modal
            try {
              await api.expenses.remove(expense.id)
            } catch (e) {
              const day = lockedDay(e, expense)
              throw day ? new Error(t.expenses.dayClosed(fmt.longInSentence(day))) : e
            }
            await invalidate.expenses()
            toast(t.expenses.removed)
          }}
        >
          {t.expenses.removeBody(modal.expense.description, fmt.money(modal.expense.amount))}
          {modal.expense.purchaseOrderId != null && ` ${t.expenses.removeFromOrder(modal.expense.purchaseOrderId)}`}
        </ConfirmDialog>
      )}
    </div>
  )
}
