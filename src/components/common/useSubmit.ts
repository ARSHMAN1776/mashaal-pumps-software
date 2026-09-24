import { useCallback, useRef, useState } from 'react'
import type { Result } from '../../data/errors'
import { useApp } from '../../context/AppContext'
import { useConfirm } from './Confirm'
import { useToast } from './Toast'

/**
 * Rules a manager may knowingly override. The action reports one of these codes; a manager is asked to
 * confirm and the action is repeated with the code acknowledged. A cashier just sees the message.
 */
const SOFT_CODES = new Set([
  'LIMIT_EXCEEDED', 'VEHICLE_NOT_REGISTERED', 'OVERPAYMENT', 'NEGATIVE_SAFE', 'NEGATIVE_BANK',
  'METER_OVERLAP', 'METER_GAP', 'OVER_CAPACITY', 'DAILY_LIMIT', 'SALARY_LIMIT',
])

const TITLES: Record<string, string> = {
  LIMIT_EXCEEDED: 'Credit limit exceeded',
  VEHICLE_NOT_REGISTERED: 'Vehicle not registered',
  OVERPAYMENT: 'Amount is more than owed',
  NEGATIVE_SAFE: 'Not enough cash in the safe',
  NEGATIVE_BANK: 'Not enough balance in the bank account',
  METER_OVERLAP: 'Meter reading overlaps',
  METER_GAP: 'Meter reading skips liters',
  OVER_CAPACITY: 'More than the tank capacity',
  DAILY_LIMIT: 'Advance limit exceeded',
  SALARY_LIMIT: 'Advances exceed the salary',
}

/**
 * Wraps a save/delete button: prevents double clicks, shows the error inside the dialog, and handles
 * "manager authorization" prompts.
 *
 *   const { busy, error, run } = useSubmit()
 *   run((ack) => act.issueSlip({ ...form, acknowledge: ack }), () => onClose())
 */
export function useSubmit() {
  const { currentUser } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(
    async <T,>(fn: (acknowledge: string[]) => Promise<Result<T>>, onOk?: (value: T) => void): Promise<boolean> => {
      if (inFlight.current) return false
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        let ack: string[] = []
        for (let attempt = 0; attempt < 6; attempt++) {
          const r = await fn(ack)
          if (r.ok) {
            onOk?.(r.value)
            return true
          }
          if (r.code && SOFT_CODES.has(r.code) && currentUser && currentUser.role !== 'cashier' && !ack.includes(r.code)) {
            const yes = await confirm({
              title: TITLES[r.code] ?? 'Please confirm',
              message: r.error,
              confirmLabel: 'Authorize and continue',
              tone: 'warning',
            })
            if (!yes) return false
            ack = [...ack, r.code]
            continue
          }
          setError(r.error)
          return false
        }
        return false
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong.'
        setError(message)
        toast.error(message)
        return false
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [confirm, currentUser, toast],
  )

  return { busy, error, setError, run }
}
