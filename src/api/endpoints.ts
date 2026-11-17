import { download, request } from './client'
import type {
  Assignment,
  BusinessSummary,
  CashClosing,
  CashClosingChange,
  CashClosingInput,
  ClockInInput,
  ClockOutForInput,
  ClockOutInput,
  DateRange,
  Establishment,
  EstablishmentInput,
  EventInput,
  Expense,
  ExpenseInput,
  ExpenseQuery,
  HoursReport,
  KEvent,
  Period,
  Role,
  Shift,
  ShiftInput,
  TimeEntry,
  TimeEntryChange,
  TimeEntryCreate,
  TimeEntryQuery,
  TimeEntryUpdate,
  TokenResponse,
  User,
  UserCreate,
  UserUpdate,
  Worker,
  WorkerDaysReport,
  WorkerRate,
  WorkerRateInput,
  WorkerWithUser,
  Zone,
} from './types'

/** "?from=2026-11-16&to=2026-11-22", or nothing when the range is open on both sides */
function rangeQuery(range: TimeEntryQuery & ExpenseQuery = {}): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  if (range.includeVoided) params.set('includeVoided', 'true')
  if (range.category) params.set('category', range.category)
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
  /** Owner and admin only: a worker never sees rates or costs, not even their own */
  rates: {
    /** Newest first */
    byWorker: (workerId: number) => request<WorkerRate[]>('GET', `/workers/${workerId}/rates`),
    create: (workerId: number, input: WorkerRateInput) => request<WorkerRate>('POST', `/workers/${workerId}/rates`, input),
    remove: (workerId: number, rateId: number) => request<void>('DELETE', `/workers/${workerId}/rates/${rateId}`),
  },
  timeEntries: {
    /** The signed-in worker's open entry; the API answers 204 when they are not clocked in */
    myOpen: async () => (await request<TimeEntry | undefined>('GET', '/time-entries/me/open')) ?? null,
    /** A worker clocks themselves in; the server sets the time */
    clockIn: (input: ClockInInput = {}) => request<TimeEntry>('POST', '/time-entries/clock-in', input),
    clockOut: (input: ClockOutInput = {}) => request<TimeEntry>('POST', '/time-entries/clock-out', input),
    /** Owner: records an entry for someone, open (clock them in now) or a whole past day */
    create: (input: TimeEntryCreate) => request<TimeEntry>('POST', '/time-entries', input),
    /**
     * Owner: clocks someone out now, kept in the history as CLOCKED_OUT. 409 when the entry has
     * been open for more than 24 hours: then it has to be corrected with the real time.
     */
    clockOutFor: (id: number, input: ClockOutForInput) => request<TimeEntry>('POST', `/time-entries/${id}/clock-out`, input),
    /** Owner: a correction; the reason is kept in the entry's history */
    update: (id: number, input: TimeEntryUpdate) => request<TimeEntry>('PUT', `/time-entries/${id}`, input),
    /** Owner: entries are voided, never deleted */
    voidEntry: (id: number, reason: string) => request<TimeEntry>('PUT', `/time-entries/${id}/void`, { reason }),
    /** Oldest change first */
    history: (id: number) => request<TimeEntryChange[]>('GET', `/time-entries/${id}/history`),
    /** Ordered by clockIn. The owner, or the worker on their own. */
    byWorker: (workerId: number, query?: TimeEntryQuery) =>
      request<TimeEntry[]>('GET', `/time-entries/worker/${workerId}${rangeQuery(query)}`),
    byEstablishment: (establishmentId: number, query?: TimeEntryQuery) =>
      request<TimeEntry[]>('GET', `/time-entries/establishment/${establishmentId}${rangeQuery(query)}`),
    /** Who is clocked in right now */
    open: (establishmentId: number) => request<TimeEntry[]>('GET', `/time-entries/establishment/${establishmentId}/open`),
  },
  reports: {
    /** Owner only: planned and worked hours and cost per person */
    hours: (establishmentId: number, period: Period) =>
      request<HoursReport>('GET', `/reports/establishment/${establishmentId}/hours${rangeQuery(period)}`),
    /** Day by day for one person. Costs are null when a worker asks for their own. */
    workerDays: (workerId: number, period: Period) =>
      request<WorkerDaysReport>('GET', `/reports/worker/${workerId}/days${rangeQuery(period)}`),
    hoursCsv: (establishmentId: number, period: Period) =>
      download(`/reports/establishment/${establishmentId}/hours.csv${rangeQuery(period)}`),
    /** The venue's record of working time: one row per entry */
    timeEntriesCsv: (establishmentId: number, period: Period) =>
      download(`/reports/establishment/${establishmentId}/time-entries.csv${rangeQuery(period)}`),
    workerTimeEntriesCsv: (workerId: number, period: Period) =>
      download(`/reports/worker/${workerId}/time-entries.csv${rangeQuery(period)}`),
    /** Owner only: sales, expenses, staff cost and margin, day by day, against the period before */
    summary: (establishmentId: number, period: Period) =>
      request<BusinessSummary>('GET', `/reports/establishment/${establishmentId}/summary${rangeQuery(period)}`),
    /** One row per day */
    summaryCsv: (establishmentId: number, period: Period) =>
      download(`/reports/establishment/${establishmentId}/summary.csv${rangeQuery(period)}`),
    /** One row per closing */
    cashClosingsCsv: (establishmentId: number, period: Period) =>
      download(`/reports/establishment/${establishmentId}/cash-closings.csv${rangeQuery(period)}`),
    /** One row per expense */
    expensesCsv: (establishmentId: number, period: Period) =>
      download(`/reports/establishment/${establishmentId}/expenses.csv${rangeQuery(period)}`),
  },
  /** Owner and admin only: the end-of-day cash count, one per venue and service day */
  cashClosings: {
    /** Newest service day first */
    byEstablishment: (establishmentId: number, range?: DateRange) =>
      request<CashClosing[]>('GET', `/cash-closings/establishment/${establishmentId}${rangeQuery(range)}`),
    get: (id: number) => request<CashClosing>('GET', `/cash-closings/${id}`),
    /** Starts as a draft; 409 when the day already has one or is in the future */
    create: (input: CashClosingInput) => request<CashClosing>('POST', '/cash-closings', input),
    /** 409 once closed */
    update: (id: number, input: CashClosingInput) => request<CashClosing>('PUT', `/cash-closings/${id}`, input),
    /** 409 when the difference is over the limit (5,00 € by default) and no reason is given, or it is closed already */
    close: (id: number, differenceReason?: string) =>
      request<CashClosing>('PUT', `/cash-closings/${id}/close`, differenceReason ? { differenceReason } : {}),
    /** Back to a draft; the reason (3 to 255 characters) is kept in the history */
    reopen: (id: number, reason: string) => request<CashClosing>('PUT', `/cash-closings/${id}/reopen`, { reason }),
    /** Drafts only */
    remove: (id: number) => request<void>('DELETE', `/cash-closings/${id}`),
    /** Oldest change first */
    history: (id: number) => request<CashClosingChange[]>('GET', `/cash-closings/${id}/history`),
  },
  /** Owner and admin only. A cash expense of a day whose closing is closed answers 409. */
  expenses: {
    /** Newest first */
    byEstablishment: (establishmentId: number, query?: ExpenseQuery) =>
      request<Expense[]>('GET', `/expenses/establishment/${establishmentId}${rangeQuery(query)}`),
    create: (input: ExpenseInput) => request<Expense>('POST', '/expenses', input),
    update: (id: number, input: ExpenseInput) => request<Expense>('PUT', `/expenses/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/expenses/${id}`),
  },
}
