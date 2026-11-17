import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, Pencil, UserCheck, UserPlus, UserX, Users } from 'lucide-react'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { UserCreate } from '../../api/types'
import { useMe } from '../../auth/AuthContext'
import { ResetPasswordDialog } from '../../components/ResetPasswordDialog'
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
  useToast,
} from '../../components/ui'
import { useFmt, useT } from '../../lib/i18n'
import { isValidPassword, passwordError } from '../../lib/password'
import { useInvalidate, useShifts, useStaff, useZones, type StaffMember } from '../../lib/queries'
import { shiftMinutes, venueTimeZone, weekDays, zonedToday } from '../../lib/time'
import { useVenue } from '../../lib/VenueContext'

type Modal =
  | { kind: 'add' }
  | { kind: 'edit'; member: StaffMember }
  | { kind: 'toggle'; member: StaffMember }
  | { kind: 'reset'; member: StaffMember }
  | null

export default function TeamPage() {
  const t = useT()
  const fmt = useFmt()
  const me = useMe()
  const { venue } = useVenue()
  // This week where the venue is, which can differ from the device's around midnight
  const week = weekDays(zonedToday(venueTimeZone(venue)))
  const staff = useStaff(venue?.id)
  const zones = useZones(venue?.id)
  const shifts = useShifts(me.id, zones.data?.map((z) => z.id), { from: week[0], to: week[6] })
  const invalidate = useInvalidate()
  const toast = useToast()
  const [modal, setModal] = useState<Modal>(null)

  const weekLoad = (id: number) => {
    const mine = (shifts.data ?? []).filter((s) => s.workerId === id && week.includes(s.date))
    const mins = mine.reduce((n, s) => n + shiftMinutes(s), 0)
    return { count: mine.length, hours: fmt.number(mins / 60) }
  }

  const list = staff.data ?? []
  const active = list.filter((s) => s.isActive).length

  return (
    <div className="page">
      <PageHead
        title={t.team.title}
        sub={list.length ? t.team.summary(active, list.length - active) : undefined}
      >
        <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>
          {t.team.addPerson}
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
            title={t.team.emptyTitle}
            action={
              <Button variant="primary" icon={UserPlus} onClick={() => setModal({ kind: 'add' })}>
                {t.team.addPerson}
              </Button>
            }
          >
            {t.team.emptyBody}
          </Empty>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.team.name}</th>
                <th className="hide-sm">{t.team.contact}</th>
                <th>{t.team.status}</th>
                <th className="right hide-xs">{t.team.thisWeek}</th>
                <th className="right" aria-label={t.common.actions} />
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
                          <Link className="name person-link" to={`/team/${m.userId}`} title={t.hours.openPerson(m.name)}>
                            {m.name}
                          </Link>
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
                        {m.isActive ? t.team.active : t.team.inactive}
                      </span>
                    </td>
                    <td className="right mono hide-xs">
                      {load.count ? t.team.load(load.hours, load.count) : <span className="muted">—</span>}
                    </td>
                    <td className="right">
                      <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Pencil}
                          className="btn-compact"
                          aria-label={`${t.common.edit}: ${m.name}`}
                          title={t.common.edit}
                          onClick={() => setModal({ kind: 'edit', member: m })}
                        >
                          <span className="btn-label">{t.common.edit}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={KeyRound}
                          className="btn-compact"
                          aria-label={`${t.resetPassword.action}: ${m.name}`}
                          title={t.resetPassword.action}
                          onClick={() => setModal({ kind: 'reset', member: m })}
                        >
                          <span className="btn-label">{t.resetPassword.action}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={m.isActive ? UserX : UserCheck}
                          className="btn-compact"
                          aria-label={`${m.isActive ? t.team.deactivate : t.team.reactivate}: ${m.name}`}
                          title={m.isActive ? t.team.deactivate : t.team.reactivate}
                          onClick={() => setModal({ kind: 'toggle', member: m })}
                        >
                          <span className="btn-label">{m.isActive ? t.team.deactivate : t.team.reactivate}</span>
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
      {modal?.kind === 'reset' && (
        <ResetPasswordDialog userId={modal.member.userId} name={modal.member.name} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'toggle' && (
        <ConfirmDialog
          title={modal.member.isActive ? t.team.deactivateTitle(modal.member.name) : t.team.reactivateTitle(modal.member.name)}
          confirmLabel={modal.member.isActive ? t.team.deactivate : t.team.reactivate}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api.workers.setActive(modal.member.userId, !modal.member.isActive)
            await invalidate.staff()
            toast(modal.member.isActive ? t.team.deactivated : t.team.reactivated)
          }}
        >
          {modal.member.isActive ? t.team.deactivateBody : t.team.reactivateBody}
        </ConfirmDialog>
      )}
    </div>
  )
}

const blank: UserCreate = { username: '', password: '', firstName: '', lastName: '', phoneNumber: '', email: '' }

function AddPersonDialog({ venueId, onClose }: { venueId: number; onClose: () => void }) {
  const t = useT()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [form, setForm] = useState<UserCreate>(blank)
  const set = (k: keyof UserCreate, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // One call creates the login and links it to this venue, so a failure leaves nothing behind
  const mutation = useMutation({
    mutationFn: () => api.workers.createWithUser(venueId, { ...form, phoneNumber: form.phoneNumber?.trim() || null }),
    onSuccess: async ({ user }) => {
      await invalidate.staff()
      toast(t.team.added(user.firstName))
      onClose()
    },
  })

  // Validation errors on the nested user come back as "user.email"
  const apiErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}
  const fe = Object.fromEntries(
    Object.keys(form).map((k) => [k, apiErrors[`user.${k}`] ?? apiErrors[k]]),
  ) as Partial<Record<keyof UserCreate, string>>
  const valid =
    form.username.trim().length >= 3 && isValidPassword(form.password) && form.firstName.trim() && form.lastName.trim() && form.email.trim()

  return (
    <Dialog
      title={t.team.addTitle}
      sub={t.team.addSub}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!valid} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.team.addSubmit}
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => (e.preventDefault(), valid && mutation.mutate())}>
        <div className="row-2">
          <Field label={t.fields.firstName} error={fe.firstName}>
            {(id) => <input id={id} className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
          </Field>
          <Field label={t.fields.lastName} error={fe.lastName}>
            {(id) => <input id={id} className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
          </Field>
        </div>
        <div className="row-2">
          <Field label={t.fields.email} error={fe.email} hint={t.team.emailHint}>
            {(id) => <input id={id} type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label={t.fields.phone} error={fe.phoneNumber} hint={t.common.optional}>
            {(id) => (
              <input id={id} type="tel" className="input mono" value={form.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} />
            )}
          </Field>
        </div>
        <div className="row-2">
          <Field label={t.fields.username} error={fe.username} hint={t.fields.usernameHint}>
            {(id) => (
              <input id={id} className="input mono" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
            )}
          </Field>
          <Field label={t.fields.password} error={passwordError(form.password, t) ?? fe.password} hint={t.fields.passwordHint}>
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
  const t = useT()
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
      toast(t.team.saved)
      onClose()
    },
  })
  const fe = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {}

  return (
    <Dialog
      title={t.team.editTitle(member.name)}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.common.save}
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
          <Field label={t.fields.phone} error={fe.phoneNumber}>
            {(id) => <input id={id} type="tel" className="input mono" value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} />}
          </Field>
        </div>
        <Field label={t.fields.username} error={fe.username}>
          {(id) => <input id={id} className="input mono" value={form.username} onChange={(e) => set('username', e.target.value)} />}
        </Field>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
