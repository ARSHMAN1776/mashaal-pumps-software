import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { computeProfit } from '../../data/profit'
import { isLowTank, safeCash } from '../../data/derive'
import { monthISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { GasPumpIcon, CashIcon, UsersIcon, CreditCardIcon, PrinterIcon, ShieldIcon, AlertCircleIcon, CalendarIcon, PlusIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Kpi, KpiStrip } from '../common/kit'
import { OwnerTransferModal } from '../../features/owner/OwnerTransferModal'
import { PendingBankNotice } from '../../features/customers/PendingBankNotice'

const monthLabel = (ym: string) => {
  if (ym === 'all') return 'All Recorded History'
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export const OwnerPortalView: React.FC = () => {
  const { activeSiteData } = useApp()
  const site = activeSiteData.siteInfo
  const isParco = site.brand === 'TOTAL PARCO'
  const { fuelSales, expenses, daybook, creditSlips, bankAccounts, customers, omcInvoices, suppliers, tanks, settings, salaryPayments } = activeSiteData

  const months = useMemo(() => {
    const set = new Set<string>([monthISO()])
    for (const d of [...fuelSales, ...expenses, ...daybook, ...creditSlips, ...salaryPayments].map((r) => r.date)) if (d && d.length >= 7) set.add(d.slice(0, 7))
    return [...set].sort().reverse()
  }, [fuelSales, expenses, daybook, creditSlips, salaryPayments])

  const [selected, setSelected] = useState<string>(months[0] ?? monthISO())
  const [printOpen, setPrintOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const from = selected === 'all' ? undefined : `${selected}-01`
  const to = selected === 'all' ? undefined : `${selected}-31`
  const profit = useMemo(() => computeProfit(activeSiteData, from, to), [activeSiteData, from, to])

  const expenseCategories = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) if ((!from || e.date >= from) && (!to || e.date <= to)) map[e.category] = (map[e.category] ?? 0) + e.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses, from, to])

  const safe = safeCash(activeSiteData)
  const bankTotal = bankAccounts.reduce((s, b) => s + b.currentBalance, 0)
  const receivables = customers.filter((c) => c.status !== 'Archived').reduce((s, c) => s + Math.max(0, c.currentBalance), 0)
  const omcPayables = omcInvoices.reduce((s, i) => s + Math.max(0, i.totalAmount - i.paidAmount), 0)
  const vendorPayables = suppliers.filter((s) => s.isActive).reduce((s, x) => s + Math.max(0, x.balanceDue), 0)
  const lowTanks = tanks.filter((t) => isLowTank(t, settings.lowStockAlertPct))
  const topDebtors = [...customers].filter((c) => c.status !== 'Archived' && c.currentBalance > 0).sort((a, b) => b.currentBalance - a.currentBalance).slice(0, 6)
  const accent = isParco ? '#9e1b1b' : '#006a4e'
  const marginRates = profit.fuel.map((f) => `${f.fuelType} Rs ${settings.margins[f.fuelType]}`).join(' • ')

  return (
    <div className="page-content-wrapper owner-portal-root">
      <div className="page-title-banner" style={{ flexDirection: 'column', gap: 14, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge badge-gold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}><ShieldIcon size={12} /> Executive Command</span>
              <span className={`badge ${isParco ? 'badge-parco' : 'badge-pso'}`} style={{ fontSize: 11 }}>{site.code} • {site.brand}</span>
            </div>
            <h2 className="page-heading" style={{ fontSize: 24, letterSpacing: '-0.02em', margin: '2px 0 4px' }}>{site.name} — Owner Financial Portal</h2>
            <p className="page-sub" style={{ margin: 0 }}>Forecourt performance, dealer margin, safe cash liquidity and estimated monthly profit.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="owner-month-filter-cluster">
              <span className="owner-month-label"><CalendarIcon size={14} color="#967938" /><span>Month:</span></span>
              <select className="owner-month-dropdown" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Filter by month">
                <option value="all">All Recorded History</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setTransferOpen(true)} style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }}><PlusIcon size={15} /><span>Withdraw Capital</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={15} /><span>Print Audit</span></button>
          </div>
        </div>
      </div>

      <PendingBankNotice />

      {lowTanks.length > 0 && (
        <div className="dashboard-alert-banner" style={{ margin: '0 0 16px' }}>
          {lowTanks.map((t) => (
            <div key={t.id} className="dash-alert-pill warning">
              <AlertCircleIcon size={15} color="#b45309" />
              <span><strong>Tank dip alert:</strong> {t.fuelType} (Tank #{t.tankNo}) has only {t.currentLiters.toLocaleString()} L left.</span>
            </div>
          ))}
        </div>
      )}

      <KpiStrip>
        <Kpi label={`Gross fuel revenue (${monthLabel(selected)})`} value={rs(profit.fuelRevenue)} tone="gold" sub={`${profit.liters.toLocaleString()} L dispensed`} />
        <Kpi label="Dealer margin (estimate)" value={rs(profit.dealerMargin)} tone="green" sub={marginRates} />
        <Kpi label="Net profit take-home" value={rs(profit.netProfit)} tone={profit.netProfit >= 0 ? 'green' : 'red'} sub={`After ${rs(profit.expenses + profit.salaries)} expenses & salaries`} />
        <Kpi label="Cash in safe" value={rs(safe)} tone="gold" sub="Liquid cash ready for deposit" />
        <Kpi label="Bank liquidity" value={rs(bankTotal)} sub={`${bankAccounts.length} station account(s)`} />
        <Kpi label="Fleet credit receivables" value={rs(receivables)} tone="red" sub="Uncollected customer balance" />
        <Kpi label="Pending payables" value={rs(omcPayables + vendorPayables)} tone="amber" sub="OMC invoices & vendor balances" />
      </KpiStrip>

      <div className="table-surface" style={{ marginTop: 18, padding: 20, borderLeft: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <span className="badge badge-gold" style={{ fontSize: 10.5 }}>Month: {monthLabel(selected)}</span>
            <h4 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px', color: '#1a1814' }}>Station Earning & Expense Audit</h4>
            <span style={{ fontSize: 12, color: '#736b5e' }}>{site.location}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: '#736b5e', display: 'block' }}>Volume sold</span>
            <strong style={{ fontSize: 18 }}>{profit.liters.toLocaleString()} Liters</strong>
          </div>
        </div>

        <div style={{ background: isParco ? '#faf6ee' : '#f0f7f4', borderRadius: 8, padding: 16, marginBottom: 14, border: `1px solid ${isParco ? 'rgba(158,27,27,0.12)' : 'rgba(0,106,78,0.12)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}><span>Gross forecourt turnover:</span><strong>{rs(profit.fuelRevenue)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}><span style={{ color: '#15803d', fontWeight: 700 }}>+ Dealer margin earned:</span><strong style={{ color: '#15803d' }}>+ {rs(profit.dealerMargin)}</strong></div>
          <div style={{ fontSize: 11.5, color: '#686256', marginLeft: 6, marginBottom: 8 }}>{profit.fuel.map((f) => `${f.fuelType} (${f.liters.toLocaleString()} L): ${rs(f.margin)}`).join('  |  ')}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#15803d', fontWeight: 600 }}>+ Lubricant margin:</span><strong style={{ color: '#15803d' }}>+ {rs(profit.lubeMargin)}</strong></div>
          <div style={{ borderTop: '1px dashed #d9cfb8', paddingTop: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: '#b91c1c', fontWeight: 600 }}>− Operating expenses:</span><strong style={{ color: '#b91c1c' }}>− {rs(profit.expenses)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#b91c1c', fontWeight: 600 }}>− Staff salaries (gross):</span><strong style={{ color: '#b91c1c' }}>− {rs(profit.salaries)}</strong></div>
            {expenseCategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {expenseCategories.map(([cat, amt]) => <span key={cat} style={{ fontSize: 11, background: '#fff', border: '1px solid #ebd9c8', borderRadius: 4, padding: '2px 8px' }}>{cat}: {rs(amt)}</span>)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #e5e7eb', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 12, color: '#686256', display: 'block' }}>Net estimated profit (margin − expenses − salaries)</span>
            <strong style={{ fontSize: 24, color: profit.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>{rs(profit.netProfit)}</strong>
          </div>
          <button type="button" className="btn btn-outline" onClick={() => setTransferOpen(true)} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><CashIcon size={14} /><span>Transfer profit to owner account →</span></button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
        <div className="table-surface" style={{ margin: 0, width: '100%' }}>
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><GasPumpIcon size={18} color="#967938" />Product Volume Distribution ({monthLabel(selected)})</h3>
              <p className="surface-sub">Comparison across Super, Diesel and Hi-Octane</p>
            </div>
            <span className="badge badge-gold font-bold">{profit.liters.toLocaleString()} L total</span>
          </div>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Product</th><th>Liters sold</th><th>Share</th><th>Gross sales</th><th>Dealer commission</th></tr></thead>
              <tbody>
                {profit.fuel.map((f, i) => {
                  const colour = ['#2563eb', '#059669', '#b45309'][i]
                  const share = profit.liters > 0 ? (f.liters / profit.liters) * 100 : 0
                  return (
                    <tr key={f.fuelType}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: colour }} /><strong>{f.fuelType}</strong></div></td>
                      <td className="font-bold">{f.liters.toLocaleString()} L</td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${share}%`, height: '100%', background: colour }} /></div><span style={{ fontSize: 11.5, minWidth: 32 }}>{Math.round(share)}%</span></div></td>
                      <td className="text-gold font-bold">{rs(f.revenue)}</td>
                      <td className="text-green font-bold">{rs(f.margin)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-surface" style={{ margin: 0 }}>
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CreditCardIcon size={18} color="#967938" />Station Liquidity & Bank Accounts</h3>
              <p className="surface-sub">Safe cash register & bank balances</p>
            </div>
            <strong className="text-gold font-bold">{rs(safe + bankTotal)}</strong>
          </div>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Account / asset</th><th>Details</th><th>Balance (PKR)</th></tr></thead>
              <tbody>
                <tr style={{ background: '#faf6ee' }}><td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CashIcon size={16} color="#8c7333" /><strong>Physical cash in safe</strong></div></td><td className="text-muted text-xs">Daybook register</td><td className="text-gold font-bold">{rs(safe)}</td></tr>
                {bankAccounts.map((b) => (
                  <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.55 }}><td><strong>{b.bankName}</strong><div className="text-muted text-xs">{b.accountNumber}</div></td><td className="text-muted text-xs">{b.branch}</td><td className="font-bold">{rs(b.currentBalance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="table-surface" style={{ marginTop: 20 }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UsersIcon size={18} color="#967938" />Major Transporter Accounts (Credit Aging)</h3>
            <p className="surface-sub">Clients with outstanding receivables needing follow-up</p>
          </div>
          <span className="badge badge-danger font-bold">{rs(receivables)} total outstanding</span>
        </div>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Customer</th><th>Contact</th><th>Approved limit</th><th>Balance due</th><th>Limit used</th></tr></thead>
            <tbody>
              {topDebtors.length === 0 ? <tr><td colSpan={5} className="ui-empty">No outstanding customer balances.</td></tr> : topDebtors.map((c) => {
                const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 0
                return (
                  <tr key={c.id}>
                    <td><strong>{c.businessName}</strong><div className="text-muted text-xs">{c.name}</div></td>
                    <td>{c.phone}</td><td>{rs(c.creditLimit)}</td>
                    <td><strong className="text-red">{rs(c.currentBalance)}</strong></td>
                    <td><span className="badge" style={{ backgroundColor: pct > 80 ? '#fee2e2' : '#f1f5f9', color: pct > 80 ? '#b91c1c' : '#334155', fontWeight: 700 }}>{pct}% used</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {transferOpen && <OwnerTransferModal onClose={() => setTransferOpen(false)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title={`Owner Performance Audit — ${monthLabel(selected)}`} stationName={site.name} stationLocation={site.location} stationPhone={site.phone} defaultMode="a4">
        <div className="slip-meta-grid">
          <div><strong>Station:</strong> {site.name}</div><div><strong>Period:</strong> {monthLabel(selected)}</div>
          <div><strong>Dealer code:</strong> {site.code}</div><div><strong>Printed:</strong> {new Date().toLocaleString()}</div>
        </div>
        <table className="slip-table">
          <thead><tr><th>Metric</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            <tr><td>Fuel dispensed</td><td style={{ textAlign: 'right' }}>{profit.liters.toLocaleString()} L</td></tr>
            <tr><td>Gross fuel sales</td><td style={{ textAlign: 'right' }}>{rs(profit.fuelRevenue)}</td></tr>
            <tr style={{ background: '#f0fdf4' }}><td>Dealer margin (estimate, per Settings)</td><td style={{ textAlign: 'right' }}>+ {rs(profit.dealerMargin)}</td></tr>
            <tr><td>Lubricant margin</td><td style={{ textAlign: 'right' }}>+ {rs(profit.lubeMargin)}</td></tr>
            <tr style={{ background: '#fef2f2' }}><td>Operating expenses</td><td style={{ textAlign: 'right' }}>- {rs(profit.expenses)}</td></tr>
            <tr style={{ background: '#fef2f2' }}><td>Staff salaries</td><td style={{ textAlign: 'right' }}>- {rs(profit.salaries)}</td></tr>
            <tr style={{ background: '#fefce8' }}><td><strong>Net estimated profit</strong></td><td style={{ textAlign: 'right' }}><strong>{rs(profit.netProfit)}</strong></td></tr>
            <tr><td>Cash in safe</td><td style={{ textAlign: 'right' }}>{rs(safe)}</td></tr>
            <tr><td>Bank balances</td><td style={{ textAlign: 'right' }}>{rs(bankTotal)}</td></tr>
            <tr><td>Fleet credit receivable</td><td style={{ textAlign: 'right' }}>{rs(receivables)}</td></tr>
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-signatures"><div><div className="sig-line" /><span>Station manager</span></div><div><div className="sig-line" /><span>Station owner</span></div></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Owner Executive Portal & Margin Auditing"
        urduTitle="اسٹیشن اونر کے لیے ماہانہ منافع اور اخراجات کا خلاصہ"
        role="owner"
        roleLabel="Station Owner"
        purpose="Top-level view of liters sold, estimated dealer margin, expenses and salaries, cash and bank liquidity, and take-home profit for any month."
        steps={[
          { step: 1, title: 'Filter by month (ماہانہ انتخاب)', detail: 'Pick any month, or all recorded history.', urdu: 'ڈراپ ڈاؤن سے مہینہ منتخب کریں۔' },
          { step: 2, title: 'Dealer margin (ڈیلر کمیشن)', detail: `Computed from liters sold × the margin per liter set in Settings (${marginRates}). It is an estimate — compare it with your OMC statement.`, urdu: 'ڈیلر مارجن سیٹنگز میں مقرر شرح کے مطابق حساب ہوتا ہے۔' },
          { step: 3, title: 'Costs (اخراجات)', detail: 'Operating expenses and staff salaries are deducted from the margin.', urdu: 'اخراجات اور تنخواہیں منہا کر کے اصل بچت دیکھیں۔' },
          { step: 4, title: 'Check liquidity (کیش اور بینک)', detail: 'Confirm safe cash and bank balances, then use "Withdraw Capital" to record money moved to your personal account.', urdu: 'رقم منتقل کرنے سے پہلے سیف اور بینک بیلنس دیکھیں۔' },
        ]}
        criticalChecks={[
          'Reconcile physical safe cash with the Daybook before authorising withdrawals.',
          'Keep a working-capital reserve for upcoming OMC tanker payments.',
          'Withdrawals are recorded as bank debits and cannot exceed the bank balance.',
        ]}
      />
    </div>
  )
}
