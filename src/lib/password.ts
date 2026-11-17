import type { Messages } from './i18n'

// The API's password rules, checked here first so the person gets a message in their language.
// BCrypt only reads the first 72 bytes, so the API refuses longer passwords rather than cutting
// them. That limit is in UTF-8 bytes, not characters: "ñ" and accented letters take two bytes
// and an emoji four, so 40 "ñ" are already too long.

export const PASSWORD_MIN = 8
/** In UTF-8 bytes */
export const PASSWORD_MAX = 72

const utf8 = new TextEncoder()

export function passwordBytes(password: string): number {
  return utf8.encode(password).length
}

/** Sign-in and the current password only have this upper limit */
export function isPasswordTooLong(password: string): boolean {
  return passwordBytes(password) > PASSWORD_MAX
}

/** The lower limit counts characters the way the API does: Java's String.length, as in JavaScript */
export function isPasswordTooShort(password: string): boolean {
  return password.length < PASSWORD_MIN
}

/** A new password the API will accept */
export function isValidPassword(password: string): boolean {
  return !isPasswordTooShort(password) && !isPasswordTooLong(password)
}

/**
 * What is wrong with a password, worded for its field. Too long shows straight away, since
 * typing on cannot fix it; too short only when `checkShort` says the person looks done typing.
 */
export function passwordError(password: string, t: Messages, checkShort = false): string | undefined {
  if (isPasswordTooLong(password)) return t.resetPassword.tooLong
  if (checkShort && isPasswordTooShort(password)) return t.resetPassword.tooShort
  return undefined
}
