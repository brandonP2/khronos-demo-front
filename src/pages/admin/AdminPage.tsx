import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Trash2, UserPlus } from 'lucide-react'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Establishment, UserCreate } from '../../api/types'
import { Avatar, Button, ConfirmDialog, Dialog, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { displayName, initials } from '../../lib/queries'

/** Platform admins onboard owners and their venues; everything after that is done by the owner */
export default function AdminPage() {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: api.users.all })
  const venues = useQuery({ queryKey: ['admin', 'venues'], queryFn: api.establishments.all })
  const [modal, setModal] = useState<'owner' | 'venue' | null>(null)
  const [deleting, setDeleting] = useState<Establishment | null>(null)

  const owners = (users.data ?? []).filter((u) => u.role === 'OWNER')
  const venueCount = (ownerId: number) => (venues.data ?? []).filter((v) => v.ownerId === ownerId).length

  return (
    <div className="page">
      <PageHead title={t.admin.title} sub={t.admin.sub}>
        <Button icon={UserPlus} onClick={() => setModal('owner')}>
          {t.admin.newOwner}
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal('venue')} disabled={!owners.length}>
          {t.admin.newVenue}
        </Button>
      </PageHead>

      <section className="card">
        <div className="card-head">
          <h2>{t.admin.venues}</h2>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {venues.data?.length ?? 0}
          </span>
        </div>
        {venues.isLoading ? (
          <div className="card-body">
            <Loading rows={2} />
          </div>
        ) : venues.error ? (
          <div className="card-body">
            <ErrorNote error={venues.error} />
          </div>
        ) : venues.data?.length === 0 ? (
          <Empty icon={Building2} title={t.admin.noVenues} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t.admin.venue}</th>
                  <th>{t.admin.owner}</th>
                  <th className="hide-sm">{t.admin.contact}</th>
                  <th aria-label={t.common.actions} />
                </tr>
              </thead>
              <tbody>
                {venues.data?.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="name" style={{ fontWeight: 500 }}>
                        {v.establishmentName}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {v.establishmentAddress}
                      </div>
                    </td>
                    <td>{v.ownerName}</td>
                    <td className="hide-sm">
                      <div>{v.ownerEmail ?? '—'}</div>
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        {v.ownerPhone || '—'}
                      </div>
                    </td>
                    <td className="right">
                      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={t.admin.delete(v.establishmentName)} onClick={() => setDeleting(v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.admin.owners}</h2>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {owners.length}
          </span>
        </div>
        {users.isLoading ? (
          <div className="card-body">
            <Loading rows={2} />
          </div>
        ) : users.error ? (
          <div className="card-body">
            <ErrorNote error={users.error} />
          </div>
        ) : owners.length === 0 ? (
          <Empty icon={UserPlus} title={t.admin.noOwners} />
        ) : (
          <div className="list">
            {owners.map((o) => (
              <div key={o.id} className="list-row">
                <Avatar initials={initials(o)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{displayName(o)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {o.email}
                  </div>
                </div>
                <span className="muted mono" style={{ fontSize: 12 }}>
                  {t.admin.venueCount(venueCount(o.id))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal === 'owner' && <NewOwnerDialog onClose={() => setModal(null)} />}
      {modal === 'venue' && (
        <NewVenueDialog owners={owners.map((o) => ({ id: o.id, name: displayName(o) }))} onClose={() => setModal(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t.admin.deleteTitle(deleting.establishmentName)}
          confirmLabel={t.admin.deleteConfirm}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.establishments.remove(deleting.id)
            await qc.invalidateQueries({ queryKey: ['admin'] })
            toast(t.admin.deleted)
          }}
        >
          {t.admin.deleteBody}
        </ConfirmDialog>
      )}
    </div>
  )
}

function NewOwnerDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<UserCreate>({ username: '', password: '', firstName: '', lastName: '', email: '', phoneNumber: '' })
  const set = (k: keyof UserCreate, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const mutation = useMutation({
    mutationFn: () => api.users.create({ ...form, phoneNumber: form.phoneNumber?.trim() || null }, 'OWNER'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast(t.admin.ownerCreated)
      onClose()
    },
  })
  const fe = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}
  return (
    <Dialog
      title={t.admin.newOwner}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.admin.createOwner}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="row-2">
          <Field label={t.fields.firstName} error={fe.firstName}>
            {(id) => <input id={id} className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
          </Field>
          <Field label={t.fields.lastName} error={fe.lastName}>
            {(id) => <input id={id} className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label={t.fields.email} error={fe.email}>
            {(id) => <input id={id} type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label={t.fields.phone} error={fe.phoneNumber} hint={t.common.optional}>
            {(id) => <input id={id} type="tel" className="input mono" value={form.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label={t.fields.username} error={fe.username}>
            {(id) => <input id={id} className="input mono" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />}
          </Field>
          <Field label={t.fields.password} error={fe.password} hint={t.fields.passwordHint}>
            {(id) => (
              <input id={id} type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
            )}
          </Field>
        </div>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}

function NewVenueDialog({ owners, onClose }: { owners: { id: number; name: string }[]; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? 0)
  const mutation = useMutation({
    mutationFn: () =>
      api.establishments.create({ establishmentName: name.trim(), establishmentAddress: address.trim(), ownerId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast(t.admin.venueCreated)
      onClose()
    },
  })
  return (
    <Dialog
      title={t.admin.newVenue}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!name.trim() || !address.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.admin.createVenue}
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label={t.admin.owner}>
          {(id) => (
            <select id={id} className="select" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t.admin.name}>
          {(id) => <input id={id} className="input" placeholder={t.admin.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t.admin.address} hint={t.admin.addressHint}>
          {(id) => <input id={id} className="input" value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
