import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, filenameFrom, setAccessToken, setUnauthorizedHandler } from '../api/client'
import { api } from '../api/endpoints'
import { saveBlob } from './download'

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
  setUnauthorizedHandler(null)
})

function csvResponse(body: string, disposition?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'text/csv; charset=utf-8' }
  if (disposition) headers['Content-Disposition'] = disposition
  return new Response(`\uFEFF${body}`, { status: 200, headers })
}

describe('authenticated CSV download', () => {
  it('sends the bearer token and reads the file name the server gives', async () => {
    setAccessToken('owner-token')
    const fetchMock = vi.fn(async () => csvResponse('Persona;Horas\nLucía;38,5', 'attachment; filename="horas_2026-11-16_2026-11-22.csv"'))
    vi.stubGlobal('fetch', fetchMock)

    const file = await api.reports.hoursCsv(4, { from: '2026-11-16', to: '2026-11-22' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/reports/establishment/4/hours.csv?from=2026-11-16&to=2026-11-22')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer owner-token')
    expect(headers.Accept).toBe('text/csv')
    expect(file.filename).toBe('horas_2026-11-16_2026-11-22.csv')
    expect(await file.blob.text()).toContain('Lucía;38,5')
  })

  it('turns an error answer into an ApiError, and a 401 ends the session', async () => {
    setAccessToken('expired')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, message: 'Expired' }), { status: 401 })))
    await expect(api.reports.timeEntriesCsv(4, { from: '2026-11-01', to: '2026-11-30' })).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('reads plain and encoded file names', () => {
    expect(filenameFrom('attachment; filename="registro.csv"')).toBe('registro.csv')
    expect(filenameFrom('attachment; filename=registro.csv')).toBe('registro.csv')
    expect(filenameFrom("attachment; filename*=UTF-8''registro%20de%20jornada.csv")).toBe('registro de jornada.csv')
    expect(filenameFrom('attachment')).toBeNull()
    expect(filenameFrom(null)).toBeNull()
  })

  it('saves the blob through a temporary link', () => {
    // jsdom has no object URLs, so they are put in place for this test only
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    const revoke = vi.fn()
    URL.createObjectURL = vi.fn(() => 'blob:khronos/1')
    URL.revokeObjectURL = revoke
    vi.useFakeTimers()
    try {
      const clicked: string[] = []
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(`${this.download} ${this.href}`)
      })
      saveBlob(new Blob(['a;b']), 'horas.csv')
      expect(click).toHaveBeenCalledTimes(1)
      expect(clicked[0]).toBe('horas.csv blob:khronos/1')
      expect(document.querySelector('a[download]')).toBeNull()
      vi.runAllTimers()
      expect(revoke).toHaveBeenCalledWith('blob:khronos/1')
    } finally {
      vi.useRealTimers()
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })
})

describe('time entry endpoints', () => {
  it('maps "not clocked in" (204) to null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(api.timeEntries.myOpen()).resolves.toBeNull()
  })

  it('asks for voided entries only when told to', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await api.timeEntries.byWorker(3, { from: '2026-11-01', to: '2026-11-30', includeVoided: true })
    await api.timeEntries.byWorker(3, { from: '2026-11-01' })
    const urls = fetchMock.mock.calls.map((call) => String((call as unknown as [string])[0]))
    expect(urls).toEqual([
      '/api/time-entries/worker/3?from=2026-11-01&to=2026-11-30&includeVoided=true',
      '/api/time-entries/worker/3?from=2026-11-01',
    ])
  })
})
