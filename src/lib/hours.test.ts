import { describe, expect, it } from 'vitest'
import { parseBreakMinutes } from './hours'

describe('parseBreakMinutes', () => {
  it('takes whole minutes from 0 to 600', () => {
    expect(parseBreakMinutes('0')).toBe(0)
    expect(parseBreakMinutes(' 15 ')).toBe(15)
    expect(parseBreakMinutes('600')).toBe(600)
  })

  it('refuses anything else', () => {
    expect(parseBreakMinutes('')).toBeNull()
    expect(parseBreakMinutes('601')).toBeNull()
    expect(parseBreakMinutes('-5')).toBeNull()
    expect(parseBreakMinutes('1.5')).toBeNull()
    expect(parseBreakMinutes('1e2')).toBeNull()
    expect(parseBreakMinutes('quince')).toBeNull()
  })
})
