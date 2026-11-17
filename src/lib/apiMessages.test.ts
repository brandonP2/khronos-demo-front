import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { errorMessage } from '../components/ui'
import { isNoOpenEntry, isOpenTooLong, knownApiMessage } from './apiMessages'
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

  it('recognises the two clock-out refusals screens act on', () => {
    expect(isOpenTooLong('This time entry has been open for more than 24 hours; ask a manager to correct it')).toBe(true)
    expect(isOpenTooLong('A time entry cannot last more than 24 hours')).toBe(false)
    expect(isNoOpenEntry('You have no open time entry')).toBe(true)
    expect(isNoOpenEntry('You already have an open time entry')).toBe(false)
  })
})
