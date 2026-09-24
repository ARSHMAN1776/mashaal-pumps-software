import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { AlertCircleIcon, CheckCircleIcon, XIcon } from './Icons'

type Kind = 'success' | 'error' | 'info'
interface Item {
  id: number
  kind: Kind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-3), { id, kind, message }])
    window.setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 4500)
  }, [dismiss])

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-host" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'error' ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
            <span className="ui-toast-text">{t.message}</span>
            <button type="button" className="ui-toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
