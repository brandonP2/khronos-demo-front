import { request } from './client'
import type {
  Assignment,
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
  Zone,
} from './types'

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<TokenResponse>('POST', '/auth/login', { username, password }, { anonymous: true }),
  },
  users: {
    me: () => request<User>('GET', '/users/me'),
    all: () => request<User[]>('GET', '/users'),
    get: (id: number) => request<User>('GET', `/users/${id}`),
    create: (input: UserCreate, role: Role) => request<User>('POST', `/users/create?role=${role}`, input),
    createWorker: (input: UserCreate) => request<User>('POST', '/users/create/worker', input),
    update: (id: number, input: UserUpdate) => request<User>('PUT', `/users/${id}`, input),
    changePassword: (id: number, currentPassword: string, newPassword: string) =>
      request<void>('PUT', `/users/${id}/password`, { currentPassword, newPassword }),
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
    create: (userId: number, establishmentId: number) =>
      request<Worker>('POST', '/workers', { userId, establishmentId, isActive: true }),
    /** The API toggles: an active worker becomes inactive and the other way round */
    toggleActive: (userId: number) => request<void>('DELETE', `/workers/deactivate/${userId}`),
  },
  shifts: {
    byOwner: (ownerId: number) => request<Shift[]>('GET', `/worker-shifts/owner/${ownerId}`),
    byWorker: (workerId: number) => request<Shift[]>('GET', `/worker-shifts/worker/${workerId}`),
    create: (input: ShiftInput[]) => request<Shift[]>('POST', '/worker-shifts', input),
    update: (id: number, input: ShiftInput) => request<Shift>('PUT', `/worker-shifts/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/worker-shifts/${id}`),
  },
  events: {
    byEstablishment: (id: number) => request<KEvent[]>('GET', `/events/establishment/${id}`),
    create: (input: EventInput[]) => request<KEvent[]>('POST', '/events', input),
    update: (id: number, input: EventInput) => request<KEvent>('PUT', `/events/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/events/${id}`),
  },
  assignments: {
    byEvent: (eventId: number) => request<Assignment[]>('GET', `/worker-events/event/${eventId}`),
    byWorker: (workerId: number) => request<Assignment[]>('GET', `/worker-events/worker/${workerId}`),
    create: (pairs: { workerId: number; eventId: number }[]) => request<Assignment[]>('POST', '/worker-events', pairs),
    remove: (id: number) => request<void>('DELETE', `/worker-events/${id}`),
  },
}
