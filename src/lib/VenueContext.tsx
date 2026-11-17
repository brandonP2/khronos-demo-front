import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Establishment } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { useVenues } from './queries'

const STORAGE_KEY = 'khronos.venue'

interface VenueState {
  venues: Establishment[]
  venue: Establishment | null
  setVenueId: (id: number) => void
  loading: boolean
  error: unknown
}

const VenueContext = createContext<VenueState | null>(null)

function readStored(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

/** An owner can run several venues; every owner screen works on the one picked here */
export function VenueProvider({ children }: { children: ReactNode }) {
  const me = useMe()
  const { data: venues = [], isLoading, error } = useVenues(me.id)
  const [venueId, setVenueIdState] = useState<number | null>(readStored)

  const venue = venues.find((v) => v.id === venueId) ?? venues[0] ?? null

  useEffect(() => {
    if (venue && venue.id !== venueId) setVenueIdState(venue.id)
  }, [venue, venueId])

  const setVenueId = (id: number) => {
    setVenueIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      // Not remembered across reloads, which is fine
    }
  }

  return (
    <VenueContext.Provider value={{ venues, venue, setVenueId, loading: isLoading, error }}>
      {children}
    </VenueContext.Provider>
  )
}

export function useVenue() {
  const ctx = useContext(VenueContext)
  if (!ctx) throw new Error('useVenue must be used inside VenueProvider')
  return ctx
}
