// Stock: what the venue has now, product by product and by category, made for the phone. The
// report's figures on top, search and filters, and four quick actions on each product (stock
// in, waste, usage, adjustment) that change its stock as soon as they are saved. Below, what is
// under its minimum, by supplier and ready to order, and the period's purchases, waste and
// count differences. ?low=1 opens it on low stock (from the summary's alert).
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, Download, Info, Package, Plus, Truck } from 'lucide-react'
import { api } from '../../../api/endpoints'
import type { InventoryReport, ManualMovementType, Product } from '../../../api/types'
import { InventoryHead, StockTags } from '../../../components/InventoryParts'
import { PeriodPicker, usePeriod } from '../../../components/PeriodPicker'
import {
  MovementDialog,
  ProductDeleteDialog,
  ProductDrawer,
  ProductFormDialog,
  ProductToggleDialog,
  QuickActions,
  type ProductAction,
} from '../../../components/StockDialogs'
import { Button, Empty, ErrorNote, Field, Loading } from '../../../components/ui'
import { useDownload } from '../../../lib/download'
import { useFmt, useT } from '../../../lib/i18n'
import { toCents } from '../../../lib/money'
import { useInventoryReport, useProducts, useSuppliers } from '../../../lib/queries'
import { filterProducts, groupByCategory, isNegative, useQuantityText, type StockFilter } from '../../../lib/stock'
import { presetPeriod, venueTimeZone, zonedToday } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'

type Modal = { kind: 'add' } | { kind: ProductAction | 'details'; productId: number } | null

/** The products under their minimum, by usual supplier, and how many have none */
export function lowStockBySupplier(lowStock: InventoryReport['lowStock']) {
  const bySupplier = new Map<number, { supplierId: number; supplierName: string; count: number }>()
  let withoutSupplier = 0
  for (const item of lowStock) {
    if (item.supplierId === null) {
      withoutSupplier += 1
      continue
    }
    const entry = bySupplier.get(item.supplierId) ?? { supplierId: item.supplierId, supplierName: item.supplierName ?? '', count: 0 }
    entry.count += 1
    bySupplier.set(item.supplierId, entry)
  }
  return { suppliers: [...bySupplier.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName)), withoutSupplier }
}

export default function StockTab() {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const s = t.inventory.stock
  const { venue } = useVenue()
  const today = zonedToday(venueTimeZone(venue))
  const [search] = useSearchParams()
  const [filter, setFilter] = useState<StockFilter>(() => ({ search: '', lowOnly: search.get('low') === '1', includeInactive: false }))
  const products = useProducts(venue?.id, filter.includeInactive)
  const suppliers = useSuppliers(venue?.id)
  const { value, setValue, period } = usePeriod(undefined, today)
  // The stock figures are today's whatever the period, so they keep showing while a range is typed
  const report = useInventoryReport(venue?.id, period ?? presetPeriod('this-week', today))
  const file = useDownload()
  const [modal, setModal] = useState<Modal>(null)

  const all = products.data ?? []
  const shown = filterProducts(all, filter)
  const groups = groupByCategory(shown)
  const find = (id: number) => all.find((p) => p.id === id)
  const modalProduct = modal && modal.kind !== 'add' ? find(modal.productId) : undefined
  const close = () => setModal(null)
  const act = (product: Product, kind: ProductAction | 'details') => setModal({ kind, productId: product.id })
  const r = report.data

  return (
    <div className="page">
      <InventoryHead>
        <Button
          icon={Download}
          disabled={!venue}
          loading={file.isPending}
          onClick={() =>
            venue && file.mutate({ fetchFile: () => api.reports.inventoryCsv(venue.id), fallbackName: s.file(today) })
          }
        >
          {s.export}
        </Button>
        <Button icon={Plus} onClick={() => setModal({ kind: 'add' })}>
          {s.addProduct}
        </Button>
        <Link to="/inventory/count" className="btn btn-primary">
          <ClipboardList size={16} strokeWidth={1.5} />
          {s.count}
        </Link>
      </InventoryHead>
      <ErrorNote error={file.error} />

      {report.isLoading ? (
        <Loading rows={1} />
      ) : r ? (
        <div className="stats" aria-busy={report.isPlaceholderData || undefined}>
          <div className="card stat">
            <span className="label">{s.value}</span>
            <span className="figure">{fmt.money(r.stockValue)}</span>
            <span className="meta">{s.valueMeta}</span>
          </div>
          <div className="card stat">
            <span className="label">{s.products}</span>
            <span className="figure">{r.productsCount}</span>
            <span className="meta">{s.productsMeta}</span>
          </div>
          <div className="card stat">
            <span className="label">{s.low}</span>
            <span className={r.lowStockCount ? 'figure accent' : 'figure'}>{r.lowStockCount}</span>
            <span className="meta">{s.lowMeta}</span>
          </div>
          <div className="card stat">
            <span className="label">{s.negative}</span>
            <span className={r.negativeStockCount ? 'figure negative' : 'figure'}>{r.negativeStockCount}</span>
            <span className="meta">{s.negativeMeta}</span>
          </div>
        </div>
      ) : (
        <ErrorNote error={report.error} />
      )}
      <p className="muted inventory-note">{t.inventory.noPos}</p>

      <div className="filters stock-filters">
        <Field label={s.search}>
          {(id) => (
            <input
              id={id}
              type="search"
              className="input"
              placeholder={s.searchPlaceholder}
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            />
          )}
        </Field>
        <label className="check">
          <input type="checkbox" checked={filter.lowOnly} onChange={(e) => setFilter((f) => ({ ...f, lowOnly: e.target.checked }))} />
          {s.lowOnly}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filter.includeInactive}
            onChange={(e) => setFilter((f) => ({ ...f, includeInactive: e.target.checked }))}
          />
          {s.includeInactive}
        </label>
      </div>

      {products.isLoading ? (
        <Loading rows={6} />
      ) : products.error ? (
        <div className="form">
          <ErrorNote error={products.error} />
          <div>
            <Button onClick={() => void products.refetch()}>{t.common.retry}</Button>
          </div>
        </div>
      ) : all.length === 0 ? (
        <div className="card">
          <Empty
            icon={Package}
            title={s.empty}
            action={
              <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
                {s.addProduct}
              </Button>
            }
          >
            {s.emptyBody}
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon={Package} title={filter.lowOnly && !filter.search.trim() ? s.emptyLow : s.emptyFiltered} />
        </div>
      ) : (
        <>
          {shown.some(isNegative) && (
            <div className="notice info" role="note">
              <Info size={16} strokeWidth={1.5} />
              <span>{s.negativeHelp}</span>
            </div>
          )}
          <section className="card stock-card" aria-busy={products.isPlaceholderData || undefined}>
            <table className="table stock-table">
              <thead>
                <tr>
                  <th>{s.columns.product}</th>
                  <th className="right">{s.columns.stock}</th>
                  <th className="right">{s.columns.min}</th>
                  <th className="right">{s.columns.cost}</th>
                  <th className="right">{s.columns.value}</th>
                  <th>
                    <span className="visually-hidden">{t.common.actions}</span>
                  </th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.category}>
                  <tr className="stock-group">
                    <th colSpan={6} scope="rowgroup">
                      {t.productCategories[group.category]} <span className="muted">· {s.groupCount(group.products.length)}</span>
                    </th>
                  </tr>
                  {group.products.map((p) => (
                    <tr key={p.id} className={p.isActive ? 'stock-row' : 'stock-row inactive-row'} data-testid={`product-${p.id}`}>
                      <td className="stock-product">
                        <button type="button" className="link-button" title={s.details(p.name)} onClick={() => act(p, 'details')}>
                          {p.name}
                        </button>
                        <span className="stock-tags">
                          <StockTags product={p} />
                        </span>
                        {p.supplierName && <span className="muted cell-sub">{p.supplierName}</span>}
                      </td>
                      <td className="right mono stock-qty" data-label={s.columns.stock}>
                        <span className={isNegative(p) ? 'diff under' : undefined}>{q.quantity(p.currentStock, p.unit)}</span>
                      </td>
                      <td className="right mono" data-label={s.columns.min}>
                        {p.minStock === null ? '—' : q.quantity(p.minStock, p.unit)}
                      </td>
                      <td className="right mono" data-label={s.columns.cost}>
                        {p.unitCost === null ? '—' : q.perUnit(p.unitCost, p.unit)}
                      </td>
                      <td className="right mono" data-label={s.columns.value}>
                        {p.stockValue === null ? '—' : fmt.money(p.stockValue)}
                      </td>
                      <td className="stock-actions-cell">
                        {p.isActive ? (
                          <QuickActions product={p} onAction={(type: ManualMovementType) => act(p, type)} />
                        ) : (
                          <Button size="sm" aria-label={t.inventory.product.activateNamed(p.name)} onClick={() => act(p, 'toggle')}>
                            {t.inventory.product.activate}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </section>
        </>
      )}

      {r && r.lowStock.length > 0 && <ToOrder report={r} />}

      <section className="card">
        <div className="card-head">
          <h2>{t.inventory.report.title}</h2>
        </div>
        <div className="card-body inventory-report">
          <PeriodPicker value={value} onChange={setValue} on={today} />
          {period && r && <PeriodReport report={r} refreshing={report.isPlaceholderData} />}
        </div>
      </section>

      {venue && modal?.kind === 'add' && <ProductFormDialog venueId={venue.id} suppliers={suppliers.data ?? []} onClose={close} />}
      {venue && modalProduct && modal && (
        <>
          {modal.kind === 'details' && (
            <ProductDrawer product={modalProduct} onClose={close} onAction={(action) => act(modalProduct, action)} />
          )}
          {modal.kind === 'edit' && (
            <ProductFormDialog venueId={venue.id} product={modalProduct} suppliers={suppliers.data ?? []} onClose={close} />
          )}
          {modal.kind === 'toggle' && <ProductToggleDialog product={modalProduct} onClose={close} />}
          {modal.kind === 'delete' && <ProductDeleteDialog product={modalProduct} onClose={close} />}
          {(modal.kind === 'PURCHASE' || modal.kind === 'WASTE' || modal.kind === 'CONSUMPTION' || modal.kind === 'ADJUSTMENT') && (
            <MovementDialog venueId={venue.id} product={modalProduct} type={modal.kind} today={today} onClose={close} />
          )}
        </>
      )}
    </div>
  )
}

/** What is at or under its minimum, by usual supplier, each a tap away from an order proposal */
function ToOrder({ report }: { report: InventoryReport }) {
  const t = useT()
  const s = t.inventory.stock
  const { suppliers, withoutSupplier } = lowStockBySupplier(report.lowStock)
  return (
    <section className="card">
      <div className="card-head">
        <h2>{s.toOrder}</h2>
      </div>
      <ul className="alert-list">
        {suppliers.map((supplier) => (
          <li key={supplier.supplierId} className="alert-item">
            <Truck size={16} strokeWidth={1.5} className="alert-icon warn" aria-hidden />
            <div className="grow">
              <span className="alert-title">{s.toOrderLine(supplier.supplierName, supplier.count)}</span>
            </div>
            <Link
              to={`/inventory/orders/new?supplierId=${supplier.supplierId}&propose=1`}
              className="btn btn-sm"
              aria-label={s.prepareOrderFor(supplier.supplierName)}
            >
              {s.prepareOrder}
            </Link>
          </li>
        ))}
        {withoutSupplier > 0 && <li className="alert-item muted">{s.noSupplier(withoutSupplier)}</li>}
      </ul>
    </section>
  )
}

/** The period's purchases, waste and count differences, and the products that lost the most */
function PeriodReport({ report, refreshing }: { report: InventoryReport; refreshing: boolean }) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const rp = t.inventory.report
  const difference = toCents(report.countDifferenceValue)
  const largest = Math.max(0, ...report.wasteByProduct.map((w) => w.value ?? 0))
  return (
    <div className="form" aria-busy={refreshing || undefined}>
      <div className="report-figures">
        <div className="stat">
          <span className="label">{rp.purchases}</span>
          <span className="figure">{fmt.money(report.purchasesValue)}</span>
          <span className="meta">{rp.purchasesMeta}</span>
        </div>
        <div className="stat">
          <span className="label">{rp.waste}</span>
          <span className="figure">{fmt.money(report.wasteValue)}</span>
          <span className="meta">{rp.wasteMeta}</span>
        </div>
        <div className="stat">
          <span className="label">{rp.countDifference}</span>
          <span className={difference < 0 ? 'figure negative' : 'figure'}>{fmt.signedMoney(report.countDifferenceValue)}</span>
          <span className="meta">{difference < 0 ? rp.countShort : difference > 0 ? rp.countOver : rp.countEven}</span>
        </div>
      </div>
      <div>
        <h3 className="section-title report-subtitle">{rp.topWaste}</h3>
        {report.wasteByProduct.length === 0 ? (
          <p className="muted">{rp.noWaste}</p>
        ) : (
          <ul className="category-list">
            {report.wasteByProduct.map((w) => (
              <li key={w.productId} className="category-row">
                <span className="category-name">{w.productName}</span>
                <span className="category-amount mono">{w.value === null ? rp.noCost : fmt.money(w.value)}</span>
                <span className="category-bar" aria-hidden>
                  <span style={{ width: `${largest > 0 && w.value ? (w.value / largest) * 100 : 0}%` }} />
                </span>
                <span className="category-share muted mono">{q.quantity(Math.abs(w.quantity), w.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="muted inventory-hint">{rp.valuesNote}</p>
    </div>
  )
}
