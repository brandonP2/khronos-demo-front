import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setAccessToken, setUnauthorizedHandler } from '../api/client'
import { api } from '../api/endpoints'
import type { User } from '../api/types'

// The API issues a bearer token that is valid for one hour. It lives in sessionStorage,
// so it is gone when the tab closes, and the app signs out on its own when it expires.
const STORAGE_KEY = 'khronos.session'

interface Session {
  token: string
  /** Epoch milliseconds */
  expiresAt: number
}

export type SignOutReason = 'expired' | null

interface AuthState {
  user: User | null
  ready: boolean
  expiresAt: number | null
  /** Why the last session ended, so the login screen can say so */
  signOutReason: SignOutReason
  login: (username: string, password: string) => Promise<void>
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const endSession = useCallback(
    (reason: SignOutReason) => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
      expiryTimer.current = null
      writeSession(null)
      setAccessToken(null)
      setExpiresAt(null)
      setUser(null)
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

  useEffect(() => {
    // Any 401 on an authenticated call means the server no longer accepts the token
    setUnauthorizedHandler(() => endSession('expired'))
    const session = readSession()
    if (!session || session.expiresAt <= Date.now()) {
      if (session) endSession('expired')
      setReady(true)
      return () => setUnauthorizedHandler(null)
    }
    startSession(session)
    api.users
      .me()
      .then(setUser)
      .catch(() => endSession('expired'))
      .finally(() => setReady(true))
    return () => {
      setUnauthorizedHandler(null)
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
    }
  }, [endSession, startSession])

  const login = useCallback(
    async (username: string, password: string) => {
      const token = await api.auth.login(username, password)
      startSession({ token: token.accessToken, expiresAt: Date.parse(token.expiresAt) })
      try {
        setUser(await api.users.me())
        setSignOutReason(null)
      } catch (e) {
        endSession(null)
        throw e
      }
    },
    [startSession, endSession],
  )

  const value = useMemo(
    () => ({ user, ready, expiresAt, signOutReason, login, logout, setUser }),
    [user, ready, expiresAt, signOutReason, login, logout],
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
