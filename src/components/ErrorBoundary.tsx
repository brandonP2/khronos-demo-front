import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '../lib/i18n'
import { Button, Empty } from './ui'

interface Props {
  children: ReactNode
  /** When this changes (for example the route), a caught error is cleared */
  resetKey?: unknown
  /** Wraps the message in the page padding, for use outside the layout */
  standalone?: boolean
}

interface State {
  error: Error | null
}

/** Catches render errors, so a crash shows a message and a retry instead of a blank screen */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Khronos render error', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    const notice = <CrashNotice onRetry={this.reset} />
    return this.props.standalone ? <div className="main">{notice}</div> : notice
  }
}

function CrashNotice({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div className="page" role="alert">
      <div className="card">
        <Empty
          icon={AlertTriangle}
          title={t.crash.title}
          action={
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={onRetry}>
                {t.common.retry}
              </Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                {t.crash.reload}
              </Button>
            </div>
          }
        >
          {t.crash.body}
        </Empty>
      </div>
    </div>
  )
}
