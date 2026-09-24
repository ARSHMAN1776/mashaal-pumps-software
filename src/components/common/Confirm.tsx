import { createContext, useCallback, useContext, useRef, useState, type FC, type ReactNode } from 'react'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'warning' | 'primary'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Promise-based replacement for window.confirm(): `if (await confirm({...})) doIt()` */
export const ConfirmProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false)
      resolver.current = resolve
      setPending(options)
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setPending(null)
  }

  const tone = pending?.tone ?? 'primary'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => settle(false)} width={480} tone={tone === 'danger' ? 'danger' : 'default'} dismissOnBackdrop>
          <div className="ui-confirm-body">
            <div className="ui-confirm-message">{pending.message}</div>
          </div>
          <div className="modal-actions-footer ui-confirm-footer">
            <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>
              {pending.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              autoFocus
              className={`btn ${tone === 'danger' ? 'btn-danger' : tone === 'warning' ? 'btn-warning' : 'btn-primary'}`}
              onClick={() => settle(true)}
            >
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
