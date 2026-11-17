import type { ApiErrorBody } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Where an error came from, so screens can word it in the user's language:
 * - network: the request never reached the API
 * - server: a 5xx without an API error body, for example from a proxy
 * - rate-limited: 429, with the wait in `retryAfter`
 * - api: an error body written by the API; its message is shown as is
 */
export type ApiErrorKind = 'network' | 'server' | 'rate-limited' | 'api'

export class ApiError extends Error {
  status: number
  kind: ApiErrorKind
  fieldErrors: Record<string, string>
  /** Index of the failing item in a batch request, read from "Shift [2]: ..." style messages */
  batchIndex: number | null
  /** Seconds to wait before trying again, from the Retry-After header of a 429 */
  retryAfter: number | null
  /**
   * Machine-readable reason, such as ACCOUNT_DISABLED. Older APIs do not send it, so code
   * that checks it keeps a fallback on the message.
   */
  code?: string

  constructor(body: ApiErrorBody, options: { kind?: ApiErrorKind; retryAfter?: number | null } = {}) {
    const match = /^\w+ \[(\d+)\]: (.*)$/s.exec(body.message ?? '')
    super(match ? match[2] : body.message || 'Something went wrong')
    this.status = body.status
    this.kind = options.kind ?? (body.status === 0 ? 'network' : body.status === 429 ? 'rate-limited' : 'api')
    this.fieldErrors = body.fieldErrors ?? {}
    this.batchIndex = match ? Number(match[1]) : null
    this.retryAfter = options.retryAfter ?? null
    this.code = typeof body.code === 'string' && body.code ? body.code : undefined
  }
}

/** Retry-After is either a number of seconds or an HTTP date */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const at = Date.parse(trimmed)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000))
}

let accessToken: string | null = null
let onUnauthorized: ((error: ApiError) => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Called with the error of any 401 on an authenticated call, so the session can end with the right reason */
export function setUnauthorizedHandler(handler: ((error: ApiError) => void) | null) {
  onUnauthorized = handler
}

interface RequestOptions {
  /** Send without the bearer token, for the login call */
  anonymous?: boolean
}

/** Sends the call with the bearer token and turns any non-2xx answer into an ApiError */
async function send(method: string, path: string, body: unknown, options: RequestOptions, accept: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept }
  const auth = options.anonymous ? null : accessToken
  if (auth) headers.Authorization = `Bearer ${auth}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({ status: 0, message: 'Cannot reach the Khronos server. Check that the API is running.' })
  }

  if (!res.ok) {
    const text = await res.text()
    const data = text ? safeJson(text) : null
    const fromApi = data !== null && typeof data === 'object' && 'message' in data
    const errorBody: ApiErrorBody = fromApi
      ? { ...(data as ApiErrorBody), status: res.status }
      : { status: res.status, message: res.status >= 500 ? 'The server had a problem. Try again in a moment.' : res.statusText }
    const error = new ApiError(errorBody, {
      kind: res.status === 429 ? 'rate-limited' : !fromApi && res.status >= 500 ? 'server' : 'api',
      retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
    })
    // A 401 on an authenticated call means the token expired, was revoked or the account was disabled
    if (res.status === 401 && auth) onUnauthorized?.(error)
    throw error
  }
  return res
}

export async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const res = await send(method, path, body, options, 'application/json')
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? safeJson(text) : null) as T
}

export interface DownloadedFile {
  blob: Blob
  /** From Content-Disposition, or null when the header is missing or not exposed to the page */
  filename: string | null
}

/**
 * Fetches a file with the bearer token. A plain link cannot send the token, so exports are
 * downloaded this way and then handed to the browser as a blob (see lib/download.ts).
 */
export async function download(path: string, accept = 'text/csv'): Promise<DownloadedFile> {
  const res = await send('GET', path, undefined, {}, accept)
  return { blob: await res.blob(), filename: filenameFrom(res.headers.get('Content-Disposition')) }
}

/** `attachment; filename="horas.csv"` or the RFC 5987 form `filename*=UTF-8''horas%20nov.csv` */
export function filenameFrom(disposition: string | null): string | null {
  if (!disposition) return null
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition)
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // Badly encoded: fall back to the plain parameter
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(disposition)
  const name = plain ? (plain[2] ?? plain[1]).trim() : ''
  return name || null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
