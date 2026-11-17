import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth, useMe } from '../auth/AuthContext'
import { Button, ErrorNote, Field, PageHead, useToast } from '../components/ui'

export default function Account() {
  const me = useMe()
  const { setUser, login, expiresAt } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState({
    firstName: me.firstName,
    lastName: me.lastName,
    email: me.email,
    phoneNumber: me.phoneNumber ?? '',
  })
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })

  // The username is the login, so it stays fixed here to keep the stored session valid
  const saveProfile = useMutation({
    mutationFn: () =>
      api.users.update(me.id, { ...profile, username: me.username, phoneNumber: profile.phoneNumber.trim() || null }),
    onSuccess: (user) => {
      setUser(user)
      toast('Profile saved')
    },
  })

  const changePassword = useMutation({
    // The server revokes every token issued before the change, this one included,
    // so a new one is fetched with the new password straight away
    mutationFn: async () => {
      await api.users.changePassword(me.id, pw.current, pw.next)
      await login(me.username, pw.next)
    },
    onSuccess: () => {
      setPw({ current: '', next: '', repeat: '' })
      toast('Password changed. Other devices are signed out')
    },
  })

  const fe = saveProfile.error instanceof ApiError ? saveProfile.error.fieldErrors : {}
  const mismatch = pw.repeat && pw.next !== pw.repeat ? 'Does not match' : undefined
  const pwValid = pw.current && pw.next.length >= 8 && pw.next === pw.repeat

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHead
        title="Account"
        sub={`Signed in as ${me.username}${expiresAt ? ` · session ends at ${new Date(expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
      />

      <section className="card">
        <div className="card-head">
          <h2>Profile</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            saveProfile.mutate()
          }}
        >
          <div className="row-2">
            <Field label="First name" error={fe.firstName}>
              {(id) => (
                <input id={id} className="input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
              )}
            </Field>
            <Field label="Last name" error={fe.lastName}>
              {(id) => (
                <input id={id} className="input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
              )}
            </Field>
          </div>
          <div className="row-2">
            <Field label="Email" error={fe.email}>
              {(id) => (
                <input id={id} type="email" className="input" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              )}
            </Field>
            <Field label="Phone" error={fe.phoneNumber} hint="Optional">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  className="input mono"
                  value={profile.phoneNumber}
                  onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                />
              )}
            </Field>
          </div>
          <ErrorNote error={saveProfile.error} />
          <div>
            <Button type="submit" variant="primary" loading={saveProfile.isPending}>
              Save profile
            </Button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Password</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            if (pwValid) changePassword.mutate()
          }}
        >
          <Field label="Current password">
            {(id) => (
              <input
                id={id}
                type="password"
                className="input"
                autoComplete="current-password"
                style={{ maxWidth: 360 }}
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            )}
          </Field>
          <div className="row-2">
            <Field label="New password" hint="At least 8 characters">
              {(id) => (
                <input
                  id={id}
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={(e) => setPw({ ...pw, next: e.target.value })}
                />
              )}
            </Field>
            <Field label="Repeat new password" error={mismatch}>
              {(id) => (
                <input
                  id={id}
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  aria-invalid={!!mismatch}
                  value={pw.repeat}
                  onChange={(e) => setPw({ ...pw, repeat: e.target.value })}
                />
              )}
            </Field>
          </div>
          <ErrorNote error={changePassword.error} />
          <div>
            <Button type="submit" disabled={!pwValid} loading={changePassword.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
