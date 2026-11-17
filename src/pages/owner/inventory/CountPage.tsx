// The physical count, made for the phone: every active product by category with its expected
// stock beside a field for what is really there, and the difference worked out as it is typed.
// Only the products typed in are sent; the rest are not touched. A review shows how many
// products, the differences per unit and in value before confirming. What is typed is kept in
// this tab, so leaving the page by mistake does not lose it.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ClipboardCheck, ClipboardList } from 'lucide-react'
import { api } from '../../../api/endpoints'
import type { Product } from '../../../api/types'
import { QuantityInput } from '../../../components/QuantityInput'
import { Button, Dialog, Empty, ErrorNote, Field, Loading, PageHead, useToast } from '../../../components/ui'
import { useFmt, useT } from '../../../lib/i18n'
import { toCents } from '../../../lib/money'
import { useApplyMovements, useInvalidate, useProducts } from '../../../lib/queries'
import {
  COUNT_ITEMS_MAX,
  COUNT_NOTES_MAX,
  clearCountDraft,
  countSummary,
  filterProducts,
  groupByCategory,
  loadCountDraft,
  saveCountDraft,
  toMilli,
  useQuantityText,
  type CountSummary,
  type CountTexts,
} from '../../../lib/stock'
import { venueTimeZone, zonedToday } from '../../../lib/time'
import { useVenue } from '../../../lib/VenueContext'

export default function CountPage() {
  const t = useT()
  const c = t.inventory.count
  const { venue } = useVenue()
  const venueId = venue?.id ?? 0
  const today = zonedToday(venueTimeZone(venue))
  const products = useProducts(venue?.id)
  const [restored] = useState(() => loadCountDraft(venueId))
  const [counts, setCounts] = useState<CountTexts>(restored?.counts ?? {})
  const [notes, setNotes] = useState(restored?.notes ?? '')
  const [date, setDate] = useState(restored && restored.date <= today ? restored.date : today)
  const [showRestored, setShowRestored] = useState(!!restored)
  const [search, setSearch] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const saved = useRef(false)

  const list = products.data ?? []
  const summary = countSummary(list, counts)
  const groups = groupByCategory(filterProducts(list, { search, lowOnly: false, includeInactive: false }))
  const dirty = Object.values(counts).some((text) => text.trim() !== '')

  // Kept in this tab as it is typed; an empty count is not kept
  useEffect(() => {
    if (venueId && !saved.current) saveCountDraft(venueId, { date, notes, counts })
  }, [venueId, date, notes, counts])

  // Closing or reloading the tab with a count half typed asks first
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setCount = (id: number, text: string) => {
    setProblem(null)
    setCounts((all) => ({ ...all, [String(id)]: text }))
  }

  const startAgain = () => {
    setCounts({})
    setNotes('')
    setDate(today)
    setTouched({})
    setProblem(null)
    setShowRestored(false)
    clearCountDraft(venueId)
  }

  const review = () => {
    if (summary.invalid.length) {
      setTouched(Object.fromEntries(summary.invalid.map((id) => [String(id), true])))
      setProblem(c.invalid(summary.invalid.length))
    } else if (summary.lines.length === 0) setProblem(c.nothing)
    else if (summary.lines.length > COUNT_ITEMS_MAX) setProblem(c.tooMany)
    else setReviewing(true)
  }

  return (
    <div className="page count-page">
      <Link to="/inventory" className="back-link">
        <ArrowLeft size={14} strokeWidth={1.5} />
        {c.back}
      </Link>
      <PageHead title={c.title} sub={c.sub} />

      {showRestored && (
        <div className="notice info" role="status">
          <span className="grow">{c.restored}</span>
          <Button size="sm" variant="ghost" onClick={startAgain}>
            {c.discardDraft}
          </Button>
        </div>
      )}

      {products.isLoading ? (
        <Loading rows={6} />
      ) : products.error ? (
        <ErrorNote error={products.error} />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty
            icon={ClipboardList}
            title={c.empty}
            action={
              <Link to="/inventory" className="btn">
                {c.back}
              </Link>
            }
          >
            {c.emptyBody}
          </Empty>
        </div>
      ) : (
        <>
          <div className="filters">
            <Field label={c.search}>
              {(id) => <input id={id} type="search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} />}
            </Field>
          </div>
          {groups.length === 0 && <p className="muted">{c.noMatch}</p>}
          {groups.map((group) => (
            <section key={group.category} className="card">
              <div className="card-head">
                <h2>{t.productCategories[group.category]}</h2>
                <span className="muted">{t.inventory.stock.groupCount(group.products.length)}</span>
              </div>
              <ul className="list count-list">
                {group.products.map((p) => (
                  <CountRow
                    key={p.id}
                    product={p}
                    text={counts[String(p.id)] ?? ''}
                    summary={summary}
                    showError={!!touched[String(p.id)]}
                    onChange={(text) => setCount(p.id, text)}
                    onBlur={() => setTouched((all) => ({ ...all, [String(p.id)]: true }))}
                  />
                ))}
              </ul>
            </section>
          ))}

          <div className="count-bar">
            <div className="count-bar-text">
              <span className="count-progress">{c.progress(summary.lines.length, list.length)}</span>
              {problem && (
                <span className="error" role="alert">
                  {problem}
                </span>
              )}
            </div>
            <Button variant="primary" icon={ClipboardCheck} onClick={review}>
              {c.review}
            </Button>
          </div>
        </>
      )}

      {venue && reviewing && (
        <ReviewDialog
          venueId={venue.id}
          today={today}
          summary={summary}
          date={date}
          notes={notes}
          onDate={setDate}
          onNotes={setNotes}
          onClose={() => setReviewing(false)}
          onSaved={() => {
            saved.current = true
          }}
        />
      )}
    </div>
  )
}

function CountRow({
  product,
  text,
  summary,
  showError,
  onChange,
  onBlur,
}: {
  product: Product
  text: string
  summary: CountSummary
  showError: boolean
  onChange: (text: string) => void
  onBlur: () => void
}) {
  const t = useT()
  const q = useQuantityText()
  const c = t.inventory.count
  const line = summary.lines.find((l) => l.product.id === product.id)
  const invalid = showError && summary.invalid.includes(product.id)
  const errorId = `count-error-${product.id}`
  const diff = line ? toMilli(line.difference) : null
  return (
    <li className={line ? 'list-row count-row counted' : 'list-row count-row'}>
      <div className="count-product">
        <span className="name">{product.name}</span>
        <span className="muted count-expected">{c.theoretical(q.quantity(product.currentStock, product.unit))}</span>
      </div>
      <div className="count-field">
        <QuantityInput
          unit={product.unit}
          value={text}
          aria-label={c.countedOf(product.name)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          enterKeyHint="next"
          onChange={onChange}
          onBlur={onBlur}
        />
        {invalid && (
          <span id={errorId} className="error">
            {c.countedError}
          </span>
        )}
      </div>
      <div className="count-diff">
        {line && diff !== null && (
          <>
            <span className={diff > 0 ? 'diff over mono' : diff < 0 ? 'diff under mono' : 'diff mono'}>
              {q.signed(line.difference, product.unit)}
            </span>
            <span className="count-words">{diff > 0 ? c.over : diff < 0 ? c.short : c.even}</span>
          </>
        )}
      </div>
    </li>
  )
}

/** What the count changes, the day and the notes, before sending it */
function ReviewDialog({
  venueId,
  today,
  summary,
  date,
  notes,
  onDate,
  onNotes,
  onClose,
  onSaved,
}: {
  venueId: number
  today: string
  summary: CountSummary
  date: string
  notes: string
  onDate: (date: string) => void
  onNotes: (notes: string) => void
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const q = useQuantityText()
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const applyMovements = useApplyMovements()
  const c = t.inventory.count
  const badDate = !date || date > today
  const [submitted, setSubmitted] = useState(false)
  const value = toCents(summary.value)

  const mutation = useMutation({
    mutationFn: () =>
      api.stockCounts.create({
        establishmentId: venueId,
        date,
        notes: notes.trim() || null,
        items: summary.lines.map((l) => ({ productId: l.product.id, countedQuantity: l.counted })),
      }),
    onSuccess: (movements) => {
      onSaved()
      clearCountDraft(venueId)
      applyMovements(venueId, movements)
      toast(c.saved(summary.lines.length))
      void invalidate.stock()
      navigate('/inventory')
    },
  })

  const submit = () => {
    setSubmitted(true)
    if (!badDate) mutation.mutate()
  }

  return (
    <Dialog
      title={c.reviewTitle}
      sub={c.reviewSub}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={ClipboardCheck} loading={mutation.isPending} onClick={submit}>
            {c.confirm}
          </Button>
        </>
      }
    >
      <div className="form">
        <dl className="cash-figures count-figures">
          <div className="cash-figure">
            <dt>{c.products}</dt>
            <dd className="mono">{summary.lines.length}</dd>
          </div>
          <div className="cash-figure">
            <dt>{c.changed}</dt>
            <dd className="mono">{summary.changed.length}</dd>
          </div>
          <div className="cash-figure">
            <dt>{c.byUnit}</dt>
            <dd className="mono">{summary.byUnit.length ? summary.byUnit.map((u) => q.signed(u.difference, u.unit)).join(' · ') : '—'}</dd>
          </div>
          <div className={`cash-figure cash-difference ${value < 0 ? 'short' : value > 0 ? 'over' : 'even'}`}>
            <dt>
              {c.byValue}
              {summary.unvalued > 0 && <span className="cash-figure-hint">{c.unvalued(summary.unvalued)}</span>}
            </dt>
            <dd>
              <span className="mono">{fmt.signedMoney(summary.value)}</span>
            </dd>
          </div>
        </dl>
        {summary.changed.length === 0 ? (
          <p className="muted">{c.allEven}</p>
        ) : (
          <div>
            <h3 className="section-title report-subtitle">{c.differences}</h3>
            <ul className="count-changes">
              {summary.changed.map((l) => (
                <li key={l.product.id}>
                  <span>{l.product.name}</span>
                  <span className="mono">
                    {q.signed(l.difference, l.product.unit)}
                    {l.value !== null && <span className="muted"> · {fmt.signedMoney(l.value)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="row-2">
          <Field label={c.date} error={submitted && badDate ? c.futureDate : undefined}>
            {(id) => (
              <input id={id} type="date" className="input mono" max={today} value={date} onChange={(e) => onDate(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label={c.notes} hint={c.notesHint}>
          {(id) => (
            <textarea id={id} className="textarea" maxLength={COUNT_NOTES_MAX} value={notes} onChange={(e) => onNotes(e.target.value)} />
          )}
        </Field>
        <ErrorNote error={mutation.error} />
      </div>
    </Dialog>
  )
}
