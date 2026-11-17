import type { ApiErrorBody } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>
  /** Index of the failing item in a batch request, read from "Shift [2]: ..." style messages */
  batchIndex: number | null

  constructor(body: ApiErrorBody) {
    const match = /^\w+ \[(\d+)\]: (.*)$/s.exec(body.message ?? '')
    super(match ? match[2] : body.message || 'Something went wrong')
    this.status = body.status
    this.fieldErrors = body.fieldErrors ?? {}
    this.batchIndex = match ? Number(match[1]) : null
  }
}

let accessToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

interface RequestOptions {
  /** Send without the bearer token, for the login call */
  anonymous?: boolean
}

export async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
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

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const data = text ? safeJson(text) : null

  if (!res.ok) {
    // A 401 on an authenticated call means the token expired or was revoked
    if (res.status === 401 && auth) onUnauthorized?.()
    const errorBody: ApiErrorBody =
      data && typeof data === 'object' && 'message' in data
        ? (data as ApiErrorBody)
        : { status: res.status, message: res.status >= 500 ? 'The server had a problem. Try again in a moment.' : res.statusText }
    throw new ApiError(errorBody)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
