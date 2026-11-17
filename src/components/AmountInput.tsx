// A field for an amount of money, made for the phone: the numeric keypad with the decimal key,
// a comma or a point accepted, and the amount shown back in the local format when it is left.
import type { InputHTMLAttributes } from 'react'
import { useFmt } from '../lib/i18n'
import { parseAmount } from '../lib/money'

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (text: string) => void
}

export function AmountInput({ value, onChange, onBlur, className = '', ...rest }: AmountInputProps) {
  const fmt = useFmt()
  return (
    <span className="amount-input">
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={`input mono ${className}`.trim()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          // "1234,5" reads back as "1.234,50"; something that is not an amount is left for the error
          const amount = parseAmount(value)
          if (amount !== null) onChange(fmt.amount(amount))
          onBlur?.(e)
        }}
      />
      <span className="amount-unit" aria-hidden>
        €
      </span>
    </span>
  )
}
