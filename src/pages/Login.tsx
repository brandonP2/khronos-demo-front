import { useState } from 'react'
import { Clock } from 'lucide-react'
import type { Assignment, KEvent, Shift, Zone } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Board } from '../components/Board'
import { Button, ErrorNote, Field, Logo } from '../components/ui'
import { today } from '../lib/time'

export default function Login() {
  const { login, signOutReason } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err)
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
          <h1>Shifts and events for your venue, checked before they go out</h1>
          <p className="lede">
            Plan who works where and when, staff each event from the people on shift, and let your team see their week.
          </p>
        </div>
        <form className="form" onSubmit={submit}>
          <Field label="Username">
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
          <Field label="Password">
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
          {signOutReason === 'expired' && !error && (
            <div className="notice info" role="status">
              <Clock size={16} strokeWidth={1.5} />
              <span>Your session ended. For security, sessions last one hour. Sign in again to continue.</span>
            </div>
          )}
          <ErrorNote error={error} />
          <Button type="submit" variant="primary" loading={busy} disabled={!username || !password}>
            Sign in
          </Button>
        </form>
      </div>
      <div className="login-visual" aria-hidden>
        <PreviewBoard />
      </div>
    </div>
  )
}

/** A sample day rendered by the real board, so the first screen shows what the product does */
function PreviewBoard() {
  const d = today()
  const zones: Zone[] = [
    { id: 1, name: 'Main hall', establishmentId: 1 },
    { id: 2, name: 'Terrace', establishmentId: 1 },
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
    { id: 1, title: 'Wedding dinner', dateTime: `${d}T19:30:00`, zoneId: 1, zoneName: 'Main hall', peopleNumber: 120, establishmentId: 1, description: null },
    { id: 2, title: 'Cocktail hour', dateTime: `${d}T21:00:00`, zoneId: 2, zoneName: 'Terrace', peopleNumber: 80, establishmentId: 1, description: null },
  ]
  const assignments = new Map<number, Assignment[]>([
    [1, [{ id: 1, workerId: 1, eventId: 1 }]],
    [2, [{ id: 2, workerId: 4, eventId: 2 }]],
  ])
  return (
    <div className="card">
      <div className="card-head">
        <h2>Saturday service</h2>
        <span className="muted mono" style={{ fontSize: 12 }}>
          5 on shift · 2 events
        </span>
      </div>
      <Board zones={zones} people={people} shifts={shifts} events={events} assignments={assignments} selectedEventId={1} />
    </div>
  )
}
