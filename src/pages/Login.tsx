import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { ApiError } from '../api/client'
import type { Assignment, KEvent, Shift, Zone } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { loginErrorText } from '../auth/loginErrors'
import { Board } from '../components/Board'
import { Button, ErrorNote, Field, Logo } from '../components/ui'
import { useFmt, useT } from '../lib/i18n'
import { today } from '../lib/time'

export default function Login() {
  const t = useT()
  const { login, signOutReason } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  // After a 429 the button stays locked for as long as Retry-After says
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const unlock = useCallback(() => setLockedUntil(null), [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockedUntil !== null) return
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err)
      if (err instanceof ApiError && err.kind === 'rate-limited' && err.retryAfter) {
        setLockedUntil(Date.now() + err.retryAfter * 1000)
      }
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-form">
        <div className="brand" style={{ padding: 0 }}>
          <Logo />
          Khronos
        </div>
        <div>
          <h1>{t.login.headline}</h1>
          <p className="lede">{t.login.lede}</p>
        </div>
        <form className="form" onSubmit={submit}>
          <Field label={t.fields.username}>
            {(id) => (
              <input
                id={id}
                className="input"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
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
          {signOutReason && !error && (
            <div className="notice info" role="status">
              <Clock size={16} strokeWidth={1.5} />
              <span>{signOutReason === 'disabled' ? t.login.sessionDisabled : t.login.sessionEnded}</span>
            </div>
          )}
          <ErrorNote error={loginErrorText(error, t)} />
          <Button type="submit" variant="primary" loading={busy} disabled={!username || !password || lockedUntil !== null}>
            {lockedUntil !== null ? <WaitCountdown until={lockedUntil} onDone={unlock} /> : t.login.signIn}
          </Button>
        </form>
      </div>
      <div className="login-visual" aria-hidden>
        <PreviewBoard />
      </div>
    </div>
  )
}

/** The locked button's label. It ticks on its own, so the form and the preview do not re-render every second */
function WaitCountdown({ until, onDone }: { until: number; onDone: () => void }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= until) onDone()
    }, 1000)
    return () => clearInterval(id)
  }, [until, onDone])

  return <>{t.login.waitButton(Math.max(0, Math.ceil((until - now) / 1000)))}</>
}

/** A sample day rendered by the real board, so the first screen shows what the product does */
function PreviewBoard() {
  const t = useT()
  const fmt = useFmt()
  const d = today()
  const [hall, terrace] = t.login.previewZones
  const [dinner, cocktails] = t.login.previewEvents
  const zones: Zone[] = [
    { id: 1, name: hall, establishmentId: 1 },
    { id: 2, name: terrace, establishmentId: 1 },
  ]
  const people = [
    { userId: 1, name: 'Lucía Romero', initials: 'LR' },
    { userId: 2, name: 'Marco Bianchi', initials: 'MB' },
    { userId: 3, name: 'Aisha Khan', initials: 'AK' },
    { userId: 4, name: 'Tomás Vidal', initials: 'TV' },
    { userId: 5, name: 'Nora Lindqvist', initials: 'NL' },
  ]
  const s = (id: number, workerId: number, zoneId: number, startTime: string, endTime: string): Shift => ({
    id,
    workerId,
    zoneId,
    date: d,
    startTime,
    endTime,
  })
  const shifts = [
    s(1, 1, 1, '16:00', '23:30'),
    s(2, 2, 1, '17:00', '23:00'),
    s(3, 3, 1, '12:00', '18:00'),
    s(4, 4, 2, '18:00', '23:59'),
    s(5, 5, 2, '11:00', '17:00'),
  ]
  const events: KEvent[] = [
    { id: 1, title: dinner, dateTime: `${d}T19:30:00`, zoneId: 1, zoneName: hall, peopleNumber: 120, establishmentId: 1, description: null },
    { id: 2, title: cocktails, dateTime: `${d}T21:00:00`, zoneId: 2, zoneName: terrace, peopleNumber: 80, establishmentId: 1, description: null },
  ]
  const assignments = new Map<number, Assignment[]>([
    [1, [{ id: 1, workerId: 1, eventId: 1 }]],
    [2, [{ id: 2, workerId: 4, eventId: 2 }]],
  ])
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t.login.previewTitle(fmt.weekdayLong(d))}</h2>
        <span className="muted mono" style={{ fontSize: 12 }}>
          {t.login.previewMeta}
        </span>
      </div>
      <Board zones={zones} people={people} shifts={shifts} events={events} assignments={assignments} selectedEventId={1} />
    </div>
  )
}
