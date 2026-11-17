import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Trash2, UserPlus } from 'lucide-react'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Establishment, UserCreate } from '../../api/types'
import { Avatar, Button, ConfirmDialog, Dialog, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../components/ui'
import { displayName, initials } from '../../lib/queries'

/** Platform admins onboard owners and their venues; everything after that is done by the owner */
export default function AdminPage() {
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
      <PageHead title="Owners and venues" sub="Onboard a business: create the owner's account, then their venue.">
        <Button icon={UserPlus} onClick={() => setModal('owner')}>
          New owner
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal('venue')} disabled={!owners.length}>
          New venue
        </Button>
      </PageHead>

      <section className="card">
        <div className="card-head">
          <h2>Venues</h2>
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
          <Empty icon={Building2} title="No venues yet" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Owner</th>
                  <th className="hide-sm">Contact</th>
                  <th aria-label="Actions" />
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
                      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete ${v.establishmentName}`} onClick={() => setDeleting(v)} />
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
          <h2>Owners</h2>
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
          <Empty icon={UserPlus} title="No owners yet" />
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
                  {venueCount(o.id)} {venueCount(o.id) === 1 ? 'venue' : 'venues'}
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
          title={`Delete ${deleting.establishmentName}`}
          confirmLabel="Delete venue"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.establishments.remove(deleting.id)
            await qc.invalidateQueries({ queryKey: ['admin'] })
            toast('Venue deleted')
          }}
        >
          Deletes its zones, team links, shifts and events. This cannot be undone.
        </ConfirmDialog>
      )}
    </div>
  )
}

function NewOwnerDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<UserCreate>({ username: '', password: '', firstName: '', lastName: '', email: '', phoneNumber: '' })
  const set = (k: keyof UserCreate, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const mutation = useMutation({
    mutationFn: () => api.users.create({ ...form, phoneNumber: form.phoneNumber?.trim() || null }, 'OWNER'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Owner created')
      onClose()
    },
  })
  const fe = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}
  return (
    <Dialog
      title="New owner"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Create owner
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="row-2">
          <Field label="First name" error={fe.firstName}>
            {(id) => <input id={id} className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
          </Field>
          <Field label="Last name" error={fe.lastName}>
            {(id) => <input id={id} className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label="Email" error={fe.email}>
            {(id) => <input id={id} type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Phone" error={fe.phoneNumber} hint="Optional">
            {(id) => <input id={id} type="tel" className="input mono" value={form.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label="Username" error={fe.username}>
            {(id) => <input id={id} className="input mono" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />}
          </Field>
          <Field label="Password" error={fe.password} hint="At least 8 characters">
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
      toast('Venue created')
      onClose()
    },
  })
  return (
    <Dialog
      title="New venue"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || !address.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Create venue
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label="Owner">
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
        <Field label="Name">
          {(id) => <input id={id} className="input" placeholder="Casa Lucía" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Address" hint="Each venue needs its own address">
          {(id) => <input id={id} className="input" value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
