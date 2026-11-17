import { describe, expect, it } from 'vitest'
import type { User, Worker } from '../api/types'
import { dictionaries } from './i18n'
import { joinStaff } from './queries'

const user = (id: number, firstName: string, lastName: string): User => ({
  id,
  username: firstName.toLowerCase(),
  firstName,
  lastName,
  phoneNumber: null,
  email: `${firstName.toLowerCase()}@khronos.es`,
  role: 'WORKER',
})
const worker = (userId: number, isActive = true): Worker => ({ userId, establishmentId: 1, isActive })

describe('joinStaff', () => {
  it('joins each worker with their user record', () => {
    const [marco] = joinStaff([worker(2)], [user(2, 'Marco', 'Bianchi')], dictionaries.es.common.missingPerson)
    expect(marco).toMatchObject({ userId: 2, name: 'Marco Bianchi', initials: 'MB', user: { email: 'marco@khronos.es' } })
  })

  it('keeps a worker whose user record is missing, under a stand-in name', () => {
    const staff = joinStaff([worker(2), worker(5)], [user(2, 'Marco', 'Bianchi')], dictionaries.es.common.missingPerson)
    expect(staff.map((s) => s.name)).toEqual(['Marco Bianchi', 'Persona sin datos (#5)'])
    expect(staff[1]).toMatchObject({ userId: 5, isActive: true, initials: '?', user: { id: 5 } })
    expect(joinStaff([worker(5)], [], dictionaries.en.common.missingPerson)[0].name).toBe('Person with no details (#5)')
  })

  it('lists active people first, then by name', () => {
    const staff = joinStaff(
      [worker(1, false), worker(2), worker(3)],
      [user(1, 'Aisha', 'Khan'), user(2, 'Tomás', 'Vidal'), user(3, 'Lucía', 'Romero')],
      dictionaries.es.common.missingPerson,
    )
    expect(staff.map((s) => s.name)).toEqual(['Lucía Romero', 'Tomás Vidal', 'Aisha Khan'])
  })
})
