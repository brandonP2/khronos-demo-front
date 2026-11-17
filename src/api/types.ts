// Mirrors the DTOs in khronos-demo/src/main/java/com/moga/khronosdemo/dtos

export type Role = 'PLATFORM_ADMIN' | 'OWNER' | 'WORKER'

export interface User {
  id: number
  username: string
  firstName: string
  lastName: string
  phoneNumber: string | null
  email: string
  role: Role
}

export interface UserCreate {
  username: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string | null
  email: string
}

export type UserUpdate = Omit<UserCreate, 'password'>

export interface Establishment {
  id: number
  establishmentName: string
  establishmentAddress: string
  ownerId: number
  ownerName: string
  /** Only sent to admins and the owner; null for workers */
  ownerEmail: string | null
  ownerPhone: string | null
}

export interface EstablishmentInput {
  establishmentName: string
  establishmentAddress: string
  ownerId: number
}

export interface Zone {
  id: number
  name: string
  establishmentId: number
}

export interface Worker {
  userId: number
  establishmentId: number
  isActive: boolean
}

/** POST /workers/with-user creates the login and links it to the venue in one transaction */
export interface WorkerWithUser {
  user: User
  worker: Worker
}

/** Date is YYYY-MM-DD, times are HH:mm or HH:mm:ss */
export interface Shift {
  id: number
  workerId: number
  date: string
  startTime: string
  endTime: string
  zoneId: number
}

export interface ShiftInput {
  workerId: number
  zoneId: number
  date: string
  startTime: string
  endTime: string
}

/** dateTime is a local ISO date-time, YYYY-MM-DDTHH:mm:ss */
export interface KEvent {
  id: number
  title: string
  dateTime: string
  zoneId: number
  zoneName: string
  peopleNumber: number
  establishmentId: number
  description: string | null
}

export interface EventInput {
  title: string
  dateTime: string
  zoneId: number
  peopleNumber: number
  description?: string | null
}

export interface Assignment {
  id: number
  workerId: number
  eventId: number
}

export interface TokenResponse {
  accessToken: string
  tokenType: 'Bearer'
  /** ISO instant, one hour after login */
  expiresAt: string
  expiresIn: number
}

/** Optional, inclusive YYYY-MM-DD bounds accepted by the shift, event and assignment listings */
export interface DateRange {
  from?: string
  to?: string
}

export interface ApiErrorBody {
  timestamp?: string
  status: number
  error?: string
  message: string
  path?: string
  fieldErrors?: Record<string, string>
  /** Machine-readable reason, sent by newer APIs: ACCOUNT_DISABLED, INVALID_CREDENTIALS, TOO_MANY_ATTEMPTS, SESSION_EXPIRED */
  code?: string
}
