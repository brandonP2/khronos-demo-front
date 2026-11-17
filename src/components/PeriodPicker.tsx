import { useState } from 'react'
import type { Period } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { matchPreset, PERIOD_PRESETS, periodIssue, presetPeriod, today, type PeriodPreset } from '../lib/time'
import { Field } from './ui'

export interface PeriodValue {
  preset: PeriodPreset | 'custom'
  from: string
  to: string
}

/**
 * The period a report covers: this week by default, or the range given (for example from a
 * link on the hours page). `period` is null while a custom range is incomplete or invalid.
 */
export function usePeriod(initial?: { from?: string | null; to?: string | null }, on: string = today()) {
  const [value, setValue] = useState<PeriodValue>(() => {
    if (initial?.from && initial.to) {
      return { preset: matchPreset(initial.from, initial.to, on) ?? 'custom', from: initial.from, to: initial.to }
    }
    return { preset: 'this-week', ...presetPeriod('this-week', on) }
  })
  const issue = value.from && value.to ? periodIssue(value.from, value.to) : null
  const period: Period | null = value.from && value.to && !issue ? { from: value.from, to: value.to } : null
  return { value, setValue, period, issue }
}

/** Week and month shortcuts, or two dates for any range up to 366 days */
export function PeriodPicker({
  value,
  onChange,
  on = today(),
}: {
  value: PeriodValue
  onChange: (value: PeriodValue) => void
  on?: string
}) {
  const t = useT()
  const fmt = useFmt()
  const issue = value.from && value.to ? periodIssue(value.from, value.to) : null
  const issueText = issue === 'order' ? t.period.order : issue === 'too-long' ? t.period.tooLong : undefined

  return (
    <div className="period">
      <div className="segmented" role="group" aria-label={t.period.label}>
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset}
            aria-pressed={value.preset === preset}
            onClick={() => onChange({ preset, ...presetPeriod(preset, on) })}
          >
            {t.period.presets[preset]}
          </button>
        ))}
        <button aria-pressed={value.preset === 'custom'} onClick={() => onChange({ ...value, preset: 'custom' })}>
          {t.period.custom}
        </button>
      </div>
      {value.preset === 'custom' ? (
        <div className="period-dates">
          <Field label={t.period.from} error={issueText}>
            {(id) => (
              <input
                id={id}
                type="date"
                className="input mono"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
              />
            )}
          </Field>
          <Field label={t.period.to}>
            {(id) => (
              <input
                id={id}
                type="date"
                className="input mono"
                value={value.to}
                min={value.from || undefined}
                aria-invalid={!!issueText}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : (
        <span className="period-range mono">{fmt.range(value.from, value.to)}</span>
      )}
    </div>
  )
}
