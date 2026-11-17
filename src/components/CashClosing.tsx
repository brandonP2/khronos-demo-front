// The cash closing of one service day: the form the owner fills in on the phone after service,
// with the figures worked out live, and the read-only view once it is closed (reopen, history).
// An internal management record: it makes no claim about any tax or invoicing rule.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { History, Lock, LockOpen, Save, Trash2 } from 'lucide-react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { CashClosing, CashClosingChange, CashClosingInput, CashClosingStatus, Expense } from '../api/types'
import { cashFigures, DIFFERENCE_REASON_LIMIT, needsDifferenceReason, type CashFigures } from '../lib/cash'
import { useFmt, useT } from '../lib/i18n'
import { isBlank, parseAmount, sumMoney, toCents } from '../lib/money'
import { useCashClosingHistory, useInvalidate } from '../lib/queries'
import { zonedDate, zonedTime, type Fmt } from '../lib/time'
import { AmountInput } from './AmountInput'
import { Button, ConfirmDialog, Dialog, ErrorNote, Field, Loading, useToast } from './ui'

type AmountKey = 'cashSales' | 'cardSales' | 'otherSales' | 'openingFloat' | 'cashWithdrawals' | 'countedCash' | 'tips'

const SALES: AmountKey[] = ['cashSales', 'cardSales', 'otherSales']
const TILL: AmountKey[] = ['openingFloat', 'cashWithdrawals', 'countedCash']

export const NOTES_MAX = 500
export const REASON_MAX = 255

const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 409

/** A closing's status in words, never colour alone; NEW is a day with nothing saved yet */
export function ClosingStatusTag({ status }: { status: CashClosingStatus | 'NEW' }) {
  const t = useT()
  const cls = status === 'CLOSED' ? 'tag good' : 'tag'
  return <span className={cls}>{t.cash.status[status]}</span>
}

/** Counted minus expected, signed, with the words for it: over, short or balanced */
export function CashDifference({ value }: { value: number }) {
  const t = useT()
  const fmt = useFmt()
  const cents = toCents(value)
  const cls = cents > 0 ? 'diff over' : cents < 0 ? 'diff under' : 'diff'
  const words = cents > 0 ? t.cash.over : cents < 0 ? t.cash.short : t.cash.even
  return (
    <span className={cls}>
      {fmt.signedMoney(value)}
      <span className="visually-hidden"> {words}</span>
    </span>
  )
}

/** The figures that come out of the count: total sales, cash expenses, expected cash and the difference */
export function CashFiguresPanel({ figures, cashExpenses, day }: { figures: CashFigures; cashExpenses: number; day: string }) {
  const t = useT()
  const fmt = useFmt()
  const cents = figures.difference === null ? null : toCents(figures.difference)
  const tone = cents === null ? '' : cents > 0 ? 'over' : cents < 0 ? 'short' : 'even'
  return (
    <dl className="cash-figures">
      <div className="cash-figure">
        <dt>{t.cash.totalSales}</dt>
        <dd className="mono">{fmt.money(figures.totalSales)}</dd>
      </div>
      <div className="cash-figure">
        <dt>
          {t.cash.cashExpenses}
          <Link className="cash-figure-link" to={`/expenses?from=${day}&to=${day}`}>
            {t.cash.seeExpenses}
          </Link>
        </dt>
        <dd className="mono">{cashExpenses ? fmt.signedMoney(-cashExpenses) : fmt.money(0)}</dd>
      </div>
      <div className="cash-figure">
        <dt>
          {t.cash.expectedCash}
          <span className="cash-figure-hint">{t.cash.expectedHint}</span>
        </dt>
        <dd className="mono">{fmt.money(figures.expectedCash)}</dd>
      </div>
      <div className={`cash-figure cash-difference ${tone}`} aria-live="polite">
        <dt>{t.cash.difference}</dt>
        {figures.difference === null ? (
          <dd className="cash-figure-hint">{t.cash.notCounted}</dd>
        ) : (
          <dd>
            <span className="mono">{fmt.signedMoney(figures.difference)}</span>{' '}
            <span className="cash-difference-words">{tone === 'over' ? t.cash.over : tone === 'short' ? t.cash.short : t.cash.even}</span>
          </dd>
        )}
      </div>
    </dl>
  )
}

function initialTexts(closing: CashClosing | null, fmt: Fmt): Record<AmountKey, string> {
  const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmt.amount(n))
  return {
    cashSales: text(closing?.cashSales),
    cardSales: text(closing?.cardSales),
    otherSales: text(closing?.otherSales),
    openingFloat: text(closing?.openingFloat),
    cashWithdrawals: text(closing?.cashWithdrawals),
    countedCash: text(closing?.countedCash),
    tips: text(closing?.tips),
  }
}

/** Whether saving the form would change what is stored */
function differs(input: CashClosingInput, closing: CashClosing): boolean {
  const keys = ['openingFloat', 'cashSales', 'cardSales', 'otherSales', 'cashWithdrawals', 'countedCash'] as const
  return (
    keys.some((k) => toCents(input[k]) !== toCents(closing[k])) ||
    (input.tips === null ? closing.tips !== null : closing.tips === null || toCents(input.tips) !== toCents(closing.tips)) ||
    (input.notes ?? '') !== (closing.notes ?? '')
  )
}

/** The newer of two versions of the same closing */
function newest(a: CashClosing | null, b: CashClosing | null): CashClosing | null {
  if (!a || !b || a.id !== b.id) return b ?? a
  return a.updatedAt > b.updatedAt ? a : b
}

/**
 * Filling in a day's count: amounts typed with a comma or a point, the figures worked out as
 * they are typed, "Save draft" and "Close the till". Closing with a difference over the limit
 * asks for a reason first; the API checks it again and its 409 brings the reason up as well.
 */
export function CashClosingForm({
  venueId,
  day,
  closing,
  dayExpenses,
  onConflict,
}: {
  venueId: number
  day: string
  /** The day's draft, or null when nothing is saved yet */
  closing: CashClosing | null
  /** The day's expenses, for the cash ones while nothing is saved */
  dayExpenses: Expense[]
  /** Someone else changed the closing: reload it and say why */
  onConflict: (notice: string | null) => void | Promise<void>
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [texts, setTexts] = useState(() => initialTexts(closing, fmt))
  const [touched, setTouched] = useState<Partial<Record<AmountKey, boolean>>>({})
  const [notes, setNotes] = useState(closing?.notes ?? '')
  const [reason, setReason] = useState(closing?.differenceReason ?? '')
  const [submitted, setSubmitted] = useState(false)
  // The API asked for a reason even if the difference looks small here (its limit can be set lower)
  const [reasonAsked, setReasonAsked] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // What this form saved last, so a second click updates the draft instead of creating it again
  const [own, setOwn] = useState<CashClosing | null>(null)
  const step = useRef<'save' | 'close'>('save')

  const current = newest(own, closing)
  const invalid = (k: AmountKey) => !isBlank(texts[k]) && parseAmount(texts[k]) === null
  const amount = (k: AmountKey) => parseAmount(texts[k]) ?? 0
  const anyInvalid = (Object.keys(texts) as AmountKey[]).some(invalid)
  const counted = isBlank(texts.countedCash) || invalid('countedCash') ? null : amount('countedCash')
  const cashExpenses =
    closing?.cashExpenses ?? current?.cashExpenses ?? sumMoney(dayExpenses.filter((e) => e.paymentMethod === 'CASH').map((e) => e.amount))
  const figures = cashFigures({
    openingFloat: amount('openingFloat'),
    cashSales: amount('cashSales'),
    cardSales: amount('cardSales'),
    otherSales: amount('otherSales'),
    cashWithdrawals: amount('cashWithdrawals'),
    countedCash: counted,
    cashExpenses,
  })
  const reasonNeeded = needsDifferenceReason(figures.difference) || reasonAsked
  const reasonMissing = reasonNeeded && reason.trim().length === 0

  const input: CashClosingInput = {
    establishmentId: venueId,
    businessDate: day,
    openingFloat: amount('openingFloat'),
    cashSales: amount('cashSales'),
    cardSales: amount('cardSales'),
    otherSales: amount('otherSales'),
    cashWithdrawals: amount('cashWithdrawals'),
    countedCash: amount('countedCash'),
    tips: isBlank(texts.tips) ? null : amount('tips'),
    notes: notes.trim() || null,
  }

  const mutation = useMutation({
    mutationFn: async (closeIt: boolean) => {
      step.current = 'save'
      let saved = current
      if (!saved) saved = await api.cashClosings.create(input)
      else if (differs(input, saved)) saved = await api.cashClosings.update(saved.id, input)
      setOwn(saved)
      if (!closeIt) return { saved, closed: false }
      step.current = 'close'
      return { saved: await api.cashClosings.close(saved.id, reasonNeeded ? reason.trim() : undefined), closed: true }
    },
    onSuccess: async ({ saved, closed }) => {
      setOwn(saved)
      toast(closed ? t.cash.closed(fmt.long(day)) : t.cash.saved)
      await invalidate.cash()
    },
    onError: (e) => {
      if (!isConflict(e)) return
      if (step.current === 'close' && !reasonNeeded) {
        // Over the API's limit with no reason: ask for it here
        setReasonAsked(true)
        return
      }
      // The day got a closing elsewhere, or it was closed meanwhile
      void onConflict(step.current === 'save' && !current ? t.cash.alreadyExists : t.cash.closedMeanwhile)
    },
  })

  // A 409 is either answered here (the reason) or handed to the page, which reloads the closing
  const conflict = isConflict(mutation.error)
  const error = conflict ? (reasonAsked && reasonMissing ? t.cash.reasonRequired : null) : mutation.error
  const canClose = !anyInvalid && counted !== null && !reasonMissing

  const send = (closeIt: boolean) => {
    setSubmitted(true)
    if (anyInvalid || (closeIt && !canClose)) return
    mutation.mutate(closeIt)
  }

  const amountField = (k: AmountKey, hint?: string) => (
    <Field
      label={t.cash[k]}
      hint={hint}
      error={(touched[k] || submitted) && invalid(k) ? t.cash.amountError : undefined}
    >
      {(id) => (
        <AmountInput
          id={id}
          value={texts[k]}
          placeholder={fmt.amount(0)}
          onChange={(text) => setTexts((all) => ({ ...all, [k]: text }))}
          onBlur={() => setTouched((all) => ({ ...all, [k]: true }))}
        />
      )}
    </Field>
  )

  const hints: Partial<Record<AmountKey, string>> = {
    otherSales: t.cash.otherSalesHint,
    openingFloat: t.cash.openingFloatHint,
    cashWithdrawals: t.cash.cashWithdrawalsHint,
    countedCash: t.cash.countedCashHint,
  }

  return (
    <form
      className="cash-layout"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        send(false)
      }}
    >
      <div className="form cash-fields">
        <fieldset className="cash-group">
          <legend>{t.cash.sales}</legend>
          <div className="row-3">{SALES.map((k) => <div key={k}>{amountField(k, hints[k])}</div>)}</div>
        </fieldset>
        <fieldset className="cash-group">
          <legend>{t.cash.till}</legend>
          <div className="row-3">{TILL.map((k) => <div key={k}>{amountField(k, hints[k])}</div>)}</div>
        </fieldset>
        <div className="row-3">
          <div>{amountField('tips', t.cash.tipsHint)}</div>
        </div>
        <Field label={t.cash.notes} hint={t.cash.notesHint}>
          {(id) => (
            <textarea id={id} className="textarea" maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>

      <div className="cash-side">
        <CashFiguresPanel figures={figures} cashExpenses={cashExpenses} day={day} />
        {reasonNeeded && (
          <Field
            label={t.cash.reason}
            hint={t.cash.reasonHint(fmt.money(DIFFERENCE_REASON_LIMIT))}
            error={submitted && reasonMissing && !conflict ? t.cash.reasonError : undefined}
          >
            {(id) => (
              <textarea id={id} className="textarea" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        )}
        <ErrorNote error={error} />
        {submitted && counted === null && !invalid('countedCash') && <p className="hint muted">{t.cash.countBeforeClosing}</p>}
        <div className="cash-actions">
          <Button type="submit" icon={Save} loading={mutation.isPending && mutation.variables === false} disabled={mutation.isPending}>
            {t.cash.saveDraft}
          </Button>
          <Button
            variant="primary"
            icon={Lock}
            loading={mutation.isPending && mutation.variables === true}
            disabled={mutation.isPending}
            aria-disabled={!canClose || undefined}
            onClick={() => send(true)}
          >
            {t.cash.close}
          </Button>
          {current?.status === 'DRAFT' && (
            <Button variant="ghost" size="sm" icon={Trash2} className="cash-discard" onClick={() => setDiscarding(true)}>
              {t.cash.discard}
            </Button>
          )}
        </div>
      </div>

      {discarding && current && (
        <ConfirmDialog
          title={t.cash.discardTitle}
          confirmLabel={t.cash.discard}
          onClose={() => setDiscarding(false)}
          onConfirm={async () => {
            try {
              await api.cashClosings.remove(current.id)
            } catch (e) {
              if (isConflict(e)) {
                await onConflict(t.cash.closedMeanwhile)
                return
              }
              throw e
            }
            toast(t.cash.discarded)
            await onConflict(null)
          }}
        >
          {t.cash.discardBody}
        </ConfirmDialog>
      )}
    </form>
  )
}

/** A closed day: what was entered and what came out of it, read only, with reopen and history */
export function ClosedClosing({
  closing,
  timeZone,
  onReopened,
}: {
  closing: CashClosing
  timeZone: string
  onReopened: (notice: string | null) => void | Promise<void>
}) {
  const t = useT()
  const fmt = useFmt()
  const [modal, setModal] = useState<'reopen' | 'history' | null>(null)
  const value = (n: number | null) => (n === null ? '—' : fmt.money(n))

  return (
    <div className="cash-layout">
      <div className="form cash-fields">
        {closing.closedAt && closing.closedByName && (
          <p className="status">
            <Lock size={14} strokeWidth={1.5} aria-hidden />
            {t.cash.closedBy(
              `${fmt.short(zonedDate(closing.closedAt, timeZone))} ${zonedTime(closing.closedAt, timeZone)}`,
              closing.closedByName,
            )}
          </p>
        )}
        <dl className="kv cash-values">
          {([...SALES, ...TILL] as const).map((k) => (
            <div key={k} className="kv-row">
              <dt>{t.cash[k]}</dt>
              <dd className="mono">{value(closing[k])}</dd>
            </div>
          ))}
          <div className="kv-row">
            <dt>{t.cash.tips}</dt>
            <dd className="mono">{value(closing.tips)}</dd>
          </div>
          {closing.notes && (
            <div className="kv-row">
              <dt>{t.cash.notes}</dt>
              <dd>{closing.notes}</dd>
            </div>
          )}
          {closing.differenceReason && (
            <div className="kv-row">
              <dt>{t.cash.reason}</dt>
              <dd>«{closing.differenceReason}»</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="cash-side">
        <CashFiguresPanel
          figures={{ totalSales: closing.totalSales, expectedCash: closing.expectedCash, difference: closing.difference }}
          cashExpenses={closing.cashExpenses}
          day={closing.businessDate}
        />
        <div className="cash-actions">
          <Button icon={History} onClick={() => setModal('history')}>
            {t.cash.history}
          </Button>
          <Button variant="primary" icon={LockOpen} onClick={() => setModal('reopen')}>
            {t.cash.reopen}
          </Button>
        </div>
      </div>
      {modal === 'reopen' && <ReopenDialog closing={closing} onClose={() => setModal(null)} onDone={onReopened} />}
      {modal === 'history' && <ClosingHistoryDialog closing={closing} timeZone={timeZone} onClose={() => setModal(null)} />}
    </div>
  )
}

/** Back to a draft, with a reason (3 to 255 characters) that stays in the history */
function ReopenDialog({
  closing,
  onClose,
  onDone,
}: {
  closing: CashClosing
  onClose: () => void
  onDone: (notice: string | null) => void | Promise<void>
}) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const invalidReason = reason.trim().length < 3 || reason.trim().length > REASON_MAX

  const mutation = useMutation({
    mutationFn: () => api.cashClosings.reopen(closing.id, reason.trim()),
    onSuccess: async () => {
      toast(t.cash.reopened)
      onClose()
      await onDone(null)
    },
    onError: async (e) => {
      if (!isConflict(e)) return
      onClose()
      await onDone(t.cash.notClosed)
    },
  })
  const submit = () => {
    setTouched(true)
    if (!invalidReason) mutation.mutate()
  }

  return (
    <Dialog
      title={t.cash.reopenTitle(fmt.long(closing.businessDate))}
      sub={t.cash.reopenBody}
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" icon={LockOpen} disabled={invalidReason} loading={mutation.isPending} onClick={submit}>
            {t.cash.reopen}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={t.cash.reopenReason} hint={t.cash.reopenHint} error={touched && invalidReason ? t.cash.reopenError : undefined}>
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              required
              maxLength={REASON_MAX}
              value={reason}
              onBlur={() => setTouched(true)}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <ErrorNote error={isConflict(mutation.error) ? null : mutation.error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** Every change to a closing, oldest first */
function ClosingHistoryDialog({ closing, timeZone, onClose }: { closing: CashClosing; timeZone: string; onClose: () => void }) {
  const t = useT()
  const fmt = useFmt()
  const history = useCashClosingHistory(closing.id)
  return (
    <Dialog title={t.cash.historyTitle} sub={t.cash.historySub(fmt.long(closing.businessDate))} onClose={onClose}>
      {history.isLoading ? (
        <Loading rows={2} />
      ) : history.error ? (
        <ErrorNote error={history.error} />
      ) : (
        <ol className="history">
          {(history.data ?? []).map((change) => (
            <ClosingChange key={change.id} change={change} timeZone={timeZone} />
          ))}
        </ol>
      )}
    </Dialog>
  )
}

function ClosingChange({ change, timeZone }: { change: CashClosingChange; timeZone: string }) {
  const t = useT()
  const fmt = useFmt()
  const when = `${fmt.day(zonedDate(change.changedAt, timeZone))} ${zonedTime(change.changedAt, timeZone)}`
  return (
    <li className="history-item">
      <div className="history-head">
        <span className="history-action">{t.cash.actions[change.action]}</span>
        <span className="muted mono">{t.entries.by(change.changedByName, when)}</span>
      </div>
      {change.reason && (
        <p className="history-reason">
          <span className="visually-hidden">{t.entries.reason}: </span>«{change.reason}»
        </p>
      )}
      <span className="muted mono" style={{ fontSize: 12 }}>
        {t.cash.historyValues(fmt.money(change.totalSales), fmt.money(change.countedCash), fmt.signedMoney(change.difference))}
      </span>
    </li>
  )
}
