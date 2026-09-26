import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { Customer } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { creditLeft } from '../../data/derive'
import { rs } from '../../lib/money'
import { PlusIcon, PrinterIcon, SearchIcon, CashIcon, WhatsAppIcon, EditIcon, TrashIcon, BookOpenIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal } from '../common/Modal'
import { EmptyRow, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard, Tabs } from '../common/kit'
import { ANY_VEHICLE } from '../../context/actions'
import { CustomerFormModal, RecoveryModal, SlipModal } from '../../features/customers/CustomerModals'
import { CustomerLedgerPanel, useRemoveCustomer } from '../../features/customers/CustomerLedgerPanel'
import { slipMessage } from '../../features/customers/whatsapp'
import { useWhatsApp } from '../../features/customers/useWhatsApp'

export const CustomersView: React.FC = () => {
  const { activeSiteData, currentUser } = useApp()
  const { customers, creditSlips, recoveries, siteInfo } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const removeCustomer = useRemoveCustomer()

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [tab, setTab] = useState<'slips' | 'recoveries'>('slips')
  const [customerForm, setCustomerForm] = useState<{ customer?: Customer } | null>(null)
  const [slipFor, setSlipFor] = useState<string | null>(null)
  const openChat = useWhatsApp()
  const [recoveryFor, setRecoveryFor] = useState<string | null>(null)
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  const [printAging, setPrintAging] = useState(false)

  const today = todayISO()
  const live = customers.filter((c) => c.status !== 'Archived')
  const term = search.trim().toLowerCase()
  const shown = useMemo(
    () =>
      customers
        .filter((c) => (showArchived ? true : c.status !== 'Archived'))
        .filter((c) => !term || c.name.toLowerCase().includes(term) || c.businessName.toLowerCase().includes(term) || c.phone.includes(term) || c.vehicleNumbers.some((v) => v.toLowerCase().includes(term))),
    [customers, showArchived, term],
  )

  const totalOutstanding = live.reduce((s, c) => s + Math.max(0, c.currentBalance), 0)
  const todaySlips = creditSlips.filter((s) => s.date === today)
  const todayRecoveries = recoveries.filter((r) => r.date === today)
  const custName = (id: string) => customers.find((c) => c.id === id)
  // the latest fuel and the latest payment of every customer, for the small line under each name
  const lastActivity = useMemo(() => {
    const fuel: Record<string, { date: string; liters: number }> = {}
    const paid: Record<string, { date: string; amount: number }> = {}
    for (const s of creditSlips) if (!fuel[s.customerId] || s.date > fuel[s.customerId].date) fuel[s.customerId] = { date: s.date, liters: s.liters }
    for (const r of recoveries) if (!paid[r.customerId] || r.date > paid[r.customerId].date) paid[r.customerId] = { date: r.date, amount: r.amount }
    return { fuel, paid }
  }, [creditSlips, recoveries])

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Credit customers"
        title="Credit customers"
        subtitle={<>Transport companies and fleets that take fuel now and pay later. See what each one owes and how much credit is left.{!isManager && ' A manager adds and edits customers.'}</>}
        actions={
          <>
            {isManager && (
              <button type="button" className="btn btn-outline" onClick={() => setCustomerForm({})}><PlusIcon size={16} /><span>Add customer</span></button>
            )}
            <button type="button" className="btn btn-outline" onClick={() => setRecoveryFor('')} disabled={live.length === 0}><CashIcon size={16} /><span>Receive payment</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setSlipFor('')} disabled={live.filter((c) => c.status === 'Active').length === 0}><PlusIcon size={16} /><span>Give fuel on credit</span></button>
          </>
        }
      />

      <KpiStrip>
        <Kpi label="Credit customers" value={`${live.length}`} sub={`${live.filter((c) => c.status === 'Hold').length} on hold`} />
        <Kpi label="Total owed to you" value={rs(totalOutstanding)} sub="Fuel given on credit, not yet paid" />
        <Kpi label="Fuel given on credit today" value={rs(todaySlips.reduce((a, s) => a + s.totalAmount, 0))} sub={`${todaySlips.length} ${todaySlips.length === 1 ? 'slip' : 'slips'}`} />
        <Kpi label="Payments received today" value={rs(todayRecoveries.reduce((a, r) => a + r.amount, 0))} tone="green" sub={`${todayRecoveries.length} ${todayRecoveries.length === 1 ? 'payment' : 'payments'}`} />
      </KpiStrip>

      <div className="table-search-bar">
        <div className="search-input-wrap">
          <SearchIcon size={18} color="currentColor" />
          <input type="text" className="search-field" placeholder="Search by name, phone or vehicle number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isManager && (
          <label className="ui-checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /><span>Also show removed customers</span>
          </label>
        )}
      </div>

      <SectionCard title="All credit customers" subtitle="Click a name to see that customer's full account." actions={<button type="button" className="btn btn-outline btn-sm" onClick={() => setPrintAging(true)}><PrinterIcon size={15} /><span>Print list</span></button>}>
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr><th>Customer</th><th>Vehicles</th><th>Credit limit</th><th>Owes now</th><th>Credit left</th><th className="col-actions" /></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <EmptyRow colSpan={6}>{customers.length === 0 ? 'No credit customers yet.' : 'No customer matches your search.'}{isManager && customers.length === 0 ? ' Press "Add customer" to add the first one.' : ''}</EmptyRow>
              ) : shown.map((c) => {
                const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 0
                const over = c.currentBalance >= c.creditLimit && c.creditLimit > 0
                const left = creditLeft(c)
                const archived = c.status === 'Archived'
                return (
                  <tr key={c.id} style={archived ? { opacity: 0.6 } : undefined}>
                    <td>
                      <button type="button" className="ui-link-btn" onClick={() => setLedgerFor(c.id)} title="Open this customer's account"><strong style={{ fontSize: 14 }}>{c.businessName}</strong></button>{c.status !== 'Active' && <span className={`badge ${c.status === 'Hold' ? 'badge-warning' : 'badge-neutral'}`} style={{ marginLeft: 8, fontSize: 10.5, padding: '2px 6px' }}>{c.status === 'Hold' ? 'On hold' : 'Removed'}</span>}
                      <div className="text-muted text-xs">{c.name !== c.businessName ? `${c.name} · ` : ''}{c.phone}</div>
                      <div className="text-muted text-xs">{lastActivity.fuel[c.id] ? `Last fuel: ${formatDate(lastActivity.fuel[c.id].date)}, ${lastActivity.fuel[c.id].liters.toLocaleString()} L` : 'No fuel taken yet'}</div>
                      <div className="text-muted text-xs">{lastActivity.paid[c.id] ? `Last payment: ${formatDate(lastActivity.paid[c.id].date)}, ${rs(lastActivity.paid[c.id].amount)}` : 'No payment yet'}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 170 }}>
                        {c.vehicleNumbers.length === 0 || c.vehicleNumbers.includes(ANY_VEHICLE)
                          ? <span className="ui-muted">Any vehicle</span>
                          : c.vehicleNumbers.map((v) => <span key={v} className="vehicle-pill" style={{ fontSize: 10, padding: '1px 5px' }}>{v}</span>)}
                      </div>
                    </td>
                    <td>{rs(c.creditLimit)}</td>
                    <td className={`font-bold ${c.currentBalance < 0 ? 'text-green' : 'text-gold'}`}>{c.currentBalance < 0 ? `${rs(-c.currentBalance)} adv.` : rs(c.currentBalance)}</td>
                    <td>
                      <strong className={left <= 0 ? 'text-red' : 'text-green'}>{left < 0 ? `Over by ${rs(-left)}` : rs(left)}</strong>
                      <div className="util-bar-wrap" style={{ width: 70, marginTop: 4 }}>
                        <div className={`util-bar-fill ${over ? 'fill-danger' : 'fill-gold'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                        <span className="util-text">{pct}%</span>
                      </div>
                    </td>
                    <td className="col-actions">
                      <RowActions>
                        <button type="button" className="btn btn-outline ui-mini-btn" disabled={c.status !== 'Active'} onClick={() => setSlipFor(c.id)}>Give fuel</button>
                        <button type="button" className="btn btn-outline ui-mini-btn" disabled={archived} onClick={() => setRecoveryFor(c.id)}>Receive payment</button>
                        <IconButton label="Open ledger (debit / credit statement)" onClick={() => setLedgerFor(c.id)}><BookOpenIcon size={14} /></IconButton>
                        {isManager && !archived && <IconButton label="Edit customer" onClick={() => setCustomerForm({ customer: c })}><EditIcon size={14} /></IconButton>}
                        {isManager && !archived && <IconButton label="Delete customer" tone="danger" onClick={() => void removeCustomer(c.id)}><TrashIcon size={14} /></IconButton>}
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Tabs tabs={[{ id: 'slips', label: 'Fuel given on credit', count: creditSlips.length }, { id: 'recoveries', label: 'Payments received', count: recoveries.length }]} active={tab} onChange={(t) => setTab(t as 'slips' | 'recoveries')} />

      {tab === 'slips' ? (
        <SectionCard title="Fuel given on credit" subtitle="Newest first. Open a customer's account to change or print a slip.">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Slip # & date</th><th>Client</th><th>Vehicle & driver</th><th>Product & volume</th><th>Value</th><th>Authorized by</th><th className="col-actions">WhatsApp</th></tr></thead>
              <tbody>
                {creditSlips.length === 0 ? <EmptyRow colSpan={7}>No fuel has been given on credit yet.</EmptyRow> : creditSlips.slice(0, 40).map((s) => {
                  const c = custName(s.customerId)
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.slipNo}</strong><div className="text-muted text-xs">{formatDate(s.date)}</div></td>
                      <td>{c ? <button type="button" className="ui-link-btn" onClick={() => setLedgerFor(c.id)}>{s.customerName}</button> : s.customerName}</td>
                      <td><strong>{s.vehicleNo}</strong><div className="text-muted text-xs">{s.driverName}</div></td>
                      <td><span className="category-tag" style={{ fontSize: 10.5 }}>{s.fuelType}</span><div style={{ fontSize: 11, color: '#686256' }}><strong>{s.liters} L</strong> @ Rs {s.rate.toFixed(2)}</div></td>
                      <td><strong className="text-gold">{rs(s.totalAmount)}</strong></td>
                      <td className="text-xs text-muted">{s.authorizedBy}</td>
                      <td className="col-actions">
                        <button type="button" className="btn ui-mini-btn" style={{ backgroundColor: '#ecfdf5', borderColor: '#86efac', color: '#15803d' }} onClick={() => openChat(c?.phone ?? '', slipMessage(s, siteInfo))}>
                          <WhatsAppIcon size={13} color="#15803d" /><span>WhatsApp</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Payments received" subtitle="Money customers have paid, newest first.">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Receipt # & date</th><th>Client</th><th>Mode</th><th>Reference</th><th>Amount</th><th>Received by</th></tr></thead>
              <tbody>
                {recoveries.length === 0 ? <EmptyRow colSpan={6}>No payments received yet.</EmptyRow> : recoveries.slice(0, 40).map((r) => {
                  const c = custName(r.customerId)
                  return (
                    <tr key={r.id}>
                      <td><strong>{r.receiptNo}</strong><div className="text-muted text-xs">{formatDate(r.date)}</div></td>
                      <td>{c ? <button type="button" className="ui-link-btn" onClick={() => setLedgerFor(c.id)}>{r.customerName}</button> : r.customerName}</td>
                      <td><span className="badge badge-neutral">{r.paymentMethod}</span></td>
                      <td>{r.referenceNo || '—'}</td>
                      <td><strong className="text-green">{rs(r.amount)}</strong></td>
                      <td className="text-xs text-muted">{r.receivedBy}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {customerForm && <CustomerFormModal customer={customerForm.customer} onClose={() => setCustomerForm(null)} />}
      {slipFor !== null && <SlipModal customerId={slipFor || undefined} onClose={() => setSlipFor(null)} />}
      {recoveryFor !== null && <RecoveryModal customerId={recoveryFor || undefined} onClose={() => setRecoveryFor(null)} />}
      {ledgerFor && (
        <Modal title="Customer account" subtitle="Everything given on credit and everything paid" onClose={() => setLedgerFor(null)} width={1150} dismissOnBackdrop>
          <div style={{ padding: '16px 20px 20px' }}>
            <CustomerLedgerPanel customerId={ledgerFor} onRemoved={() => setLedgerFor(null)} />
          </div>
        </Modal>
      )}

      <PrintReceiptModal isOpen={printAging} onClose={() => setPrintAging(false)} title="Customer Credit Aging & Outstanding Balances" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Client / party</th><th>Phone</th><th>Credit limit</th><th>Outstanding</th></tr></thead>
          <tbody>
            {live.map((c) => <tr key={c.id}><td>{c.businessName}</td><td>{c.phone}</td><td>{rs(c.creditLimit)}</td><td>{rs(c.currentBalance)}</td></tr>)}
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total receivables:</span><strong>{rs(totalOutstanding)}</strong></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Commercial Fleet Credit & Recoveries Guide"
        urduTitle="ٹرانسپورٹ کھاتہ، ادھار ڈیزل پرچیاں اور وصولیوں کی رہنمائی"
        role="cashier"
        roleLabel="Cashier &amp; Manager"
        purpose="Issue computerized credit fuel slips (debit), receive payments (credit), keep every customer's running ledger, and send WhatsApp statements. Managers register, edit and delete customers and correct any ledger entry."
        steps={[
          { step: 1, title: 'Issue Credit Fuel (ادھار پرچی)', detail: 'Click "Issue Credit Slip", pick the account, vehicle, driver and liters. The credit limit and registered vehicles are checked for you.', urdu: 'گاڑی نمبر، ڈرائیور کا نام اور لیٹر درج کر کے ادھار پرچی کاٹیں۔' },
          { step: 2, title: 'Instant WhatsApp Slip (واٹس ایپ)', detail: 'Use "Save & send WhatsApp" to send the computerized slip to the transporter.', urdu: 'سیو کرتے ہی کمپیوٹرائزڈ بل واٹس ایپ پر بھیجیں۔' },
          { step: 3, title: 'Record Payment (وصولی)', detail: 'When the customer pays, click "Record Recovery". Cash payments are added to the Daybook automatically.', urdu: 'نقد رقم کی وصولی ڈے بک میں خودکار درج ہو جاتی ہے۔' },
          { step: 4, title: 'Ledger, Edit & Delete (کھاتہ، تبدیلی اور حذف)', detail: 'Click the ledger button on a customer to see the full debit/credit statement. Managers can edit or delete customers and correct any entry.', urdu: 'ہر گاہک کا مکمل کھاتہ دیکھیں؛ مینیجر ترمیم یا حذف کر سکتا ہے۔' },
        ]}
        criticalChecks={[
          'Always verify that the vehicle matches the customer\'s registered vehicle list.',
          'If a customer would exceed the approved credit limit, a manager must authorize the slip.',
          'A customer with ledger history is archived, never erased — and only once the balance is Rs 0.',
        ]}
      />
    </div>
  )
}
