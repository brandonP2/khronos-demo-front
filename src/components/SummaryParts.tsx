// Pieces of the business summary: a figure's change against the period before, and the
// expenses split by category.
import { ArrowDownRight, ArrowUpRight, Equal } from 'lucide-react'
import type { ExpenseCategory } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import type { Trend } from '../lib/summary'

/**
 * The change against the period before: an arrow, a signed amount and, for screen readers,
 * words. Colour only says whether the change is good news, so it is never the only cue.
 */
export function TrendLine({
  trend,
  upIsGood,
  format,
  showPercent = true,
}: {
  /** null when there is nothing to compare with */
  trend: Trend | null
  /** More sales is good news; more expenses is not */
  upIsGood: boolean
  /** The signed change in the figure's own unit */
  format: (delta: number) => string
  showPercent?: boolean
}) {
  const t = useT()
  const fmt = useFmt()
  if (!trend) return <span className="meta">{t.trend.none}</span>
  if (trend.direction === 'flat') {
    return (
      <span className="meta trend">
        <Equal size={14} strokeWidth={1.5} aria-hidden />
        {t.trend.flat}
      </span>
    )
  }
  const up = trend.direction === 'up'
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const percent =
    showPercent && trend.percent !== null ? ` (${trend.percent > 0 ? '+' : '−'}${fmt.percent(Math.abs(trend.percent))})` : ''
  return (
    <span className={up === upIsGood ? 'meta trend good' : 'meta trend bad'}>
      <Icon size={14} strokeWidth={1.5} aria-hidden />
      <span>
        {format(trend.delta)}
        {percent}
        <span className="visually-hidden"> {up ? t.trend.up : t.trend.down}</span>
      </span>
    </span>
  )
}

/** One bar per category, against the largest, with its amount and its share of the total */
export function CategoryBars({ items, total }: { items: { category: ExpenseCategory; amount: number }[]; total: number }) {
  const t = useT()
  const fmt = useFmt()
  const largest = Math.max(0, ...items.map((i) => i.amount))
  return (
    <ul className="category-list">
      {items.map((item) => {
        const share = total > 0 ? (item.amount / total) * 100 : 0
        return (
          <li key={item.category} className="category-row">
            <span className="category-name">{t.categories[item.category]}</span>
            <span className="category-amount mono">{fmt.money(item.amount)}</span>
            <span className="category-bar" aria-hidden>
              <span style={{ width: `${largest > 0 ? (item.amount / largest) * 100 : 0}%` }} />
            </span>
            <span className="category-share muted mono">{t.summary.share(fmt.percent(share))}</span>
          </li>
        )
      })}
    </ul>
  )
}
