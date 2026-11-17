import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../api/endpoints'
import type { WorkerRate } from '../api/types'
import { parseRate } from '../lib/hours'
import { useFmt, useT } from '../lib/i18n'
import { useInvalidate, useRates } from '../lib/queries'
import { Button, ConfirmDialog, ErrorNote, Field, Loading, useToast } from './ui'

/**
 * A person's hourly rate and its history. A rate applies from its date until the next one
 * starts; one already applied is never edited, a new one is added instead. Only a rate that
 * has not started yet, or starts today, can be removed. Owner only.
 */
export function RatesCard({ workerId, today }: { workerId: number; today: string }) {
  const t = useT()
  const fmt = useFmt()
  const toast = useToast()
  const invalidate = useInvalidate()
  const rates = useRates(workerId)
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(today)
  const [removing, setRemoving] = useState<WorkerRate | null>(null)

  const list = rates.data ?? []
  const current = list.find((r) => r.effectiveFrom <= today) ?? null
  const hourlyRate = parseRate(amount)
  const amountError = amount.trim() && hourlyRate === null ? t.rates.amountError : undefined
  const duplicate = list.some((r) => r.effectiveFrom === from) ? t.rates.duplicate : undefined
  const perHour = (r: WorkerRate) => t.hours.perHour(fmt.money(r.hourlyRate))

  const add = useMutation({
    mutationFn: () => api.rates.create(workerId, { hourlyRate: hourlyRate!, effectiveFrom: from }),
    onSuccess: async () => {
      setAmount('')
      await invalidate.rates()
      toast(t.rates.added)
    },
  })
  const canAdd = hourlyRate !== null && !!from && !duplicate

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t.rates.title}</h2>
        <span className="mono" style={{ fontSize: 13 }}>
          {current ? perHour(current) : <span className="muted">{t.rates.none}</span>}
        </span>
      </div>
      {rates.isLoading ? (
        <div className="card-body">
          <Loading rows={1} />
        </div>
      ) : rates.error ? (
        <div className="card-body">
          <ErrorNote error={rates.error} />
        </div>
      ) : list.length === 0 ? (
        <p className="card-body muted" style={{ margin: 0 }}>
          {t.rates.empty}
        </p>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="list-row">
              <span className="mono" style={{ fontWeight: 500 }}>
                {perHour(r)}
              </span>
              <span className="muted" style={{ flex: 1 }}>
                {t.rates.from(fmt.long(r.effectiveFrom))}
              </span>
              {r === current && <span className="tag good">{t.rates.current}</span>}
              {r.effectiveFrom > today && <span className="tag">{t.rates.upcoming}</span>}
              {r.effectiveFrom >= today && (
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={Trash2}
                  aria-label={t.rates.remove(perHour(r), fmt.long(r.effectiveFrom))}
                  onClick={() => setRemoving(r)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <form
        className="card-body form"
        style={{ borderTop: '1px solid var(--line)' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (canAdd) add.mutate()
        }}
      >
        <div className="rate-form">
          <Field label={t.rates.amount} error={amountError}>
            {(id) => (
              <input
                id={id}
                className="input mono"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t.rates.amountPlaceholder}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t.rates.effectiveFrom} error={duplicate}>
            {(id) => <input id={id} type="date" className="input mono" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Button type="submit" icon={Plus} disabled={!canAdd} loading={add.isPending}>
            {t.rates.add}
          </Button>
        </div>
        <span className="hint muted" style={{ fontSize: 12 }}>
          {t.rates.hint}
        </span>
        <ErrorNote error={add.error} />
      </form>

      {removing && (
        <ConfirmDialog
          title={t.rates.removeTitle}
          confirmLabel={t.rates.removeConfirm}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.rates.remove(workerId, removing.id)
            await invalidate.rates()
            toast(t.rates.removed)
          }}
        >
          {t.rates.remove(perHour(removing), fmt.long(removing.effectiveFrom))}. {t.rates.removeBody}
        </ConfirmDialog>
      )}
    </section>
  )
}
