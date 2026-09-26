import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { BankAccount, BankTransaction } from '../../types'
import { BANK_CREDIT_TYPES } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PlusIcon, PrinterIcon, CheckCircleIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { PendingBankNotice } from '../../features/customers/PendingBankNotice'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, FilterBar, Grid2, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard } from '../common/kit'

// ===========================================================================
// Bank account dialog
// ===========================================================================
const AccountModal: React.FC<{ account?: BankAccount; onClose: () => void }> = ({ account, onClose }) => {
  const [version] = useState(account?.updatedAt) // the record's version when this window was opened
  const { act } = useApp()
  const toast = useToast()
  const [bankName, setBankName] = useState(account?.bankName ?? '')
  const [title, setTitle] = useState(account?.accountTitle ?? '')
  const [number, setNumber] = useState(account?.accountNumber ?? '')
  const [branch, setBranch] = useState(account?.branch ?? '')
  const [opening, setOpening] = useState(String(account?.openingBalance ?? 0))
  const [active, setActive] = useState(account?.isActive ?? true)
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { bankName, accountTitle: title, accountNumber: number, branch, openingBalance: Number(opening) }
    if (account) void run(() => act.updateBankAccount(account.id, { ...input, isActive: active, version }), () => { toast.success('Bank account updated.'); onClose() })
    else void run(() => act.addBankAccount(input), (a) => { toast.success(`Added ${a.bankName}.`); onClose() })
  }

  return (
    <Modal title={account ? 'Edit Bank Account' : 'Add Bank Account'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Bank name"><input className="form-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Habib Bank Limited (HBL)" required autoFocus /></Field>
          <Field label="Branch"><input className="form-input" value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Account title"><input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Account number / IBAN"><input className="form-input" value={number} onChange={(e) => setNumber(e.target.value)} required /></Field>
        </Grid2>
        <Field label="Opening balance (PKR)" hint="The balance when you started using this software. Deposits and payments are added to it.">
          <input type="number" step="any" className="form-input" value={opening} onChange={(e) => setOpening(e.target.value)} required />
        </Field>
        {account && <label className="ui-checkbox-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active (untick to stop using this account; history is kept)</span></label>}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : account ? 'Save changes' : 'Add account'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Deposit / withdrawal / fee dialog
// ===========================================================================
type TxKind = 'deposit' | 'withdraw' | 'fee'

const txKindOf = (t: BankTransaction): TxKind => (BANK_CREDIT_TYPES.includes(t.type) ? 'deposit' : t.type === 'Withdrawal' ? 'withdraw' : 'fee')

const TxModal: React.FC<{ kind: TxKind; bankId?: string; entry?: BankTransaction; onClose: () => void }> = ({ kind, bankId, entry, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive || b.id === entry?.bankId)
  const cashNow = activeSiteData.daybook.length ? activeSiteData.daybook[activeSiteData.daybook.length - 1].balanceAfter : 0
  // when fixing an entry, the safe and the bank are worked out as if this entry had not been made yet
  const linked = entry ? activeSiteData.daybook.find((d) => d.sourceId === entry.id && (d.sourceType === 'bank_deposit' || d.sourceType === 'bank_withdrawal')) : undefined
  const cash = cashNow + (linked ? linked.cashOut - linked.cashIn : 0)
  const [id, setId] = useState(entry?.bankId || bankId || banks[0]?.id || '')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [slip, setSlip] = useState(entry?.depositSlipNo ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [date, setDate] = useState(entry?.date ?? todayISO())
  const [funding, setFunding] = useState<'cash' | 'cheque' | 'online'>(entry?.type === 'Online Transfer' ? 'online' : entry?.type === 'Credit Received' ? 'cheque' : 'cash')
  const { busy, error, run } = useSubmit()
  const bank = banks.find((b) => b.id === id)
  const amt = Number(amount) || 0
  const credit = kind === 'deposit'
  const entryEffect = entry && bank && entry.bankId === bank.id ? (BANK_CREDIT_TYPES.includes(entry.type) ? entry.amount : -entry.amount) : 0
  const bankBase = (bank?.currentBalance ?? 0) - entryEffect

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (entry) {
      void run(
        (ack) => act.updateBankTransaction(entry.id, { bankId: id, amount: Number(amount), date, slipNo: slip, description, funding: kind === 'deposit' ? funding : undefined, version: entry.updatedAt, acknowledge: ack }),
        () => { toast.success('Bank entry updated.'); onClose() },
      )
      return
    }
    if (kind === 'deposit') {
      void run((ack) => act.depositToBank({ bankId: id, amount: Number(amount), slipNo: slip, description, date, funding, acknowledge: ack }), () => { toast.success(`Deposit of ${rs(Number(amount))} recorded.`); onClose() })
    } else if (kind === 'withdraw') {
      void run((ack) => act.withdrawFromBank({ bankId: id, amount: Number(amount), description, date, acknowledge: ack }), () => { toast.success(`Withdrawal of ${rs(Number(amount))} recorded — added to the safe.`); onClose() })
    } else {
      void run(() => act.addBankFee({ bankId: id, amount: Number(amount), description, date }), () => { toast.success('Bank charge recorded.'); onClose() })
    }
  }

  const title = entry
    ? kind === 'deposit' ? 'Edit deposit' : kind === 'withdraw' ? 'Edit cash taken out' : 'Edit bank charge'
    : kind === 'deposit' ? 'Deposit money' : kind === 'withdraw' ? 'Take cash out of the bank' : 'Add a bank charge'

  return (
    <Modal title={title} subtitle={entry ? 'Fix a mistake. The balances and the cash book are corrected for you.' : kind === 'deposit' ? 'Puts money into the bank account (and takes cash from the safe for cash deposits)' : kind === 'withdraw' ? 'Takes money out of the bank account and puts the cash in the safe' : 'Takes the charge out of the bank account'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Bank account">
            <select className="form-input" value={id} onChange={(e) => setId(e.target.value)} required>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} (Bal: {rs(b.currentBalance)})</option>)}</select>
          </Field>
          <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        </Grid2>
        {kind === 'deposit' && (
          <Grid2>
            <Field label="Funding">
              <select className="form-input" value={funding} onChange={(e) => setFunding(e.target.value as 'cash' | 'cheque' | 'online')}>
                <option value="cash">Cash taken from the safe</option>
                <option value="cheque">Cheque (safe not affected)</option>
                <option value="online">Online transfer (safe not affected)</option>
              </select>
            </Field>
            <Field label={funding === 'online' ? 'Transaction / reference no.' : funding === 'cheque' ? 'Cheque no. / slip #' : 'Bank-stamped slip #'}>
              <input className="form-input" value={slip} onChange={(e) => setSlip(e.target.value)} placeholder={funding === 'online' ? 'e.g. RAAST or the transaction ID' : undefined} required />
            </Field>
          </Grid2>
        )}
        <Grid2>
          <Field label="Amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
          <Field label="Description"><input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'deposit' ? (funding === 'online' ? 'e.g. Payment from a customer' : 'e.g. Morning shift cash deposit') : kind === 'withdraw' ? 'e.g. Cash for staff salaries' : 'e.g. Monthly service charges'} required={kind !== 'deposit'} /></Field>
        </Grid2>
        <CalcStrip items={[
          { label: entry ? 'Balance without this entry' : 'Balance now', value: rs(bankBase) },
          { label: credit ? 'Money in' : 'Money out', value: `${credit ? '+' : '−'} ${rs(amt)}`, tone: credit ? 'green' : 'red' },
          { label: 'Balance after', value: rs(bankBase + (credit ? amt : -amt)), tone: 'gold' },
          ...(kind === 'deposit' && funding === 'cash' ? [{ label: 'Safe after', value: rs(cash - amt) }] : kind === 'withdraw' ? [{ label: 'Safe after', value: rs(cash + amt) }] : []),
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || banks.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : entry ? 'Save changes' : 'Save'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const BankSheetView: React.FC = () => {
  const { activeSiteData, act } = useApp()
  const { bankAccounts, bankTransactions, siteInfo } = activeSiteData
  const confirm = useConfirm()
  const toast = useToast()
  const [accountForm, setAccountForm] = useState<{ account?: BankAccount } | null>(null)
  const [txForm, setTxForm] = useState<{ kind: TxKind; bankId?: string; entry?: BankTransaction } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [bankFilter, setBankFilter] = useState('all')

  const active = bankAccounts.filter((b) => b.isActive)
  const totalBalances = bankAccounts.reduce((s, b) => s + b.currentBalance, 0)
  const txs = useMemo(() => bankTransactions.filter((t) => bankFilter === 'all' || t.bankId === bankFilter), [bankTransactions, bankFilter])
  const bankName = (id: string) => bankAccounts.find((b) => b.id === id)?.bankName ?? 'Removed account'
  const month = todayISO().slice(0, 7)
  const monthDeposits = bankTransactions.filter((t) => t.date.startsWith(month) && BANK_CREDIT_TYPES.includes(t.type)).reduce((s, t) => s + t.amount, 0)
  const monthOmc = bankTransactions.filter((t) => t.date.startsWith(month) && t.type === 'OMC Online Transfer').reduce((s, t) => s + t.amount, 0)

  const removeAccount = async (b: BankAccount) => {
    const yes = await confirm({ title: `Remove ${b.bankName}?`, message: 'An account without transactions is deleted; one with history is deactivated (history kept). The balance must be Rs 0 first.', confirmLabel: 'Remove account', tone: 'danger' })
    if (!yes) return
    const r = await act.removeBankAccount(b.id)
    if (r.ok) toast.success(r.value.mode === 'deleted' ? 'Bank account deleted.' : 'Bank account deactivated — history kept.'); else toast.error(r.error)
  }
  const removeTx = async (t: BankTransaction) => {
    const yes = await confirm({ title: 'Delete this bank entry?', message: `${t.type} of ${rs(t.amount)} on ${formatDate(t.date)}${t.sourceType === 'bank_deposit' || t.sourceType === 'bank_withdrawal' ? ' — the matching cash-book line is removed too' : ''}. The balance is recalculated.`, confirmLabel: 'Delete entry', tone: 'danger' })
    if (!yes) return
    const r = await act.removeBankTransaction(t.id)
    if (r.ok) toast.success('Bank entry deleted.'); else toast.error(r.error)
  }
  // entries typed here can be fixed or deleted; the rest belong to another record (an expense, a supplier payment ...)
  const deletable = (t: BankTransaction) => !t.sourceType || t.sourceType === 'bank_deposit' || t.sourceType === 'bank_withdrawal'
  const editable = (t: BankTransaction) => deletable(t) && (BANK_CREDIT_TYPES.includes(t.type) || t.type === 'Withdrawal' || t.type === 'Bank Fee')

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Bank"
        title="Bank"
        subtitle="Your bank accounts: money paid in, money taken out, and bank charges."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setAccountForm({})}><PlusIcon size={16} /><span>Add account</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setTxForm({ kind: 'withdraw' })} disabled={active.length === 0}><span>Take cash out</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setTxForm({ kind: 'deposit' })} disabled={active.length === 0}><PlusIcon size={16} /><span>Deposit money</span></button>
          </>
        }
      />

      <PendingBankNotice />

      {bankAccounts.length === 0 ? (
        <div className="ui-empty">No bank accounts yet. Press "Add account".</div>
      ) : (
        <div className="tanks-meter-row">
          {bankAccounts.map((bank) => (
            <div key={bank.id} className="tank-gauge-card" style={bank.isActive ? undefined : { opacity: 0.6 }}>
              <div className="tank-card-top">
                <div><span className="tank-number-tag">{bank.branch || 'Branch not set'}</span><h4 className="tank-fuel-title">{bank.bankName}</h4></div>
                <RowActions>
                  <span className={`badge ${bank.isActive ? 'badge-neutral' : 'badge-warning'}`}>{bank.isActive ? 'Active' : 'Inactive'}</span>
                  <IconButton label="Edit account" onClick={() => setAccountForm({ account: bank })}><EditIcon size={14} /></IconButton>
                  <IconButton label="Remove account" tone="danger" onClick={() => void removeAccount(bank)}><TrashIcon size={14} /></IconButton>
                </RowActions>
              </div>
              <div className="bank-card-meta">
                <div className="meta-row"><span className="text-muted">Title:</span><strong>{bank.accountTitle || '—'}</strong></div>
                <div className="meta-row"><span className="text-muted">Account #:</span><span className="font-mono">{bank.accountNumber}</span></div>
              </div>
              <div className="tank-stats-row">
                <div className="tank-stat-item"><span className="stat-label">Available balance</span><strong className={`stat-val ${bank.currentBalance < 0 ? 'text-red' : 'text-gold'}`}>{rs(bank.currentBalance)}</strong></div>
                <div className="tank-stat-item"><span className="stat-label">Opening balance</span><strong className="stat-val">{rs(bank.openingBalance)}</strong></div>
              </div>
              {bank.isActive && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setTxForm({ kind: 'deposit', bankId: bank.id })}>Deposit</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setTxForm({ kind: 'withdraw', bankId: bank.id })}>Withdraw</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setTxForm({ kind: 'fee', bankId: bank.id })}>Bank charge</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <KpiStrip>
        <Kpi label="Total bank balances" value={rs(totalBalances)} tone="gold" sub={`Across ${bankAccounts.length} account(s)`} />
        <Kpi label="Credits this month" value={rs(monthDeposits)} tone="green" sub="Money paid in" />
        <Kpi label="Paid to the oil company" value={rs(monthOmc)} sub="This month" />
      </KpiStrip>

      <FilterBar>
        <div className="form-group">
          <label className="form-label">Account</label>
          <select className="form-input" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}>
            <option value="all">All accounts</option>{bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName}</option>)}
          </select>
        </div>
      </FilterBar>

      <SectionCard title="Bank activity" subtitle="Newest first">
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Slip no.</th><th>Details</th><th>Money in</th><th>Money out</th><th>Balance</th><th /></tr></thead>
            <tbody>
              {txs.length === 0 ? <EmptyRow colSpan={9}>No bank activity yet.</EmptyRow> : txs.map((t) => {
                const isCredit = BANK_CREDIT_TYPES.includes(t.type)
                return (
                  <tr key={t.id}>
                    <td>{formatDate(t.date)}</td>
                    <td className="text-xs">{bankName(t.bankId)}</td>
                    <td><span className={`badge ${isCredit ? 'badge-success' : 'badge-neutral'}`}>{t.type}</span></td>
                    <td><strong>{t.depositSlipNo || '—'}</strong></td>
                    <td>{t.description}</td>
                    <td className="text-green font-bold">{isCredit ? rs(t.amount) : '—'}</td>
                    <td className="text-red font-bold">{!isCredit ? rs(t.amount) : '—'}</td>
                    <td>{rs(t.balanceAfter)}</td>
                    <td>{deletable(t) && (
                      <RowActions>
                        {editable(t) && <button type="button" className="btn btn-outline ui-mini-btn" onClick={() => setTxForm({ kind: txKindOf(t), entry: t })}>Edit</button>}
                        <IconButton label="Delete entry" tone="danger" onClick={() => void removeTx(t)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {accountForm && <AccountModal account={accountForm.account} onClose={() => setAccountForm(null)} />}
      {txForm && <TxModal kind={txForm.kind} bankId={txForm.bankId} entry={txForm.entry} onClose={() => setTxForm(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Bank Balances & Deposit Summary" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Bank</th><th>Account</th><th>Balance</th></tr></thead>
          <tbody>{bankAccounts.map((b) => <tr key={b.id}><td>{b.bankName}</td><td>{b.accountNumber}</td><td>{rs(b.currentBalance)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total liquid bank balance:</span><strong>{rs(totalBalances)}</strong></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Station Commercial Banking & Cash Remittances Guide"
        urduTitle="اسٹیشن کے بینک کھاتہ جات اور کیش جمع کی رہنمائی"
        role="manager"
        roleLabel="Station Manager &amp; Owner"
        purpose="Keep every station bank account, deposit slip, withdrawal and charge. Balances are always opening balance plus credits minus debits — payments to OMC, vendors and the owner reduce them automatically."
        steps={[
          { step: 1, title: 'Deposit physical cash (کیش جمع کروانا)', detail: 'Take cash from the safe to the bank and get the stamped deposit slip.', urdu: 'سیف سے نقد رقم لے جا کر بینک میں جمع کروائیں اور مہر شدہ سلپ لیں۔' },
          { step: 2, title: 'Record the deposit (اندراج)', detail: 'Choose the account, enter the slip number and amount. The safe is reduced and the bank credited in one step.', urdu: 'بینک، سلپ نمبر اور رقم درج کریں۔' },
          { step: 3, title: 'Cheques & online credits', detail: 'Choose "Cheque / online credit" so the safe is not touched.', urdu: 'چیک یا آن لائن رقم کے لیے سیف متاثر نہیں ہوتا۔' },
          { step: 4, title: 'Withdrawals & charges (رقم نکلوانا)', detail: 'Cash withdrawn adds to the safe; bank charges reduce the balance.', urdu: 'بینک سے نکلوائی گئی رقم سیف میں شامل ہوتی ہے۔' },
        ]}
        criticalChecks={[
          'Always verify the teller stamp and deposit slip number.',
          'Keep enough balance for OMC tanker payments 24 hours before delivery.',
          'Entries created by payments (OMC, expenses, owner transfers) are removed by deleting the payment record.',
        ]}
      />
    </div>
  )
}
