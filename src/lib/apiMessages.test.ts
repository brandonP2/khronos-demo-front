import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { errorMessage } from '../components/ui'
import {
  cashRefusal,
  closedCashDay,
  fieldErrorsMessage,
  inventoryRefusal,
  inventoryRefusalMessage,
  isAlreadyClockedOut,
  isClosingTaken,
  isNoOpenEntry,
  isOpenTooLong,
  isReasonRequired,
  knownApiMessage,
  refusalDay,
  refusalOrder,
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

  it('reads the inventory refusals by their code first', () => {
    expect(inventoryRefusal({ message: 'Reworded', code: 'PRODUCT_UNIT_LOCKED' })).toBe('PRODUCT_UNIT_LOCKED')
    expect(inventoryRefusal({ message: 'Reworded', code: 'PURCHASE_ORDER_NOTHING_RECEIVED' })).toBe('PURCHASE_ORDER_NOTHING_RECEIVED')
    // The code wins over the message, and a code that is not the inventory's is nothing here
    expect(inventoryRefusal({ message: "A product named 'Ron' already exists at this establishment", code: 'CASH_DAY_CLOSED' })).toBeNull()
    expect(inventoryRefusal({ message: 'A cash closing already exists for 2026-11-16 at this establishment' })).toBeNull()
  })

  it('reads them by their message from an API without codes', () => {
    const cases: [string, string][] = [
      ["A supplier named 'Sur' already exists at this establishment", 'SUPPLIER_NAME_TAKEN'],
      ["A product named 'Ron' already exists at this establishment", 'PRODUCT_NAME_TAKEN'],
      ['Cannot delete a supplier that has purchase orders', 'SUPPLIER_HAS_ORDERS'],
      ['Cannot delete a product that has stock movements or purchase order lines; deactivate it instead', 'PRODUCT_HAS_HISTORY'],
      ['The unit of a product with stock movements or purchase order lines cannot be changed', 'PRODUCT_UNIT_LOCKED'],
      ["Product 'Ron' is inactive; activate it first", 'PRODUCT_INACTIVE'],
      ['The supplier belongs to another establishment', 'OTHER_ESTABLISHMENT'],
      ['Only an ordered purchase order can be received; this one is RECEIVED', 'PURCHASE_ORDER_WRONG_STATUS'],
      ['Nothing was received; cancel the purchase order instead', 'PURCHASE_ORDER_NOTHING_RECEIVED'],
      [
        'The received purchase order has no total to record as an expense; give its lines a unit cost or receive it without an expense',
        'PURCHASE_ORDER_NO_TOTAL',
      ],
      [
        'This expense was created when purchase order #12 was received and cannot be edited; to correct it, delete it and enter it again',
        'EXPENSE_FROM_PURCHASE_ORDER',
      ],
    ]
    for (const [message, refusal] of cases) expect(inventoryRefusal({ message }), message).toBe(refusal)
  })

  it('words the inventory refusals, with the product, the status or the order they name', () => {
    expect(inventoryRefusalMessage({ message: "Product 'Ron Brugal' is inactive; activate it first", code: 'PRODUCT_INACTIVE' }, es)).toBe(
      '«Ron Brugal» está inactivo: actívalo antes en Stock.',
    )
    expect(
      inventoryRefusalMessage({ message: 'Only a draft purchase order can be edited; this one is ORDERED', code: 'PURCHASE_ORDER_WRONG_STATUS' }, es),
    ).toBe('Este pedido ha cambiado mientras tanto y ahora está «Pedido». Vuelve a abrirlo para ver cómo está.')
    const fromOrder = { message: 'Reworded', code: 'EXPENSE_FROM_PURCHASE_ORDER', details: { purchaseOrderId: '12' } }
    expect(refusalOrder(fromOrder)).toBe(12)
    expect(inventoryRefusalMessage(fromOrder, en)).toBe(
      'This expense was created on receiving order #12 and can’t be edited. To correct it, delete it and enter it again.',
    )
    expect(inventoryRefusalMessage({ message: 'x', code: 'SUPPLIER_NAME_TAKEN' }, es)).toBe('Ya hay un proveedor con ese nombre en este local.')
    // Every code is worded in both languages
    for (const code of ['SUPPLIER_HAS_ORDERS', 'PRODUCT_NAME_TAKEN', 'PRODUCT_UNIT_LOCKED', 'PRODUCT_HAS_HISTORY', 'OTHER_ESTABLISHMENT', 'PURCHASE_ORDER_NO_TOTAL', 'PURCHASE_ORDER_NOTHING_RECEIVED']) {
      expect(inventoryRefusalMessage({ message: 'x', code }, es)).toMatch(/\S/)
      expect(inventoryRefusalMessage({ message: 'x', code }, en)).not.toBe(inventoryRefusalMessage({ message: 'x', code }, es))
    }
    expect(errorMessage(new ApiError({ status: 409, message: 'Reworded', code: 'PRODUCT_HAS_HISTORY' }), es)).toBe(es.inventoryErrors.PRODUCT_HAS_HISTORY)
    expect(errorMessage(new ApiError({ status: 409, message: 'The movement date cannot be in the future', code: 'FUTURE_DATE' }), es)).toBe(es.apiErrors.futureDay)
    expect(errorMessage(new ApiError({ status: 400, message: 'The date range cannot be longer than 366 days' }), es)).toBe(es.apiErrors.rangeTooLong)
  })

  it('words the inventory’s 400s by the fields they name', () => {
    const e = es.inventoryErrors
    expect(fieldErrorsMessage({ items: 'must not contain the same product twice' }, es)).toBe(e.countRepeated)
    expect(fieldErrorsMessage({ lines: 'must not contain the same product twice' }, es)).toBe(e.orderRepeated)
    expect(fieldErrorsMessage({ lines: 'must not contain the same line twice' }, es)).toBe(e.lineRepeated)
    expect(fieldErrorsMessage({ unitCost: 'can only be sent with a PURCHASE' }, es)).toBe(e.costOnlyOnPurchase)
    expect(fieldErrorsMessage({ createExpense: 'must not be null' }, es)).toBe(e.createExpenseMissing)
    expect(fieldErrorsMessage({ paymentMethod: 'must not be null when createExpense is true' }, es)).toBe(e.paymentMethodMissing)
    expect(fieldErrorsMessage({ 'items[2].countedQuantity': 'would leave a stock of 1000000000000.000; a product’s stock can be at most 999999999999.999 either way' }, es)).toBe(e.outOfRange)
    expect(fieldErrorsMessage({ 'lines[0].quantity': 'numeric value out of bounds (<9 digits>.<3 digits> expected)' }, es)).toBe(e.quantityTooLong)
    // The same default message in Spanish, as the API may word it for the browser's language
    expect(fieldErrorsMessage({ unitCost: 'valor numérico fuera de los límites (se esperaba <8 dígitos>.<2 dígitos>)' }, es)).toBe(e.amountTooLong)
    expect(fieldErrorsMessage({ name: 'must not be blank' }, es)).toBeNull()
    expect(errorMessage(new ApiError({ status: 400, message: 'Validation failed', fieldErrors: { items: 'must not contain the same product twice' } }), es)).toBe(
      e.countRepeated,
    )
  })

  it('reads a closed till when receiving an order like an expense’s', () => {
    // Receiving an order with a cash expense on a closed day uses the expenses' own refusal
    expect(closedCashDay('The cash closing of 2026-11-17 is closed; reopen it to add, change or delete cash expenses of that day')).toEqual({
      day: '2026-11-17',
    })
  })
})
