import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Clock, WifiOff } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useFmt, useT } from '../lib/i18n'
import { Button, Dialog, Empty, ErrorNote, Field, errorMessage, useToast } from './ui'

/** How long before the token runs out the warning appears */
export const WARN_BEFORE_MS = 5 * 60_000

/**
 * Tokens last one hour and there is no refresh token, so five minutes before the end a
 * banner offers to sign in again with the password. The new token replaces the old one in
 * place, so the screen, open dialogs and unsaved input stay as they are.
 */
export function SessionWarning() {
  const t = useT()
  const fmt = useFmt()
  const { user, expiresAt } = useAuth()
  const [now, setNow] = useState(() => Date.now())
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    if (!expiresAt) return
    const delay = expiresAt - WARN_BEFORE_MS - Date.now()
    if (delay <= 0) {
      setNow(Date.now())
      return
    }
    const id = setTimeout(() => setNow(Date.now()), delay)
    return () => clearTimeout(id)
  }, [expiresAt])

  if (!user || !expiresAt || expiresAt - now > WARN_BEFORE_MS) return null

  if (renewing) return <RenewDialog expiresAt={expiresAt} onClose={() => setRenewing(false)} />

  return (
    <div className="session-warning" role="status">
      <Clock size={16} strokeWidth={1.5} />
      <span>{t.session.expiresAt(fmt.time(expiresAt))}</span>
      <Button size="sm" variant="primary" onClick={() => setRenewing(true)}>
        {t.session.stay}
      </Button>
    </div>
  )
}

function RenewDialog({ expiresAt, onClose }: { expiresAt: number; onClose: () => void }) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const { user, renewSession } = useAuth()
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => renewSession(password),
    onSuccess: (newExpiry) => {
      toast(t.session.renewed(fmt.time(newExpiry)))
      onClose()
    },
  })

  // The username is fixed, so a 401 here can only mean a wrong password
  const error =
    mutation.error instanceof ApiError && mutation.error.status === 401 ? t.session.wrongPassword : mutation.error

  return (
    <Dialog
      title={t.session.reauthTitle}
      sub={t.session.reauthSub(fmt.time(expiresAt))}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!password} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t.session.renew}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) mutation.mutate()
        }}
      >
        <p className="secondary" style={{ margin: 0 }}>
          {t.session.signedInAs(user?.username ?? '')}
        </p>
        <Field label={t.fields.password}>
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** The stored session could not be checked because the server is unreachable or failing */
export function ConnectionLost() {
  const t = useT()
  const { bootError, retryBoot, logout } = useAuth()
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    await retryBoot()
    setRetrying(false)
  }
  return (
    <div className="main">
      <div className="page" style={{ maxWidth: 560 }}>
        <div className="card">
          <Empty
            icon={WifiOff}
            title={t.session.lostTitle}
            action={
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Button variant="primary" loading={retrying} onClick={retry}>
                  {t.common.retry}
                </Button>
                <Button variant="ghost" onClick={logout}>
                  {t.nav.signOut}
                </Button>
              </div>
            }
          >
            {errorMessage(bootError, t)} {t.session.lostBody}
          </Empty>
        </div>
      </div>
    </div>
  )
}
