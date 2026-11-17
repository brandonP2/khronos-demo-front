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
  /** IANA zone, "Europe/Madrid" by default. Clock-in times are shown in it, not in the device's zone */
  timeZone: string
}

export interface EstablishmentInput {
  establishmentName: string
  establishmentAddress: string
  ownerId: number
  /** Optional; the API uses "Europe/Madrid" when it is left out */
  timeZone?: string
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

/**
 * Date is YYYY-MM-DD, times are HH:mm or HH:mm:ss. `date` is the service day, the day the
 * shift starts: an end at or before the start is on the next day (18:00–02:00 is 8 hours).
 */
export interface Shift {
  id: number
  workerId: number
  date: string
  startTime: string
  endTime: string
  zoneId: number
  endsNextDay: boolean
  durationMinutes: number
}

/** The request keeps its shape: an endTime at or before startTime means the next day */
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

/** Inclusive YYYY-MM-DD bounds; required by the reports, at most 366 days */
export interface Period {
  from: string
  to: string
}

/* ---------- Hourly rates (staff cost). Only the owner and admins see them. ---------- */

/** A rate applies from effectiveFrom until the next one starts. Past rates are never edited. */
export interface WorkerRate {
  id: number
  workerId: number
  /** Euros per hour, two decimals */
  hourlyRate: number
  effectiveFrom: string
  /** ISO instant */
  createdAt: string
}

export interface WorkerRateInput {
  hourlyRate: number
  effectiveFrom: string
}

/* ---------- Time entries (clocking in and out) ---------- */

export type TimeEntrySource = 'WORKER' | 'MANAGER'

export type TimeEntryStatus = 'OPEN' | 'CLOSED' | 'VOIDED'

/**
 * One clock-in with its clock-out. Instants are ISO-8601 in UTC ("2026-11-20T17:02:00Z") and
 * are shown in the venue's time zone. Entries are never deleted: they are corrected or voided,
 * and every change is kept in their history.
 */
export interface TimeEntry {
  id: number
  workerId: number
  workerFirstName: string
  workerLastName: string
  establishmentId: number
  /** Service day: the shift's date when the entry was matched to one */
  businessDate: string
  clockIn: string
  /** null while the person is still in */
  clockOut: string | null
  breakMinutes: number
  /** (clockOut - clockIn) - breakMinutes; null while open */
  workedMinutes: number | null
  shiftId: number | null
  source: TimeEntrySource
  status: TimeEntryStatus
  /** Corrected at least once after it was created */
  isEdited: boolean
  /** Open for more than 16 hours: the clock-out was most likely forgotten */
  isStale: boolean
  note: string | null
}

export interface ClockInInput {
  note?: string
}

export interface ClockOutInput {
  /** 0 to 600; when left out the entry keeps its break, 0 by default */
  breakMinutes?: number
  note?: string
}

/** The owner clocks someone out now; the server sets the time, as when the worker does it */
export interface ClockOutForInput {
  /** 0 to 600; when left out the entry keeps its break */
  breakMinutes?: number
  /** Required, 3 to 255 characters; kept in the entry's history */
  reason: string
}

/** An owner records an entry for someone: "clock them in now" (no clockOut) or a past day */
export interface TimeEntryCreate {
  workerId: number
  clockIn: string
  clockOut?: string | null
  breakMinutes?: number
  /** Required, 3 to 255 characters */
  reason: string
}

export interface TimeEntryUpdate {
  clockIn: string
  clockOut: string | null
  breakMinutes: number
  reason: string
}

export type TimeEntryAction = 'CREATED' | 'CLOCKED_OUT' | 'CORRECTED' | 'VOIDED'

/** clockIn, clockOut and breakMinutes are the values after the change */
export interface TimeEntryChange {
  id: number
  action: TimeEntryAction
  changedAt: string
  changedByUserId: number
  changedByName: string
  reason: string | null
  clockIn: string
  clockOut: string | null
  breakMinutes: number
}

/** Time entry listings filter on businessDate; voided entries only come back when asked for */
export interface TimeEntryQuery extends DateRange {
  includeVoided?: boolean
}

/* ---------- Reports ---------- */

export interface HoursReportRow {
  workerId: number
  firstName: string
  lastName: string
  isActive: boolean
  plannedMinutes: number
  workedMinutes: number
  /** worked - planned */
  differenceMinutes: number
  shiftsCount: number
  entriesCount: number
  /** Entries matched to a shift that started more than 10 minutes late */
  lateCount: number
  /** Shifts already over with no entry matched to them */
  missedShiftsCount: number
  /** Entries with no shift */
  unplannedCount: number
  openEntriesCount: number
  /** null when the person has no rate */
  currentHourlyRate: number | null
  plannedCost: number | null
  actualCost: number | null
}

export interface HoursReport {
  from: string
  to: string
  currency: 'EUR'
  workers: HoursReportRow[]
  /** Costs add up the people that have a rate */
  totals: {
    plannedMinutes: number
    workedMinutes: number
    differenceMinutes: number
    plannedCost: number | null
    actualCost: number | null
    /** actualCost is known but leaves out someone who worked with no rate (from delivery 3 on) */
    costPartial?: boolean
    /** People who worked in the period and whose actual cost is unknown (from delivery 3 on) */
    workersWithoutCost?: number
  }
}

export type DayStatus = 'OK' | 'LATE' | 'MISSED' | 'UNPLANNED' | 'OPEN' | 'UPCOMING'

export interface WorkerDay {
  date: string
  plannedMinutes: number
  workedMinutes: number
  status: DayStatus
  shifts: Shift[]
  entries: TimeEntry[]
}

/** Only days with a shift or an entry are listed. Costs are null when a worker asks for their own. */
export interface WorkerDaysReport {
  workerId: number
  firstName: string
  lastName: string
  from: string
  to: string
  plannedMinutes: number
  workedMinutes: number
  differenceMinutes: number
  plannedCost: number | null
  actualCost: number | null
  days: WorkerDay[]
}

/* ---------- Cash closing, expenses and the business summary (owner and admin only) ---------- */

export type CashClosingStatus = 'DRAFT' | 'CLOSED'

/**
 * What the owner types at the end of service. Amounts are euros with two decimals, never
 * negative. establishmentId and businessDate are only read on creation; a PUT ignores them.
 */
export interface CashClosingInput {
  establishmentId: number
  /** Service day, not in the future */
  businessDate: string
  /** Cash in the till before service */
  openingFloat: number
  cashSales: number
  cardSales: number
  /** Bizum, vouchers and the like */
  otherSales: number
  /** Cash taken out of the till during the day */
  cashWithdrawals: number
  /** null while the cash has not been counted: a draft can be saved without it, the day cannot be closed */
  countedCash: number | null
  /** For information only; not part of sales */
  tips: number | null
  /** At most 500 characters */
  notes: string | null
}

/** One closing per venue and service day. The figures are worked out by the API, frozen once closed. */
export interface CashClosing {
  id: number
  establishmentId: number
  businessDate: string
  status: CashClosingStatus
  openingFloat: number
  cashSales: number
  cardSales: number
  otherSales: number
  cashWithdrawals: number
  /** null while a draft's cash has not been counted; a closed closing always has it */
  countedCash: number | null
  tips: number | null
  notes: string | null
  /** The day's expenses paid in cash */
  cashExpenses: number
  /** cashSales + cardSales + otherSales */
  totalSales: number
  /** openingFloat + cashSales - cashExpenses - cashWithdrawals */
  expectedCash: number
  /** countedCash - expectedCash; negative when cash is missing, null while the cash has not been counted */
  difference: number | null
  differenceReason: string | null
  closedAt: string | null
  closedByName: string | null
  createdAt: string
  updatedAt: string
}

export type CashClosingAction = 'CREATED' | 'UPDATED' | 'CLOSED' | 'REOPENED'

/** The values right after the change; countedCash and difference are null before the cash was counted */
export interface CashClosingChange {
  id: number
  action: CashClosingAction
  changedAt: string
  changedByUserId: number
  changedByName: string
  reason: string | null
  totalSales: number
  countedCash: number | null
  difference: number | null
}

export type ExpenseCategory = 'SUPPLIES' | 'RENT' | 'UTILITIES' | 'PAYROLL' | 'MAINTENANCE' | 'MARKETING' | 'TAXES' | 'OTHER'

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'

/** establishmentId is only read on creation */
export interface ExpenseInput {
  establishmentId: number
  /** Service day, not in the future */
  date: string
  category: ExpenseCategory
  /** 1 to 150 characters */
  description: string
  /** At most 100 characters */
  supplier: string | null
  /** Above 0 */
  amount: number
  paymentMethod: PaymentMethod
  /** At most 500 characters */
  notes: string | null
}

export interface Expense {
  id: number
  establishmentId: number
  date: string
  category: ExpenseCategory
  description: string
  supplier: string | null
  amount: number
  paymentMethod: PaymentMethod
  notes: string | null
  createdAt: string
  createdByName: string
  /**
   * The purchase order whose receipt created this expense; null (or missing, from an API before
   * the inventory) otherwise. Such an expense is deleted, never edited: PUT answers 409
   * EXPENSE_FROM_PURCHASE_ORDER
   */
  purchaseOrderId?: number | null
}

/** Every filter is optional; the list comes newest first */
export interface ExpenseQuery extends DateRange {
  category?: ExpenseCategory
}

/** MISSING: there was activity (a shift or an entry) and no closing; NONE: neither */
export type ClosingDayStatus = 'CLOSED' | 'DRAFT' | 'MISSING' | 'NONE'

export interface SummaryDay {
  date: string
  sales: number
  expenses: number
  /** null when the period's laborCost is null */
  laborCost: number | null
  /** Like the totals' grossMargin, with the day's own figures */
  margin: number
  closingStatus: ClosingDayStatus
  /** null without a closing, or while its cash has not been counted */
  cashDifference: number | null
}

/**
 * The staff cost a margin takes off: HOURS is laborCost, the hours worked at each one's rate;
 * PAYROLL_EXPENSES is the PAYROLL expenses, when no one's cost from the hours is known
 */
export type LaborCostSource = 'HOURS' | 'PAYROLL_EXPENSES'

export interface SummaryTotals {
  /** From the period's closings, in any status */
  sales: number
  cashSales: number
  cardSales: number
  otherSales: number
  tips: number
  /** Every expense of the period, payroll included */
  expenses: number
  payrollExpenses: number
  /** Worked hours times the rate in force; null when no one's cost is known */
  laborCost: number | null
  /** laborCost is known but leaves out someone who worked with no rate */
  laborCostPartial: boolean
  /** People who worked in the period and whose cost is unknown, left out of laborCost */
  workersWithoutCost: number
  plannedLaborCost: number | null
  /** sales - (expenses - payrollExpenses) - (laborCost ?? payrollExpenses); can be negative */
  grossMargin: number
  /** Which staff cost grossMargin took off */
  laborCostSource: LaborCostSource
  /** laborCost / sales * 100, one decimal; null when there are no sales or no labor cost */
  laborCostPercent: number | null
  /** Sum of the differences of the CLOSED days */
  cashDifference: number
  /** Sum of the differences the drafts show now (counted ones only): provisional until they are closed */
  draftCashDifference: number
  closedDays: number
  draftDays: number
  /** Days before today with a shift or an entry and no closing */
  missingClosingDays: number
}

/** The period right before, of the same length */
export interface SummaryPrevious {
  from: string
  to: string
  sales: number
  expenses: number
  laborCost: number | null
  grossMargin: number
  /** Which staff cost this period's grossMargin took off */
  laborCostSource: LaborCostSource
}

export interface BusinessSummary {
  from: string
  to: string
  currency: 'EUR'
  totals: SummaryTotals
  /** One per day of the period, oldest first */
  days: SummaryDay[]
  /** Only categories with an amount, largest first */
  expensesByCategory: { category: ExpenseCategory; amount: number }[]
  previous: SummaryPrevious
}

/* ---------- Inventory: suppliers, products, stock, counts and purchase orders (owner and admin only) ---------- */

/** establishmentId is only sent on creation */
export interface SupplierInput {
  establishmentId?: number
  /** 1 to 100 characters, unique in the venue (case does not matter) */
  name: string
  /** At most 30 characters */
  phone: string | null
  email: string | null
  /** At most 500 characters */
  notes: string | null
}

export interface Supplier {
  id: number
  establishmentId: number
  name: string
  phone: string | null
  email: string | null
  notes: string | null
}

/** SOFT_DRINKS includes water; SUPPLIES is material such as napkins, ice and cleaning */
export type ProductCategory = 'SPIRITS' | 'BEER' | 'WINE' | 'SOFT_DRINKS' | 'COFFEE' | 'FOOD' | 'SUPPLIES' | 'OTHER'

/** How a product is counted. There are no conversions between units. */
export type StockUnit = 'BOTTLE' | 'UNIT' | 'KG' | 'L' | 'BOX' | 'KEG'

/** establishmentId is only sent on creation. The unit cannot change once the product has movements (409). */
export interface ProductInput {
  establishmentId?: number
  /** 1 to 100 characters, unique in the venue (case does not matter) */
  name: string
  category: ProductCategory
  unit: StockUnit
  /** 0 or more */
  minStock: number | null
  /** Cost per unit, 0 or more */
  unitCost: number | null
  supplierId: number | null
}

/** The stock is never edited: it is the sum of the product's movements */
export interface Product {
  id: number
  establishmentId: number
  name: string
  category: ProductCategory
  unit: StockUnit
  minStock: number | null
  /** The last known cost per unit; updated when purchases with a cost come in */
  unitCost: number | null
  supplierId: number | null
  supplierName: string | null
  isActive: boolean
  /** Up to three decimals; can be negative when a purchase was not recorded */
  currentStock: number
  /** currentStock × the cost per unit now; null with no cost, 0 when the stock is 0 or less */
  stockValue: number | null
  /** minStock != null && currentStock <= minStock */
  isLowStock: boolean
}

/** COUNT is only made by a physical count */
export type StockMovementType = 'PURCHASE' | 'WASTE' | 'CONSUMPTION' | 'ADJUSTMENT' | 'COUNT'

export type ManualMovementType = Exclude<StockMovementType, 'COUNT'>

export interface StockMovementInput {
  productId: number
  type: ManualMovementType
  /** Above 0 for PURCHASE, WASTE and CONSUMPTION (the type gives the sign); not 0 and signed for ADJUSTMENT */
  quantity: number
  /** PURCHASE only; when sent it becomes the product's cost per unit */
  unitCost: number | null
  /** Required (3 to 255 characters) for WASTE and ADJUSTMENT */
  reason: string | null
  /** Service day, not in the future; today on the venue's clock when null */
  date: string | null
}

/** Movements are never changed or deleted: a mistake is corrected with an adjustment */
export interface StockMovement {
  id: number
  productId: number
  productName: string
  unit: StockUnit
  type: StockMovementType
  /** Signed: positive comes in, negative goes out */
  quantity: number
  /** The cost per unit applied to the movement */
  unitCost: number | null
  /** |quantity| × unitCost */
  value: number | null
  reason: string | null
  date: string
  /** ISO instant */
  createdAt: string
  createdByName: string
  purchaseOrderId: number | null
  /**
   * The product's stock right after this movement, when it was recorded: a movement recorded later
   * with an earlier day does not change it
   */
  stockAfter: number
}

/** Every filter is optional; from and to apply to `date`, inclusive. Newest first. */
export interface StockMovementQuery extends DateRange {
  productId?: number
  type?: StockMovementType
}

/** A physical count: one COUNT movement per item, countedQuantity - currentStock, in one transaction */
export interface StockCountInput {
  establishmentId: number
  date: string | null
  /** At most 255 characters; becomes each movement's reason */
  notes: string | null
  /** 1 to 500 items, no product twice */
  items: { productId: number; countedQuantity: number }[]
}

export type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderLineInput {
  productId: number
  /** Above 0 */
  quantity: number
  unitCost: number | null
}

/** Creating and editing a draft. establishmentId is only sent on creation. */
export interface PurchaseOrderInput {
  establishmentId?: number
  supplierId: number
  expectedDate: string | null
  /** At most 500 characters */
  notes: string | null
  /** 1 to 200 lines, no product twice, active products of the venue */
  lines: PurchaseOrderLineInput[]
}

export interface PurchaseOrderLine {
  id: number
  productId: number
  productName: string
  unit: StockUnit
  quantity: number
  unitCost: number | null
  receivedQuantity: number | null
  /** (received quantity once received, else the ordered one) × unitCost */
  lineTotal: number | null
}

export interface PurchaseOrder {
  id: number
  establishmentId: number
  supplierId: number
  supplierName: string
  status: PurchaseOrderStatus
  /** Set when it is marked as ordered */
  orderDate: string | null
  expectedDate: string | null
  receivedDate: string | null
  notes: string | null
  lines: PurchaseOrderLine[]
  /** Sum of the line totals; null when no line has a cost */
  total: number | null
  /** The expense created on receiving it, if one was asked for */
  expenseId: number | null
  createdAt: string
  createdByName: string
}

/** Every filter is optional; from and to apply to the creation date. Newest first. */
export interface PurchaseOrderQuery extends DateRange {
  status?: PurchaseOrderStatus
}

/**
 * Receiving an ordered order, all its lines included, in one transaction: a PURCHASE movement per
 * line received, the products' costs updated and, when asked for, an expense of the total
 * (SUPPLIES, dated receivedDate). A cash expense on a day whose till is closed answers 409 and
 * nothing is received.
 */
export interface ReceiveOrderInput {
  receivedDate: string | null
  lines: { lineId: number; receivedQuantity: number; unitCost: number | null }[]
  createExpense: boolean
  /** Required when createExpense is true */
  paymentMethod: PaymentMethod | null
}

/**
 * The stock now (stockValue, the counts and lowStock) and what happened in the period (purchases,
 * waste and count differences, valued with the cost kept on each movement; movements with no
 * cost do not add up).
 */
export interface InventoryReport {
  from: string
  to: string
  currency: 'EUR'
  /** Active products with a cost and stock above 0, each at its cost per unit now */
  stockValue: number
  /** Active products */
  productsCount: number
  lowStockCount: number
  negativeStockCount: number
  purchasesValue: number
  /** Positive */
  wasteValue: number
  /** Net value of the period's counts; negative when goods were missing */
  countDifferenceValue: number
  /** Largest value first, at most 10 */
  wasteByProduct: { productId: number; productName: string; unit: StockUnit; quantity: number; value: number | null }[]
  lowStock: {
    productId: number
    productName: string
    unit: StockUnit
    currentStock: number
    minStock: number
    supplierId: number | null
    supplierName: string | null
  }[]
}

export interface ApiErrorBody {
  timestamp?: string
  status: number
  error?: string
  message: string
  path?: string
  fieldErrors?: Record<string, string>
  /**
   * Machine-readable reason, sent by newer APIs: ACCOUNT_DISABLED, INVALID_CREDENTIALS, TOO_MANY_ATTEMPTS,
   * SESSION_EXPIRED, and the cash closing and expense conflicts (see CashRefusal in lib/apiMessages)
   */
  code?: string
  /** What a coded error is about, such as `{ date: "2026-11-14" }` for CASH_DAY_CLOSED and CASH_CLOSING_EXISTS */
  details?: Record<string, string>
}
