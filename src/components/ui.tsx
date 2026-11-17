import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2, X, type LucideIcon } from 'lucide-react'
import { ApiError } from '../api/client'
import { knownApiMessage } from '../lib/apiMessages'
import { useT, type Messages } from '../lib/i18n'
import { endsNextDay, hhmm } from '../lib/time'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: LucideIcon
  loading?: boolean
  iconOnly?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  icon: Icon,
  loading,
  iconOnly,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    variant !== 'default' && `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    iconOnly && 'btn-icon',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const iconSize = size === 'sm' ? 14 : 16
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={1.5} className="spin" />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={1.5} />
      )}
      {children}
    </button>
  )
}

interface FieldControlProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

/**
 * A labelled control. The error, or else the hint, is linked to the control with
 * aria-describedby, and an error also marks it aria-invalid, so screen readers read both.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => ReactElement<FieldControlProps>
}) {
  const id = useId()
  const noteId = `${id}-note`
  const control = children(id)
  const note = error || hint
  const describedBy = [control.props['aria-describedby'], note ? noteId : null].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(control, {
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : control.props['aria-invalid'],
      })}
      {error ? (
        <span id={noteId} className="error">
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** "+1" after a time that falls on the next day; screen readers hear the words instead */
export function NextDay() {
  const t = useT()
  return (
    <span className="next-day" title={t.board.nextDay}>
      <span aria-hidden>+1</span>
      <span className="visually-hidden"> {t.board.nextDay}</span>
    </span>
  )
}

/** A shift's times, "18:00–02:00+1", with the mark when it ends the next day */
export function ShiftTimes({ startTime, endTime }: { startTime: string; endTime: string }) {
  return (
    <>
      {hhmm(startTime)}–{hhmm(endTime)}
      {endsNextDay(startTime, endTime) && <NextDay />}
    </>
  )
}

export function Avatar({ initials, size }: { initials: string; size?: 'sm' }) {
  return (
    <span className={size === 'sm' ? 'avatar sm' : 'avatar'} aria-hidden>
      {initials}
    </span>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  )
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon size={20} strokeWidth={1.5} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/**
 * Errors written by the API are shown as they come (in English), except the clock-in ones the
 * app knows, which are worded in the current language like the errors the app detects itself.
 */
export function errorMessage(error: unknown, t: Messages): string {
  if (typeof error === 'string') return error
  if (error instanceof ApiError) {
    if (error.kind === 'network') return t.errors.network
    if (error.kind === 'server') return t.errors.server
    if (error.kind === 'rate-limited') return t.errors.rateLimited(error.retryAfter === null ? null : t.common.wait(error.retryAfter))
    return knownApiMessage(error.message, t) ?? error.message
  }
  if (error instanceof Error) return error.message
  return t.errors.generic
}

export function ErrorNote({ error }: { error: unknown }) {
  const t = useT()
  if (!error) return null
  return (
    <div className="notice" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} />
      <span>{errorMessage(error, t)}</span>
    </div>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const t = useT()
  return (
    <div className="form" aria-busy="true" aria-label={t.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 44, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

/** Open dialogs and drawers, top-most last. Only the top one answers Escape and Tab. */
const modalStack: object[] = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal behaviour shared by Dialog and Drawer: focus moves in on open, Tab stays inside,
 * Escape closes unless a save is running, and focus goes back to what opened it on close.
 */
function useModal(onClose: () => void, busy: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ onClose, busy })
  useEffect(() => {
    latest.current = { onClose, busy }
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const token = {}
    modalStack.push(token)
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = el.querySelector<HTMLElement>('[data-autofocus], input, select, textarea') ?? el
    target.focus()

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!latest.current.busy) latest.current.onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest('[hidden], [inert]'))
      const active = document.activeElement
      if (items.length === 0) {
        e.preventDefault()
        el.focus()
      } else if (e.shiftKey && (active === items[0] || active === el || !el.contains(active))) {
        e.preventDefault()
        items[items.length - 1].focus()
      } else if (!e.shiftKey && (active === items[items.length - 1] || !el.contains(active))) {
        e.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      modalStack.splice(modalStack.indexOf(token), 1)
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [])

  const requestClose = () => {
    if (!latest.current.busy) latest.current.onClose()
  }
  return { ref, requestClose }
}

interface PanelProps {
  title: string
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** A save is running: Escape, the overlay and the close button do nothing until it ends */
  busy?: boolean
}

export function Dialog({ title, sub, onClose, children, footer, wide, busy = false }: PanelProps) {
  const t = useT()
  const { ref, requestClose } = useModal(onClose, busy)
  const titleId = useId()
  return createPortal(
    <>
      <div className="overlay" onClick={requestClose} />
      <div
        ref={ref}
        className={wide ? 'dialog wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={requestClose} disabled={busy} aria-label={t.common.close} />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

export function Drawer({ title, sub, onClose, children, footer, busy = false }: PanelProps) {
  const t = useT()
  const { ref, requestClose } = useModal(onClose, busy)
  const titleId = useId()
  return createPortal(
    <>
      <div className="overlay" onClick={requestClose} />
      <aside
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={requestClose} disabled={busy} aria-label={t.common.close} />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </aside>
    </>,
    document.body,
  )
}

/** Small confirm step for destructive actions, since the API cascades deletes */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={run} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="secondary">{children}</div>
        <ErrorNote error={error} />
      </div>
    </Dialog>
  )
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number
  text: string
}

const ToastContext = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Check size={16} strokeWidth={1.5} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/** The product mark: two shift bars crossed by the coverage line */
export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="5" width="11" height="4" rx="2" fill="currentColor" />
      <rect x="7" y="13" width="13" height="4" rx="2" fill="currentColor" opacity="0.55" />
      <rect x="10.25" y="1" width="1.5" height="20" rx="0.75" fill="var(--accent)" />
    </svg>
  )
}
