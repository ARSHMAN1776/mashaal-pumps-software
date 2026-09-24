import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { FuelType, OmcInvoice, OmcPayment, OmcPaymentMethod } from '../../types'
import { FUEL_TYPES } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs, round2 } from '../../lib/money'
import { BuildingIcon, PlusIcon, PrinterIcon, CheckCircleIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, Grid3, Grid4, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard } from '../common/kit'

const InvoiceModal: React.FC<{ invoice?: OmcInvoice; onClose: () => void }> = ({ invoice, onClose }) => {
  const [version] = useState(invoice?.updatedAt) // the record's version when this window was opened
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const { tanks } = activeSiteData
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo ?? '')
  const [date, setDate] = useState(invoice?.date ?? todayISO())
  const [lorry, setLorry] = useState(invoice?.tankLorryNo ?? '')
  const [driver, setDriver] = useState(invoice?.driverName ?? '')
  const [fuel, setFuel] = useState<FuelType>(invoice?.fuelType ?? 'HSD Diesel')
  // a fuel with a single tank needs no choice: it is picked for you
  const onlyTank = (f: FuelType) => { const l = tanks.filter((t) => t.fuelType === f); return l.length === 1 ? l[0].id : '' }
  const [tankId, setTankId] = useState(invoice?.tankId || onlyTank(invoice?.fuelType ?? 'HSD Diesel'))
  const [invVol, setInvVol] = useState(String(invoice?.invoiceVolumeLiters ?? ''))
  const [decVol, setDecVol] = useState(String(invoice?.decantedVolumeLiters ?? ''))
  const [rate, setRate] = useState(String(invoice?.ratePerLiter ?? ''))
  const [freight, setFreight] = useState(String(invoice?.freightAmount ?? 0))
  const { busy, error, run } = useSubmit()

  const fuelTanks = tanks.filter((t) => t.fuelType === fuel)
  const total = round2(Number(decVol) * Number(rate) + Number(freight))
  const shortage = round2(Number(invVol) - Number(decVol))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = {
      invoiceNo, date, tankLorryNo: lorry, driverName: driver, fuelType: fuel, tankId: fuelTanks.some((t) => t.id === tankId) ? tankId : '',
      invoiceVolumeLiters: Number(invVol), decantedVolumeLiters: Number(decVol), ratePerLiter: Number(rate), freightAmount: Number(freight),
    }
    if (invoice) void run(() => act.updateOmcInvoice(invoice.id, { ...input, version }), () => { toast.success('Invoice updated.'); onClose() })
    else void run(() => act.addOmcInvoice(input), (i) => { toast.success(`Invoice ${i.invoiceNo} recorded — ${rs(i.totalAmount)} payable.`); onClose() })
  }

  return (
    <Modal title={invoice ? `Edit Invoice ${invoice.invoiceNo}` : `Record ${activeSiteData.siteInfo.brand} Fuel Delivery`} subtitle="Official tanker invoice and the quantity actually decanted" onClose={onClose} busy={busy} width={760}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="Invoice number"><input className="form-input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required autoFocus /></Field>
          <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Tank lorry reg #"><input className="form-input" value={lorry} onChange={(e) => setLorry(e.target.value)} required /></Field>
        </Grid3>
        <Grid3>
          <Field label="Driver name"><input className="form-input" value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
          <Field label="Fuel product">
            <select className="form-input" value={fuel} onChange={(e) => { setFuel(e.target.value as FuelType); setTankId(onlyTank(e.target.value as FuelType)) }}>{FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </Field>
          <Field label="Unloaded into tank" hint="The fuel is added to this tank's stock">
            <select className="form-input" value={tankId} onChange={(e) => setTankId(e.target.value)} required>
              <option value="" disabled>Choose the tank</option>
              {fuelTanks.map((t) => <option key={t.id} value={t.id}>Tank #{t.tankNo} ({t.capacityLiters.toLocaleString()} L)</option>)}
            </select>
          </Field>
        </Grid3>
        <Grid4>
          <Field label="Invoice volume (L)"><input type="number" min={0} step="any" className="form-input" value={invVol} onChange={(e) => { setInvVol(e.target.value); if (!decVol || decVol === invVol) setDecVol(e.target.value) }} required /></Field>
          <Field label="Decanted volume (L)" strong><input type="number" min={0.001} step="any" className="form-input" value={decVol} onChange={(e) => setDecVol(e.target.value)} required /></Field>
          <Field label="Rate / liter (Rs)"><input type="number" min={0.01} step="any" className="form-input" value={rate} onChange={(e) => setRate(e.target.value)} required /></Field>
          <Field label="Freight (Rs)"><input type="number" min={0} step="any" className="form-input" value={freight} onChange={(e) => setFreight(e.target.value)} required /></Field>
        </Grid4>
        <CalcStrip items={[
          { label: 'Product cost', value: rs(Number(decVol) * Number(rate) || 0) },
          { label: 'Freight', value: `+ ${rs(Number(freight) || 0)}` },
          { label: 'Transit shortage', value: invVol === '' || decVol === '' ? '—' : `${shortage} L`, tone: shortage > 0 ? 'red' : undefined },
          { label: 'Total payable', value: rs(Number.isFinite(total) ? total : 0), tone: 'gold' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : invoice ? 'Save changes' : 'Save tanker invoice'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const PaymentModal: React.FC<{ invoiceNo?: string; onClose: () => void }> = ({ invoiceNo, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const open = activeSiteData.omcInvoices.filter((i) => i.paymentStatus !== 'Paid')
  const first = open.find((i) => i.invoiceNo === invoiceNo) ?? open[0]
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)
  const [invNo, setInvNo] = useState(first?.invoiceNo ?? '')
  const inv = open.find((i) => i.invoiceNo === invNo)
  const [method, setMethod] = useState<OmcPaymentMethod>('Bank Transfer')
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [amount, setAmount] = useState(first ? String(round2(first.totalAmount - first.paidAmount)) : '')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const due = inv ? round2(inv.totalAmount - inv.paidAmount) : 0
  const bank = banks.find((b) => b.id === bankId)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      (ack) => act.payOmcInvoice({ invoiceNo: invNo, amount: Number(amount), method, bankAccountId: method === 'Cash' ? '' : bankId, referenceNo: ref, date, acknowledge: ack }),
      (p) => { toast.success(`Payment of ${rs(p.amount)} recorded against ${p.invoiceNo}.`); onClose() },
    )
  }

  return (
    <Modal title={`Record Payment to ${activeSiteData.siteInfo.brand}`} subtitle="Bank transfer, pay order, cheque or cash — posted to the bank or the daybook automatically" onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        {open.length === 0 ? <div className="ui-notice ui-notice-info">All invoices are fully paid. There is nothing to pay.</div> : (
          <>
            <Grid2>
              <Field label="Against invoice">
                <select className="form-input" value={invNo} onChange={(e) => { setInvNo(e.target.value); const i = open.find((x) => x.invoiceNo === e.target.value); if (i) setAmount(String(round2(i.totalAmount - i.paidAmount))) }} required>
                  {open.map((i) => <option key={i.id} value={i.invoiceNo}>{i.invoiceNo} — due {rs(i.totalAmount - i.paidAmount)}</option>)}
                </select>
              </Field>
              <Field label="Payment method">
                <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value as OmcPaymentMethod)}>
                  <option value="Bank Transfer">Bank transfer (RTGS / online)</option>
                  <option value="Pay Order">Bank pay order</option>
                  <option value="Cheque">Crossed cheque</option>
                  <option value="Cash">Cash from the safe</option>
                </select>
              </Field>
            </Grid2>
            <Grid2>
              {method === 'Cash' ? (
                <Field label="Paid from"><div className="read-only-box">Station safe (daybook)</div></Field>
              ) : (
                <Field label="Paid from bank account" hint={bank ? `Balance ${rs(bank.currentBalance)}` : 'Add a bank account in the Bank Sheet first'}>
                  <select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)} required>{banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}</select>
                </Field>
              )}
              <Field label="Reference / pay-order / cheque #"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} required /></Field>
            </Grid2>
            <Grid2>
              <Field label="Payment amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
              <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
            </Grid2>
            <CalcStrip items={[{ label: 'Invoice due', value: rs(due) }, { label: 'This payment', value: rs(Number(amount) || 0), tone: 'green' }, { label: 'Remaining', value: rs(due - (Number(amount) || 0)), tone: 'gold' }]} />
          </>
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || open.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save payment voucher'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const OmcLedgerView: React.FC = () => {
  const { activeSiteData, act } = useApp()
  const { omcInvoices, omcPayments, siteInfo, tanks } = activeSiteData
  const confirm = useConfirm()
  const toast = useToast()
  const [invoiceForm, setInvoiceForm] = useState<{ invoice?: OmcInvoice } | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  const totalInvoiced = omcInvoices.reduce((a, i) => a + i.totalAmount, 0)
  const totalPaid = omcInvoices.reduce((a, i) => a + i.paidAmount, 0)
  const net = totalInvoiced - totalPaid

  const removeInvoice = async (i: OmcInvoice) => {
    const yes = await confirm({ title: `Delete invoice ${i.invoiceNo}?`, message: `${rs(i.totalAmount)} — ${i.fuelType}, ${formatDate(i.date)}. Only invoices without payments can be deleted.`, confirmLabel: 'Delete invoice', tone: 'danger' })
    if (!yes) return
    const r = await act.removeOmcInvoice(i.id)
    if (r.ok) toast.success('Invoice deleted.'); else toast.error(r.error)
  }
  const removePayment = async (p: OmcPayment) => {
    const yes = await confirm({ title: 'Delete this payment?', message: `${rs(p.amount)} for invoice ${p.invoiceNo}. The ${p.paymentMethod === 'Cash' ? 'cash-book' : 'bank'} line created with it is removed too and the invoice balance is restored.`, confirmLabel: 'Delete payment', tone: 'danger' })
    if (!yes) return
    const r = await act.removeOmcPayment(p.id)
    if (r.ok) toast.success('Payment deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="OIL MARKETING COMPANY LEDGER"
        title={`${siteInfo.brand} Purchases & Ledger`}
        subtitle="Fuel tanker delivery invoices, decanted volumes, freight charges, and RTGS / cheque / cash payments"
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print OMC Statement</span></button>
            <button type="button" className="btn btn-secondary" onClick={() => setPayFor('')}><BuildingIcon size={16} /><span>Record Payment</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setInvoiceForm({})}><PlusIcon size={16} /><span>New Tanker Delivery</span></button>
          </>
        }
      />

      <KpiStrip>
        <Kpi label="Primary OMC supplier" value={siteInfo.brand} sub="Contracted supply depot" />
        <Kpi label="Total fuel purchased" value={rs(totalInvoiced)} tone="gold" sub={`${omcInvoices.length} tanker invoice(s)`} />
        <Kpi label="Total payments" value={rs(totalPaid)} tone="green" sub="Transfers / pay orders / cash" />
        <Kpi label="Net payable balance" value={rs(net)} tone={net > 0 ? 'amber' : 'green'} sub={net > 0 ? 'Pending remittance to OMC' : 'All invoices cleared'} />
      </KpiStrip>

      <SectionCard title="Tank Lorry Delivery Invoices" subtitle="Decanted bulk liters from company depot tankers">
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Invoice #</th><th>Date</th><th>Lorry & driver</th><th>Fuel / tank</th><th>Decanted</th><th>Rate</th><th>Freight</th><th>Total</th><th>Paid</th><th>Status</th><th /></tr></thead>
            <tbody>
              {omcInvoices.length === 0 ? <EmptyRow colSpan={11}>No tanker invoices recorded yet.</EmptyRow> : omcInvoices.map((i) => {
                const tank = tanks.find((t) => t.id === i.tankId)
                return (
                  <tr key={i.id}>
                    <td><strong>{i.invoiceNo}</strong></td>
                    <td>{formatDate(i.date)}</td>
                    <td><div>{i.tankLorryNo}</div><div className="text-muted text-xs">Driver: {i.driverName || '—'}</div></td>
                    <td><span className="fuel-pill">{i.fuelType}</span>{tank && <div className="text-muted text-xs">Tank #{tank.tankNo}</div>}</td>
                    <td><strong>{i.decantedVolumeLiters.toLocaleString()} L</strong>{i.invoiceVolumeLiters !== i.decantedVolumeLiters && <div className="text-muted text-xs">invoice {i.invoiceVolumeLiters.toLocaleString()} L</div>}</td>
                    <td>Rs {i.ratePerLiter}</td>
                    <td>{rs(i.freightAmount)}</td>
                    <td className="text-gold font-bold">{rs(i.totalAmount)}</td>
                    <td className="text-green">{rs(i.paidAmount)}</td>
                    <td><span className={`badge ${i.paymentStatus === 'Paid' ? 'badge-success' : i.paymentStatus === 'Partial' ? 'badge-warning' : 'badge-danger'}`}>{i.paymentStatus}</span></td>
                    <td>
                      <RowActions>
                        {i.paymentStatus !== 'Paid' && <button type="button" className="btn btn-outline ui-mini-btn" onClick={() => setPayFor(i.invoiceNo)}>Pay</button>}
                        <IconButton label="Edit invoice" onClick={() => setInvoiceForm({ invoice: i })}><EditIcon size={14} /></IconButton>
                        <IconButton label="Delete invoice" tone="danger" onClick={() => void removeInvoice(i)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="OMC Payment Vouchers & Remittances" subtitle="Settlement vouchers — newest first">
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Date</th><th>Invoice</th><th>Mode</th><th>Bank & reference</th><th>Amount</th><th>Recorded by</th><th /></tr></thead>
            <tbody>
              {omcPayments.length === 0 ? <EmptyRow colSpan={7}>No payments recorded yet.</EmptyRow> : omcPayments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td><strong>{p.invoiceNo}</strong></td>
                  <td><span className="badge badge-neutral">{p.paymentMethod}</span></td>
                  <td><div>{p.paymentMethod === 'Cash' ? 'Cash from safe' : p.bankName || '—'}</div><div className="text-muted text-xs">Ref: {p.referenceNo || '—'}</div></td>
                  <td className="text-green font-bold">{rs(p.amount)}</td>
                  <td>{p.recordedBy}</td>
                  <td><RowActions><IconButton label="Delete payment" tone="danger" onClick={() => void removePayment(p)}><TrashIcon size={14} /></IconButton></RowActions></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {invoiceForm && <InvoiceModal invoice={invoiceForm.invoice} onClose={() => setInvoiceForm(null)} />}
      {payFor !== null && <PaymentModal invoiceNo={payFor || undefined} onClose={() => setPayFor(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title={`${siteInfo.brand} Company Account & Ledger Statement`} stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Fuel</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>{omcInvoices.map((i) => <tr key={i.id}><td>{i.invoiceNo}</td><td>{formatDate(i.date)}</td><td>{i.fuelType}</td><td>{rs(i.totalAmount)}</td><td>{rs(i.paidAmount)}</td><td>{rs(i.totalAmount - i.paidAmount)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Net outstanding payable to OMC:</span><strong>{rs(net)}</strong></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="OMC Supply & Tanker Deliveries SOP"
        urduTitle="آئل مارکیٹنگ کمپنی اور ٹینکر ڈلیوری کے اصول"
        role="manager"
        roleLabel="Station Manager / Owner"
        purpose="Track bulk fuel tanker receipts, decanting variance against depot invoices, freight, and payments. Payments post to the bank account or the cash safe automatically."
        steps={[
          { step: 1, title: 'Tanker arrival & dip (ٹینکر کی آمد)', detail: 'Check seals and dip the tanker before decanting into the underground tank.', urdu: 'ڈپو کی سیل چیک کریں اور ٹینکر کی پیمائش کریں۔' },
          { step: 2, title: 'Record decanted liters (اتاری گئی مقدار)', detail: 'Enter invoice volume, decanted volume and the receiving tank. The transit shortage is shown.', urdu: 'انوائس اور اصل اتاری گئی مقدار درج کریں۔' },
          { step: 3, title: 'Pay the OMC (ادائیگی)', detail: 'Record the transfer / pay order / cheque against the invoice and choose the bank account it left from.', urdu: 'بینک اکاؤنٹ منتخب کر کے ادائیگی درج کریں۔' },
        ]}
        criticalChecks={[
          'Test fuel with water paste before decanting.',
          'Decanted volume must match the temperature-corrected dip report.',
          'A payment cannot exceed the invoice balance without manager authorization.',
        ]}
      />
    </div>
  )
}
