// What the app keeps in this tab while something is being typed, so a reload or a slip of the
// finger does not lose it: today, the stock count of each venue. A draft belongs to the person who
// typed it, so all of them are forgotten when the session ends, and a draft saved by someone else
// is never offered.

/** Every draft's key starts with one of these */
export const DRAFT_PREFIXES = ['khronos.stockCount.'] as const

/** Forgets every draft in this tab. Storage that is blocked has nothing to forget. */
export function clearDrafts() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i))
    for (const key of keys) {
      if (key && DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key)
    }
  } catch {
    // Nothing kept, so nothing to forget
  }
}
