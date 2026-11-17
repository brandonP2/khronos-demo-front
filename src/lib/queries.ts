import { useMemo } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/endpoints'
import type { Assignment, DateRange, User, Worker } from '../api/types'

const rangeKey = (range: DateRange) => [range.from ?? null, range.to ?? null] as const

export const keys = {
  venues: (ownerId: number) => ['venues', ownerId] as const,
  venue: (venueId: number) => ['venue', venueId] as const,
  zones: (venueId: number) => ['zones', venueId] as const,
  staff: (venueId: number) => ['staff', venueId] as const,
  worker: (userId: number) => ['worker', userId] as const,
  ownerShifts: (ownerId: number, range: DateRange) => ['shifts', 'owner', ownerId, ...rangeKey(range)] as const,
  workerShifts: (workerId: number, range: DateRange) => ['shifts', 'worker', workerId, ...rangeKey(range)] as const,
  events: (venueId: number, range: DateRange) => ['events', venueId, ...rangeKey(range)] as const,
  assignments: (venueId: number, range: DateRange) => ['assignments', 'venue', venueId, ...rangeKey(range)] as const,
  workerAssignments: (workerId: number) => ['assignments', 'worker', workerId] as const,
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

/** Workers only carry ids, so they are joined with the venue's user records, fetched in one call */
export function useStaff(venueId: number | undefined) {
  return useQuery({
    queryKey: keys.staff(venueId ?? 0),
    enabled: !!venueId,
    queryFn: async (): Promise<StaffMember[]> => {
      const [workers, users] = await Promise.all([
        api.workers.byEstablishment(venueId!),
        api.users.byEstablishment(venueId!),
      ])
      const userById = new Map(users.map((u) => [u.id, u]))
      return workers
        .flatMap((w) => {
          const user = userById.get(w.userId)
          return user ? [{ ...w, user, name: displayName(user), initials: initials(user) }] : []
        })
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
    },
  })
}

/**
 * The API lists shifts per owner, so they are narrowed to the zones of the current venue.
 * Only the range on screen is fetched; the previous range stays visible while the next one loads.
 */
export function useShifts(ownerId: number, zoneIds: number[] | undefined, range: DateRange) {
  const query = useQuery({
    queryKey: keys.ownerShifts(ownerId, range),
    queryFn: () => api.shifts.byOwner(ownerId, range),
    placeholderData: keepPreviousData,
  })
  const zoneKey = zoneIds?.join(',')
  const data = useMemo(() => {
    if (!query.data || zoneKey === undefined) return undefined
    const set = new Set(zoneKey ? zoneKey.split(',').map(Number) : [])
    return query.data
      .filter((s) => set.has(s.zoneId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }, [query.data, zoneKey])
  return { ...query, data }
}

export function useEvents(venueId: number | undefined, range: DateRange) {
  return useQuery({
    queryKey: keys.events(venueId ?? 0, range),
    queryFn: () => api.events.byEstablishment(venueId!, range),
    enabled: !!venueId,
    placeholderData: keepPreviousData,
    select: (events) => [...events].sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
  })
}

/** Every assignment of the venue's events in the range, in one request, grouped by event */
export function useAssignments(venueId: number | undefined, range: DateRange) {
  const query = useQuery({
    queryKey: keys.assignments(venueId ?? 0, range),
    queryFn: () => api.assignments.byEstablishment(venueId!, range),
    enabled: !!venueId,
    placeholderData: keepPreviousData,
  })
  const byEvent = useMemo(() => {
    const map = new Map<number, Assignment[]>()
    for (const a of query.data ?? []) map.set(a.eventId, [...(map.get(a.eventId) ?? []), a])
    return map
  }, [query.data])
  // Placeholder data belongs to the previous range, so it does not count as loaded
  return { byEvent, loading: query.isLoading || query.isPlaceholderData, error: query.error }
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
