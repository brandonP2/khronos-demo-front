// A product's dialogs: the quick movements (stock in, waste, usage, adjustment) that change its
// stock at once, adding and editing it, its card with every action, and deactivating or
// deleting it. Movements are never edited: a mistake is corrected with an adjustment.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { GlassWater, History, PackagePlus, PackageX, Pencil, Power, SlidersHorizontal, Trash2, type LucideIcon } from 'lucide-react'
import { isConflict } from '../api/client'
import { api } from '../api/endpoints'
import type { ManualMovementType, Product, ProductCategory, ProductInput, StockUnit, Supplier } from '../api/types'
import { isNameTaken, isUnitLocked } from '../lib/apiMessages'
import { useFmt, useT } from '../lib/i18n'
import { isBlank, parseAmount } from '../lib/money'
import { useApplyMovements, useInvalidate } from '../lib/queries'
import {
  MOVEMENT_TYPES,
  NAME_MAX,
  PRODUCT_CATEGORIES,
  REASON_MAX,
  STOCK_UNITS,
  fromMilli,
  isNegative,
  movementInput,
  movementIssues,
  needsReason,
  parseQuantity,
  stockChange,
  toMilli,
  useQuantityText,
  type MovementDraft,
} from '../lib/stock'
import { AmountInput } from './AmountInput'
import { StockTags } from './InventoryParts'
import { QuantityInput } from './QuantityInput'
import { Button, ConfirmDialog, Dialog, Drawer, ErrorNote, Field, useToast } from './ui'

export const MOVEMENT_ICONS: Record<ManualMovementType, LucideIcon> = {
  PURCHASE: PackagePlus,
  WASTE: PackageX,
  CONSUMPTION: GlassWater,
  ADJUSTMENT: SlidersHorizontal,
}

/** The four quick actions, one tap each on the phone; the visible word is part of each name */
export function QuickActions({ product, onAction }: { product: Product; onAction: (type: ManualMovementType) => void }) {
  const t = useT()
  return (
    <div className="stock-actions">
      {MOVEMENT_TYPES.map((type) => (
        <Button
          key={type}
          size="sm"
          icon={MOVEMENT_ICONS[type]}
          aria-label={t.inventory.stock.quick(t.movementTypes[type], product.name)}
          onClick={() => onAction(type)}
        >
          <span className="btn-label">{t.movementTypes[type]}</span>
        </Button>
      ))}
    </div>
  )
}

/** One movement of one product, with the stock it leaves worked out as it is typed */
export function MovementDialog({
  venueId,
  product,
  type,
  today,
  onClose,
}: {
  venueId: number
  product: Product
  type: ManualMovementType
  /** The venue's today, the latest day a movement can have */
  today: string
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const toast = useToast()
  const invalidate = useInvalidate()
  const applyMovements = useApplyMovements()
  const [quantityText, setQuantityText] = useState('')
  const [direction, setDirection] = useState<MovementDraft['direction']>('add')
  const [costText, setCostText] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today)
  const [submitted, setSubmitted] = useState(false)
  const m = t.inventory.movement

  const quantity = parseQuantity(quantityText)
  const unitCost = isBlank(costText) ? null : (parseAmount(costText) ?? 'invalid')
  const draft: MovementDraft = { type, quantity, direction, unitCost, reason, date }
  const issues = movementIssues(draft, today)
  const valid = Object.keys(issues).length === 0
  const after = quantity === null ? null : fromMilli(toMilli(product.currentStock) + toMilli(stockChange(draft)))

  const mutation = useMutation({
    mutationFn: () => api.stockMovements.create(movementInput(product.id, draft)),
    onSuccess: (movement) => {
      // The stock the API worked out shows at once; the lists are refetched behind it
      applyMovements(venueId, [movement])
      toast(m.savedToast(m.saved[type], product.name, q.quantity(movement.stockAfter, product.unit)))
      onClose()
      void invalidate.stock()
    },
  })

  const submit = () => {
    setSubmitted(true)
    if (valid) mutation.mutate()
  }
  const shown = (issue: true | undefined, text: string) => (submitted && issue ? text : undefined)

  return (
    <Dialog
      title={m.title[type](product.name)}
      sub={m.sub[type]}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={MOVEMENT_ICONS[type]} loading={mutation.isPending} onClick={submit}>
            {m.save[type]}
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
        {type === 'ADJUSTMENT' && (
          <div className="field">
            <span className="label">{m.direction}</span>
            <div className="segmented movement-direction" role="group" aria-label={m.direction}>
              <button type="button" aria-pressed={direction === 'add'} onClick={() => setDirection('add')}>
                {m.add}
              </button>
              <button type="button" aria-pressed={direction === 'remove'} onClick={() => setDirection('remove')}>
                {m.remove}
              </button>
            </div>
          </div>
        )}
        <div className="row-2">
          <Field label={m.quantity} hint={m.quantityHint} error={shown(issues.quantity, m.quantityError)}>
            {(id) => (
              <QuantityInput id={id} unit={product.unit} value={quantityText} placeholder="0" onChange={setQuantityText} required />
            )}
          </Field>
          {type === 'PURCHASE' ? (
            <Field
              label={m.unitCost}
              hint={m.unitCostHint(product.unitCost === null ? null : q.perUnit(product.unitCost, product.unit))}
              error={shown(issues.unitCost, m.unitCostError)}
            >
              {(id) => <AmountInput id={id} value={costText} placeholder={fmt.amount(0)} onChange={setCostText} />}
            </Field>
          ) : (
            <Field label={m.date} hint={m.dateHint} error={shown(issues.date, m.futureDate)}>
              {(id) => (
                <input id={id} type="date" className="input mono" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </Field>
          )}
        </div>
        {needsReason(type) && (
          <Field label={m.reason} hint={m.reasonHint} error={shown(issues.reason, m.reasonError)}>
            {(id) => (
              <input id={id} className="input" required maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        )}
        {type === 'WASTE' && (
          <div className="chips reason-chips" role="group" aria-label={m.suggestions}>
            {m.wasteReasons.map((r) => (
              <button key={r} type="button" className="chip plain" aria-pressed={reason === r} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
        )}
        {type === 'PURCHASE' && (
          <div className="row-2">
            <Field label={m.date} hint={m.dateHint} error={shown(issues.date, m.futureDate)}>
              {(id) => (
                <input id={id} type="date" className="input mono" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </Field>
          </div>
        )}
        <p className="movement-preview" aria-live="polite">
          <span className="muted">{m.stockAfter}</span>{' '}
          <span className="mono">
            {q.quantity(product.currentStock, product.unit)} → {after === null ? '…' : q.quantity(after, product.unit)}
          </span>
        </p>
        {after !== null && toMilli(after) < 0 && <p className="muted inventory-hint">{m.goesNegative}</p>}
        {type === 'CONSUMPTION' && <p className="muted inventory-hint">{t.inventory.noPos}</p>}
        <p className="muted inventory-hint">{m.final}</p>
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** Adding and editing a product. The unit cannot change once it has movements: the API answers 409. */
export function ProductFormDialog({
  venueId,
  product,
  suppliers,
  onClose,
}: {
  venueId: number
  /** Edits this product; without it a new one is added */
  product?: Product
  suppliers: Supplier[]
  onClose: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const p = t.inventory.product
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState<ProductCategory>(product?.category ?? 'SPIRITS')
  const [unit, setUnit] = useState<StockUnit>(product?.unit ?? 'BOTTLE')
  const [minText, setMinText] = useState(product?.minStock == null ? '' : fmt.quantityInput(product.minStock))
  const [costText, setCostText] = useState(product?.unitCost == null ? '' : fmt.amount(product.unitCost))
  const [supplierId, setSupplierId] = useState(product?.supplierId ? String(product.supplierId) : '')
  const [submitted, setSubmitted] = useState(false)
  // The API said this product has movements, so the unit went back to what it was
  const [unitRefused, setUnitRefused] = useState(false)

  // Some stock means some movements, so the unit is locked; with 0 the API still has the last word
  const unitLocked = !!product && (toMilli(product.currentStock) !== 0 || unitRefused)
  const minStock = isBlank(minText) ? null : parseQuantity(minText)
  const unitCost = isBlank(costText) ? null : parseAmount(costText)
  const errors = {
    name: name.trim().length === 0 || name.trim().length > NAME_MAX ? p.nameError : undefined,
    minStock: !isBlank(minText) && minStock === null ? p.minStockError : undefined,
    unitCost: !isBlank(costText) && unitCost === null ? p.unitCostError : undefined,
  }
  const valid = !errors.name && !errors.minStock && !errors.unitCost

  const input: ProductInput = {
    ...(product ? {} : { establishmentId: venueId }),
    name: name.trim(),
    category,
    unit,
    minStock,
    unitCost,
    supplierId: supplierId ? Number(supplierId) : null,
  }

  const mutation = useMutation({
    mutationFn: () => (product ? api.products.update(product.id, input) : api.products.create(input)),
    onSuccess: async (saved) => {
      await invalidate.products()
      toast(product ? p.saved : p.added(saved.name))
      onClose()
    },
    onError: (e) => {
      // A name that is taken can mention "unit" too, so the name is ruled out first
      if (product && isConflict(e) && unit !== product.unit && !isNameTaken(e.message) && isUnitLocked(e.message)) {
        setUnit(product.unit)
        setUnitRefused(true)
      }
    },
  })
  const conflict = isConflict(mutation.error) ? mutation.error : null
  const error =
    conflict && isNameTaken(conflict.message)
      ? p.duplicate
      : unitRefused && conflict && isUnitLocked(conflict.message)
        ? p.unitConflict
        : mutation.error

  const submit = () => {
    setSubmitted(true)
    if (valid) mutation.mutate()
  }
  const shown = (text: string | undefined) => (submitted ? text : undefined)

  return (
    <Dialog
      title={product ? p.editTitle : p.addTitle}
      sub={product ? p.sub : `${p.sub} ${p.startsEmpty}`}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {product ? t.common.save : p.addTitle}
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
        <Field label={p.name} error={shown(errors.name)}>
          {(id) => (
            <input
              id={id}
              className="input"
              required
              maxLength={NAME_MAX}
              placeholder={p.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="row-2">
          <Field label={p.category} hint={t.productCategoryHints[category]}>
            {(id) => (
              <select id={id} className="select" value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.productCategories[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={p.unit} hint={unitLocked ? p.unitLocked : p.unitHint}>
            {(id) => (
              <select id={id} className="select" value={unit} disabled={unitLocked} onChange={(e) => setUnit(e.target.value as StockUnit)}>
                {STOCK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t.unitNames[u]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="row-2">
          <Field label={p.minStock} hint={p.minStockHint} error={shown(errors.minStock)}>
            {(id) => <QuantityInput id={id} unit={unit} value={minText} placeholder="—" onChange={setMinText} />}
          </Field>
          <Field label={p.unitCost} hint={p.unitCostHint} error={shown(errors.unitCost)}>
            {(id) => <AmountInput id={id} value={costText} placeholder="—" onChange={setCostText} />}
          </Field>
        </div>
        <Field label={p.supplier}>
          {(id) => (
            <select id={id} className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{p.noSupplier}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

export type ProductAction = ManualMovementType | 'edit' | 'toggle' | 'delete'

/** A product's card: its figures, the quick actions, its history and the rest of what can be done with it */
export function ProductDrawer({
  product,
  onClose,
  onAction,
}: {
  product: Product
  onClose: () => void
  onAction: (action: ProductAction) => void
}) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const p = t.inventory.product
  const columns = t.inventory.stock.columns
  return (
    <Drawer
      title={product.name}
      sub={`${t.productCategories[product.category]} · ${t.unitNames[product.unit]}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} className="spacer" onClick={() => onAction('delete')}>
            {p.remove}
          </Button>
          <Button icon={Power} onClick={() => onAction('toggle')}>
            {product.isActive ? p.deactivate : p.activate}
          </Button>
          <Button variant="primary" icon={Pencil} onClick={() => onAction('edit')}>
            {t.common.edit}
          </Button>
        </>
      }
    >
      <dl className="kv product-kv">
        <dt>{p.stock}</dt>
        <dd>
          <span className="mono product-stock">{q.quantity(product.currentStock, product.unit)}</span>{' '}
          <span className="stock-tags">
            <StockTags product={product} />
          </span>
        </dd>
        <dt>{columns.min}</dt>
        <dd className="mono">{product.minStock === null ? '—' : q.quantity(product.minStock, product.unit)}</dd>
        <dt>{columns.cost}</dt>
        <dd className="mono">{product.unitCost === null ? '—' : q.perUnit(product.unitCost, product.unit)}</dd>
        <dt>{columns.value}</dt>
        <dd className="mono">{product.stockValue === null ? '—' : fmt.money(product.stockValue)}</dd>
        <dt>{p.supplier}</dt>
        <dd>{product.supplierName ?? '—'}</dd>
        <dt>{p.status}</dt>
        <dd>{product.isActive ? p.active : p.inactive}</dd>
      </dl>
      {isNegative(product) && (
        <p className="notice info" role="note">
          {t.inventory.stock.negativeHelp}
        </p>
      )}
      {product.isActive && <QuickActions product={product} onAction={onAction} />}
      <Link className="btn" to={`/inventory/movements?productId=${product.id}`}>
        <History size={16} strokeWidth={1.5} />
        {p.seeMovements}
      </Link>
    </Drawer>
  )
}

/** Deactivating keeps the history and stops new movements; activating brings it back */
export function ProductToggleDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const p = t.inventory.product
  const deactivating = product.isActive
  return (
    <ConfirmDialog
      title={deactivating ? p.deactivateTitle(product.name) : p.activateTitle(product.name)}
      confirmLabel={deactivating ? p.deactivate : p.activate}
      onClose={onClose}
      onConfirm={async () => {
        await api.products.setActive(product.id, !deactivating)
        await invalidate.products()
        toast(deactivating ? p.deactivated : p.activated)
      }}
    >
      {deactivating ? p.deactivateBody : p.activateBody}
    </ConfirmDialog>
  )
}

/** Only a product with no movements and no orders can go; otherwise the API answers 409 and deactivating is the way */
export function ProductDeleteDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const p = t.inventory.product
  return (
    <ConfirmDialog
      title={p.removeTitle(product.name)}
      confirmLabel={p.removeConfirm}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api.products.remove(product.id)
        } catch (e) {
          throw isConflict(e) ? new Error(p.removeBlocked(product.name)) : e
        }
        await invalidate.products()
        toast(p.removed)
      }}
    >
      {p.removeBody}
    </ConfirmDialog>
  )
}
