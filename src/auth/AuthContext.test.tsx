import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { ApiError } from '../api/client'
import { ToastProvider } from '../components/ui'
import { LocaleProvider } from '../lib/i18n'
import { AuthProvider, isDisabledAccount } from './AuthContext'

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>

function mockFetch(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input).replace(/^.*\/api/, ''), init)),
  )
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
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

function storeSession(minutesLeft = 30) {
  sessionStorage.setItem('khronos.session', JSON.stringify({ token: 'stored-token', expiresAt: Date.now() + minutesLeft * 60_000 }))
}

const admin = { id: 1, username: 'admin', firstName: 'Ana', lastName: 'Gil', phoneNumber: null, email: 'a@b.es', role: 'PLATFORM_ADMIN' }

function signIn() {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'lucia' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

beforeEach(() => sessionStorage.clear())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('stored session', () => {
  it('keeps the session and offers a retry when the server cannot be reached', async () => {
    storeSession()
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    renderApp()
    expect(await screen.findByText('No se puede conectar con Khronos')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(sessionStorage.getItem('khronos.session')).not.toBeNull()
  })

  it('does not call a 5xx an expired session', async () => {
    storeSession()
    mockFetch(() => new Response('Bad gateway', { status: 502 }))
    renderApp()
    expect(await screen.findByText('No se puede conectar con Khronos')).toBeTruthy()
    expect(screen.queryByText(/Tu sesión ha terminado/)).toBeNull()
  })

  it('explains a sign-out caused by a disabled account', async () => {
    storeSession()
    mockFetch(() => json(401, { status: 401, message: 'This account is disabled' }))
    renderApp()
    expect(await screen.findByText(/tu cuenta está desactivada/)).toBeTruthy()
    expect(sessionStorage.getItem('khronos.session')).toBeNull()
  })

  it('says the session ended for any other 401', async () => {
    storeSession()
    mockFetch(() => json(401, { status: 401, message: 'Your session has expired or is no longer valid. Sign in again' }))
    renderApp()
    expect(await screen.findByText(/Tu sesión ha terminado/)).toBeTruthy()
  })

  it('reads a disabled account from the error code, whatever the message says', async () => {
    storeSession()
    mockFetch(() => json(401, { status: 401, message: 'Unauthorized', code: 'ACCOUNT_DISABLED' }))
    renderApp()
    expect(await screen.findByText(/tu cuenta está desactivada/)).toBeTruthy()
  })
})

describe('isDisabledAccount', () => {
  const error = (body: { message: string; code?: string }, status = 401) => new ApiError({ status, ...body })

  it('trusts the code when the API sends one', () => {
    expect(isDisabledAccount(error({ message: 'Unauthorized', code: 'ACCOUNT_DISABLED' }))).toBe(true)
    expect(isDisabledAccount(error({ message: 'Sign in again, this token is disabled', code: 'SESSION_EXPIRED' }))).toBe(false)
    expect(isDisabledAccount(error({ message: 'Invalid username or password', code: 'INVALID_CREDENTIALS' }))).toBe(false)
  })

  it('falls back on the message for an API without codes', () => {
    expect(isDisabledAccount(error({ message: 'This account is disabled' }))).toBe(true)
    expect(isDisabledAccount(error({ message: 'Invalid username or password' }))).toBe(false)
  })

  it('only applies to a 401', () => {
    expect(isDisabledAccount(error({ message: 'This account is disabled', code: 'ACCOUNT_DISABLED' }, 403))).toBe(false)
    expect(isDisabledAccount(new Error('This account is disabled'))).toBe(false)
  })
})

describe('login', () => {
  it('locks the button for as long as Retry-After says after too many attempts', async () => {
    mockFetch(() => json(429, { status: 429, message: 'Too many login attempts' }, { 'Retry-After': '30' }))
    renderApp()
    signIn()
    expect(await screen.findByText('Demasiados intentos. Espera 30 segundos y vuelve a probar.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Espera 30 s' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('counts the wait down and unlocks the button when it is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mockFetch(() => json(429, { status: 429, message: 'Too many login attempts' }, { 'Retry-After': '2' }))
      renderApp()
      signIn()
      expect(await screen.findByRole('button', { name: 'Espera 2 s' })).toBeTruthy()
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByRole('button', { name: 'Espera 1 s' })).toBeTruthy()
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not send a password longer than the API accepts', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'lucia' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ñ'.repeat(40) } })
    expect(screen.getByText(/^Es demasiado larga/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('words wrong credentials and disabled accounts', async () => {
    mockFetch(() => json(401, { status: 401, message: 'Invalid username or password' }))
    renderApp()
    signIn()
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeTruthy()

    mockFetch(() => json(401, { status: 401, message: 'This account is disabled' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Tu cuenta está desactivada. Habla con el responsable de tu local.')).toBeTruthy()
  })
})

describe('session warning', () => {
  it('warns five minutes before the end and renews the token without leaving the screen', async () => {
    storeSession(4)
    const renewedUntil = new Date(Date.now() + 60 * 60_000).toISOString()
    const calls: string[] = []
    mockFetch((path, init) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`)
      if (path === '/users/me') return json(200, admin)
      if (path === '/auth/login') {
        return json(200, { accessToken: 'fresh-token', tokenType: 'Bearer', expiresAt: renewedUntil, expiresIn: 3600 })
      }
      return json(200, [])
    })
    renderApp()

    expect(await screen.findByText(/Tu sesión caduca a las/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Propietarios y locales' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    fireEvent.change(await screen.findByLabelText('Contraseña'), { target: { value: 'admin1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))

    expect(await screen.findByText(/Sesión renovada hasta las/)).toBeTruthy()
    expect(screen.queryByText(/Tu sesión caduca a las/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Propietarios y locales' })).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem('khronos.session')!).token).toBe('fresh-token')
    expect(calls).toContain('POST /auth/login')
  })

  async function renewWith(loginAnswer: () => Response) {
    storeSession(4)
    mockFetch((path) => (path === '/users/me' ? json(200, admin) : path === '/auth/login' ? loginAnswer() : json(200, [])))
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Seguir conectado' }))
    fireEvent.change(await screen.findByLabelText('Contraseña'), { target: { value: 'admin1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
  }

  it('says the password is wrong for a plain 401', async () => {
    await renewWith(() => json(401, { status: 401, message: 'Invalid username or password', code: 'INVALID_CREDENTIALS' }))
    expect(await screen.findByText('Contraseña incorrecta.')).toBeTruthy()
    expect(sessionStorage.getItem('khronos.session')).not.toBeNull()
  })

  it('signs out with the reason when the account was disabled meanwhile', async () => {
    await renewWith(() => json(401, { status: 401, message: 'This account is disabled', code: 'ACCOUNT_DISABLED' }))
    expect(await screen.findByText(/Se ha cerrado tu sesión porque tu cuenta está desactivada/)).toBeTruthy()
    expect(screen.queryByText('Contraseña incorrecta.')).toBeNull()
    expect(sessionStorage.getItem('khronos.session')).toBeNull()
  })

  it('asks to wait after too many attempts', async () => {
    await renewWith(() => json(429, { status: 429, message: 'Too many login attempts' }, { 'Retry-After': '30' }))
    expect(await screen.findByText('Demasiados intentos. Espera 30 segundos y vuelve a probar.')).toBeTruthy()
  })
})
