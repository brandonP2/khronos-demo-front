import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Building2,
  CalendarClock,
  CalendarRange,
  Clock,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  ReceiptText,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth, useMe } from '../auth/AuthContext'
import { useT, type Messages } from '../lib/i18n'
import { useVenue } from '../lib/VenueContext'
import { displayName, initials } from '../lib/queries'
import { ErrorBoundary } from './ErrorBoundary'
import { Avatar, Logo } from './ui'

interface NavItem {
  to: string
  label: keyof Messages['nav']
  icon: LucideIcon
}

const NAV: Record<string, NavItem[]> = {
  OWNER: [
    { to: '/', label: 'summary', icon: LayoutDashboard },
    { to: '/schedule', label: 'schedule', icon: CalendarRange },
    { to: '/hours', label: 'hours', icon: Clock },
    { to: '/cash', label: 'cash', icon: Wallet },
    { to: '/expenses', label: 'expenses', icon: ReceiptText },
    { to: '/events', label: 'events', icon: CalendarClock },
    { to: '/team', label: 'team', icon: Users },
    { to: '/venue', label: 'venue', icon: MapIcon },
  ],
  WORKER: [
    { to: '/', label: 'mySchedule', icon: CalendarRange },
    { to: '/hours', label: 'myHours', icon: Clock },
  ],
  PLATFORM_ADMIN: [{ to: '/', label: 'admin', icon: Building2 }],
}

export function Layout({ venuePicker }: { venuePicker?: ReactNode }) {
  const t = useT()
  const me = useMe()
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const sidebarId = useId()
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [location.pathname])

  // On small screens the menu slides over the page: focus goes into it, and Escape closes it
  useEffect(() => {
    if (!open) return
    sidebarRef.current?.querySelector<HTMLElement>('.nav a')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={open ? 'shell nav-open' : 'shell'}>
      <aside className="sidebar" id={sidebarId} ref={sidebarRef}>
        <div className="brand">
          <Logo />
          Khronos
        </div>

        {venuePicker}

        <nav className="nav" aria-label={t.nav.main}>
          {NAV[me.role].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
              <item.icon size={16} strokeWidth={1.5} />
              {t.nav[item.label]}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/account" className="nav-link">
            <UserCog size={16} strokeWidth={1.5} />
            {t.nav.account}
          </NavLink>
          <button className="nav-link" onClick={logout}>
            <LogOut size={16} strokeWidth={1.5} />
            {t.nav.signOut}
          </button>
          <div className="user-chip">
            <Avatar initials={initials(me)} />
            <div className="who">
              <span>{displayName(me)}</span>
              <span>{t.roles[me.role]}</span>
            </div>
          </div>
        </div>
      </aside>

      {open && <div className="overlay" style={{ zIndex: 35 }} onClick={() => setOpen(false)} />}

      <div>
        <div className="mobile-bar">
          <button
            ref={menuButtonRef}
            className="btn btn-ghost btn-icon"
            onClick={() => setOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={open}
            aria-controls={sidebarId}
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>
          <div className="brand" style={{ padding: 0 }}>
            <Logo />
            Khronos
          </div>
        </div>
        <main className="main">
          {/* A crash on one page keeps the menu usable, and clears when another page is opened */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export function VenuePicker() {
  const t = useT()
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
        aria-label={t.nav.venuePicker}
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
