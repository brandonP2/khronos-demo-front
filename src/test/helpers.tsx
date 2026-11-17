// Test helpers: a fake API answered by path, and the whole app rendered with a stored session.
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import type { User } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { ToastProvider } from '../components/ui'
import { LocaleProvider } from '../lib/i18n'

export interface Call {
  method: string
  /** Path after /api, with the query string */
  path: string
  body: unknown
  headers: Record<string, string>
}

/** Answers a call, or returns undefined to fall through to a 404 */
export type Route = (call: Call) => Response | undefined | Promise<Response | undefined>

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const noContent = () => new Response(null, { status: 204 })

/** Stubs fetch; every call is recorded, unknown paths answer 404 */
export function mockApi(route: Route) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? 'GET',
        path: String(input).replace(/^.*\/api/, ''),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      }
      calls.push(call)
      return (await route(call)) ?? json(404, { status: 404, message: `No route for ${call.method} ${call.path}` })
    }),
  )
  return calls
}

export function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="es">
        <ToastProvider>{node}</ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

/** The whole app at `path`, signed in as `user` (whose /users/me the route must answer) */
export function renderApp(path = '/') {
  sessionStorage.setItem('khronos.session', JSON.stringify({ token: 'test-token', expiresAt: Date.now() + 30 * 60_000 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider initialLocale="es">
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export function user(id: number, role: User['role'], firstName = 'Lucía', lastName = 'Romero'): User {
  return { id, username: firstName.toLowerCase(), firstName, lastName, phoneNumber: null, email: `${id}@khronos.es`, role }
}
