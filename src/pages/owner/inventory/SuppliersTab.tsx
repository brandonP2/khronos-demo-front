// Suppliers: who the venue buys from, with how to reach them and how many products have them as
// their usual supplier. Added and edited in a dialog; a supplier with orders cannot be deleted
// (the API answers 409), and deleting one leaves its products with no usual supplier.
import { useState } from 'react'
import { Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { api } from '../../../api/endpoints'
import type { Supplier } from '../../../api/types'
import { InventoryHead } from '../../../components/InventoryParts'
import { SupplierFormDialog } from '../../../components/SupplierDialogs'
import { Button, ConfirmDialog, Empty, ErrorNote, Loading, useToast } from '../../../components/ui'
import { useT } from '../../../lib/i18n'
import { useInvalidate, useProducts, useSuppliers } from '../../../lib/queries'
import { useVenue } from '../../../lib/VenueContext'

type Modal = { kind: 'add' } | { kind: 'edit'; supplier: Supplier } | { kind: 'delete'; supplier: Supplier } | null

export default function SuppliersTab() {
  const t = useT()
  const toast = useToast()
  const invalidate = useInvalidate()
  const sp = t.inventory.suppliers
  const { venue } = useVenue()
  const suppliers = useSuppliers(venue?.id)
  const products = useProducts(venue?.id, true)
  const [modal, setModal] = useState<Modal>(null)
  const list = suppliers.data ?? []
  const productsOf = (id: number) => (products.data ?? []).filter((p) => p.supplierId === id).length

  const add = (
    <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>
      {sp.add}
    </Button>
  )

  return (
    <div className="page">
      <InventoryHead>{add}</InventoryHead>

      {suppliers.isLoading ? (
        <Loading rows={3} />
      ) : suppliers.error ? (
        <ErrorNote error={suppliers.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={Truck} title={sp.empty} action={add}>
            {sp.emptyBody}
          </Empty>
        </div>
      ) : (
        <section className="card">
          <ul className="list suppliers-list">
            {list.map((s) => (
              <li key={s.id} className="list-row supplier-row">
                <div className="supplier-main">
                  <span className="name">{s.name}</span>
                  <span className="supplier-contact">
                    {s.phone && <a href={`tel:${s.phone.replace(/\s+/g, '')}`}>{s.phone}</a>}
                    {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
                  </span>
                  {s.notes && <span className="muted cell-sub">{s.notes}</span>}
                </div>
                <span className="muted supplier-products">{products.data ? sp.products(productsOf(s.id)) : null}</span>
                <div className="actions entry-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Pencil}
                    className="btn-compact"
                    aria-label={sp.edit(s.name)}
                    onClick={() => setModal({ kind: 'edit', supplier: s })}
                  >
                    <span className="btn-label">{t.common.edit}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    iconOnly
                    aria-label={sp.remove(s.name)}
                    title={sp.removeConfirm}
                    onClick={() => setModal({ kind: 'delete', supplier: s })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {venue && modal?.kind === 'add' && <SupplierFormDialog venueId={venue.id} onClose={() => setModal(null)} />}
      {venue && modal?.kind === 'edit' && (
        <SupplierFormDialog venueId={venue.id} supplier={modal.supplier} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'delete' && (
        <ConfirmDialog
          title={sp.removeTitle(modal.supplier.name)}
          confirmLabel={sp.removeConfirm}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const { supplier } = modal
            try {
              await api.suppliers.remove(supplier.id)
            } catch (e) {
              // Its orders keep its name, so a supplier with orders stays
              throw e instanceof ApiError && e.status === 409 ? new Error(sp.removeBlocked(supplier.name)) : e
            }
            await invalidate.suppliers()
            toast(sp.removed)
          }}
        >
          {sp.removeBody(productsOf(modal.supplier.id))}
        </ConfirmDialog>
      )}
    </div>
  )
}
