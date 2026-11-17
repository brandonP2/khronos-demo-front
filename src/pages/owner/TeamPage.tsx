import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Pencil, UserPlus, Users } from 'lucide-react'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { UserCreate } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Loading,
  PageHead,
  pluralize,
  useToast,
} from '../../components/ui'
import { useInvalidate, useShifts, useStaff, useZones, type StaffMember } from '../../lib/queries'
import { minutes, today, weekDays } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal = { kind: 'add' } | { kind: 'edit'; member: StaffMember } | { kind: 'toggle'; member: StaffMember } | null

export default function TeamPage() {
  const me = useMe()
  const { venue } = useVenue()
  const staff = useStaff(venue?.id)
  const zones = useZones(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id))
  const invalidate = useInvalidate()
  const toast = useToast()
  const [modal, setModal] = useState<Modal>(null)

  const week = weekDays(today())
  const weekLoad = (id: number) => {
    const mine = (shifts.data ?? []).filter((s) => s.workerId === id && week.includes(s.date))
    const mins = mine.reduce((n, s) => n + minutes(s.endTime) - minutes(s.startTime), 0)
    return { count: mine.length, hours: Math.round((mins / 60) * 10) / 10 }
  }

  const list = staff.data ?? []
  const active = list.filter((s) => s.isActive).length

  return (
    <div className="page">
      <PageHead
        title="Team"
        sub={list.length ? `${active} active${list.length > active ? `, ${list.length - active} inactive` : ''}` : undefined}
      >
        <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>
          Add person
        </Button>
      </PageHead>

      {staff.isLoading ? (
        <Loading rows={4} />
      ) : staff.error ? (
        <ErrorNote error={staff.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty
            icon={Users}
            title="Nobody on the team yet"
            action={
              <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>
                Add person
              </Button>
            }
          >
            Each person gets their own login to see their shifts, and an email whenever their schedule changes.
          </Empty>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-sm">Contact</th>
                <th>Status</th>
                <th className="right">This week</th>
                <th className="right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const load = weekLoad(m.userId)
                return (
                  <tr key={m.userId}>
                    <td>
                      <div className={m.isActive ? 'person' : 'person inactive'}>
                        <Avatar initials={m.initials} />
                        <div>
                          <div className="name">{m.name}</div>
                          <div className="muted mono" style={{ fontSize: 12 }}>
                            {m.user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-sm">
                      <div>{m.user.email}</div>
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        {m.user.phoneNumber || '—'}
                      </div>
                    </td>
                    <td>
                      <span className="status">
                        <span className={m.isActive ? 'dot on' : 'dot'} />
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="right mono">
                      {load.count ? `${load.hours}h · ${pluralize(load.count, 'shift')}` : <span className="muted">—</span>}
                    </td>
                    <td className="right">
                      <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setModal({ kind: 'edit', member: m })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'toggle', member: m })}>
                          {m.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === 'add' && venue && <AddPersonDialog venueId={venue.id} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <EditPersonDialog member={modal.member} onClose={() => setModal(null)} />}
      {modal?.kind === 'toggle' && (
        <ConfirmDialog
          title={modal.member.isActive ? `Deactivate ${modal.member.name}` : `Reactivate ${modal.member.name}`}
          confirmLabel={modal.member.isActive ? 'Deactivate' : 'Reactivate'}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api.workers.toggleActive(modal.member.userId)
            await invalidate.staff()
            toast(modal.member.isActive ? 'Deactivated' : 'Reactivated')
          }}
        >
          {modal.member.isActive
            ? 'They stay on the team and keep the shifts already planned, but no new shifts can be given to them.'
            : 'They can be scheduled again.'}
        </ConfirmDialog>
      )}
    </div>
  )
}

const blank: UserCreate = { username: '', password: '', firstName: '', lastName: '', phoneNumber: '', email: '' }

function AddPersonDialog({ venueId, onClose }: { venueId: number; onClose: () => void }) {
  const invalidate = useInvalidate()
  const toast = useToast()
  const [form, setForm] = useState<UserCreate>(blank)
  const set = (k: keyof UserCreate, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Two calls: the login account, then linking it to this venue as a worker
  const mutation = useMutation({
    mutationFn: async () => {
      const user = await api.users.createWorker({ ...form, phoneNumber: form.phoneNumber?.trim() || null })
      try {
        await api.workers.create(user.id, venueId)
      } catch (e) {
        throw new Error(
          `The account "${user.username}" was created but could not be added to this venue: ${e instanceof Error ? e.message : ''}`,
          { cause: e },
        )
      }
      return user
    },
    onSuccess: async (user) => {
      await invalidate.staff()
      toast(`${user.firstName} added to the team`)
      onClose()
    },
  })

  const fe = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}
  const valid =
    form.username.trim().length >= 3 && form.password.length >= 8 && form.firstName.trim() && form.lastName.trim() && form.email.trim()

  return (
    <Dialog
      title="Add person"
      sub="They sign in with this username and password. Share them in person; Khronos does not send passwords."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Add to team
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), valid && mutation.mutate())}>
        <div className="row-2">
          <Field label="First name" error={fe.firstName}>
            {(id) => <input id={id} className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
          </Field>
          <Field label="Last name" error={fe.lastName}>
            {(id) => <input id={id} className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label="Email" error={fe.email} hint="Schedule changes are emailed here">
            {(id) => <input id={id} type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Phone" error={fe.phoneNumber} hint="Optional">
            {(id) => (
              <input id={id} type="tel" className="input mono" value={form.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="row-2">
          <Field label="Username" error={fe.username} hint="3 to 50 characters">
            {(id) => (
              <input id={id} className="input mono" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
            )}
          </Field>
          <Field label="Password" error={fe.password} hint="At least 8 characters">
            {(id) => (
              <input
                id={id}
                type="password"
                className="input"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            )}
          </Field>
        </div>
        <ErrorNote error={mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function EditPersonDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const invalidate = useInvalidate()
  const toast = useToast()
  const u = member.user
  const [form, setForm] = useState({
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phoneNumber: u.phoneNumber ?? '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => api.users.update(u.id, { ...form, phoneNumber: form.phoneNumber.trim() || null }),
    onSuccess: async () => {
      await invalidate.staff()
      toast('Saved')
      onClose()
    },
  })
  const fe = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}

  return (
    <Dialog
      title={`Edit ${member.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
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
          <Field label="Phone" error={fe.phoneNumber}>
            {(id) => <input id={id} type="tel" className="input mono" value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} />}
          </Field>
        </div>
        <Field label="Username" error={fe.username}>
          {(id) => <input id={id} className="input mono" value={form.username} onChange={(e) => set('username', e.target.value)} />}
        </Field>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
