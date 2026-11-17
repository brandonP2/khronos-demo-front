import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { errorMessage } from '../components/ui'
import {
  cashRefusal,
  closedCashDay,
  isAlreadyClockedOut,
  isClosingTaken,
  isNoOpenEntry,
  isOpenTooLong,
  isReasonRequired,
  knownApiMessage,
  refusalDay,
} from './apiMessages'
import { dictionaries } from './i18n'

const { es, en } = dictionaries

describe('API messages', () => {
  it('words every clock-in rule of the API in Spanish', () => {
    const messages = [
      'You already have an open time entry',
      'You have no open time entry',
      'The time entry overlaps another time entry of this worker',
      'Clock-out must be after clock-in',
      'A time entry cannot last more than 24 hours',
      'A voided time entry cannot be corrected',
      'The time entry is already voided',
      'Clock-out cannot be in the future',
      'The break cannot be longer than the time between clock-in and clock-out',
      'This time entry has been open for more than 24 hours; ask a manager to correct it',
      'Your account is not linked to an establishment',
      'A voided time entry cannot be clocked out',
      'The time entry is already clocked out',
    ]
    for (const message of messages) {
      const spanish = knownApiMessage(message, es)
      expect(spanish, message).toBeTruthy()
      expect(spanish).not.toBe(message)
      expect(knownApiMessage(message, en)).toBeTruthy()
    }
  })

  it('shows any other message as the API wrote it', () => {
    expect(knownApiMessage('Something new', es)).toBeNull()
    expect(errorMessage(new ApiError({ status: 409, message: 'Something new' }), es)).toBe('Something new')
    expect(errorMessage(new ApiError({ status: 409, message: 'Clock-out must be after clock-in' }), es)).toBe(
      'La salida tiene que ser posterior a la entrada.',
    )
  })

  it('recognises the clock-out refusals screens act on', () => {
    expect(isOpenTooLong('This time entry has been open for more than 24 hours; ask a manager to correct it')).toBe(true)
    expect(isOpenTooLong('A time entry cannot last more than 24 hours')).toBe(false)
    expect(isNoOpenEntry('You have no open time entry')).toBe(true)
    expect(isNoOpenEntry('You already have an open time entry')).toBe(false)
    expect(isAlreadyClockedOut('The time entry is already clocked out')).toBe(true)
    expect(isAlreadyClockedOut('A voided time entry cannot be clocked out')).toBe(false)
  })

  it('tells the cash closing and expense refusals apart', () => {
    expect(isReasonRequired('The cash difference of -7.50 EUR is larger than the 5.00 EUR allowed without a reason; send a differenceReason to close the day')).toBe(true)
    expect(isReasonRequired('The cash closing is already closed')).toBe(false)
    expect(isClosingTaken('A cash closing already exists for 2026-11-16 at this establishment; edit that one instead')).toBe(true)
    expect(closedCashDay('The cash closing of 2026-11-14 is closed; reopen it to add, change or delete cash expenses of that day')).toEqual({ day: '2026-11-14' })
    expect(closedCashDay('The expense date cannot be in the future')).toBeNull()
  })

  it('reads the cash closing and expense refusals by their code first', () => {
    expect(cashRefusal({ message: 'Write a reason', code: 'DIFFERENCE_REASON_REQUIRED' })).toBe('DIFFERENCE_REASON_REQUIRED')
    expect(cashRefusal({ message: 'Not counted', code: 'CASH_NOT_COUNTED' })).toBe('CASH_NOT_COUNTED')
    // The code wins over the message, and a code the app does not know is nothing it acts on
    expect(cashRefusal({ message: 'The cash closing is already closed', code: 'CASH_CLOSING_WAS_CLOSED' })).toBe('CASH_CLOSING_WAS_CLOSED')
    expect(cashRefusal({ message: 'A cash closing already exists for 2026-11-16 at this establishment', code: 'SOMETHING_NEW' })).toBeNull()
    expect(cashRefusal({ message: 'You have no open time entry' })).toBeNull()
  })

  it('reads them by their message from an API without codes', () => {
    const cases: [string, string][] = [
      ['A cash closing already exists for 2026-11-16 at this establishment; edit that one instead', 'CASH_CLOSING_EXISTS'],
      ['A closed cash closing cannot be edited; reopen it first', 'CASH_CLOSING_CLOSED'],
      ['The cash closing is already closed', 'CASH_CLOSING_CLOSED'],
      ['A closed cash closing cannot be deleted; reopen it to correct it instead', 'CASH_CLOSING_CLOSED'],
      ['The cash closing is not closed', 'CASH_CLOSING_NOT_CLOSED'],
      ['A cash closing that has been closed before cannot be deleted; correct it and close it again instead', 'CASH_CLOSING_WAS_CLOSED'],
      ['The cash difference of -7.50 EUR is larger than the 5.00 EUR allowed without a reason; send a differenceReason to close the day', 'DIFFERENCE_REASON_REQUIRED'],
      ['The cash closing of 2026-11-14 is closed; reopen it to add, change or delete cash expenses of that day', 'CASH_DAY_CLOSED'],
      ['The business date cannot be in the future', 'FUTURE_DATE'],
      ['The expense date cannot be in the future', 'FUTURE_DATE'],
    ]
    for (const [message, refusal] of cases) expect(cashRefusal({ message }), message).toBe(refusal)
    expect(cashRefusal({ message: 'Clock-in cannot be in the future' })).toBeNull()
  })

  it('takes the day of a refusal from its details, else from its message', () => {
    expect(refusalDay({ message: 'The cash closing of 2026-11-14 is closed', details: { date: '2026-11-13' } })).toBe('2026-11-13')
    expect(refusalDay({ message: 'The cash closing of 2026-11-14 is closed' })).toBe('2026-11-14')
    expect(refusalDay({ message: 'That day is closed', details: {} })).toBeNull()
  })

  it('words a coded refusal whose message the app does not know', () => {
    const coded = (code: string) => new ApiError({ status: 409, message: 'Reworded by a newer API', code })
    expect(errorMessage(coded('CASH_CLOSING_WAS_CLOSED'), es)).toBe(es.apiErrors.closedBeforeNoDelete)
    expect(errorMessage(coded('CASH_NOT_COUNTED'), es)).toBe('Escribe el efectivo contado para poder cerrar la caja.')
    expect(errorMessage(coded('FUTURE_DATE'), en)).toBe(en.apiErrors.futureDay)
    // The message the app knows stays first; any other code is shown as the API wrote it
    expect(errorMessage(new ApiError({ status: 409, message: 'The expense date cannot be in the future', code: 'FUTURE_DATE' }), es)).toBe(es.apiErrors.futureDay)
    expect(errorMessage(coded('SOMETHING_NEW'), es)).toBe('Reworded by a newer API')
  })
})
