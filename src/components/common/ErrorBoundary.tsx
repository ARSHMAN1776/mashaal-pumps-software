import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence: a crash in one screen shows a message instead of a blank page. No data is lost — everything is already saved. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="ui-splash">
        <h2>Something went wrong on this screen</h2>
        <p>
          Everything you already saved is safe in the database. Reload the page to continue. If it keeps happening, tell the
          administrator what you were doing when this appeared.
        </p>
        <p className="ui-muted">{this.state.error.message}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
