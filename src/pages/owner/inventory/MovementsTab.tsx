// Movements: the stock's history, filtered by period, product and type, newest first. Each
// movement shows its signed quantity, value, reason, who recorded it and when, the stock it left
// when it was recorded (a back-dated one does not change the ones recorded before it) and the
// order it came from. Movements are never edited or deleted: a mistake is corrected with
// an adjustment. ?productId= opens it on one product (from a product's card).
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, Download } from 'lucide-react'
import { api } from '../../../api/endpoints'
import type { StockMovementType } from '../../../api/types'
import { InventoryHead } from '../../../components/InventoryParts'
import { PeriodPicker, usePeriod } from '../../../components/PeriodPicker'
import { Button, Empty, ErrorNote, Field, Loading } from '../../../components/ui'
import { useDownload } from '../../../lib/download'
import { useFmt, useT } from '../../../lib/i18n'
import { useProducts, useStockMovements } from '../../../lib/queries'
import { useQuantityText } from '../../../lib/stock'
import { venueTimeZone, zonedDate, zonedTime, zonedToday } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'

const TYPES: StockMovementType[] = ['PURCHASE', 'WASTE', 'CONSUMPTION', 'ADJUSTMENT', 'COUNT']

export default function MovementsTab() {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const mv = t.inventory.movements
  const { venue } = useVenue()
  const timeZone = venueTimeZone(venue)
  const today = zonedToday(timeZone)
  const [search] = useSearchParams()
  const { value, setValue, period } = usePeriod(undefined, today)
  const [productId, setProductId] = useState(() => {
    const asked = Number(search.get('productId'))
    return Number.isInteger(asked) && asked > 0 ? String(asked) : ''
  })
  const [type, setType] = useState<StockMovementType | ''>('')
  // Inactive products keep their history, so they are offered too
  const products = useProducts(venue?.id, true)
  const movements = useStockMovements(
    venue?.id,
    period ? { ...period, productId: productId ? Number(productId) : undefined, type: type || undefined } : null,
  )
  const file = useDownload()
  const list = movements.data ?? []
  const filtered = !!productId || !!type

  return (
    <div className="page">
      <InventoryHead>
        <Button
          icon={Download}
          disabled={!period || !venue}
          loading={file.isPending}
          onClick={() =>
            period &&
            venue &&
            file.mutate({
              fetchFile: () => api.reports.stockMovementsCsv(venue.id, period),
              fallbackName: mv.file(period.from, period.to),
            })
          }
        >
          {mv.export}
        </Button>
      </InventoryHead>

      <div className="filters">
        <PeriodPicker value={value} onChange={setValue} on={today} />
        <Field label={mv.product}>
          {(id) => (
            <select id={id} className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{mv.allProducts}</option>
              {[...(products.data ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.isActive ? p.name : t.inventory.order.inactive(p.name)}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label={mv.type}>
          {(id) => (
            <select id={id} className="select" value={type} onChange={(e) => setType(e.target.value as StockMovementType | '')}>
              <option value="">{mv.allTypes}</option>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t.movementTypes[ty]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <p className="muted inventory-note">
        {mv.note} {mv.afterNote}
      </p>
      <ErrorNote error={file.error} />

      {!period ? null : movements.isLoading ? (
        <Loading rows={5} />
      ) : movements.error ? (
        <ErrorNote error={movements.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={ArrowRightLeft} title={filtered ? mv.emptyFiltered : mv.empty}>
            {filtered ? null : mv.emptyBody}
          </Empty>
        </div>
      ) : (
        <section className="card movements-card" aria-busy={movements.isPlaceholderData || undefined}>
          <div className="card-head">
            <h2>{t.inventory.tabs.movements}</h2>
            <span className="muted">{mv.count(list.length)}</span>
          </div>
          <table className="table movements-table">
            <thead>
              <tr>
                <th>{mv.columns.date}</th>
                <th>{mv.columns.product}</th>
                <th>{mv.columns.type}</th>
                <th className="right">{mv.columns.quantity}</th>
                <th className="right">{mv.columns.value}</th>
                <th>{mv.columns.reason}</th>
                <th>{mv.columns.by}</th>
                <th className="right">{mv.columns.after}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="mono movement-date" data-label={mv.columns.date}>
                    {fmt.day(m.date)}
                  </td>
                  <td className="movement-product">
                    <span className="name">{m.productName}</span>
                  </td>
                  <td data-label={mv.columns.type}>
                    <span className="tag">{t.movementTypes[m.type]}</span>
                    {m.purchaseOrderId !== null && (
                      <Link className="movement-order" to={`/inventory/orders/${m.purchaseOrderId}`}>
                        {mv.order(m.purchaseOrderId)}
                      </Link>
                    )}
                  </td>
                  <td className="right mono movement-quantity" data-label={mv.columns.quantity}>
                    <span className={m.quantity > 0 ? 'diff over' : m.quantity < 0 ? 'diff under' : 'diff'}>
                      {q.signed(m.quantity, m.unit)}
                    </span>
                  </td>
                  <td className="right mono" data-label={mv.columns.value}>
                    {m.value === null ? '—' : fmt.money(m.value)}
                  </td>
                  <td className="movement-reason" data-label={mv.columns.reason}>
                    {m.reason ?? '—'}
                  </td>
                  <td className="movement-by" data-label={mv.columns.by}>
                    {mv.by(m.createdByName, `${fmt.short(zonedDate(m.createdAt, timeZone))} ${zonedTime(m.createdAt, timeZone)}`)}
                  </td>
                  <td className="right mono" data-label={mv.columns.after}>
                    {q.quantity(m.stockAfter, m.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
