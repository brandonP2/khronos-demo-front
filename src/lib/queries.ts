import { useMemo } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/endpoints'
import type { Assignment, KEvent, User, Worker } from '../api/types'

export const keys = {
  venues: (ownerId: number) => ['venues', ownerId] as const,
  zones: (venueId: number) => ['zones', venueId] as const,
  staff: (venueId: number) => ['staff', venueId] as const,
  shifts: (ownerId: number) => ['shifts', 'owner', ownerId] as const,
  events: (venueId: number) => ['events', venueId] as const,
  assignments: (eventId: number) => ['assignments', 'event', eventId] as const,
}

export interface StaffMember extends Worker {
  user: User
  name: string
  initials: string
}

export function displayName(u: Pick<User, 'firstName' | 'lastName' | 'username'>) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return name || u.username
}

export function initials(u: Pick<User, 'firstName' | 'lastName' | 'username'>) {
  const a = u.firstName?.[0] ?? u.username[0] ?? '?'
  const b = u.lastName?.[0] ?? ''
  return (a + b).toUpperCase()
}

export function useVenues(ownerId: number) {
  return useQuery({ queryKey: keys.venues(ownerId), queryFn: () => api.establishments.byOwner(ownerId) })
}

export function useZones(venueId: number | undefined) {
  return useQuery({
    queryKey: keys.zones(venueId ?? 0),
    queryFn: () => api.zones.byEstablishment(venueId!),
    enabled: !!venueId,
    select: (zones) => [...zones].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

/** Workers only carry ids, so each one is joined with its user record */
export function useStaff(venueId: number | undefined) {
  return useQuery({
    queryKey: keys.staff(venueId ?? 0),
    enabled: !!venueId,
    queryFn: async (): Promise<StaffMember[]> => {
      const workers = await api.workers.byEstablishment(venueId!)
      const users = await Promise.all(workers.map((w) => api.users.get(w.userId)))
      return workers
        .map((w, i) => ({ ...w, user: users[i], name: displayName(users[i]), initials: initials(users[i]) }))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
    },
  })
}

/** The API lists shifts per owner, so they are narrowed to the zones of the current venue */
export function useShifts(ownerId: number, zoneIds: number[] | undefined) {
  const query = useQuery({ queryKey: keys.shifts(ownerId), queryFn: () => api.shifts.byOwner(ownerId) })
  const zoneKey = zoneIds?.join(',')
  const data = useMemo(() => {
    if (!query.data || !zoneIds) return undefined
    const set = new Set(zoneIds)
    return query.data
      .filter((s) => set.has(s.zoneId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }, [query.data, zoneKey])
  return { ...query, data }
}

export function useEvents(venueId: number | undefined) {
  return useQuery({
    queryKey: keys.events(venueId ?? 0),
    queryFn: () => api.events.byEstablishment(venueId!),
    enabled: !!venueId,
    select: (events) => [...events].sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
  })
}

/** Assignments are only listed per event, so the visible events are fetched in parallel */
export function useAssignments(events: KEvent[]) {
  const results = useQueries({
    queries: events.map((e) => ({ queryKey: keys.assignments(e.id), queryFn: () => api.assignments.byEvent(e.id) })),
  })
  const byEvent = new Map<number, Assignment[]>()
  events.forEach((e, i) => byEvent.set(e.id, results[i]?.data ?? []))
  return { byEvent, loading: results.some((r) => r.isLoading) }
}

/** Shift and event edits can unassign workers on the server, so assignments are refetched with them */
export function useInvalidate() {
  const qc = useQueryClient()
  return {
    schedule: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['shifts'] }),
        qc.invalidateQueries({ queryKey: ['events'] }),
        qc.invalidateQueries({ queryKey: ['assignments'] }),
      ]),
    staff: () => qc.invalidateQueries({ queryKey: ['staff'] }),
    zones: () => qc.invalidateQueries({ queryKey: ['zones'] }),
    venues: () => qc.invalidateQueries({ queryKey: ['venues'] }),
  }
}
