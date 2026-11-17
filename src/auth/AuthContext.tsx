import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, setAccessToken, setUnauthorizedHandler } from '../api/client'
import { api } from '../api/endpoints'
import type { User } from '../api/types'
import { clearDrafts } from '../lib/drafts'

// The API issues a bearer token that is valid for one hour. It lives in sessionStorage,
// so it is gone when the tab closes, and the app signs out on its own when it expires.
const STORAGE_KEY = 'khronos.session'

interface Session {
  token: string
  /** Epoch milliseconds */
  expiresAt: number
}

export type SignOutReason = 'expired' | 'disabled' | null

interface AuthState {
  user: User | null
  ready: boolean
  expiresAt: number | null
  /** Why the last session ended, so the login screen can say so */
  signOutReason: SignOutReason
  /** The stored session could not be checked (no connection, server error); it is kept for a retry */
  bootError: unknown
  retryBoot: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  /** Gets a fresh token for the signed-in user without leaving the current screen; resolves to the new expiry */
  renewSession: (password: string) => Promise<number>
  logout: () => void
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return typeof s.token === 'string' && typeof s.expiresAt === 'number' ? s : null
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the session lasts until reload
  }
}

/**
 * The API answers 401 when a worker is deactivated. Newer APIs say so with the code
 * ACCOUNT_DISABLED; older ones send no code, only the message "This account is disabled".
 */
export function isDisabledAccount(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false
  if (error.code) return error.code === 'ACCOUNT_DISABLED'
  return /disabled|deactivated/i.test(error.message)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null)
  const [bootError, setBootError] = useState<unknown>(null)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const endSession = useCallback(
    (reason: SignOutReason) => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
      expiryTimer.current = null
      writeSession(null)
      // What this person left half typed is not for whoever signs in next in this tab
      clearDrafts()
      setAccessToken(null)
      setExpiresAt(null)
      setUser(null)
      setBootError(null)
      setSignOutReason(reason)
      queryClient.clear()
    },
    [queryClient],
  )

  const startSession = useCallback(
    (session: Session) => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
      writeSession(session)
      setAccessToken(session.token)
      setExpiresAt(session.expiresAt)
      expiryTimer.current = setTimeout(() => endSession('expired'), Math.max(0, session.expiresAt - Date.now()))
    },
    [endSession],
  )

  const logout = useCallback(() => endSession(null), [endSession])

  // A 401 has already ended the session through the handler. Anything else, like a lost
  // connection or a 5xx, keeps the session so the person can retry instead of being signed out.
  const loadUser = useCallback(async () => {
    try {
      setUser(await api.users.me())
      setBootError(null)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setBootError(e)
    }
  }, [])

  useEffect(() => {
    // Any 401 on an authenticated call means the server no longer accepts the token
    setUnauthorizedHandler((error) => endSession(isDisabledAccount(error) ? 'disabled' : 'expired'))
    const session = readSession()
    if (!session || session.expiresAt <= Date.now()) {
      if (session) endSession('expired')
      setReady(true)
      return () => setUnauthorizedHandler(null)
    }
    startSession(session)
    loadUser().finally(() => setReady(true))
    return () => {
      setUnauthorizedHandler(null)
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
    }
  }, [endSession, startSession, loadUser])

  // Coming back online is a good moment to try the stored session again
  useEffect(() => {
    if (!bootError) return
    const retry = () => void loadUser()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [bootError, loadUser])

  const login = useCallback(
    async (username: string, password: string) => {
      const token = await api.auth.login(username, password)
      startSession({ token: token.accessToken, expiresAt: Date.parse(token.expiresAt) })
      try {
        setUser(await api.users.me())
        setSignOutReason(null)
        setBootError(null)
      } catch (e) {
        endSession(null)
        throw e
      }
    },
    [startSession, endSession],
  )

  const renewSession = useCallback(
    async (password: string) => {
      if (!user) throw new Error('renewSession needs a signed-in user')
      const token = await api.auth.login(user.username, password).catch((e: unknown) => {
        // A deactivated account signs out with that reason, as a 401 on any other call would
        if (isDisabledAccount(e)) endSession('disabled')
        throw e
      })
      const session = { token: token.accessToken, expiresAt: Date.parse(token.expiresAt) }
      startSession(session)
      return session.expiresAt
    },
    [user, startSession, endSession],
  )

  const value = useMemo(
    () => ({
      user,
      ready,
      expiresAt,
      signOutReason,
      bootError,
      retryBoot: loadUser,
      login,
      renewSession,
      logout,
      setUser,
    }),
    [user, ready, expiresAt, signOutReason, bootError, loadUser, login, renewSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useMe(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useMe needs a signed-in user')
  return user
}
