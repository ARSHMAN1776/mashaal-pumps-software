import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/dates'
import { rs } from '../../lib/money'
import { useToast } from '../../components/common/Toast'

/**
 * Cheques / online payments that a cashier noted but nobody has placed in a bank account yet.
 * One line each: pick the bank, press Confirm. Shown to managers and owners only.
 */
export const PendingBankNotice: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)
  const pending = activeSiteData.recoveries.filter((r) => r.bankPending)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')

  if (currentUser?.role === 'cashier' || pending.length === 0) return null

  const confirm = async (id: string) => {
    const bankId = pick[id] || banks[0]?.id
    if (!bankId) return
    setBusyId(id)
    const r = await act.assignRecoveryBank(id, bankId)
    setBusyId('')
    if (r.ok) toast.success('Placed in the bank account.')
    else toast.error(r.error)
  }

  return (
    <div className="ui-notice ui-notice-warning" style={{ display: 'block' }}>
      <strong>{pending.length === 1 ? '1 cheque / online payment is' : `${pending.length} cheque / online payments are`} not in a bank account yet.</strong>
      <div className="ui-muted" style={{ margin: '2px 0 10px' }}>Choose the bank each one went to and press Confirm. Until then the customer&apos;s balance is already reduced, but the bank balance is not increased.</div>
      {banks.length === 0 && <div>Add a bank account first (Bank Sheet → Add Bank Account).</div>}
      {banks.length > 0 && pending.map((r) => (
        <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', padding: '8px 0', borderTop: '1px dashed rgba(0,0,0,0.12)' }}>
          <span style={{ flex: '1 1 260px', minWidth: 0 }}>
            <strong>{r.customerName}</strong> — {rs(r.amount)}
            <span className="ui-muted" style={{ display: 'block', fontSize: 12.5 }}>{r.paymentMethod} {r.referenceNo} • {formatDate(r.date)} • {r.receiptNo}</span>
          </span>
          <select className="form-input" style={{ flex: '0 1 240px' }} value={pick[r.id] ?? banks[0].id} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })} aria-label="Bank account">
            {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => void confirm(r.id)}>{busyId === r.id ? 'Saving…' : 'Confirm'}</button>
        </div>
      ))}
    </div>
  )
}
