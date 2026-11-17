// Amounts typed by hand ("1.234,50", "1234,5", "12.50", "12 €") and sums of money. Sums are
// done in whole cents, so 0,10 + 0,20 is 0,30 and not 0,30000000000000004.

/** Euros to whole cents */
export const toCents = (euros: number) => Math.round(euros * 100)

/** Whole cents to euros */
export const fromCents = (cents: number) => cents / 100

/** Adds amounts in cents and gives euros back */
export function sumMoney(amounts: number[]): number {
  return fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0))
}

export function isBlank(text: string): boolean {
  return text.trim() === ''
}

/**
 * A typed amount in euros, or null when it is not one (an empty field included). A separator
 * followed by exactly three digits groups thousands ("1.234", "1,234"); followed by one or two
 * digits it is the decimal mark ("12,5", "12.50"). With both kinds, the last one is the decimal
 * mark ("1.234,50", "1,234.50"). Never negative, two decimals at most.
 */
export function parseAmount(text: string): number | null {
  const plain = text.replace(/[\s\u00a0\u202f€]/g, '')
  if (!/^[\d.,]+$/.test(plain)) return null
  const last = Math.max(plain.lastIndexOf('.'), plain.lastIndexOf(','))
  const bothKinds = plain.includes('.') && plain.includes(',')
  const tail = last === -1 ? '' : plain.slice(last + 1)
  const decimalMark = last !== -1 && (bothKinds || tail.length !== 3) ? plain[last] : null

  let whole = decimalMark ? plain.slice(0, last) : plain
  const cents = decimalMark ? tail : ''
  if (decimalMark && !/^\d{1,2}$/.test(cents)) return null
  if (!/^\d+$/.test(whole)) {
    // Thousands grouped in threes by one kind of separator, which is not the decimal mark
    const separators = new Set(whole.replace(/\d/g, ''))
    if (!/^\d{1,3}([.,]\d{3})+$/.test(whole) || separators.size !== 1 || separators.has(decimalMark ?? '')) return null
    whole = whole.replace(/[.,]/g, '')
  }
  return fromCents(Number(whole) * 100 + Number(cents.padEnd(2, '0') || 0))
}
