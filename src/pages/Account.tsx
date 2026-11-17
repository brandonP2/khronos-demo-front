import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth, useMe } from '../auth/AuthContext'
import { Button, ErrorNote, Field, PageHead, useToast } from '../components/ui'
import { LOCALES, useFmt, useLocale, useT, type Locale } from '../lib/i18n'

export default function Account() {
  const t = useT()
  const fmt = useFmt()
  const { locale, setLocale } = useLocale()
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
      toast(t.account.profileSaved)
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
      toast(t.account.passwordChanged)
    },
  })

  const fe = saveProfile.error instanceof ApiError ? saveProfile.error.fieldErrors : {}
  const mismatch = pw.repeat && pw.next !== pw.repeat ? t.fields.mismatch : undefined
  const pwValid = pw.current && pw.next.length >= 8 && pw.next === pw.repeat

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHead title={t.account.title} sub={t.account.sub(me.username, expiresAt ? fmt.time(expiresAt) : null)} />

      <section className="card">
        <div className="card-head">
          <h2>{t.account.profile}</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            saveProfile.mutate()
          }}
        >
          <div className="row-2">
            <Field label={t.fields.firstName} error={fe.firstName}>
              {(id) => (
                <input id={id} className="input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
              )}
            </Field>
            <Field label={t.fields.lastName} error={fe.lastName}>
              {(id) => (
                <input id={id} className="input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
              )}
            </Field>
          </div>
          <div className="row-2">
            <Field label={t.fields.email} error={fe.email}>
              {(id) => (
                <input id={id} type="email" className="input" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              )}
            </Field>
            <Field label={t.fields.phone} error={fe.phoneNumber} hint={t.common.optional}>
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
              {t.account.saveProfile}
            </Button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.account.password}</h2>
        </div>
        <form
          className="card-body form"
          onSubmit={(e) => {
            e.preventDefault()
            if (pwValid) changePassword.mutate()
          }}
        >
          <Field label={t.account.currentPassword}>
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
            <Field label={t.account.newPassword} hint={t.fields.passwordHint}>
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
            <Field label={t.account.repeatPassword} error={mismatch}>
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
              {t.account.changePassword}
            </Button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.account.language}</h2>
        </div>
        <div className="card-body form">
          <Field label={t.account.languageLabel} hint={t.account.languageHint}>
            {(id) => (
              <select
                id={id}
                className="select"
                style={{ maxWidth: 360 }}
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
              >
                {LOCALES.map((l) => (
                  <option key={l.id} value={l.id} lang={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </section>
    </div>
  )
}
