import { describe, expect, it } from 'vitest'
import { dictionaries } from './i18n'
import { PASSWORD_MAX, PASSWORD_MIN, isPasswordTooLong, isPasswordTooShort, isValidPassword, passwordBytes, passwordError } from './password'

describe('password rules', () => {
  it('measures the upper limit in UTF-8 bytes, as BCrypt does', () => {
    expect(passwordBytes('abc')).toBe(3)
    expect(passwordBytes('ñ')).toBe(2)
    expect(passwordBytes('😀')).toBe(4)
    expect(isPasswordTooLong('a'.repeat(PASSWORD_MAX))).toBe(false)
    expect(isPasswordTooLong('a'.repeat(PASSWORD_MAX + 1))).toBe(true)
    expect(isPasswordTooLong('ñ'.repeat(36))).toBe(false)
  })

  it('refuses 40 "ñ", which are 40 characters but 80 bytes', () => {
    const password = 'ñ'.repeat(40)
    expect(password.length).toBeLessThan(PASSWORD_MAX)
    expect(isPasswordTooLong(password)).toBe(true)
    expect(isValidPassword(password)).toBe(false)
  })

  it('counts characters for the lower limit', () => {
    expect(isPasswordTooShort('a'.repeat(PASSWORD_MIN - 1))).toBe(true)
    expect(isPasswordTooShort('ñ'.repeat(PASSWORD_MIN))).toBe(false)
    expect(isValidPassword('nueva-clave')).toBe(true)
  })

  it('words the problem, and only says "too short" when asked to', () => {
    const t = dictionaries.es
    expect(passwordError('ñ'.repeat(40), t)).toBe(t.resetPassword.tooLong)
    expect(passwordError('corta', t)).toBeUndefined()
    expect(passwordError('corta', t, true)).toBe(t.resetPassword.tooShort)
    expect(passwordError('nueva-clave', t, true)).toBeUndefined()
  })
})
