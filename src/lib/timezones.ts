// The time zones offered for a venue. Spain's three come first; the rest cover nearby
// countries and the Spanish-speaking Americas. Any other valid IANA zone a venue already
// has is kept and shown as it is.
import type { Messages } from './i18n'
import { DEFAULT_TIME_ZONE } from './time'

export const COMMON_TIME_ZONES = [
  DEFAULT_TIME_ZONE,
  'Atlantic/Canary',
  'Africa/Ceuta',
  'Europe/Andorra',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Vienna',
  'Europe/Athens',
  'America/Mexico_City',
  'America/Guatemala',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'UTC',
] as const

/** The options for a picker, with the current zone kept even when it is not a common one */
export function timeZoneOptions(current?: string | null): string[] {
  const list: string[] = [...COMMON_TIME_ZONES]
  return current && !list.includes(current) ? [current, ...list] : list
}

/** "Península y Baleares (Europe/Madrid)" for Spain's zones, the IANA name for the rest */
export function timeZoneLabel(zone: string, t: Messages): string {
  const names: Record<string, string> = t.timeZone.names
  const name = names[zone]
  return name ? `${name} (${zone})` : zone.replace(/_/g, ' ')
}
