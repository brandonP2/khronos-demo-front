import { Navigate, Route, Routes } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useAuth, useMe } from './auth/AuthContext'
import { Layout, VenuePicker } from './components/Layout'
import { ConnectionLost, SessionWarning } from './components/Session'
import { Empty, ErrorNote, Loading } from './components/ui'
import { useT } from './lib/i18n'
import { VenueProvider, useVenue } from './lib/VenueContext'
import Login from './pages/Login'
import Account from './pages/Account'
import SchedulePage from './pages/owner/SchedulePage'
import EventsPage from './pages/owner/EventsPage'
import TeamPage from './pages/owner/TeamPage'
import VenuePage from './pages/owner/VenuePage'
import MySchedule from './pages/worker/MySchedule'
import MyHours from './pages/worker/MyHours'
import AdminPage from './pages/admin/AdminPage'

export default function App() {
  const { user, ready, bootError } = useAuth()
  if (!ready) return null
  // A stored session that could not be checked is kept, so the person can retry
  if (!user) return bootError ? <ConnectionLost /> : <Login />
  return (
    <>
      {user.role === 'OWNER' ? (
        <VenueProvider>
          <OwnerApp />
        </VenueProvider>
      ) : (
        <SimpleApp />
      )}
      <SessionWarning />
    </>
  )
}

function OwnerApp() {
  const { venue, loading, error } = useVenue()
  return (
    <Routes>
      <Route element={<Layout venuePicker={<VenuePicker />} />}>
        <Route path="/account" element={<Account />} />
        <Route
          path="*"
          element={
            loading ? (
              <div className="page"><Loading /></div>
            ) : error ? (
              <div className="page"><ErrorNote error={error} /></div>
            ) : !venue ? (
              <NoVenue />
            ) : (
              <Routes key={venue.id}>
                <Route index element={<SchedulePage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="venue" element={<VenuePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            )
          }
        />
      </Route>
    </Routes>
  )
}

function NoVenue() {
  const t = useT()
  return (
    <div className="page">
      <div className="card">
        <Empty icon={Building2} title={t.noVenue.title}>
          {t.noVenue.body}
        </Empty>
      </div>
    </div>
  )
}

function SimpleApp() {
  const me = useMe()
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={me.role === 'WORKER' ? <MySchedule /> : <AdminPage />} />
        {me.role === 'WORKER' && <Route path="hours" element={<MyHours />} />}
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
