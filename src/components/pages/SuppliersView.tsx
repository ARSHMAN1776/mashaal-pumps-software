import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { Supplier, SupplierTransaction } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PrinterIcon, CheckCircleIcon, CashIcon, PlusIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard, Tabs } from '../common/kit'

const SupplierModal: React.FC<{ supplier?: Supplier; onClose: () => void }> = ({ supplier, onClose }) => {
  const [version] = useState(supplier?.updatedAt) // the record's version when this window was opened
  const { act } = useApp()
  const toast = useToast()
  const [name, setName] = useState(supplier?.name ?? '')
  const [company, setCompany] = useState(supplier?.company ?? '')
  const [category, setCategory] = useState(supplier?.category ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [opening, setOpening] = useState(String(supplier?.openingBalance ?? 0))
  const [active, setActive] = useState(supplier?.isActive ?? true)
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { name, company, category, phone, openingBalance: Number(opening) }
    if (supplier) void run(() => act.updateSupplier(supplier.id, { ...input, isActive: active, version }), () => { toast.success('Supplier updated.'); onClose() })
    else void run(() => act.addSupplier(input), (s) => { toast.success(`Added ${s.name}.`); onClose() })
  }

  return (
    <Modal title={supplier ? 'Edit Supplier' : 'Add Supplier / Vendor'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Vendor name"><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Company"><input className="form-input" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Category"><input className="form-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Spare parts, generator service" /></Field>
          <Field label="Phone"><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </Grid2>
        <Field label="Opening balance owed to this vendor (PKR)" hint="Bills recorded later are added to it; payments reduce it."><input type="number" step="any" className="form-input" value={opening} onChange={(e) => setOpening(e.target.value)} required /></Field>
        {supplier && <label className="ui-checkbox-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active vendor</span></label>}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const BillModal: React.FC<{ supplierId?: string; onClose: () => void }> = ({ supplierId, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const list = activeSiteData.suppliers.filter((s) => s.isActive)
  const [id, setId] = useState(supplierId ?? list[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => act.addSupplierBill({ supplierId: id, amount: Number(amount), referenceNo: ref, note, date }), () => { toast.success('Bill recorded.'); onClose() })
  }

  return (
    <Modal title="Record Vendor Bill" subtitle="Adds to the amount owed to the vendor" onClose={onClose} busy={busy} width={580}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Vendor"><select className="form-input" value={id} onChange={(e) => setId(e.target.value)} required>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Bill amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Grid2>
          <Field label="Bill / invoice #"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        </Grid2>
        <Field label="Details"><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dispenser hose replacement" /></Field>
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || list.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save bill'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const PayModal: React.FC<{ supplierId?: string; onClose: () => void }> = ({ supplierId, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const list = activeSiteData.suppliers.filter((s) => s.isActive)
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)
  const first = list.find((s) => s.id === supplierId) ?? list[0]
  const [id, setId] = useState(first?.id ?? '')
  const s = list.find((x) => x.id === id)
  const [amount, setAmount] = useState(first && first.balanceDue > 0 ? String(first.balanceDue) : '')
  const [source, setSource] = useState<'Cash' | 'Bank'>('Cash')
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const amt = Number(amount) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run((ack) => act.paySupplier({ supplierId: id, amount: Number(amount), source, bankAccountId: source === 'Bank' ? bankId : '', referenceNo: ref, note, date, acknowledge: ack }), () => { toast.success(`Paid ${rs(Number(amount))}.`); onClose() })
  }

  return (
    <Modal title="Record Vendor Payment" subtitle="Deducts the vendor balance and posts the cash / bank line" onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Vendor"><select className="form-input" value={id} onChange={(e) => { setId(e.target.value); const n = list.find((x) => x.id === e.target.value); if (n && n.balanceDue > 0) setAmount(String(n.balanceDue)) }} required>{list.map((x) => <option key={x.id} value={x.id}>{x.name} — owed {rs(x.balanceDue)}</option>)}</select></Field>
          <Field label="Payment amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Grid2>
          <Field label="Paid from"><select className="form-input" value={source} onChange={(e) => setSource(e.target.value as 'Cash' | 'Bank')}><option value="Cash">Cash from the safe</option><option value="Bank">Bank account</option></select></Field>
          {source === 'Bank' ? (
            <Field label="Bank account"><select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)} required>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} (Bal {rs(b.currentBalance)})</option>)}</select></Field>
          ) : (
            <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
          )}
        </Grid2>
        {source === 'Bank' && <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>}
        <Grid2>
          <Field label="Reference"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Notes"><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Payment against spare parts invoice" /></Field>
        </Grid2>
        <CalcStrip items={[{ label: 'You owe now', value: rs(s?.balanceDue ?? 0) }, { label: 'This payment', value: `− ${rs(amt)}`, tone: 'green' }, { label: 'You will owe', value: rs((s?.balanceDue ?? 0) - amt), tone: 'gold' }]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || list.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save payment'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const SuppliersView: React.FC = () => {
  const { activeSiteData, act } = useApp()
  const { suppliers, supplierTransactions, siteInfo } = activeSiteData
  const confirm = useConfirm()
  const toast = useToast()
  const [tab, setTab] = useState<'vendors' | 'ledger'>('vendors')
  const [form, setForm] = useState<{ supplier?: Supplier } | null>(null)
  const [billFor, setBillFor] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const shown = suppliers.filter((s) => showInactive || s.isActive)
  const live = suppliers.filter((s) => s.isActive)
  const payables = live.reduce((s, x) => s + x.balanceDue, 0)
  const name = (id: string) => suppliers.find((s) => s.id === id)?.name ?? 'Removed vendor'

  const removeSupplier = async (s: Supplier) => {
    if (!(await confirm({ title: `Remove ${s.name}?`, message: 'A vendor without history is deleted; one with history is deactivated (records kept). The balance must be Rs 0 first.', confirmLabel: 'Remove vendor', tone: 'danger' }))) return
    const r = await act.removeSupplier(s.id)
    if (r.ok) toast.success(r.value.mode === 'deleted' ? 'Vendor deleted.' : 'Vendor deactivated — history kept.'); else toast.error(r.error)
  }
  const removeTx = async (t: SupplierTransaction) => {
    if (!(await confirm({ title: `Delete this ${t.type.toLowerCase()}?`, message: `${rs(t.amount)} — ${name(t.supplierId)}, ${formatDate(t.date)}${t.type === 'Payment' ? '. The cash / bank line it created is removed too.' : '.'}`, confirmLabel: 'Delete', tone: 'danger' }))) return
    const r = await act.removeSupplierTransaction(t.id)
    if (r.ok) toast.success('Deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Suppliers"
        title="Suppliers"
        subtitle="People and companies you buy from, and what you still owe each of them."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setForm({})}><PlusIcon size={16} /><span>Add supplier</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setBillFor('')} disabled={live.length === 0}><span>Add bill</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setPayFor('')} disabled={live.length === 0}><CashIcon size={16} /><span>Pay a supplier</span></button>
          </>
        }
      />

      <KpiStrip>
        <Kpi label="Suppliers" value={`${live.length}`} sub="People and companies you buy from" />
        <Kpi label="You owe in total" value={rs(payables)} sub="Bills not yet paid" />
        <Kpi label="Paid this month" value={rs(supplierTransactions.filter((t) => t.type === 'Payment' && t.date.startsWith(todayISO().slice(0, 7))).reduce((s, t) => s + t.amount, 0))} tone="green" sub="Paid to vendors" />
      </KpiStrip>

      <Tabs tabs={[{ id: 'vendors', label: 'Suppliers', count: shown.length }, { id: 'ledger', label: 'Bills & payments', count: supplierTransactions.length }]} active={tab} onChange={(t) => setTab(t as typeof tab)} />

      {tab === 'vendors' ? (
        <SectionCard title="Your suppliers" subtitle="What you owe = old balance + bills − payments made." actions={<label className="ui-checkbox-row" style={{ margin: 0 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /><span>Show inactive</span></label>}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Supplier</th><th>Category</th><th>Phone</th><th>You owe</th><th /></tr></thead>
              <tbody>
                {shown.length === 0 ? <EmptyRow colSpan={5}>No suppliers added yet. Press "Add supplier".</EmptyRow> : shown.map((s) => (
                  <tr key={s.id} style={s.isActive ? undefined : { opacity: 0.55 }}>
                    <td><strong>{s.name}</strong><div className="text-muted text-xs">{s.company}{!s.isActive && ' • inactive'}</div></td>
                    <td><span className="category-tag">{s.category || '—'}</span></td>
                    <td>{s.phone || '—'}</td>
                    <td className="text-gold font-bold">{rs(s.balanceDue)}</td>
                    <td>
                      <RowActions>
                        <button type="button" className="btn btn-sm btn-outline" disabled={!s.isActive} onClick={() => setBillFor(s.id)}>+ Bill</button>
                        <button type="button" className="btn btn-sm btn-outline" disabled={!s.isActive} onClick={() => setPayFor(s.id)}>Pay</button>
                        <IconButton label="Edit vendor" onClick={() => setForm({ supplier: s })}><EditIcon size={14} /></IconButton>
                        <IconButton label="Remove vendor" tone="danger" onClick={() => void removeSupplier(s)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Bills & payments" subtitle="Newest first.">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Date</th><th>Supplier</th><th>Type</th><th>Details</th><th>Bill</th><th>Paid</th><th>Paid from</th><th /></tr></thead>
              <tbody>
                {supplierTransactions.length === 0 ? <EmptyRow colSpan={8}>No bills or payments yet.</EmptyRow> : supplierTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.date)}</td><td><strong>{name(t.supplierId)}</strong></td>
                    <td><span className={`badge ${t.type === 'Bill' ? 'badge-warning' : 'badge-success'}`}>{t.type}</span></td>
                    <td>{t.referenceNo && <strong>{t.referenceNo} </strong>}{t.note}</td>
                    <td className="text-red">{t.type === 'Bill' ? rs(t.amount) : '—'}</td><td className="text-green">{t.type === 'Payment' ? rs(t.amount) : '—'}</td>
                    <td>{t.paymentSource || '—'}</td>
                    <td><RowActions><IconButton label="Delete" tone="danger" onClick={() => void removeTx(t)}><TrashIcon size={14} /></IconButton></RowActions></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {form && <SupplierModal supplier={form.supplier} onClose={() => setForm(null)} />}
      {billFor !== null && <BillModal supplierId={billFor || undefined} onClose={() => setBillFor(null)} />}
      {payFor !== null && <PayModal supplierId={payFor || undefined} onClose={() => setPayFor(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Station Vendor Payables Summary" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Supplier</th><th>Category</th><th>Phone</th><th>You owe</th></tr></thead>
          <tbody>{live.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.category}</td><td>{s.phone}</td><td>{rs(s.balanceDue)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total vendor payables:</span><strong>{rs(payables)}</strong></div>
      </PrintReceiptModal>
    </div>
  )
}
