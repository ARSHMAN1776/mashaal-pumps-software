import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { safeCash } from '../../data/derive'
import { todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { CheckCircleIcon } from '../../components/common/Icons'
import { Modal, FormError } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { useSubmit } from '../../components/common/useSubmit'
import { CalcStrip, Field, Grid2, Grid3 } from '../../components/common/kit'

/** Owner withdrawal: money leaves the station either from a bank account or as cash from the safe. */
export const OwnerTransferModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)
  const last = activeSiteData.ownerTransfers[0]
  const [source, setSource] = useState<'bank' | 'cash'>(banks.length ? 'bank' : 'cash')
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState(last?.accountTitle ?? '')
  const [number, setNumber] = useState(last?.accountNumber ?? '')
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('Owner profit withdrawal')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const bank = banks.find((b) => b.id === bankId)
  const safe = safeCash(activeSiteData)
  const amt = Number(amount) || 0
  const before = source === 'bank' ? bank?.currentBalance ?? 0 : safe

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (source === 'cash') {
      void run(
        (ack) => act.addOwnerCashWithdrawal({ amount: Number(amount), notes, date, acknowledge: ack }),
        () => { toast.success(`${rs(amt)} cash taken from the safe.`); onClose() },
      )
      return
    }
    void run(
      () => act.addOwnerTransfer({ amount: Number(amount), bankId, accountTitle: title, accountNumber: number, referenceNo: ref, notes, date }),
      (t) => { toast.success(`Recorded ${rs(t.amount)} transfer to ${t.accountTitle}. Ref: ${t.referenceNo}`); onClose() },
    )
  }

  const choice = (value: 'bank' | 'cash', label: string) => (
    <button
      type="button"
      className={`btn ${source === value ? 'btn-primary' : 'btn-outline'}`}
      style={{ flex: 1, justifyContent: 'center' }}
      onClick={() => setSource(value)}
      aria-pressed={source === value}
    >
      {label}
    </button>
  )

  return (
    <Modal title="Owner Withdrawal" subtitle="Record money you take out of the station" onClose={onClose} busy={busy} width={740}>
      <form className="modal-form-compact" onSubmit={submit}>
        <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Where does the money come from?">
          {choice('bank', 'From a bank account')}
          {choice('cash', 'Cash from the safe')}
        </div>

        {source === 'bank' ? (
          <>
            <Grid2>
              <Field label="Bank account" hint={bank ? `Available: ${rs(bank.currentBalance)}` : 'Add a bank account in the Bank Sheet first'}>
                <select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)} required>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
                </select>
              </Field>
              <Field label="Amount (Rs)" strong><input type="number" min={1} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
            </Grid2>
            <Grid2>
              <Field label="Sent to (account name)"><input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner's name" required /></Field>
              <Field label="Account number / IBAN"><input className="form-input" value={number} onChange={(e) => setNumber(e.target.value)} required /></Field>
            </Grid2>
            <Grid3>
              <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
              <Field label="Bank reference / cheque #" hint="Optional"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. IBFT-98124" /></Field>
              <Field label="Note" hint="Optional"><input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </Grid3>
          </>
        ) : (
          <Grid3>
            <Field label="Amount (Rs)" hint={`Cash in the safe now: ${rs(safe)}`} strong><input type="number" min={1} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
            <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="Note" hint="Optional"><input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </Grid3>
        )}

        <CalcStrip items={[
          { label: source === 'bank' ? 'Bank now' : 'Cash in safe now', value: rs(before) },
          { label: 'You take', value: `− ${rs(amt)}`, tone: 'red' },
          { label: 'Left after', value: rs(before - amt), tone: 'gold' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || (source === 'bank' && banks.length === 0)}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save withdrawal'}</span></button>
        </div>
      </form>
    </Modal>
  )
}
