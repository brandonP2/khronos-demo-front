import { request } from './client'
import type {
  Assignment,
  DateRange,
  Establishment,
  EstablishmentInput,
  EventInput,
  KEvent,
  Role,
  Shift,
  ShiftInput,
  TokenResponse,
  User,
  UserCreate,
  UserUpdate,
  Worker,
  WorkerWithUser,
  Zone,
} from './types'

/** "?from=2026-11-16&to=2026-11-22", or nothing when the range is open on both sides */
function rangeQuery(range: DateRange = {}): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<TokenResponse>('POST', '/auth/login', { username, password }, { anonymous: true }),
  },
  users: {
    me: () => request<User>('GET', '/users/me'),
    all: () => request<User[]>('GET', '/users'),
    get: (id: number) => request<User>('GET', `/users/${id}`),
    /** The user records of the venue's workers */
    byEstablishment: (establishmentId: number) => request<User[]>('GET', `/users/establishment/${establishmentId}`),
    create: (input: UserCreate, role: Role) => request<User>('POST', `/users/create?role=${role}`, input),
    update: (id: number, input: UserUpdate) => request<User>('PUT', `/users/${id}`, input),
    changePassword: (id: number, currentPassword: string, newPassword: string) =>
      request<void>('PUT', `/users/${id}/password`, { currentPassword, newPassword }),
    /** An owner on their workers, or an admin on anyone: sets a new password without the current one */
    resetPassword: (id: number, newPassword: string) =>
      request<void>('PUT', `/users/${id}/password/reset`, { newPassword }),
    remove: (id: number) => request<void>('DELETE', `/users/${id}`),
  },
  establishments: {
    all: () => request<Establishment[]>('GET', '/establishments'),
    byOwner: (ownerId: number) => request<Establishment[]>('GET', `/establishments/owner/${ownerId}`),
    get: (id: number) => request<Establishment>('GET', `/establishments/${id}`),
    create: (input: EstablishmentInput) => request<Establishment>('POST', '/establishments', input),
    update: (id: number, input: EstablishmentInput) => request<Establishment>('PUT', `/establishments/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/establishments/${id}`),
  },
  zones: {
    byEstablishment: (id: number) => request<Zone[]>('GET', `/zones/establishment/${id}`),
    create: (name: string, establishmentId: number) => request<Zone>('POST', '/zones', { name, establishmentId }),
    update: (id: number, name: string, establishmentId: number) =>
      request<Zone>('PUT', `/zones/${id}`, { name, establishmentId }),
    remove: (id: number) => request<void>('DELETE', `/zones/${id}`),
  },
  workers: {
    byEstablishment: (id: number) => request<Worker[]>('GET', `/workers/establishment/${id}`),
    get: (userId: number) => request<Worker>('GET', `/workers/${userId}`),
    /** Creates the login and links it to the venue in one transaction, so nothing is left half done */
    createWithUser: (establishmentId: number, user: UserCreate) =>
      request<WorkerWithUser>('POST', '/workers/with-user', { establishmentId, user }),
    setActive: (userId: number, active: boolean) => request<Worker>('PUT', `/workers/${userId}/active`, { active }),
  },
  shifts: {
    byOwner: (ownerId: number, range?: DateRange) =>
      request<Shift[]>('GET', `/worker-shifts/owner/${ownerId}${rangeQuery(range)}`),
    byWorker: (workerId: number, range?: DateRange) =>
      request<Shift[]>('GET', `/worker-shifts/worker/${workerId}${rangeQuery(range)}`),
    create: (input: ShiftInput[]) => request<Shift[]>('POST', '/worker-shifts', input),
    update: (id: number, input: ShiftInput) => request<Shift>('PUT', `/worker-shifts/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/worker-shifts/${id}`),
  },
  events: {
    byEstablishment: (id: number, range?: DateRange) =>
      request<KEvent[]>('GET', `/events/establishment/${id}${rangeQuery(range)}`),
    create: (input: EventInput[]) => request<KEvent[]>('POST', '/events', input),
    update: (id: number, input: EventInput) => request<KEvent>('PUT', `/events/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/events/${id}`),
  },
  assignments: {
    /** Assignments of the venue's events, narrowed by event date */
    byEstablishment: (establishmentId: number, range?: DateRange) =>
      request<Assignment[]>('GET', `/worker-events/establishment/${establishmentId}${rangeQuery(range)}`),
    byWorker: (workerId: number) => request<Assignment[]>('GET', `/worker-events/worker/${workerId}`),
    create: (pairs: { workerId: number; eventId: number }[]) => request<Assignment[]>('POST', '/worker-events', pairs),
    remove: (id: number) => request<void>('DELETE', `/worker-events/${id}`),
  },
}
