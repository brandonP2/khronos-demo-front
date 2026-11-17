// Pieces shared by the inventory screens: the title with the section tabs under it, and the
// marks on a product (low stock, negative stock, inactive) and on an order, always in words so
// colour is never the only cue.
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import type { Product, PurchaseOrderStatus } from '../api/types'
import { useT } from '../lib/i18n'
import { isNegative } from '../lib/stock'
import { PageHead } from './ui'

/** The inventory's title, its actions and the tabs for Stock, Movements, Orders and Suppliers */
export function InventoryHead({ children }: { children?: ReactNode }) {
  const t = useT()
  const tabs = [
    { to: '/inventory', label: t.inventory.tabs.stock, end: true },
    { to: '/inventory/movements', label: t.inventory.tabs.movements, end: false },
    { to: '/inventory/orders', label: t.inventory.tabs.orders, end: false },
    { to: '/inventory/suppliers', label: t.inventory.tabs.suppliers, end: false },
  ]
  return (
    <>
      <PageHead title={t.inventory.title} sub={t.inventory.sub}>
        {children}
      </PageHead>
      <nav className="tabs" aria-label={t.inventory.sections}>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

/** Inactive, low stock and negative stock, as words; negative stock carries its likely cause */
export function StockTags({ product }: { product: Product }) {
  const t = useT()
  return (
    <>
      {!product.isActive && <span className="tag">{t.inventory.stock.inactiveTag}</span>}
      {product.isLowStock && <span className="tag warn">{t.inventory.stock.lowTag}</span>}
      {isNegative(product) && (
        <span className="tag bad" title={t.inventory.stock.negativeHelp}>
          {t.inventory.stock.negativeTag}
        </span>
      )}
    </>
  )
}

export function OrderStatusTag({ status }: { status: PurchaseOrderStatus }) {
  const t = useT()
  const cls = status === 'RECEIVED' ? 'tag good' : status === 'ORDERED' ? 'tag warn' : 'tag'
  return <span className={cls}>{t.orderStatus[status]}</span>
}
