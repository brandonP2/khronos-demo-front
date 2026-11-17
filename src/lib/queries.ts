import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from './i18n'
import { api } from '../api/endpoints'
import type { Assignment, DateRange, Period, TimeEntryQuery, User, Worker } from '../api/types'

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
  myOpenEntry: () => ['time-entries', 'me', 'open'] as const,
  openEntries: (venueId: number) => ['time-entries', 'open', venueId] as const,
  workerEntries: (workerId: number, query: TimeEntryQuery) =>
    ['time-entries', 'worker', workerId, ...rangeKey(query), !!query.includeVoided] as const,
  entryHistory: (entryId: number) => ['time-entries', 'history', entryId] as const,
  rates: (workerId: number) => ['rates', workerId] as const,
  hoursReport: (venueId: number, period: Period) => ['reports', 'hours', venueId, period.from, period.to] as const,
  workerDays: (workerId: number, period: Period) => ['reports', 'days', workerId, period.from, period.to] as const,
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

/**
 * Joins workers with their user records. A worker whose record did not come back is kept,
 * under a stand-in name and an empty record, so the owner still sees them and can act on them.
 */
export function joinStaff(workers: Worker[], users: User[], missingName: (userId: number) => string): StaffMember[] {
  const userById = new Map(users.map((u) => [u.id, u]))
  return workers
    .map((w) => {
      const user = userById.get(w.userId)
      if (user) return { ...w, user, name: displayName(user), initials: initials(user) }
      const blank: User = { id: w.userId, username: '', firstName: '', lastName: '', phoneNumber: null, email: '', role: 'WORKER' }
      return { ...w, user: blank, name: missingName(w.userId), initials: '?' }
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
}

/** Workers only carry ids, so they are joined with the venue's user records, fetched in one call */
export function useStaff(venueId: number | undefined) {
  const t = useT()
  // Joined when read rather than when fetched, so a stand-in name follows the language
  const select = useCallback(
    ({ workers, users }: { workers: Worker[]; users: User[] }) => joinStaff(workers, users, t.common.missingPerson),
    [t],
  )
  return useQuery({
    queryKey: keys.staff(venueId ?? 0),
    enabled: !!venueId,
    queryFn: async () => {
      const [workers, users] = await Promise.all([
        api.workers.byEstablishment(venueId!),
        api.users.byEstablishment(venueId!),
      ])
      return { workers, users }
    },
    select,
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

/** A worker has no venue picker: their venue is the one their worker record points to */
export function useMyVenue(userId: number) {
  const worker = useQuery({ queryKey: keys.worker(userId), queryFn: () => api.workers.get(userId) })
  const venueId = worker.data?.establishmentId
  const venue = useQuery({
    queryKey: keys.venue(venueId ?? 0),
    queryFn: () => api.establishments.get(venueId!),
    enabled: !!venueId,
  })
  return { worker, venue }
}

/* ---------- Time entries, rates and reports ---------- */

/** The signed-in worker's open entry, or null when they are not clocked in */
export function useMyOpenEntry() {
  return useQuery({ queryKey: keys.myOpenEntry(), queryFn: api.timeEntries.myOpen })
}

/** Who is clocked in now; checked every minute and whenever the tab comes back into view */
export function useOpenEntries(venueId: number | undefined) {
  return useQuery({
    queryKey: keys.openEntries(venueId ?? 0),
    queryFn: () => api.timeEntries.open(venueId!),
    enabled: !!venueId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
    select: (entries) => [...entries].sort((a, b) => a.clockIn.localeCompare(b.clockIn)),
  })
}

export function useWorkerEntries(workerId: number, query: TimeEntryQuery, enabled = true) {
  return useQuery({
    queryKey: keys.workerEntries(workerId, query),
    queryFn: () => api.timeEntries.byWorker(workerId, query),
    enabled,
    placeholderData: keepPreviousData,
    select: (entries) => [...entries].sort((a, b) => b.clockIn.localeCompare(a.clockIn)),
  })
}

export function useEntryHistory(entryId: number) {
  return useQuery({ queryKey: keys.entryHistory(entryId), queryFn: () => api.timeEntries.history(entryId) })
}

/** Owner only. Newest first. */
export function useRates(workerId: number) {
  return useQuery({
    queryKey: keys.rates(workerId),
    queryFn: () => api.rates.byWorker(workerId),
    select: (rates) => [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
  })
}

/** Owner only. Nothing is fetched while the period is not valid. */
export function useHoursReport(venueId: number | undefined, period: Period | null) {
  return useQuery({
    queryKey: keys.hoursReport(venueId ?? 0, period ?? { from: '', to: '' }),
    queryFn: () => api.reports.hours(venueId!, period!),
    enabled: !!venueId && !!period,
    placeholderData: keepPreviousData,
  })
}

/** The owner on anyone in the venue, or a worker on themselves (then without costs) */
export function useWorkerDays(workerId: number, period: Period | null) {
  return useQuery({
    queryKey: keys.workerDays(workerId, period ?? { from: '', to: '' }),
    queryFn: () => api.reports.workerDays(workerId, period!),
    enabled: !!period,
    placeholderData: keepPreviousData,
  })
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
        // Planned hours in the reports come from the shifts
        qc.invalidateQueries({ queryKey: ['reports'] }),
      ]),
    staff: () => qc.invalidateQueries({ queryKey: ['staff'] }),
    zones: () => qc.invalidateQueries({ queryKey: ['zones'] }),
    venues: () => qc.invalidateQueries({ queryKey: ['venues'] }),
    /** Any clock-in, clock-out, correction or void also changes the reports */
    timeEntries: () =>
      Promise.all([qc.invalidateQueries({ queryKey: ['time-entries'] }), qc.invalidateQueries({ queryKey: ['reports'] })]),
    rates: () => Promise.all([qc.invalidateQueries({ queryKey: ['rates'] }), qc.invalidateQueries({ queryKey: ['reports'] })]),
  }
}
