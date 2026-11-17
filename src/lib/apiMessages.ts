// The API writes its error messages in English. The ones a person meets while clocking in and
// out are worded in the app's language here; any other message is shown as the API wrote it.
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
}

/** The message in the current language, or null when the app does not know it */
export function knownApiMessage(message: string, t: Messages): string | null {
  const key = KNOWN[message.trim()]
  return key ? t.apiErrors[key] : null
}

/** "Open for more than 24 hours": it cannot be clocked out, only corrected with the real time */
export function isOpenTooLong(message: string): boolean {
  return /open for more than 24 hours/i.test(message)
}

/** The worker had nothing open to clock out */
export function isNoOpenEntry(message: string): boolean {
  return /no open time entry/i.test(message)
}

/** The entry the owner was clocking out had been clocked out already, by someone else */
export function isAlreadyClockedOut(message: string): boolean {
  return /already clocked out/i.test(message)
}
