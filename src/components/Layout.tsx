import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Building2,
  CalendarClock,
  CalendarRange,
  LogOut,
  Map as MapIcon,
  Menu,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth, useMe } from '../auth/AuthContext'
import { useVenue } from '../lib/VenueContext'
import { displayName, initials } from '../lib/queries'
import { Avatar, Logo } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: Record<string, NavItem[]> = {
  OWNER: [
    { to: '/', label: 'Schedule', icon: CalendarRange },
    { to: '/events', label: 'Events', icon: CalendarClock },
    { to: '/team', label: 'Team', icon: Users },
    { to: '/venue', label: 'Venue and zones', icon: MapIcon },
  ],
  WORKER: [{ to: '/', label: 'My schedule', icon: CalendarRange }],
  PLATFORM_ADMIN: [{ to: '/', label: 'Owners and venues', icon: Building2 }],
}

const ROLE_LABEL = { OWNER: 'Owner', WORKER: 'Staff', PLATFORM_ADMIN: 'Platform admin' } as const

export function Layout({ venuePicker }: { venuePicker?: ReactNode }) {
  const me = useMe()
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className={open ? 'shell nav-open' : 'shell'}>
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          Khronos
        </div>

        {venuePicker}

        <nav className="nav" aria-label="Main">
          {NAV[me.role].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
              <item.icon size={16} strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/account" className="nav-link">
            <UserCog size={16} strokeWidth={1.5} />
            Account
          </NavLink>
          <button className="nav-link" onClick={logout}>
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
          <div className="user-chip">
            <Avatar initials={initials(me)} />
            <div className="who">
              <span>{displayName(me)}</span>
              <span>{ROLE_LABEL[me.role]}</span>
            </div>
          </div>
        </div>
      </aside>

      {open && <div className="overlay" style={{ zIndex: 35 }} onClick={() => setOpen(false)} />}

      <div>
        <div className="mobile-bar">
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={18} strokeWidth={1.5} />
          </button>
          <div className="brand" style={{ padding: 0 }}>
            <Logo />
            Khronos
          </div>
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function VenuePicker() {
  const { venues, venue, setVenueId } = useVenue()
  if (!venue) return null
  if (venues.length === 1) {
    return (
      <div className="venue-static">
        <div className="venue-name">{venue.establishmentName}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {venue.establishmentAddress}
        </div>
      </div>
    )
  }
  return (
    <div className="venue-picker">
      <select
        className="select"
        aria-label="Venue"
        value={venue.id}
        onChange={(e) => setVenueId(Number(e.target.value))}
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.establishmentName}
          </option>
        ))}
      </select>
    </div>
  )
}
