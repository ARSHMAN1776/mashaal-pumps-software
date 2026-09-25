import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { ExpenseCategory, ExpenseRecord } from '../../types'
import { EXPENSE_CATEGORIES } from '../../types'
import { formatDate, monthISO, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PlusIcon, PrinterIcon, CheckCircleIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, FilterBar, Grid3, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard } from '../common/kit'

const ExpenseModal: React.FC<{ expense?: ExpenseRecord; onClose: () => void }> = ({ expense, onClose }) => {
  const [version] = useState(expense?.updatedAt) // the record's version when this window was opened
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const isCashier = currentUser?.role === 'cashier'
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive || b.id === expense?.bankAccountId)
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'Staff Meals & Tea')
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [mode, setMode] = useState<'Cash' | 'Bank'>(expense?.paymentMode ?? 'Cash')
  const [bankId, setBankId] = useState(expense?.bankAccountId || banks[0]?.id || '')
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [voucher, setVoucher] = useState(expense?.voucherNo ?? '')
  const { busy, error, run } = useSubmit()
  const bank = banks.find((b) => b.id === bankId)
  const amt = Number(amount) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { category, payee, description, amount: Number(amount), paymentMode: mode, bankAccountId: mode === 'Bank' ? bankId : '', date, voucherNo: voucher }
    if (expense) void run((ack) => act.updateExpense(expense.id, { ...input, acknowledge: ack, version }), () => { toast.success('Expense updated.'); onClose() })
    else void run((ack) => act.addExpense({ ...input, acknowledge: ack }), (x) => { toast.success(`Voucher ${x.voucherNo} saved — ${rs(x.amount)}${x.paymentMode === 'Cash' ? ' (deducted from the safe)' : ''}`); onClose() })
  }

  return (
    <Modal title={expense ? `Edit Voucher ${expense.voucherNo}` : 'Create Station Expense Voucher'} subtitle="Deducted from the safe (cash) or a bank account" onClose={onClose} busy={busy} width={660}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="Category">
            <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (Rs)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
          <Field label="Date" hint={isCashier ? 'Today only' : undefined}><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={isCashier} required /></Field>
        </Grid3>
        <Grid3>
          <Field label="Paid to"><input className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Al-Madina Hotel" required /></Field>
          <Field label="Paid from">
            <select className="form-input" value={mode} onChange={(e) => setMode(e.target.value as 'Cash' | 'Bank')}>
              <option value="Cash">Cash in the safe</option>
              {!isCashier && <option value="Bank">Bank account</option>}
            </select>
          </Field>
          {mode === 'Bank' ? (
            <Field label="Which bank" hint={bank ? `Balance ${rs(bank.currentBalance)}` : 'Add a bank account first'}>
              <select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)} required>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName}</option>)}</select>
            </Field>
          ) : (
            <Field label="Voucher number" hint={expense ? undefined : 'Empty = automatic'}>
              <input className="form-input" value={voucher} onChange={(e) => setVoucher(e.target.value)} placeholder="Automatic" />
            </Field>
          )}
        </Grid3>
        <Field label="What was it for?"><input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 50 L generator diesel during load-shedding" required /></Field>
        <CalcStrip items={[{ label: 'Category', value: category }, { label: 'Paid from', value: mode === 'Cash' ? 'Cash safe (daybook)' : bank?.bankName ?? 'Bank account', tone: 'gold' }, { label: 'Amount', value: rs(amt), tone: 'red' }]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : expense ? 'Save changes' : 'Save expense voucher'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const ExpensesView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const { expenses, siteInfo, bankAccounts } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const confirm = useConfirm()
  const toast = useToast()
  const [form, setForm] = useState<{ expense?: ExpenseRecord } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [month, setMonth] = useState(monthISO())
  const [category, setCategory] = useState<'all' | ExpenseCategory>('all')

  const months = useMemo(() => {
    const set = new Set<string>([monthISO()])
    for (const e of expenses) if (e.date.length >= 7) set.add(e.date.slice(0, 7))
    return [...set].sort().reverse()
  }, [expenses])
  const rows = useMemo(() => expenses.filter((e) => (month === 'all' || e.date.startsWith(month)) && (category === 'all' || e.category === category)), [expenses, month, category])
  const total = rows.reduce((s, e) => s + e.amount, 0)
  const cash = rows.filter((e) => e.paymentMode === 'Cash').reduce((s, e) => s + e.amount, 0)
  const bank = total - cash

  const removeExpense = async (e: ExpenseRecord) => {
    const yes = await confirm({ title: `Delete voucher ${e.voucherNo}?`, message: `${e.category} — ${rs(e.amount)} paid to ${e.payee}. The ${e.paymentMode === 'Cash' ? 'cash-book' : 'bank'} line created with it is removed too and the balance is restored.`, confirmLabel: 'Delete voucher', tone: 'danger' })
    if (!yes) return
    const r = await act.removeExpense(e.id)
    if (r.ok) toast.success('Voucher deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Expenses"
        title="Expenses"
        subtitle="Money spent to run the station: generator diesel, bills, repairs, tea and supplies."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setForm({})}><PlusIcon size={16} /><span>Add expense</span></button>
          </>
        }
      />

      <FilterBar>
        <div className="form-group">
          <label className="form-label">Month</label>
          <select className="form-input" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value as 'all' | ExpenseCategory)}>
            <option value="all">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </FilterBar>

      <KpiStrip>
        <Kpi label="Total expenses" value={rs(total)} tone="red" sub={`${rows.length} voucher(s)`} />
        <Kpi label="Cash from safe" value={rs(cash)} sub="Paid from the safe" />
        <Kpi label="Bank payments" value={rs(bank)} sub="Paid from a bank account" />
      </KpiStrip>

      <SectionCard title="All expenses" subtitle="Newest first">
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Voucher</th><th>Date</th><th>Category</th><th>What for</th><th>Paid to</th><th>Paid from</th><th>Amount</th><th>Approved by</th>{isManager && <th />}</tr></thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow colSpan={isManager ? 9 : 8}>No expenses for this period.</EmptyRow> : rows.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.voucherNo}</strong></td>
                  <td>{formatDate(e.date)}</td>
                  <td><span className="category-tag">{e.category}</span></td>
                  <td>{e.description}</td>
                  <td>{e.payee}</td>
                  <td><span className={`badge ${e.paymentMode === 'Cash' ? 'badge-neutral' : 'badge-gold'}`}>{e.paymentMode}</span>{e.bankAccountId && <div className="text-muted text-xs">{bankAccounts.find((b) => b.id === e.bankAccountId)?.bankName}</div>}</td>
                  <td className="text-red font-bold">{rs(e.amount)}</td>
                  <td>{e.approvedBy}</td>
                  {isManager && (
                    <td><RowActions>
                      <IconButton label="Edit voucher" onClick={() => setForm({ expense: e })}><EditIcon size={14} /></IconButton>
                      <IconButton label="Delete voucher" tone="danger" onClick={() => void removeExpense(e)}><TrashIcon size={14} /></IconButton>
                    </RowActions></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {form && <ExpenseModal expense={form.expense} onClose={() => setForm(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Station Expense Statement" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid"><div><strong>Period:</strong> {month === 'all' ? 'All months' : month}</div><div><strong>Category:</strong> {category === 'all' ? 'All' : category}</div></div>
        <table className="slip-table">
          <thead><tr><th>Voucher</th><th>Date</th><th>Category</th><th>Paid to</th><th>Paid from</th><th>Amount</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td>{e.voucherNo}</td><td>{formatDate(e.date)}</td><td>{e.category}</td><td>{e.payee}</td><td>{e.paymentMode}</td><td>{rs(e.amount)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total operational outflow:</span><strong>{rs(total)}</strong></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Station Operating Expenses & Overheads Guide"
        urduTitle="اسٹیشن کے روزمرہ اخراجات کی رہنمائی"
        role="manager"
        roleLabel="Station Manager"
        purpose="Record forecourt operating expenses. Cash expenses leave the safe (daybook) and bank expenses leave the chosen bank account — automatically, in the same step."
        steps={[
          { step: 1, title: 'Select category (مد)', detail: 'Generator fuel, WAPDA electricity, dispenser repairs, staff meals, municipal fees, stationery or miscellaneous.', urdu: 'صحیح شعبہ منتخب کریں۔' },
          { step: 2, title: 'Choose payment mode (ادائیگی)', detail: 'Cash from the safe, or (managers) a bank account.', urdu: 'سیف سے نقد یا بینک اکاؤنٹ سے ادائیگی منتخب کریں۔' },
          { step: 3, title: 'Enter payee & details (تفصیل)', detail: 'Vendor name and what was bought.', urdu: 'دکان دار کا نام اور خرچ کی تفصیل درج کریں۔' },
          { step: 4, title: 'Edit or delete (درستگی)', detail: 'Managers can correct or delete a voucher; the safe or bank balance follows.', urdu: 'مینیجر وائوچر درست یا حذف کر سکتا ہے۔' },
        ]}
        criticalChecks={[
          'Cash vouchers reduce the safe immediately — verify manager authorization.',
          'Keep the vendor\'s cash memo or repair invoice attached to the voucher.',
          'Large utility bills should be paid from a bank account.',
        ]}
      />
    </div>
  )
}
