import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, parseRetryAfter, request, setAccessToken, setUnauthorizedHandler } from './client'

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('Expected the request to fail')
}

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
  setUnauthorizedHandler(null)
})

describe('batch errors', () => {
  it('reads the failing index and keeps only the message', () => {
    const e = new ApiError({ status: 409, message: 'Assignment [2]: The worker has no shift in zone' })
    expect(e.batchIndex).toBe(2)
    expect(e.message).toBe('The worker has no shift in zone')
    expect(e.kind).toBe('api')
  })

  it('leaves messages without an index alone', () => {
    const e = new ApiError({ status: 409, message: 'Worker is already assigned to this event' })
    expect(e.batchIndex).toBeNull()
    expect(e.message).toBe('Worker is already assigned to this event')
  })

  it('parses a batch failure coming from the API', async () => {
    respond(409, { status: 409, message: 'Shift [1]: Overlaps another shift' })
    const e = await failure(request('POST', '/worker-shifts', []))
    expect(e.status).toBe(409)
    expect(e.batchIndex).toBe(1)
    expect(e.message).toBe('Overlaps another shift')
  })

  it('keeps field errors', async () => {
    respond(400, { status: 400, message: 'Validation failed', fieldErrors: { 'user.email': 'must be a well-formed email address' } })
    const e = await failure(request('POST', '/workers/with-user', {}))
    expect(e.fieldErrors['user.email']).toBe('must be a well-formed email address')
  })
})

describe('401', () => {
  it('reports a 401 on an authenticated call to the session handler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    setAccessToken('token')
    respond(401, { status: 401, message: 'This account is disabled' })
    const e = await failure(request('GET', '/users/me'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBe(e)
    expect(e.message).toBe('This account is disabled')
  })

  it('keeps the error code when the API sends one', async () => {
    respond(401, { status: 401, message: 'Cuenta bloqueada', code: 'ACCOUNT_DISABLED' })
    const e = await failure(request('POST', '/auth/login', {}, { anonymous: true }))
    expect(e.code).toBe('ACCOUNT_DISABLED')

    respond(401, { status: 401, message: 'This account is disabled' })
    const old = await failure(request('POST', '/auth/login', {}, { anonymous: true }))
    expect(old.code).toBeUndefined()
  })

  it('does not end the session for a failed login', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    setAccessToken('token')
    const fetchMock = respond(401, { status: 401, message: 'Invalid username or password' })
    await failure(request('POST', '/auth/login', {}, { anonymous: true }))
    expect(handler).not.toHaveBeenCalled()
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('429', () => {
  it('reads Retry-After in seconds', async () => {
    respond(429, { status: 429, message: 'Too many login attempts' }, { 'Retry-After': '42' })
    const e = await failure(request('POST', '/auth/login', {}, { anonymous: true }))
    expect(e.kind).toBe('rate-limited')
    expect(e.retryAfter).toBe(42)
  })

  it('works without a body or header', async () => {
    respond(429)
    const e = await failure(request('POST', '/auth/login', {}, { anonymous: true }))
    expect(e.kind).toBe('rate-limited')
    expect(e.retryAfter).toBeNull()
  })

  it('accepts an HTTP date', () => {
    const now = Date.parse('2026-11-17T10:00:00Z')
    expect(parseRetryAfter('Tue, 17 Nov 2026 10:01:30 GMT', now)).toBe(90)
    expect(parseRetryAfter('Tue, 17 Nov 2026 09:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('soon', now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })
})

describe('network and server failures', () => {
  it('marks an unreachable server as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const e = await failure(request('GET', '/users/me'))
    expect(e.kind).toBe('network')
    expect(e.status).toBe(0)
  })

  it('marks a 5xx without an API body as a server error, and does not end the session', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    setAccessToken('token')
    respond(502, '<html>Bad gateway</html>')
    const e = await failure(request('GET', '/users/me'))
    expect(e.kind).toBe('server')
    expect(e.status).toBe(502)
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps the API message of a 5xx that has one', async () => {
    respond(500, { status: 500, message: 'An unexpected error occurred' })
    const e = await failure(request('GET', '/users/me'))
    expect(e.kind).toBe('api')
    expect(e.message).toBe('An unexpected error occurred')
  })

  it('returns undefined for 204', async () => {
    respond(204)
    await expect(request('PUT', '/users/1/password/reset', { newPassword: 'x' })).resolves.toBeUndefined()
  })
})
