/**
 * "1 turno", "3 turnos": the number, then the singular for 1 and the plural otherwise. Shared
 * by every dictionary; when no plural is given it is the singular plus "s", as in English.
 */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
