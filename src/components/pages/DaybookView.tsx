import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { DaybookCategory, DaybookEntry } from '../../types'
import { DAYBOOK_CATEGORIES } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PlusIcon, PrinterIcon, CheckCircleIcon, ShieldIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, FilterBar, Grid2, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard } from '../common/kit'

const EntryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const isCashier = currentUser?.role === 'cashier'
  const balance = activeSiteData.daybook.length ? activeSiteData.daybook[activeSiteData.daybook.length - 1].balanceAfter : 0
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState<DaybookCategory>('Shift Fuel')
  const [amount, setAmount] = useState('')
  const [particulars, setParticulars] = useState('')
  const [ref, setRef] = useState('')
  const [handledBy, setHandledBy] = useState(currentUser?.name ?? '')
  const { busy, error, run } = useSubmit()
  const amt = Number(amount) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      (ack) => act.addDaybookEntry({ date, particulars, category, direction, amount: Number(amount), referenceNo: ref, handledBy, acknowledge: ack }),
      () => { toast.success('Cash entry saved.'); onClose() },
    )
  }

  return (
    <Modal title="Add Daybook Cash Transaction" subtitle="Record physical cash moving into or out of the station safe" onClose={onClose} busy={busy} width={640}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Transaction flow">
            <div className="role-pills-row" style={{ marginTop: 2 }}>
              <button type="button" className={`role-pill-btn ${direction === 'IN' ? 'active' : ''}`} onClick={() => setDirection('IN')} style={direction === 'IN' ? { backgroundColor: '#15803d', color: '#fff' } : {}}>Cash IN (+)</button>
              <button type="button" className={`role-pill-btn ${direction === 'OUT' ? 'active' : ''}`} onClick={() => setDirection('OUT')} style={direction === 'OUT' ? { backgroundColor: '#b91c1c', color: '#fff' } : {}}>Cash OUT (−)</button>
            </div>
          </Field>
          <Field label="Voucher date" hint={isCashier ? '🔒 Cashiers record today only' : undefined}>
            <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={isCashier} required />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Category">
            <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value as DaybookCategory)}>
              {DAYBOOK_CATEGORIES.map((c) => <option key={c} value={c}>{c === 'Shift Fuel' ? 'Shift fuel sales handover' : c}</option>)}
            </select>
          </Field>
          <Field label="Cash amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Field label="Description / particulars"><input className="form-input" value={particulars} onChange={(e) => setParticulars(e.target.value)} placeholder="e.g. Morning shift handover by Zahid Khan" required /></Field>
        <Grid2>
          <Field label="Reference / slip #"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. SH-01, RCP-102" /></Field>
          <Field label="Handled by"><input className="form-input" value={handledBy} onChange={(e) => setHandledBy(e.target.value)} required /></Field>
        </Grid2>
        <CalcStrip items={[
          { label: 'Current safe cash', value: rs(balance) },
          { label: direction === 'IN' ? 'Cash coming in' : 'Cash going out', value: `${direction === 'IN' ? '+' : '−'} ${rs(amt)}`, tone: direction === 'IN' ? 'green' : 'red' },
          { label: 'Projected balance', value: rs(direction === 'IN' ? balance + amt : balance - amt), tone: 'gold' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save cash entry'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const DaybookView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const { daybook, siteInfo } = activeSiteData
  const isCashier = currentUser?.role === 'cashier'
  const confirm = useConfirm()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [category, setCategory] = useState<'all' | DaybookCategory>('all')

  const current = daybook.length ? daybook[daybook.length - 1].balanceAfter : 0
  const rows = useMemo(() => daybook.filter((e) => (!from || e.date >= from) && (!to || e.date <= to) && (category === 'all' || e.category === category)), [daybook, from, to, category])
  // safe balance at the start of the selected period = balance after the last entry before it
  const opening = useMemo(() => {
    const before = daybook.filter((e) => from && e.date < from)
    return before.length ? before[before.length - 1].balanceAfter : 0
  }, [daybook, from])
  const totalIn = rows.reduce((s, d) => s + d.cashIn, 0)
  const totalOut = rows.reduce((s, d) => s + d.cashOut, 0)
  const periodLabel = from && to ? (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`) : 'all dates'

  const removeEntry = async (e: DaybookEntry) => {
    const yes = await confirm({ title: 'Delete this cash entry?', message: `"${e.particulars}" — ${e.cashIn > 0 ? `in ${rs(e.cashIn)}` : `out ${rs(e.cashOut)}`}. The safe balance is recalculated and the deletion is recorded in the audit trail.`, confirmLabel: 'Delete entry', tone: 'danger' })
    if (!yes) return
    const r = await act.removeDaybookEntry(e.id)
    if (r.ok) toast.success('Entry deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="STATION CASHBOOK REGISTER"
        title="Station Daybook (Cash Flow)"
        subtitle="Chronological record of shift inflows, customer recoveries, expenses, advances and bank deposits"
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print Daybook</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}><PlusIcon size={16} /><span>Add Cash Voucher</span></button>
          </>
        }
      />

      <ModuleGuide
        title="Station Daybook (Cash Movement Register) Guide"
        urduTitle="اسٹیشن ڈے بک (روزنامچہ کیش رجسٹر) کی رہنمائی"
        role="manager"
        roleLabel="Station Manager &amp; Head Cashier"
        purpose="Every rupee entering or leaving the station safe. Recoveries, expenses, advances, lube sales, bank deposits and OMC cash payments are posted here automatically — use manual vouchers for everything else."
        steps={[
          { step: 1, title: 'Choose cash direction (آمد یا خرچ)', detail: 'Cash IN (+) for collections, Cash OUT (−) for payments.', urdu: 'آمد کے لیے کیش ان اور اخراجات کے لیے کیش آؤٹ منتخب کریں۔' },
          { step: 2, title: 'Pick the category (مد)', detail: 'Choose Shift fuel handover, Bank deposit, Other, etc. Automatic entries already carry their own category.', urdu: 'صحیح کیٹیگری منتخب کریں۔' },
          { step: 3, title: 'Enter amount & details (رقم اور تفصیل)', detail: 'Type the exact amount, who handled it and a reference slip number.', urdu: 'رقم اور مکمل تفصیل درج کریں۔' },
          { step: 4, title: 'Safe balance updates (سیف بیلنس)', detail: 'The running safe balance is recalculated from the entries — it always equals the sum of what is recorded.', urdu: 'سیف میں نقد رقم خودکار طور پر اپ ڈیٹ ہو جاتی ہے۔' },
        ]}
        criticalChecks={[
          'Physical cash counted in the safe must always match the Safe Cash in Hand balance.',
          'Cash taken to the bank is recorded from the Bank Sheet (it also credits the bank account).',
          'Cashiers can only record today\'s entries; managers can correct or delete manual entries.',
        ]}
      />

      {isCashier && (
        <div className="ui-notice ui-notice-warning"><ShieldIcon size={16} /><span><strong>Cashier shift mode:</strong> real-time voucher entry is active. Back-dating and deletion are restricted by station policy.</span></div>
      )}

      <FilterBar>
        <div className="form-group"><label className="form-label">From</label><input type="date" className="form-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">To</label><input type="date" className="form-input" value={to} min={from || undefined} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value as 'all' | DaybookCategory)}>
            <option value="all">All categories</option>{DAYBOOK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(todayISO()); setTo(todayISO()); setCategory('all') }}>Today</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(''); setTo(''); setCategory('all') }}>All dates</button>
      </FilterBar>

      <KpiStrip>
        <Kpi label="Opening cash (period start)" value={rs(opening)} sub="Brought forward" />
        <Kpi label="Cash collected (+)" value={`+ ${rs(totalIn)}`} tone="green" sub={periodLabel} />
        <Kpi label="Cash disbursed (−)" value={`- ${rs(totalOut)}`} tone="red" sub="Expenses, deposits, advances" />
        <Kpi label="Cash in safe now" value={rs(current)} tone="gold" sub="Available station cash" />
      </KpiStrip>

      <SectionCard title="Cash Movement Entries" subtitle={`Ordered by date and time of entry — ${periodLabel}`}>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Date / time</th><th>Particulars</th><th>Category</th><th>Ref #</th><th>Cash in (+)</th><th>Cash out (−)</th><th>Safe balance</th><th>Handled by</th><th>Record</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow colSpan={9}>No cash entries for {periodLabel}.</EmptyRow> : rows.map((e) => (
                <tr key={e.id}>
                  <td className="ui-nowrap"><strong>{e.time}</strong><div className="text-muted text-xs">{formatDate(e.date)}</div></td>
                  <td><span className="font-semibold">{e.particulars}</span></td>
                  <td><span className="category-tag">{e.category}</span></td>
                  <td>{e.referenceNo || '—'}</td>
                  <td className="text-green font-bold">{e.cashIn > 0 ? `+ ${rs(e.cashIn)}` : '—'}</td>
                  <td className="text-red font-bold">{e.cashOut > 0 ? `- ${rs(e.cashOut)}` : '—'}</td>
                  <td className="text-gold font-bold">{rs(e.balanceAfter)}</td>
                  <td>{e.handledBy}</td>
                  <td>
                    <RowActions>
                      <span className="badge badge-outline" style={{ fontSize: 11, color: '#686256', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ShieldIcon size={12} color="#686256" />{e.sourceType ? 'Auto' : 'Manual'}
                      </span>
                      {!isCashier && !e.sourceType && <IconButton label="Delete entry" tone="danger" onClick={() => void removeEntry(e)}><TrashIcon size={14} /></IconButton>}
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {modalOpen && <EntryModal onClose={() => setModalOpen(false)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Official Station Daily Cash Register (Daybook)" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid"><div><strong>Period:</strong> {periodLabel}</div><div><strong>Opening cash:</strong> {rs(opening)}</div></div>
        <table className="slip-table">
          <thead><tr><th>Date</th><th>Particulars</th><th>Ref</th><th>In</th><th>Out</th><th>Balance</th></tr></thead>
          <tbody>{rows.map((d) => <tr key={d.id}><td>{formatDate(d.date)} {d.time}</td><td>{d.particulars}</td><td>{d.referenceNo || '—'}</td><td>{d.cashIn > 0 ? rs(d.cashIn) : '—'}</td><td>{d.cashOut > 0 ? rs(d.cashOut) : '—'}</td><td>{rs(d.balanceAfter)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Closing safe balance:</span><strong>{rs(rows.length ? rows[rows.length - 1].balanceAfter : opening)}</strong></div>
      </PrintReceiptModal>
    </div>
  )
}
