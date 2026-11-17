// The API writes its error messages in English. The ones a person meets while clocking in and
// out are worded in the app's language here; any other message is shown as the API wrote it.
// The cash closing and expense conflicts screens act on come with a stable `code`, read first;
// their messages are still read for an API that does not send it.
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

/** The worker had nothing open to clock out */
export function isNoOpenEntry(message: string): boolean {
  return /no open time entry/i.test(message)
}

/** The entry the owner was clocking out had been clocked out already, by someone else */
export function isAlreadyClockedOut(message: string): boolean {
  return /already clocked out/i.test(message)
}
