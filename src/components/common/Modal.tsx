import { useEffect, type FC, type ReactNode } from 'react'
import { XIcon } from './Icons'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** max width in px (default 640) */
  width?: number
  /** clicking the dark area closes the dialog. Off by default for forms so typed data is never lost by accident. */
  dismissOnBackdrop?: boolean
  /** blocks closing (while a save is running) */
  busy?: boolean
  /** highlight colour for destructive dialogs */
  tone?: 'default' | 'danger'
}

/** Dialog shell used by every form: consistent header, Escape to close, scrolls on small screens. */
export const Modal: FC<ModalProps> = ({ title, subtitle, onClose, children, width = 640, dismissOnBackdrop = false, busy = false, tone = 'default' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissOnBackdrop && !busy && e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal-container ui-modal ${tone === 'danger' ? 'ui-modal-danger' : ''}`} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 className="modal-heading">{title}</h3>
            {subtitle && <span className="modal-sub">{subtitle}</span>}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const FormError: FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div className="ui-error" role="alert">
      {message}
    </div>
  ) : null
