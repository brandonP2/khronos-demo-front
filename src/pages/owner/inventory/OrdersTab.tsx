// Purchase orders, newest first, with their status (draft, ordered, received, cancelled),
// supplier, expected date and total. Each opens on its own page, where a draft is edited and an
// ordered one is received.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Truck } from 'lucide-react'
import type { PurchaseOrderStatus } from '../../../api/types'
import { InventoryHead, OrderStatusTag } from '../../../components/InventoryParts'
import { Empty, ErrorNote, Field, Loading } from '../../../components/ui'
import { useFmt, useT } from '../../../lib/i18n'
import { usePurchaseOrders } from '../../../lib/queries'
import { useVenue } from '../../../lib/VenueContext'

const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED']

export default function OrdersTab() {
  const t = useT()
  const fmt = useFmt()
  const o = t.inventory.orders
  const { venue } = useVenue()
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('')
  const orders = usePurchaseOrders(venue?.id, { status: status || undefined })
  const list = orders.data ?? []

  const newOrder = (
    <Link to="/inventory/orders/new" className="btn btn-primary">
      <Plus size={16} strokeWidth={1.5} />
      {o.add}
    </Link>
  )

  return (
    <div className="page">
      <InventoryHead>{newOrder}</InventoryHead>

      <div className="filters">
        <Field label={o.status}>
          {(id) => (
            <select id={id} className="select" value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus | '')}>
              <option value="">{o.allStatuses}</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t.orderStatus[st]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {orders.isLoading ? (
        <Loading rows={4} />
      ) : orders.error ? (
        <ErrorNote error={orders.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={Truck} title={status ? o.emptyFiltered : o.empty} action={status ? undefined : newOrder}>
            {status ? null : o.emptyBody}
          </Empty>
        </div>
      ) : (
        <section className="card" aria-busy={orders.isPlaceholderData || undefined}>
          <ul className="list orders-list">
            {list.map((order) => (
              <li key={order.id} className="list-row order-row">
                <Link
                  to={`/inventory/orders/${order.id}`}
                  className="order-link"
                  aria-label={o.open(order.id, order.supplierName)}
                >
                  <span className="mono order-number">{o.number(order.id)}</span>
                  <span className="order-supplier">
                    <span className="name">{order.supplierName}</span>
                    <span className="muted cell-sub">{o.lines(order.lines.length)}</span>
                  </span>
                </Link>
                <span className="order-status">
                  <OrderStatusTag status={order.status} />
                </span>
                <span className="mono muted order-date">
                  <span className="visually-hidden">{o.columns.expected}: </span>
                  {order.expectedDate ? fmt.short(order.expectedDate) : '—'}
                </span>
                <span className="mono order-amount">
                  <span className="visually-hidden">{o.columns.total}: </span>
                  {order.total === null ? '—' : fmt.money(order.total)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
