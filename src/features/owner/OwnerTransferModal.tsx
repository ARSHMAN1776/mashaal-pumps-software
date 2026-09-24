import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { CheckCircleIcon } from '../../components/common/Icons'
import { Modal, FormError } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { useSubmit } from '../../components/common/useSubmit'
import { CalcStrip, Field, Grid2 } from '../../components/common/kit'

/** Owner withdrawal: money leaves a station bank account for the owner's personal account. */
export const OwnerTransferModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)
  const last = activeSiteData.ownerTransfers[0]
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState(last?.accountTitle ?? '')
  const [number, setNumber] = useState(last?.accountNumber ?? '')
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('Owner profit withdrawal')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const bank = banks.find((b) => b.id === bankId)
  const amt = Number(amount) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => act.addOwnerTransfer({ amount: Number(amount), bankId, accountTitle: title, accountNumber: number, referenceNo: ref, notes, date }),
      (t) => { toast.success(`Recorded ${rs(t.amount)} transfer to ${t.accountTitle}. Ref: ${t.referenceNo}`); onClose() },
    )
  }

  return (
    <Modal title="Withdraw Station Profit / Capital" subtitle="Transfer from a station bank account to the owner's personal account" onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Station bank account (source)" hint={bank ? `Available: ${rs(bank.currentBalance)}` : 'Add a bank account in the Bank Sheet first'}>
            <select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)} required>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
            </select>
          </Field>
          <Field label="Withdrawal amount (PKR)" strong><input type="number" min={1} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Grid2>
          <Field label="Beneficiary account title"><input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner's name" required /></Field>
          <Field label="Beneficiary account / IBAN"><input className="form-input" value={number} onChange={(e) => setNumber(e.target.value)} required /></Field>
        </Grid2>
        <Grid2>
          <Field label="Transfer date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Online ref / cheque #" hint="Left empty, a reference is generated"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. IBFT-98124" /></Field>
        </Grid2>
        <Field label="Purpose / notes"><input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <CalcStrip items={[
          { label: 'Bank balance now', value: rs(bank?.currentBalance ?? 0) },
          { label: 'Withdrawing', value: `− ${rs(amt)}`, tone: 'red' },
          { label: 'Bank balance after', value: rs((bank?.currentBalance ?? 0) - amt), tone: 'gold' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || banks.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Execute transfer'}</span></button>
        </div>
      </form>
    </Modal>
  )
}
