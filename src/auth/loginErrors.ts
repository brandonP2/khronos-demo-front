import { ApiError } from '../api/client'
import { errorMessage } from '../components/ui'
import type { Messages } from '../lib/i18n'
import { isDisabledAccount } from './AuthContext'

/**
 * The login endpoint's own errors are worded here; anything else falls back to the shared
 * wording. The login screen and the dialog that renews a session both send a password to it,
 * so they read its errors the same way. Only a plain 401 can be worded differently, since
 * the renew dialog's username is fixed and only the password can be wrong.
 */
export function loginErrorText(error: unknown, t: Messages, wrongCredentials = t.login.invalidCredentials): string | null {
  if (!error) return null
  if (error instanceof ApiError && error.status === 401) {
    return isDisabledAccount(error) ? t.login.accountDisabled : wrongCredentials
  }
  if (error instanceof ApiError && error.kind === 'rate-limited') {
    return t.login.tooManyAttempts(error.retryAfter ? t.common.wait(error.retryAfter) : null)
  }
  return errorMessage(error, t)
}
