// A field for a stock quantity, made for the phone like the amount field: the numeric keypad
// with the decimal key, a comma or a point, up to three decimals, and the unit beside it in the
// plural the quantity takes. The unit is read out with the field; with none known yet (no product
// chosen), none is shown.
import { useId, type InputHTMLAttributes } from 'react'
import type { StockUnit } from '../api/types'
import { useFmt, useT } from '../lib/i18n'
import { parseQuantity } from '../lib/stock'

interface QuantityInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (text: string) => void
  /** Left out while it is not known, rather than guessed */
  unit?: StockUnit
}

export function QuantityInput({ value, onChange, onBlur, unit, className = '', ...rest }: QuantityInputProps) {
  const t = useT()
  const fmt = useFmt()
  const unitId = useId()
  const quantity = parseQuantity(value)
  return (
    <span className="quantity-input">
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={`input mono ${className}`.trim()}
        value={value}
        aria-describedby={[rest['aria-describedby'], unit && unitId].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          // "4.50" reads back as "4,5"; something that is not a quantity is left for the error
          if (quantity !== null) onChange(fmt.quantityInput(quantity))
          onBlur?.(e)
        }}
      />
      {unit && (
        <span className="quantity-unit" id={unitId}>
          {t.units[unit](quantity ?? 2)}
        </span>
      )}
    </span>
  )
}
