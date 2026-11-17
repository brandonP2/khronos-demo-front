import { useT } from '../lib/i18n'
import { timeZoneLabel, timeZoneOptions } from '../lib/timezones'
import { Field } from './ui'

/** The venue's time zone, used to show every clock-in and clock-out on the venue's clock */
export function TimeZoneField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (zone: string) => void
  error?: string
}) {
  const t = useT()
  return (
    <Field label={t.timeZone.label} hint={t.timeZone.hint} error={error}>
      {(id) => (
        <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {timeZoneOptions(value).map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone, t)}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}
