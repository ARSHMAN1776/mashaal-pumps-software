import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { CreditSaleSlip, CustomerAdjustment, CustomerRecovery } from '../../types'
import { buildStatement, type StatementRow } from '../../data/statements'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { EditIcon, PlusIcon, PrinterIcon, TrashIcon, WhatsAppIcon } from '../../components/common/Icons'
import { PrintReceiptModal } from '../../components/common/PrintReceiptModal'
import { useConfirm } from '../../components/common/Confirm'
import { useToast } from '../../components/common/Toast'
import { EmptyRow, IconButton, Kpi, KpiStrip, RowActions, SectionCard } from '../../components/common/kit'
import { AdjustmentModal, CustomerFormModal, RecoveryModal, SlipModal } from './CustomerModals'
import { openWhatsApp, slipMessage, statementMessage } from './whatsapp'

/** Delete (or archive) a customer with an explanation that matches what will really happen. */
export function useRemoveCustomer() {
  const { activeSiteData, act } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  return async (customerId: string): Promise<boolean> => {
    const c = activeSiteData.customers.find((x) => x.id === customerId)
    if (!c) return false
    const history =
      activeSiteData.creditSlips.filter((s) => s.customerId === customerId).length +
      activeSiteData.recoveries.filter((r) => r.customerId === customerId).length +
      activeSiteData.customerAdjustments.filter((a) => a.customerId === customerId).length
    const yes = await confirm({
      title: history === 0 ? `Delete ${c.businessName}?` : `Remove ${c.businessName}?`,
      message: history === 0 ? (
        <p>This customer has no transactions, so it will be deleted permanently.</p>
      ) : (
        <>
          <p>This customer has <strong>{history} ledger entries</strong> (slips, payments, notes). Financial history is never erased:</p>
          <ul style={{ margin: '8px 0 0 18px' }}>
            <li>If the balance is <strong>Rs 0</strong>, the customer is <strong>archived</strong> — hidden from the lists, ledger kept for reports and audit.</li>
            <li>If money is still owed, removal is refused until the balance is settled.</li>
          </ul>
        </>
      ),
      confirmLabel: history === 0 ? 'Delete customer' : 'Remove customer',
      tone: 'danger',
    })
    if (!yes) return false
    const r = await act.removeCustomer(customerId)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success(r.value.mode === 'deleted' ? `${c.businessName} deleted.` : `${c.businessName} archived — its ledger is kept.`)
    return true
  }
}

const KIND_LABEL: Record<StatementRow['kind'], string> = {
  opening: 'B/F', slip: 'Credit slip', recovery: 'Payment', 'debit-note': 'Debit note', 'credit-note': 'Credit note',
}

export const CustomerLedgerPanel: React.FC<{ customerId: string; onRemoved?: () => void }> = ({ customerId, onRemoved }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const { siteInfo, bankAccounts } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const confirm = useConfirm()
  const toast = useToast()
  const removeCustomer = useRemoveCustomer()

  const customer = activeSiteData.customers.find((c) => c.id === customerId)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [slipModal, setSlipModal] = useState<{ slip?: CreditSaleSlip } | null>(null)
  const [recoveryModal, setRecoveryModal] = useState<{ recovery?: CustomerRecovery } | null>(null)
  const [noteModal, setNoteModal] = useState<{ adjustment?: CustomerAdjustment } | null>(null)
  const [editCustomer, setEditCustomer] = useState(false)
  const [printStatement, setPrintStatement] = useState(false)
  const [printSlip, setPrintSlip] = useState<CreditSaleSlip | null>(null)
  const [printReceipt, setPrintReceipt] = useState<CustomerRecovery | null>(null)

  const slips = useMemo(() => activeSiteData.creditSlips.filter((s) => s.customerId === customerId), [activeSiteData.creditSlips, customerId])
  const recoveries = useMemo(() => activeSiteData.recoveries.filter((r) => r.customerId === customerId), [activeSiteData.recoveries, customerId])
  const adjustments = useMemo(() => activeSiteData.customerAdjustments.filter((a) => a.customerId === customerId), [activeSiteData.customerAdjustments, customerId])

  const statement = useMemo(
    () => (customer ? buildStatement(customer, slips, recoveries, adjustments, { from: from || undefined, to: to || undefined }) : null),
    [customer, slips, recoveries, adjustments, from, to],
  )
  if (!customer || !statement) return <div className="ui-empty">Select a customer.</div>

  const utilPct = customer.creditLimit > 0 ? Math.round((customer.currentBalance / customer.creditLimit) * 100) : 0
  const primaryBank = bankAccounts.find((b) => b.isActive)
  const archived = customer.status === 'Archived'

  const editRow = (r: StatementRow) => {
    if (r.kind === 'slip') setSlipModal({ slip: slips.find((s) => s.id === r.id) })
    else if (r.kind === 'recovery') setRecoveryModal({ recovery: recoveries.find((x) => x.id === r.id) })
    else if (r.kind === 'debit-note' || r.kind === 'credit-note') setNoteModal({ adjustment: adjustments.find((a) => a.id === r.id) })
  }

  const deleteRow = async (r: StatementRow) => {
    const what = r.kind === 'slip' ? 'credit slip' : r.kind === 'recovery' ? 'payment receipt' : 'ledger note'
    const yes = await confirm({
      title: `Delete ${what} ${r.refNo}?`,
      message: (
        <>
          <p>{formatDate(r.date)} — {r.debit > 0 ? `Debit ${rs(r.debit)}` : `Credit ${rs(r.credit)}`}</p>
          <p>The customer balance is recalculated{r.kind === 'recovery' ? ' and the cash-book / bank line created with this receipt is removed too' : ''}. The deletion is recorded in the audit trail.</p>
        </>
      ),
      confirmLabel: `Delete ${what}`,
      tone: 'danger',
    })
    if (!yes) return
    const res = r.kind === 'slip' ? await act.removeSlip(r.id) : r.kind === 'recovery' ? await act.removeRecovery(r.id) : await act.removeAdjustment(r.id)
    if (res.ok) toast.success('Deleted.')
    else toast.error(res.error)
  }

  const whatsappStatement = () =>
    openWhatsApp(customer.phone, statementMessage(customer, siteInfo, primaryBank, statement, todayISO()))

  return (
    <div>
      {archived && (
        <div className="ui-notice ui-notice-warning">
          <div><strong>Archived customer.</strong> Hidden from the customer lists; the ledger below is kept for records.</div>
          {isManager && (
            <div className="ui-notice-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={async () => { const r = await act.restoreCustomer(customer.id); if (r.ok) toast.success('Customer restored.'); else toast.error(r.error) }}>Restore</button>
            </div>
          )}
        </div>
      )}

      <KpiStrip>
        <Kpi label="Client" value={<span style={{ fontSize: 16 }}>{customer.businessName}</span>} sub={`Prop: ${customer.name} • ${customer.phone}`} />
        <Kpi label="Credit limit" value={rs(customer.creditLimit)} sub={`${utilPct}% used${customer.status === 'Hold' ? ' • ON HOLD' : ''}`} tone={utilPct >= 100 ? 'red' : 'plain'} />
        <Kpi label="Total debit (fuel & debit notes)" value={rs(statement.totalDebit)} tone="red" sub={from || to ? 'in the selected period' : 'whole ledger'} />
        <Kpi label="Total credit (payments & credit notes)" value={rs(statement.totalCredit)} tone="green" />
        <Kpi label="Net balance due" value={customer.currentBalance < 0 ? `${rs(-customer.currentBalance)} advance` : rs(customer.currentBalance)} tone="gold" sub="Payable to the station" />
      </KpiStrip>

      <div className="ui-filter-bar">
        <div className="form-group"><label className="form-label">From</label><input type="date" className="form-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">To</label><input type="date" className="form-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
        {(from || to) && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(''); setTo('') }}>Clear dates</button>}
        <div className="ui-filter-spacer" />
        {!archived && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSlipModal({})} disabled={customer.status !== 'Active'} title={customer.status === 'Hold' ? 'Account is on hold' : undefined}>
              <PlusIcon size={14} /><span>Debit: issue slip</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecoveryModal({})}><PlusIcon size={14} /><span>Credit: record payment</span></button>
            {isManager && <button type="button" className="btn btn-outline btn-sm" onClick={() => setNoteModal({})}><PlusIcon size={14} /><span>Debit / credit note</span></button>}
          </>
        )}
        {isManager && !archived && (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditCustomer(true)}><EditIcon size={14} /><span>Edit customer</span></button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={async () => { if (await removeCustomer(customer.id)) onRemoved?.() }}><TrashIcon size={14} /><span>Delete customer</span></button>
          </>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPrintStatement(true)}><PrinterIcon size={14} /><span>Print</span></button>
        <button type="button" className="btn btn-sm" style={{ background: '#15803d', borderColor: '#166534', color: '#fff' }} onClick={whatsappStatement}><WhatsAppIcon size={14} color="#fff" /><span>WhatsApp</span></button>
      </div>

      <SectionCard title={`Account statement — ${customer.businessName}`} subtitle="Complete itemized audit trail. Debit = fuel taken on credit; Credit = money received.">
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Ref #</th><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance due</th>{isManager && <th />}</tr>
            </thead>
            <tbody>
              {statement.rows.length === 0 ? (
                <EmptyRow colSpan={isManager ? 8 : 7}>No ledger entries yet.</EmptyRow>
              ) : statement.rows.map((r) => (
                <tr key={r.key} className={r.kind === 'opening' ? 'ui-statement-opening' : undefined}>
                  <td className="ui-nowrap">{r.date ? formatDate(r.date) : '—'}</td>
                  <td><span className="ui-tag">{KIND_LABEL[r.kind]}</span></td>
                  <td><strong>{r.refNo}</strong></td>
                  <td>{r.description}</td>
                  <td className="text-right text-red font-bold">{r.debit > 0 ? rs(r.debit) : '—'}</td>
                  <td className="text-right text-green font-bold">{r.credit > 0 ? rs(r.credit) : '—'}</td>
                  <td className="text-right text-gold font-bold">{r.balance < 0 ? `${rs(-r.balance)} Cr` : rs(r.balance)}</td>
                  {isManager && (
                    <td>
                      {r.kind !== 'opening' && (
                        <RowActions>
                          {r.kind === 'slip' && <IconButton label="Print slip" onClick={() => setPrintSlip(slips.find((s) => s.id === r.id) ?? null)}><PrinterIcon size={14} /></IconButton>}
                          {r.kind === 'recovery' && <IconButton label="Print receipt" onClick={() => setPrintReceipt(recoveries.find((x) => x.id === r.id) ?? null)}><PrinterIcon size={14} /></IconButton>}
                          {r.kind === 'slip' && <IconButton label="Send slip on WhatsApp" onClick={() => { const s = slips.find((x) => x.id === r.id); if (s) openWhatsApp(customer.phone, slipMessage(s, siteInfo)) }}><WhatsAppIcon size={14} color="#15803d" /></IconButton>}
                          <IconButton label="Edit" onClick={() => editRow(r)}><EditIcon size={14} /></IconButton>
                          <IconButton label="Delete" tone="danger" onClick={() => void deleteRow(r)}><TrashIcon size={14} /></IconButton>
                        </RowActions>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {statement.rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right"><strong>Totals / closing balance</strong></td>
                  <td className="text-right text-red font-bold">{rs(statement.totalDebit)}</td>
                  <td className="text-right text-green font-bold">{rs(statement.totalCredit)}</td>
                  <td className="text-right text-gold font-bold">{statement.closing < 0 ? `${rs(-statement.closing)} Cr` : rs(statement.closing)}</td>
                  {isManager && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      {slipModal && <SlipModal customerId={customer.id} slip={slipModal.slip} onClose={() => setSlipModal(null)} />}
      {recoveryModal && <RecoveryModal customerId={customer.id} recovery={recoveryModal.recovery} onClose={() => setRecoveryModal(null)} onSaved={(r, print) => { if (print) setPrintReceipt(r) }} />}
      {noteModal && <AdjustmentModal customerId={customer.id} adjustment={noteModal.adjustment} onClose={() => setNoteModal(null)} />}
      {editCustomer && <CustomerFormModal customer={customer} onClose={() => setEditCustomer(false)} />}

      <PrintReceiptModal isOpen={printStatement} onClose={() => setPrintStatement(false)} title={`Account Statement: ${customer.businessName}`} stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone} defaultMode="a4">
        <div className="slip-meta-grid">
          <div><strong>Client:</strong> {customer.businessName}</div>
          <div><strong>Proprietor:</strong> {customer.name}</div>
          <div><strong>Contact:</strong> {customer.phone}</div>
          <div><strong>Credit limit:</strong> {rs(customer.creditLimit)}</div>
          {(from || to) && <div><strong>Period:</strong> {from ? formatDate(from) : 'start'} – {to ? formatDate(to) : 'today'}</div>}
        </div>
        <table className="slip-table">
          <thead><tr><th>Date</th><th>Ref</th><th>Particulars</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
          <tbody>
            {statement.rows.map((r) => (
              <tr key={r.key}><td>{r.date ? formatDate(r.date) : ''}</td><td>{r.refNo}</td><td>{r.description}</td><td style={{ textAlign: 'right' }}>{r.debit > 0 ? rs(r.debit) : '—'}</td><td style={{ textAlign: 'right' }}>{r.credit > 0 ? rs(r.credit) : '—'}</td><td style={{ textAlign: 'right' }}>{rs(r.balance)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Net balance due:</span><strong>{rs(statement.closing)}</strong></div>
        {primaryBank && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
            <div><strong>Remittance bank:</strong> {primaryBank.bankName} • {primaryBank.branch}</div>
            <div><strong>A/C title:</strong> {primaryBank.accountTitle} • <strong>A/C:</strong> {primaryBank.accountNumber}</div>
          </div>
        )}
      </PrintReceiptModal>

      <PrintReceiptModal isOpen={printSlip !== null} onClose={() => setPrintSlip(null)} title="Credit Fuel Slip" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone} defaultMode="thermal">
        {printSlip && (
          <div className="slip-summary-list">
            <div className="slip-row"><span>Slip #:</span><strong>{printSlip.slipNo}</strong></div>
            <div className="slip-row"><span>Date:</span><span>{formatDate(printSlip.date)}</span></div>
            <div className="slip-row"><span>Customer:</span><strong>{printSlip.customerName}</strong></div>
            <div className="slip-row"><span>Vehicle:</span><span>{printSlip.vehicleNo}</span></div>
            <div className="slip-row"><span>Driver:</span><span>{printSlip.driverName}</span></div>
            <div className="slip-row"><span>Product:</span><span>{printSlip.fuelType}</span></div>
            <div className="slip-row"><span>Liters:</span><strong>{printSlip.liters.toLocaleString()} L</strong></div>
            <div className="slip-row"><span>Rate / L:</span><span>Rs {printSlip.rate.toFixed(2)}</span></div>
            <div className="receipt-divider" />
            <div className="slip-row highlight"><span>Amount on credit:</span><strong>{rs(printSlip.totalAmount)}</strong></div>
            <div className="slip-row"><span>Authorized by:</span><span>{printSlip.authorizedBy}</span></div>
            <div className="slip-signatures"><div><div className="sig-line" /><span>Driver signature</span></div><div><div className="sig-line" /><span>Cashier</span></div></div>
          </div>
        )}
      </PrintReceiptModal>

      <PrintReceiptModal isOpen={printReceipt !== null} onClose={() => setPrintReceipt(null)} title="Payment Receipt" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone} defaultMode="thermal">
        {printReceipt && (
          <div className="slip-summary-list">
            <div className="slip-row"><span>Receipt #:</span><strong>{printReceipt.receiptNo}</strong></div>
            <div className="slip-row"><span>Date:</span><span>{formatDate(printReceipt.date)}</span></div>
            <div className="slip-row"><span>Received from:</span><strong>{printReceipt.customerName}</strong></div>
            <div className="slip-row"><span>Mode:</span><span>{printReceipt.paymentMethod}{printReceipt.referenceNo ? ` (${printReceipt.referenceNo})` : ''}</span></div>
            <div className="receipt-divider" />
            <div className="slip-row highlight"><span>Amount received:</span><strong>{rs(printReceipt.amount)}</strong></div>
            <div className="slip-row"><span>Balance still due:</span><span>{rs(customer.currentBalance)}</span></div>
            <div className="slip-row"><span>Received by:</span><span>{printReceipt.receivedBy}</span></div>
          </div>
        )}
      </PrintReceiptModal>
    </div>
  )
}
