// The API writes its error messages in English. The ones a person meets while clocking in and
// out are worded in the app's language here; any other message is shown as the API wrote it.
// The cash closing, expense and inventory conflicts screens act on come with a stable `code`, read
// first; their messages are still read for an API that does not send it. The inventory's 400s
// that name a field (fieldErrors) are worded here too.
import type { Messages } from './i18n'

type ApiMessageKey = keyof Messages['apiErrors']

/** Matched exactly, as the API writes them */
const KNOWN: Record<string, ApiMessageKey> = {
  'You already have an open time entry': 'openEntryExists',
  'You have no open time entry': 'noOpenEntry',
  'The time entry overlaps another time entry of this worker': 'overlap',
  'Clock-in cannot be in the future': 'clockInFuture',
  'Clock-out must be after clock-in': 'clockOutBeforeIn',
  'A time entry cannot last more than 24 hours': 'tooLong',
  'A voided time entry cannot be corrected': 'voidedNotCorrectable',
  'The time entry is already voided': 'alreadyVoided',
  'Clock-out cannot be in the future': 'clockOutFuture',
  'The break cannot be longer than the time between clock-in and clock-out': 'breakTooLong',
  'This time entry has been open for more than 24 hours; ask a manager to correct it': 'openTooLong',
  'Your account is not linked to an establishment': 'noVenue',
  // The owner clocking someone out
  'A voided time entry cannot be clocked out': 'voidedNotClockable',
  'The time entry is already clocked out': 'alreadyClockedOut',
  // Cash closings and expenses
  'The business date cannot be in the future': 'futureDay',
  'The expense date cannot be in the future': 'futureDay',
  // Inventory
  'The movement date cannot be in the future': 'futureDay',
  'The count date cannot be in the future': 'futureDay',
  'The received date cannot be in the future': 'futureDay',
  // Any request the account may not make, such as a worker's on the inventory
  'You do not have permission to perform this action': 'forbidden',
  // Any list of a period
  'The date range cannot be longer than 366 days': 'rangeTooLong',
  "'from' must not be after 'to'": 'rangeOrder',
  'A cash closing that has been closed before cannot be deleted; correct it and close it again instead': 'closedBeforeNoDelete',
}

/** The message in the current language, or null when the app does not know it */
export function knownApiMessage(message: string, t: Messages): string | null {
  const key = KNOWN[message.trim()]
  return key ? t.apiErrors[key] : null
}

/** The 409s of cash closings and expenses, by the `code` the API sends with them */
export type CashRefusal =
  | 'CASH_CLOSING_EXISTS'
  | 'CASH_CLOSING_CLOSED'
  | 'CASH_CLOSING_NOT_CLOSED'
  | 'CASH_CLOSING_WAS_CLOSED'
  | 'DIFFERENCE_REASON_REQUIRED'
  | 'CASH_NOT_COUNTED'
  | 'CASH_DAY_CLOSED'
  | 'FUTURE_DATE'

/** How each one is worded when its message is not one the app knows */
const CASH_REFUSALS: Record<CashRefusal, ApiMessageKey> = {
  CASH_CLOSING_EXISTS: 'closingExists',
  CASH_CLOSING_CLOSED: 'closingClosed',
  CASH_CLOSING_NOT_CLOSED: 'closingNotClosed',
  CASH_CLOSING_WAS_CLOSED: 'closedBeforeNoDelete',
  DIFFERENCE_REASON_REQUIRED: 'reasonRequired',
  CASH_NOT_COUNTED: 'notCounted',
  CASH_DAY_CLOSED: 'dayClosed',
  FUTURE_DATE: 'futureDay',
}

/** The parts of an API error the refusals are read from */
interface Refusal {
  message: string
  code?: string
  details?: Record<string, string>
}

const isCashRefusal = (code: string): code is CashRefusal => code in CASH_REFUSALS

/**
 * Which cash closing or expense refusal an error is: by its `code` when the API sends one (and
 * then only by it), else by its message, as older APIs word them. null for anything else.
 */
export function cashRefusal(error: Refusal): CashRefusal | null {
  if (error.code) return isCashRefusal(error.code) ? error.code : null
  const message = error.message
  if (isClosedBefore(message)) return 'CASH_CLOSING_WAS_CLOSED'
  if (/already closed|closed cash closing cannot/i.test(message)) return 'CASH_CLOSING_CLOSED'
  if (/is not closed/i.test(message)) return 'CASH_CLOSING_NOT_CLOSED'
  if (isReasonRequired(message)) return 'DIFFERENCE_REASON_REQUIRED'
  if (isClosingTaken(message)) return 'CASH_CLOSING_EXISTS'
  if (/cannot be in the future/i.test(message) && /business date|expense date/i.test(message)) return 'FUTURE_DATE'
  if (closedCashDay(message)) return 'CASH_DAY_CLOSED'
  return null
}

/** The day a refusal is about: `details.date` when the API sends it, else the date its message names */
export function refusalDay(error: Refusal): string | null {
  const date = error.details?.date
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return /\d{4}-\d{2}-\d{2}/.exec(error.message)?.[0] ?? null
}

/** A cash closing or expense refusal in the current language, by its code; null for any other error */
export function cashRefusalMessage(error: Refusal, t: Messages): string | null {
  const refusal = error.code && isCashRefusal(error.code) ? error.code : null
  return refusal ? t.apiErrors[CASH_REFUSALS[refusal]] : null
}

/** "Open for more than 24 hours": it cannot be clocked out, only corrected with the real time */
export function isOpenTooLong(message: string): boolean {
  return /open for more than 24 hours/i.test(message)
}

/** By its message, for an API without codes: a closing's 409 for a difference over the limit and no reason */
export function isReasonRequired(message: string): boolean {
  return /differenceReason|difference of/i.test(message)
}

/** By its message, for an API without codes: a closing's 409 on creating it, as the day already has one */
export function isClosingTaken(message: string): boolean {
  return /already exists/i.test(message)
}

/** By its message, for an API without codes: a closing's 409 on deleting it, as it was closed once */
export function isClosedBefore(message: string): boolean {
  return /closed before/i.test(message)
}

/**
 * By its message, for an API without codes: an expense's 409 because that day's cash closing is
 * closed. The API names the day ("The cash closing of 2026-11-14 is closed; reopen it ..."), which
 * is returned when present. Prefer cashRefusal and refusalDay, which read the code first.
 */
export function closedCashDay(message: string): { day: string | null } | null {
  if (!/cash closing/i.test(message) || !/closed|reopen/i.test(message)) return null
  return { day: /\d{4}-\d{2}-\d{2}/.exec(message)?.[0] ?? null }
}

/** The inventory's 409s, by the `code` the API sends with them */
export const INVENTORY_REFUSALS = [
  'SUPPLIER_NAME_TAKEN',
  'SUPPLIER_HAS_ORDERS',
  'PRODUCT_NAME_TAKEN',
  'PRODUCT_INACTIVE',
  'PRODUCT_UNIT_LOCKED',
  'PRODUCT_HAS_HISTORY',
  'OTHER_ESTABLISHMENT',
  'PURCHASE_ORDER_WRONG_STATUS',
  'PURCHASE_ORDER_NO_TOTAL',
  'PURCHASE_ORDER_NOTHING_RECEIVED',
  'EXPENSE_FROM_PURCHASE_ORDER',
] as const

export type InventoryRefusal = (typeof INVENTORY_REFUSALS)[number]

const isInventoryRefusal = (code: string): code is InventoryRefusal => (INVENTORY_REFUSALS as readonly string[]).includes(code)

/**
 * Which inventory refusal an error is: by its `code` when the API sends one (and then only by it),
 * else by its message as the API words it. null for anything else.
 */
export function inventoryRefusal(error: Refusal): InventoryRefusal | null {
  if (error.code) return isInventoryRefusal(error.code) ? error.code : null
  const message = error.message
  if (/created when purchase order #\d+ was received/i.test(message)) return 'EXPENSE_FROM_PURCHASE_ORDER'
  if (/delete a supplier/i.test(message)) return 'SUPPLIER_HAS_ORDERS'
  if (/delete a product/i.test(message)) return 'PRODUCT_HAS_HISTORY'
  if (/is inactive; activate it/i.test(message)) return 'PRODUCT_INACTIVE'
  if (/belongs to another establishment/i.test(message)) return 'OTHER_ESTABLISHMENT'
  if (/purchase order can be .+; this one is/i.test(message)) return 'PURCHASE_ORDER_WRONG_STATUS'
  if (/nothing was received/i.test(message)) return 'PURCHASE_ORDER_NOTHING_RECEIVED'
  if (/no total to record as an expense/i.test(message)) return 'PURCHASE_ORDER_NO_TOTAL'
  if (/supplier named .+ already exists/i.test(message)) return 'SUPPLIER_NAME_TAKEN'
  if (/product named .+ already exists/i.test(message)) return 'PRODUCT_NAME_TAKEN'
  if (/unit of a product/i.test(message)) return 'PRODUCT_UNIT_LOCKED'
  return null
}

/** The purchase order an expense came from, from the error's details, else from its message */
export function refusalOrder(error: Refusal): number | null {
  const id = Number(error.details?.purchaseOrderId ?? /purchase order #(\d+)/i.exec(error.message)?.[1])
  return Number.isInteger(id) && id > 0 ? id : null
}

/** An inventory refusal in the current language; null for any other error */
export function inventoryRefusalMessage(error: Refusal, t: Messages): string | null {
  const refusal = inventoryRefusal(error)
  if (!refusal) return null
  const e = t.inventoryErrors
  switch (refusal) {
    case 'PRODUCT_INACTIVE':
      return e.PRODUCT_INACTIVE(/'(.+)'/.exec(error.message)?.[1] ?? null)
    case 'PURCHASE_ORDER_WRONG_STATUS': {
      const status = /this one is (DRAFT|ORDERED|RECEIVED|CANCELLED)/.exec(error.message)?.[1] as keyof Messages['orderStatus'] | undefined
      return e.PURCHASE_ORDER_WRONG_STATUS(status ? t.orderStatus[status] : null)
    }
    case 'EXPENSE_FROM_PURCHASE_ORDER':
      return e.EXPENSE_FROM_PURCHASE_ORDER(refusalOrder(error))
    default:
      return e[refusal]
  }
}

/**
 * A 400 whose fieldErrors the inventory's screens can word: a product twice in a count or an order,
 * a line twice in a receipt, a cost on a movement that is not a purchase, the expense's missing
 * choice or payment method, a quantity or an amount with too many digits, and a quantity that would
 * leave the stock out of range. null when none of them is there.
 */
export function fieldErrorsMessage(fieldErrors: Record<string, string>, t: Messages): string | null {
  const e = t.inventoryErrors
  const said = new Set<string>()
  for (const [field, message] of Object.entries(fieldErrors)) {
    const leaf = field.replace(/^.*\./, '')
    if (/same product twice/i.test(message)) said.add(field === 'items' ? e.countRepeated : e.orderRepeated)
    else if (/same line twice/i.test(message)) said.add(e.lineRepeated)
    else if (leaf === 'unitCost' && /PURCHASE/.test(message)) said.add(e.costOnlyOnPurchase)
    else if (field === 'createExpense') said.add(e.createExpenseMissing)
    else if (field === 'paymentMethod') said.add(e.paymentMethodMissing)
    else if (/would (record a movement|leave a stock)/i.test(message)) said.add(e.outOfRange)
    else if (/<9\D+<3/.test(message)) said.add(e.quantityTooLong)
    else if (/<8\D+<2/.test(message)) said.add(e.amountTooLong)
  }
  return said.size ? [...said].join(' ') : null
}

/** The worker had nothing open to clock out */
export function isNoOpenEntry(message: string): boolean {
  return /no open time entry/i.test(message)
}

/** The entry the owner was clocking out had been clocked out already, by someone else */
export function isAlreadyClockedOut(message: string): boolean {
  return /already clocked out/i.test(message)
}
