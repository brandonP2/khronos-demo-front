// Receiving an ordered order: what arrived and at what cost, line by line (the ordered quantities
// to start with, and each line's cost, else its product's), the day, and whether to create the
// matching expense and how it was paid. The API does it all at once: the stock goes up for each line
// that arrived, its cost becomes the product's and the expense of the total is created. A line
// received with 0 is left out of all of it. A cash expense on a day whose till is closed is refused
// (409) and nothing is received; the screen says so and links to that day's till, as Expenses does.
// When nothing arrived at all there is nothing to receive: the screen offers to cancel the order.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, PackageCheck, Truck } from 'lucide-react'
import { ApiError, isConflict } from '../../../api/client'
import { api } from '../../../api/endpoints'
import type { PaymentMethod, PurchaseOrder, ReceiveOrderInput } from '../../../api/types'
import { AmountInput } from '../../../components/AmountInput'
import { DayClosedNote, PAYMENT_METHODS } from '../../../components/ExpenseDialogs'
import { QuantityInput } from '../../../components/QuantityInput'
import { Button, Empty, ErrorNote, Field, Loading, PageHead, errorMessage, useToast } from '../../../components/ui'
import { cashRefusal, inventoryRefusal, refusalDay } from '../../../lib/apiMessages'
import { useFmt, useT } from '../../../lib/i18n'
import { isBlank, toCents } from '../../../lib/money'
import { keys, useInvalidate, useProducts, usePurchaseOrder } from '../../../lib/queries'
import { orderTotal, parseCost, parseQuantity, quantityValue, toMilli, useQuantityText } from '../../../lib/stock'
import { venueTimeZone, zonedToday } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'
import { CancelOrderDialog } from './OrderPage'

export default function ReceivePage() {
  const t = useT()
  const params = useParams()
  const { venue } = useVenue()
  const asked = Number(params.orderId)
  const orderId = Number.isInteger(asked) && asked > 0 ? asked : null
  const order = usePurchaseOrder(orderId)
  // A line with no cost of its own is received at its product's
  const products = useProducts(venue?.id)
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
      ) : !venue || order.isLoading || products.isLoading ? (
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
        order.data && (
          <ReceiveForm
            order={order.data}
            productCosts={new Map((products.data ?? []).map((p) => [p.id, p.unitCost]))}
            today={zonedToday(venueTimeZone(venue))}
          />
        )
      )}
    </div>
  )
}

function ReceiveForm({
  order,
  productCosts,
  today,
}: {
  order: PurchaseOrder
  /** Each active product's cost per unit now */
  productCosts: Map<number, number | null>
  today: string
}) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const rc = t.inventory.receive
  // The cost a line is received at when its field is left empty, as the API picks it: the line's, else the product's
  const fallbackCost = order.lines.map((l) => l.unitCost ?? productCosts.get(l.productId) ?? null)
  const [rows, setRows] = useState(() =>
    order.lines.map((l, i) => ({
      lineId: l.id,
      receivedText: fmt.quantityInput(l.quantity),
      costText: fallbackCost[i] === null ? '' : fmt.amount(fallbackCost[i]),
    })),
  )
  const [date, setDate] = useState(today)
  const [createExpense, setCreateExpense] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER')
  const [submitted, setSubmitted] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const parsed = rows.map((r, i) => {
    const quantity = parseQuantity(r.receivedText)
    const typed = isBlank(r.costText) ? null : parseCost(r.costText)
    return {
      quantity,
      /** Received with 0: it does not come in, and its cost is neither sent nor checked */
      out: quantity !== null && toMilli(quantity) === 0,
      typed,
      unitCost: typed ?? fallbackCost[i],
      costInvalid: !isBlank(r.costText) && typed === null,
    }
  })
  const { total } = orderTotal(parsed.map((p) => ({ hasProduct: true, quantity: p.quantity, unitCost: p.unitCost })))
  const nothing = parsed.every((p) => p.out)
  const errors = {
    date: !date || date > today ? rc.futureDate : undefined,
    expense: createExpense && (total === null || toCents(total) <= 0) ? rc.expenseNeedsTotal : undefined,
  }
  const valid = !nothing && !errors.date && !errors.expense && parsed.every((p) => p.quantity !== null && (p.out || !p.costInvalid))

  const input: ReceiveOrderInput = {
    receivedDate: date,
    lines: rows.map((r, i) => ({
      lineId: r.lineId,
      receivedQuantity: parsed[i].quantity ?? 0,
      unitCost: parsed[i].out ? null : parsed[i].typed,
    })),
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
    onError: (e) => {
      // Received or cancelled meanwhile: say so, and the page reloads it as it is now
      if (isConflict(e) && inventoryRefusal(e) === 'PURCHASE_ORDER_WRONG_STATUS') {
        toast(errorMessage(e, t))
        void invalidate.orders()
      }
    },
  })
  // The day's till is closed and the expense was in cash: nothing was received
  const closedDay =
    isConflict(mutation.error) && cashRefusal(mutation.error) === 'CASH_DAY_CLOSED' ? (refusalDay(mutation.error) ?? date) : null

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
            const { quantity, out } = parsed[i]
            const value = quantity === null || out ? null : quantityValue(quantity, parsed[i].unitCost)
            const costShown = submitted && !out && parsed[i].costInvalid
            return (
              <li key={line.id} className={out ? 'list-row receive-line out' : 'list-row receive-line'}>
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
                    placeholder={fallbackCost[i] === null ? '—' : fmt.amount(fallbackCost[i])}
                    aria-label={rc.costOf(line.productName)}
                    aria-invalid={costShown || undefined}
                    disabled={out}
                    onChange={(text) => update(line.id, { costText: text })}
                  />
                  {costShown && <span className="error">{t.inventory.order.costError}</span>}
                </div>
                <span className={out ? 'receive-total receive-out' : 'mono receive-total'}>
                  {out ? rc.notArrived : value === null ? rc.noCost : fmt.money(value)}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="muted inventory-hint receive-cost-hint">{rc.costHint}</p>
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

      {submitted && nothing && (
        <div className="notice" role="alert">
          <span className="grow">{rc.nothingReceived}</span>
          <Button size="sm" icon={Ban} onClick={() => setCancelling(true)}>
            {t.inventory.order.cancel}
          </Button>
        </div>
      )}
      {closedDay ? <DayClosedNote day={closedDay} message={rc.cashClosed(fmt.longInSentence(closedDay))} /> : <ErrorNote error={mutation.error} />}
      <div className="actions order-actions">
        <span className="spacer" />
        <Button type="submit" variant="primary" icon={PackageCheck} loading={mutation.isPending}>
          {rc.submit}
        </Button>
      </div>
      {cancelling && (
        <CancelOrderDialog
          order={order}
          onClose={() => setCancelling(false)}
          onCancelled={() => navigate(`/inventory/orders/${order.id}`, { replace: true })}
        />
      )}
    </form>
  )
}
