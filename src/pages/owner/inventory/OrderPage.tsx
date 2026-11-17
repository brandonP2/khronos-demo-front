// One purchase order. A draft (or a new order) is edited here: the supplier, the expected date,
// notes and the lines (product, quantity, optional cost per unit) with the total worked out as
// they are typed; "Suggest from low stock" fills the lines with the supplier's products at or
// under their minimum. It is then marked as ordered (Khronos does not send it), cancelled or, once
// ordered, received on its own page. ?supplierId=&propose=1 starts a new order with the proposal.
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Ban, PackageCheck, Plus, ReceiptText, Save, Send, Sparkles, Trash2, Truck } from 'lucide-react'
import { ApiError, isConflict } from '../../../api/client'
import { api } from '../../../api/endpoints'
import type { Product, PurchaseOrder, PurchaseOrderInput, Supplier } from '../../../api/types'
import { AmountInput } from '../../../components/AmountInput'
import { OrderStatusTag } from '../../../components/InventoryParts'
import { QuantityInput } from '../../../components/QuantityInput'
import { SupplierFormDialog } from '../../../components/SupplierDialogs'
import { Button, ConfirmDialog, Empty, ErrorNote, Field, Loading, PageHead, errorMessage, useToast } from '../../../components/ui'
import { inventoryRefusal } from '../../../lib/apiMessages'
import { useFmt, useT } from '../../../lib/i18n'
import { isBlank, parseAmount } from '../../../lib/money'
import { useInvalidate, useProducts, usePurchaseOrder, useSuppliers } from '../../../lib/queries'
import {
  ORDER_LINES_MAX,
  ORDER_NOTES_MAX,
  orderTotal,
  parseQuantity,
  proposeOrderLines,
  quantityValue,
  toMilli,
  useQuantityText,
} from '../../../lib/stock'
import { venueTimeZone, zonedDate } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'

export interface LineDraft {
  key: number
  productId: string
  quantityText: string
  costText: string
  /** The product changed after a quantity was typed: that quantity is checked again, now */
  recheck?: boolean
}

let lineKeys = 0
const nextKey = () => ++lineKeys

function BackToOrders() {
  const t = useT()
  return (
    <Link to="/inventory/orders" className="back-link">
      <ArrowLeft size={14} strokeWidth={1.5} />
      {t.inventory.order.back}
    </Link>
  )
}

export default function OrderPage() {
  const t = useT()
  const params = useParams()
  const [search] = useSearchParams()
  const { venue } = useVenue()
  const asked = params.orderId === undefined ? null : Number(params.orderId)
  const orderId = asked !== null && Number.isInteger(asked) && asked > 0 ? asked : null
  const order = usePurchaseOrder(orderId)
  const products = useProducts(venue?.id)
  const suppliers = useSuppliers(venue?.id)
  const o = t.inventory.order

  const notFound = (
    <div className="page">
      <BackToOrders />
      <div className="card">
        <Empty icon={Truck} title={o.notFound} />
      </div>
    </div>
  )

  if (params.orderId !== undefined && orderId === null) return notFound
  if (!venue || order.isLoading || products.isLoading || suppliers.isLoading) {
    return (
      <div className="page">
        <BackToOrders />
        <Loading rows={5} />
      </div>
    )
  }
  if (order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 403)) return notFound
  const error = order.error ?? products.error ?? suppliers.error
  if (error) {
    return (
      <div className="page">
        <BackToOrders />
        <ErrorNote error={error} />
      </div>
    )
  }
  const current = order.data
  if (current && current.establishmentId !== venue.id) return notFound

  if (current && current.status !== 'DRAFT') return <OrderView order={current} />
  const supplierId = Number(search.get('supplierId'))
  return (
    <OrderEditor
      key={current?.id ?? 'new'}
      venueId={venue.id}
      order={current}
      products={products.data ?? []}
      suppliers={suppliers.data ?? []}
      initialSupplierId={Number.isInteger(supplierId) && supplierId > 0 ? supplierId : null}
      proposeOnStart={search.get('propose') === '1'}
    />
  )
}

/** The lines a proposal adds: the products missing from the order, with their quantity and cost */
export function proposedLines(
  current: LineDraft[],
  products: Product[],
  supplierId: number,
  amount: (n: number) => string,
  quantity: (n: number) => string,
): LineDraft[] {
  const have = new Set(current.map((l) => l.productId))
  return proposeOrderLines(products, supplierId)
    .filter((line) => !have.has(String(line.productId)))
    .map((line) => ({
      key: nextKey(),
      productId: String(line.productId),
      quantityText: quantity(line.quantity),
      costText: line.unitCost === null ? '' : amount(line.unitCost),
    }))
}

const isFilled = (l: LineDraft) => !!l.productId || !isBlank(l.quantityText) || !isBlank(l.costText)

function OrderEditor({
  venueId,
  order,
  products,
  suppliers,
  initialSupplierId,
  proposeOnStart,
}: {
  venueId: number
  /** The draft being edited; a new order without it */
  order?: PurchaseOrder
  /** The venue's active products */
  products: Product[]
  suppliers: Supplier[]
  initialSupplierId: number | null
  proposeOnStart: boolean
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const o = t.inventory.order
  const startSupplier = order ? String(order.supplierId) : initialSupplierId && suppliers.some((s) => s.id === initialSupplierId) ? String(initialSupplierId) : ''

  const [supplierId, setSupplierId] = useState(startSupplier)
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? '')
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (order) {
      return order.lines.map((l) => ({
        key: nextKey(),
        productId: String(l.productId),
        quantityText: fmt.quantityInput(l.quantity),
        costText: l.unitCost === null ? '' : fmt.amount(l.unitCost),
      }))
    }
    const proposal = proposeOnStart && startSupplier ? proposedLines([], products, Number(startSupplier), fmt.amount, fmt.quantityInput) : []
    return proposal.length ? proposal : [{ key: nextKey(), productId: '', quantityText: '', costText: '' }]
  })
  const [notice, setNotice] = useState<string | null>(() =>
    !order && proposeOnStart && startSupplier
      ? lines.some((l) => l.productId)
        ? o.proposed(lines.filter((l) => l.productId).length)
        : o.nothingLow
      : null,
  )
  const [submitted, setSubmitted] = useState(false)
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [confirm, setConfirm] = useState<'remove' | 'cancel' | null>(null)
  // The draft a new order became on its first save. If marking it as ordered fails after that, a
  // retry saves and orders this same draft instead of creating another one.
  const [created, setCreated] = useState<PurchaseOrder | null>(null)
  const draft = order ?? created ?? undefined

  const productById = new Map(products.map((p) => [String(p.id), p]))
  const supplierName = suppliers.find((s) => String(s.id) === supplierId)?.name ?? ''
  const parsed = lines.map((l) => ({
    product: productById.get(l.productId),
    quantity: parseQuantity(l.quantityText),
    unitCost: isBlank(l.costText) ? null : parseAmount(l.costText),
    costInvalid: !isBlank(l.costText) && parseAmount(l.costText) === null,
  }))
  const { total, withoutCost } = orderTotal(
    parsed.map((l, i) => ({ hasProduct: !!lines[i].productId, quantity: l.quantity, unitCost: l.unitCost })),
  )

  const lineErrors = lines.map((l, i) => ({
    product: !l.productId
      ? o.productError
      : lines.findIndex((other) => other.productId === l.productId) < i
        ? o.duplicateError
        : undefined,
    quantity: parsed[i].quantity === null || toMilli(parsed[i].quantity ?? 0) <= 0 ? o.quantityError : undefined,
    cost: parsed[i].costInvalid ? o.costError : undefined,
  }))
  const errors = {
    supplier: supplierId ? undefined : o.supplierError,
    lines: lines.length === 0 ? o.linesError : lines.length > ORDER_LINES_MAX ? o.tooManyLines : undefined,
  }
  const valid = !errors.supplier && !errors.lines && lineErrors.every((e) => !e.product && !e.quantity && !e.cost)

  const input = (): PurchaseOrderInput => ({
    ...(draft ? {} : { establishmentId: venueId }),
    supplierId: Number(supplierId),
    expectedDate: expectedDate || null,
    notes: notes.trim() || null,
    lines: lines.map((l, i) => ({ productId: Number(l.productId), quantity: parsed[i].quantity ?? 0, unitCost: parsed[i].unitCost })),
  })

  const mutation = useMutation({
    mutationFn: async (markOrdered: boolean) => {
      const isNew = !draft
      let saved: PurchaseOrder
      if (draft) saved = await api.purchaseOrders.update(draft.id, input())
      else {
        saved = await api.purchaseOrders.create(input())
        // From here on the form edits this draft, whatever happens next
        setCreated(saved)
        void invalidate.orders()
      }
      if (markOrdered) saved = await api.purchaseOrders.order(saved.id)
      return { saved, markOrdered, isNew }
    },
    onSuccess: async ({ saved, markOrdered, isNew }) => {
      await invalidate.orders()
      toast(markOrdered ? o.ordered : isNew ? o.created : o.saved)
      if (!order) navigate(`/inventory/orders/${saved.id}`, { replace: true })
    },
    onError: (e) => {
      // No longer a draft (ordered or cancelled meanwhile): say so, and the page reloads it as it is now
      if (isConflict(e) && inventoryRefusal(e) === 'PURCHASE_ORDER_WRONG_STATUS') {
        toast(errorMessage(e, t))
        void invalidate.orders()
      }
    },
  })

  const send = (markOrdered: boolean) => {
    setSubmitted(true)
    if (valid) mutation.mutate(markOrdered)
  }
  const shown = (text: string | undefined) => (submitted ? text : undefined)

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const pickProduct = (line: LineDraft, productId: string) => {
    const product = productById.get(productId)
    const typed = parseQuantity(line.quantityText)
    update(line.key, {
      productId,
      // The product's last cost fills an empty cost
      costText: isBlank(line.costText) && product?.unitCost != null ? fmt.amount(product.unitCost) : line.costText,
      // A quantity typed before is now in this product's unit: it reads back in it and is checked again
      quantityText: typed === null ? line.quantityText : fmt.quantityInput(typed),
      recheck: !isBlank(line.quantityText),
    })
  }

  const propose = () => {
    if (!supplierId) return setNotice(o.chooseSupplierFirst)
    const added = proposedLines(lines.filter(isFilled), products, Number(supplierId), fmt.amount, fmt.quantityInput)
    if (added.length === 0) return setNotice(o.nothingLow)
    setLines((all) => [...all.filter(isFilled), ...added])
    setNotice(o.proposed(added.length))
  }

  // The supplier's products first, then the rest
  const ofSupplier = products.filter((p) => String(p.supplierId) === supplierId)
  const others = products.filter((p) => String(p.supplierId) !== supplierId)
  const productOptions = (line: LineDraft) => {
    const missing = line.productId && !productById.has(line.productId)
      ? draft?.lines.find((l) => String(l.productId) === line.productId)
      : undefined
    return (
      <>
        <option value="">{o.chooseProduct}</option>
        {missing && <option value={line.productId}>{o.inactive(missing.productName)}</option>}
        {ofSupplier.length > 0 && (
          <optgroup label={o.fromSupplier(supplierName)}>
            {ofSupplier.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {ofSupplier.length > 0 && others.length > 0 ? (
          <optgroup label={o.otherProducts}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ) : (
          others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </>
    )
  }

  return (
    <div className="page order-page">
      <BackToOrders />
      <PageHead title={draft ? o.title(draft.id) : o.newTitle} sub={o.statusSub.DRAFT}>
        {draft && <OrderStatusTag status={draft.status} />}
      </PageHead>

      <section className="card">
        <div className="card-body form">
          {suppliers.length === 0 ? (
            <div className="notice info" role="note">
              <span className="grow">{o.noSuppliers}</span>
              <Button size="sm" icon={Plus} onClick={() => setAddingSupplier(true)}>
                {o.addSupplier}
              </Button>
            </div>
          ) : null}
          <div className="row-3">
            <Field label={o.supplier} error={shown(errors.supplier)}>
              {(id) => (
                <select id={id} className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">{o.chooseSupplier}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={o.expectedDate} hint={o.expectedHint}>
              {(id) => (
                <input id={id} type="date" className="input mono" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              )}
            </Field>
          </div>
          <Field label={o.notes} hint={o.notesHint}>
            {(id) => (
              <textarea id={id} className="textarea" maxLength={ORDER_NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{o.lines}</h2>
          <Button size="sm" icon={Sparkles} onClick={propose} title={o.proposeHint}>
            {o.propose}
          </Button>
        </div>
        <div className="card-body form">
          <p className="muted inventory-hint">{o.proposeHint}</p>
          {notice && (
            <div className="notice info" role="status">
              <span>{notice}</span>
            </div>
          )}
          <ol className="order-lines">
            {lines.map((line, i) => {
              // An inactive product left on a draft is not in the list, but its line knows the unit
              const unit = productById.get(line.productId)?.unit ?? draft?.lines.find((l) => String(l.productId) === line.productId)?.unit
              const quantity = parsed[i].quantity
              const value = quantity === null ? null : quantityValue(quantity, parsed[i].unitCost)
              return (
                <li key={line.key} className="order-line">
                  <Field label={o.product} error={shown(lineErrors[i].product)}>
                    {(id) => (
                      <select id={id} className="select" value={line.productId} onChange={(e) => pickProduct(line, e.target.value)}>
                        {productOptions(line)}
                      </select>
                    )}
                  </Field>
                  <Field label={o.quantity} error={submitted || line.recheck ? lineErrors[i].quantity : undefined}>
                    {(id) => (
                      <QuantityInput
                        id={id}
                        unit={unit}
                        value={line.quantityText}
                        placeholder="0"
                        onChange={(text) => update(line.key, { quantityText: text })}
                      />
                    )}
                  </Field>
                  <Field label={o.unitCost} error={shown(lineErrors[i].cost)}>
                    {(id) => (
                      <AmountInput id={id} value={line.costText} placeholder="—" onChange={(text) => update(line.key, { costText: text })} />
                    )}
                  </Field>
                  <div className="order-line-total">
                    <span className="label">{o.lineTotal}</span>
                    <span className="mono">{value === null ? '—' : fmt.money(value)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Trash2}
                    className="order-line-remove"
                    aria-label={o.removeLine(i + 1)}
                    onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}
                  />
                </li>
              )
            })}
          </ol>
          {shown(errors.lines) && <span className="error">{errors.lines}</span>}
          <div>
            <Button
              size="sm"
              icon={Plus}
              onClick={() => setLines((all) => [...all, { key: nextKey(), productId: '', quantityText: '', costText: '' }])}
            >
              {o.addLine}
            </Button>
          </div>
        </div>
        <div className="order-total" aria-live="polite">
          <span>{o.total}</span>
          <span className="figure mono" data-testid="order-total">
            {total === null ? '—' : fmt.money(total)}
          </span>
          <span className="muted order-total-note">
            {total === null ? o.noTotal : withoutCost > 0 ? o.withoutCost(withoutCost) : null}
          </span>
        </div>
      </section>

      <ErrorNote error={mutation.error} />
      <p className="muted inventory-hint">{o.markOrderedHint}</p>
      <div className="actions order-actions">
        {draft && (
          <>
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirm('remove')}>
              {o.remove}
            </Button>
            <Button variant="ghost" icon={Ban} onClick={() => setConfirm('cancel')}>
              {o.cancel}
            </Button>
          </>
        )}
        <span className="spacer" />
        <Button icon={Save} loading={mutation.isPending && mutation.variables === false} disabled={mutation.isPending} onClick={() => send(false)}>
          {o.saveDraft}
        </Button>
        <Button
          variant="primary"
          icon={Send}
          loading={mutation.isPending && mutation.variables === true}
          disabled={mutation.isPending}
          onClick={() => send(true)}
        >
          {o.markOrdered}
        </Button>
      </div>

      {addingSupplier && (
        <SupplierFormDialog venueId={venueId} onClose={() => setAddingSupplier(false)} onSaved={(s) => setSupplierId(String(s.id))} />
      )}
      {draft && confirm === 'remove' && (
        <ConfirmDialog
          title={o.removeTitle}
          confirmLabel={o.remove}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await api.purchaseOrders.remove(draft.id)
            await invalidate.orders()
            toast(o.removed)
            navigate('/inventory/orders', { replace: true })
          }}
        >
          {o.removeBody}
        </ConfirmDialog>
      )}
      {draft && confirm === 'cancel' && (
        <CancelOrderDialog
          order={draft}
          onClose={() => setConfirm(null)}
          // A draft created on this page is still at /new: go to it, now cancelled
          onCancelled={order ? undefined : () => navigate(`/inventory/orders/${draft.id}`, { replace: true })}
        />
      )}
    </div>
  )
}

/** Cancelling a draft or an ordered order: it stays on record as cancelled and can no longer be received */
export function CancelOrderDialog({ order, onClose, onCancelled }: { order: PurchaseOrder; onClose: () => void; onCancelled?: () => void }) {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const o = t.inventory.order
  return (
    <ConfirmDialog
      title={o.cancelTitle(order.id)}
      confirmLabel={o.cancel}
      onClose={onClose}
      onConfirm={async () => {
        await api.purchaseOrders.cancel(order.id)
        await invalidate.orders()
        toast(o.cancelled)
        onCancelled?.()
      }}
    >
      {o.cancelBody}
    </ConfirmDialog>
  )
}

/** An order that is no longer a draft: what was ordered and received, and what is left to do */
function OrderView({ order }: { order: PurchaseOrder }) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const { venue } = useVenue()
  const timeZone = venueTimeZone(venue)
  const o = t.inventory.order
  const [cancelling, setCancelling] = useState(false)
  const received = order.status === 'RECEIVED'

  return (
    <div className="page order-page">
      <BackToOrders />
      <PageHead title={o.title(order.id)} sub={o.statusSub[order.status]}>
        <OrderStatusTag status={order.status} />
      </PageHead>

      <section className="card">
        <div className="card-body">
          <dl className="kv order-kv">
            <dt>{o.supplier}</dt>
            <dd>{order.supplierName}</dd>
            {order.orderDate && (
              <>
                <dt>{o.orderDate}</dt>
                <dd>{fmt.long(order.orderDate)}</dd>
              </>
            )}
            {order.expectedDate && (
              <>
                <dt>{o.expectedDate}</dt>
                <dd>{fmt.long(order.expectedDate)}</dd>
              </>
            )}
            {order.receivedDate && (
              <>
                <dt>{o.receivedDate}</dt>
                <dd>{fmt.long(order.receivedDate)}</dd>
              </>
            )}
            {order.notes && (
              <>
                <dt>{o.notes}</dt>
                <dd>{order.notes}</dd>
              </>
            )}
          </dl>
          <p className="muted inventory-hint order-created">{o.createdBy(order.createdByName, fmt.short(zonedDate(order.createdAt, timeZone)))}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{o.lines}</h2>
        </div>
        <table className="table order-table">
          <thead>
            <tr>
              <th>{o.product}</th>
              <th className="right">{o.orderedQuantity}</th>
              {received && <th className="right">{o.receivedQuantity}</th>}
              <th className="right">{o.unitCost}</th>
              <th className="right">{o.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="order-table-product">{l.productName}</td>
                <td className="right mono" data-label={o.orderedQuantity}>
                  {q.quantity(l.quantity, l.unit)}
                </td>
                {received && (
                  <td className="right mono" data-label={o.receivedQuantity}>
                    {l.receivedQuantity === null ? '—' : q.quantity(l.receivedQuantity, l.unit)}
                  </td>
                )}
                <td className="right mono" data-label={o.unitCost}>
                  {l.unitCost === null ? '—' : q.perUnit(l.unitCost, l.unit)}
                </td>
                <td className="right mono" data-label={o.lineTotal}>
                  {l.lineTotal === null ? '—' : fmt.money(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="order-total">
          <span>{received ? t.inventory.receive.total : o.total}</span>
          <span className="figure mono" data-testid="order-total">
            {order.total === null ? '—' : fmt.money(order.total)}
          </span>
        </div>
      </section>

      {received && order.expenseId !== null && order.receivedDate && (
        <div className="notice info" role="note">
          <ReceiptText size={16} strokeWidth={1.5} />
          <Link to={`/expenses?from=${order.receivedDate}&to=${order.receivedDate}`}>{o.expense}</Link>
        </div>
      )}

      {order.status === 'ORDERED' && (
        <div className="actions order-actions">
          <Button variant="ghost" icon={Ban} onClick={() => setCancelling(true)}>
            {o.cancel}
          </Button>
          <span className="spacer" />
          <Link to={`/inventory/orders/${order.id}/receive`} className="btn btn-primary">
            <PackageCheck size={16} strokeWidth={1.5} />
            {o.receive}
          </Link>
        </div>
      )}
      {cancelling && <CancelOrderDialog order={order} onClose={() => setCancelling(false)} />}
    </div>
  )
}
