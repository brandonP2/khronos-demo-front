// Receiving an ordered order: what arrived and at what cost, line by line (the ordered figures to
// start with), the day, and whether to create the matching expense and how it was paid. The API
// does it all at once: the stock goes up, each product's cost is updated and the expense is
// created. A cash expense on a day whose till is closed is refused (409) and nothing is
// received; the screen says so and links to that day's till, as Expenses does.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, PackageCheck, Truck } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { api } from '../../../api/endpoints'
import type { PaymentMethod, PurchaseOrder, ReceiveOrderInput } from '../../../api/types'
import { AmountInput } from '../../../components/AmountInput'
import { DayClosedNote, PAYMENT_METHODS } from '../../../components/ExpenseDialogs'
import { QuantityInput } from '../../../components/QuantityInput'
import { Button, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../../components/ui'
import { closedCashDay } from '../../../lib/apiMessages'
import { useFmt, useT } from '../../../lib/i18n'
import { isBlank, parseAmount, toCents } from '../../../lib/money'
import { keys, useInvalidate, usePurchaseOrder } from '../../../lib/queries'
import { orderTotal, parseQuantity, quantityValue, useQuantityText } from '../../../lib/stock'
import { venueTimeZone, zonedToday } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'

export default function ReceivePage() {
  const t = useT()
  const params = useParams()
  const { venue } = useVenue()
  const asked = Number(params.orderId)
  const orderId = Number.isInteger(asked) && asked > 0 ? asked : null
  const order = usePurchaseOrder(orderId)
  const o = t.inventory.order

  const back = (
    <Link to={orderId ? `/inventory/orders/${orderId}` : '/inventory/orders'} className="back-link">
      <ArrowLeft size={14} strokeWidth={1.5} />
      {orderId ? o.title(orderId) : o.back}
    </Link>
  )
  const notFound =
    orderId === null ||
    (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 403)) ||
    (!!order.data && !!venue && order.data.establishmentId !== venue.id)

  return (
    <div className="page order-page">
      {back}
      {notFound ? (
        <div className="card">
          <Empty icon={Truck} title={o.notFound} />
        </div>
      ) : !venue || order.isLoading ? (
        <Loading rows={5} />
      ) : order.error ? (
        <ErrorNote error={order.error} />
      ) : order.data && order.data.status !== 'ORDERED' ? (
        <>
          <PageHead title={t.inventory.receive.title(order.data.id)} />
          <div className="notice info" role="note">
            <span>{t.inventory.receive.notOrdered}</span>
          </div>
        </>
      ) : (
        order.data && <ReceiveForm order={order.data} today={zonedToday(venueTimeZone(venue))} />
      )}
    </div>
  )
}

function ReceiveForm({ order, today }: { order: PurchaseOrder; today: string }) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const rc = t.inventory.receive
  const [rows, setRows] = useState(() =>
    order.lines.map((l) => ({
      lineId: l.id,
      receivedText: fmt.quantityInput(l.quantity),
      costText: l.unitCost === null ? '' : fmt.amount(l.unitCost),
    })),
  )
  const [date, setDate] = useState(today)
  const [createExpense, setCreateExpense] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER')
  const [submitted, setSubmitted] = useState(false)

  const parsed = rows.map((r) => ({
    quantity: parseQuantity(r.receivedText),
    unitCost: isBlank(r.costText) ? null : parseAmount(r.costText),
    costInvalid: !isBlank(r.costText) && parseAmount(r.costText) === null,
  }))
  const { total } = orderTotal(parsed.map((p) => ({ ...p, hasProduct: true })))
  const errors = {
    date: !date || date > today ? rc.futureDate : undefined,
    expense: createExpense && (total === null || toCents(total) <= 0) ? rc.expenseNeedsTotal : undefined,
  }
  const valid = !errors.date && !errors.expense && parsed.every((p) => p.quantity !== null && !p.costInvalid)

  const input: ReceiveOrderInput = {
    receivedDate: date,
    lines: rows.map((r, i) => ({ lineId: r.lineId, receivedQuantity: parsed[i].quantity ?? 0, unitCost: parsed[i].unitCost })),
    createExpense,
    paymentMethod: createExpense ? paymentMethod : null,
  }

  const mutation = useMutation({
    mutationFn: () => api.purchaseOrders.receive(order.id, input),
    onSuccess: (received) => {
      // Straight to the order as the API gave it back, received: waiting for the lists first let
      // this page reload it and say it is not marked as ordered on the way
      qc.setQueryData(keys.purchaseOrder(order.id), received)
      navigate(`/inventory/orders/${order.id}`, { replace: true })
      toast(rc.done)
      void invalidate.orders()
    },
  })
  // The day's till is closed and the expense was in cash: nothing was received
  const closed =
    mutation.error instanceof ApiError && mutation.error.status === 409 ? closedCashDay(mutation.error.message) : null
  const closedDay = closed ? (closed.day ?? date) : null

  const submit = () => {
    setSubmitted(true)
    if (valid) mutation.mutate()
  }
  const shown = (text: string | undefined) => (submitted ? text : undefined)
  const update = (lineId: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((all) => all.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)))

  return (
    <form
      className="form receive-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <PageHead title={rc.title(order.id)} sub={rc.sub} />

      <section className="card">
        <div className="card-head">
          <h2>{order.supplierName}</h2>
          <span className="muted">{rc.zeroHint}</span>
        </div>
        <ul className="list receive-lines">
          {order.lines.map((line, i) => {
            const row = rows[i]
            const quantity = parsed[i].quantity
            const value = quantity === null ? null : quantityValue(quantity, parsed[i].unitCost)
            return (
              <li key={line.id} className="list-row receive-line">
                <div className="receive-product">
                  <span className="name">{line.productName}</span>
                  <span className="muted cell-sub">{rc.ordered(q.quantity(line.quantity, line.unit))}</span>
                </div>
                <div className="receive-field">
                  <QuantityInput
                    unit={line.unit}
                    value={row.receivedText}
                    aria-label={rc.receivedOf(line.productName)}
                    aria-invalid={(submitted && parsed[i].quantity === null) || undefined}
                    onChange={(text) => update(line.id, { receivedText: text })}
                  />
                  {submitted && parsed[i].quantity === null && <span className="error">{rc.receivedError}</span>}
                </div>
                <div className="receive-field">
                  <AmountInput
                    value={row.costText}
                    placeholder="—"
                    aria-label={rc.costOf(line.productName)}
                    aria-invalid={(submitted && parsed[i].costInvalid) || undefined}
                    onChange={(text) => update(line.id, { costText: text })}
                  />
                  {submitted && parsed[i].costInvalid && <span className="error">{t.inventory.order.costError}</span>}
                </div>
                <span className="mono receive-total">{value === null ? '—' : fmt.money(value)}</span>
              </li>
            )
          })}
        </ul>
        <div className="order-total" aria-live="polite">
          <span>{rc.total}</span>
          <span className="figure mono" data-testid="receive-total">
            {total === null ? '—' : fmt.money(total)}
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-body form">
          <div className="row-3">
            <Field label={rc.date} error={shown(errors.date)}>
              {(id) => (
                <input id={id} type="date" className="input mono" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} />
            {rc.createExpense}
          </label>
          {createExpense && (
            <div className="row-3">
              <Field label={rc.method} hint={total !== null && toCents(total) > 0 ? rc.expenseHint(fmt.money(total)) : undefined}>
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
          )}
          {shown(errors.expense) && (
            <span className="error" role="alert">
              {errors.expense}
            </span>
          )}
        </div>
      </section>

      {closedDay ? <DayClosedNote day={closedDay} message={rc.cashClosed(fmt.long(closedDay))} /> : <ErrorNote error={mutation.error} />}
      <div className="actions order-actions">
        <span className="spacer" />
        <Button type="submit" variant="primary" icon={PackageCheck} loading={mutation.isPending}>
          {rc.submit}
        </Button>
      </div>
    </form>
  )
}
