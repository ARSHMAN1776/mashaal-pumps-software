import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { computeProfit } from '../../data/profit'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { TrendingUpIcon, CashIcon, CreditCardIcon, CalendarIcon, PrinterIcon, FileTextIcon, ShieldIcon, BuildingIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { IconButton, RowActions } from '../common/kit'
import { OwnerTransferModal } from '../../features/owner/OwnerTransferModal'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const OwnerFinancialView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const site = activeSiteData.siteInfo
  const isParco = site.brand === 'TOTAL PARCO'
  const thisYear = String(new Date().getFullYear())

  // every year that has any recorded activity, plus the current year
  const availableYears = useMemo(() => {
    const years = new Set<string>([thisYear])
    const dates = [
      ...activeSiteData.fuelSales.map((r) => r.date), ...activeSiteData.expenses.map((r) => r.date),
      ...activeSiteData.ownerTransfers.map((r) => r.date), ...activeSiteData.bankTransactions.map((r) => r.date),
      ...activeSiteData.salaryPayments.map((r) => r.date), ...activeSiteData.lubricantMovements.map((r) => r.date),
    ]
    for (const d of dates) if (d) years.add(d.slice(0, 4))
    return [...years].sort().reverse()
  }, [activeSiteData, thisYear])

  const [year, setYear] = useState(thisYear)
  const [printOpen, setPrintOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const monthly = useMemo(() => MONTH_NAMES.map((name, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const prefix = `${year}-${mm}`
    const p = computeProfit(activeSiteData, `${prefix}-01`, `${prefix}-31`)
    const transfers = activeSiteData.ownerTransfers.filter((t) => t.date.startsWith(prefix))
    const transferred = transfers.reduce((s, t) => s + t.amount, 0)
    const salesCount = activeSiteData.fuelSales.filter((s) => s.date.startsWith(prefix)).length
    const expCount = activeSiteData.expenses.filter((e) => e.date.startsWith(prefix)).length
    const hasData = salesCount + expCount + transfers.length > 0
    return {
      mm, name, ...p, transferred, retained: p.netProfit - transferred, hasData, txCount: salesCount + expCount + transfers.length, transfers,
    }
  }), [activeSiteData, year])

  const totals = useMemo(() => monthly.reduce((a, m) => ({
    liters: a.liters + m.liters, revenue: a.revenue + m.fuelRevenue, margin: a.margin + m.dealerMargin + m.lubeMargin,
    costs: a.costs + m.expenses + m.salaries, net: a.net + m.netProfit, transferred: a.transferred + m.transferred,
    retained: a.retained + m.retained, tx: a.tx + m.txCount,
  }), { liters: 0, revenue: 0, margin: 0, costs: 0, net: 0, transferred: 0, retained: 0, tx: 0 }), [monthly])

  const current = monthly[new Date().getMonth()]
  const transfers = activeSiteData.ownerTransfers
  const lifetime = transfers.reduce((s, t) => s + t.amount, 0)
  const chartMax = Math.max(100000, Math.ceil(Math.max(...monthly.map((m) => Math.max(m.dealerMargin, Math.abs(m.netProfit), m.transferred))) / 100000) * 100000)

  const exportCsv = () => {
    const header = ['Month', 'Year', 'Liters', 'Gross_Sales_PKR', 'Dealer_Margin_PKR', 'Lube_Margin_PKR', 'Expenses_PKR', 'Salaries_PKR', 'Net_Profit_PKR', 'Transferred_To_Owner_PKR', 'Retained_PKR', 'Records']
    const rows = monthly.map((m) => [m.name, year, m.liters, Math.round(m.fuelRevenue), Math.round(m.dealerMargin), Math.round(m.lubeMargin), Math.round(m.expenses), Math.round(m.salaries), Math.round(m.netProfit), m.transferred, Math.round(m.retained), m.txCount])
    const csv = [header, ...rows, ['ANNUAL TOTAL', year, totals.liters, Math.round(totals.revenue), '', '', '', '', Math.round(totals.net), totals.transferred, Math.round(totals.retained), totals.tx]].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mashaal-owner-financials-${site.code.replace(/\s+/g, '-')}-${year}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Annual breakdown for ${year} exported.`)
  }

  const removeTransfer = async (id: string, amount: number, date: string) => {
    if (!(await confirm({ title: 'Delete this owner withdrawal?', message: `${rs(amount)} on ${formatDate(date)}. The matching bank debit is removed too, so the bank balance goes back up. Recorded in the audit trail.`, confirmLabel: 'Delete withdrawal', tone: 'danger' }))) return
    const r = await act.removeOwnerTransfer(id)
    if (r.ok) toast.success('Withdrawal deleted.'); else toast.error(r.error)
  }

  const accent = isParco ? '#9e1b1b' : '#006a4e'
  const netColor = (n: number) => (n >= 0 ? '#15803d' : '#b91c1c')

  return (
    <div className="page-content-wrapper owner-financial-page">
      <div className="page-title-banner" style={{ flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge badge-gold" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}><ShieldIcon size={12} /> Executive Financial Intelligence</span>
              <span className={`badge ${isParco ? 'badge-parco' : 'badge-pso'}`} style={{ fontSize: 11 }}>{site.code} • {site.brand}</span>
            </div>
            <h2 className="page-heading" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>{site.name} — Financial & Annual Performance</h2>
            <p className="page-sub">Turnover, estimated dealer margin, costs, net profit and money withdrawn by the owner for {year}.</p>
          </div>
          <div className="page-actions" style={{ alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={exportCsv}><FileTextIcon size={16} /><span>Export CSV</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print Financial Audit</span></button>
            <button type="button" className="btn btn-primary" style={{ backgroundColor: accent, borderColor: accent }} onClick={() => setTransferOpen(true)}><CreditCardIcon size={16} /><span>Record Owner Withdrawal</span></button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 12, borderTop: '1px solid rgba(150,121,56,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#8c7333', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}><CalendarIcon size={16} /> Fiscal year:</span>
            <div className="report-tab-strip" style={{ margin: 0, padding: 3, background: '#f5f0e6', borderRadius: 8 }}>
              {availableYears.map((y) => (
                <button key={y} type="button" className={`report-tab-btn ${year === y ? 'active' : ''}`} onClick={() => setYear(y)} style={{ padding: '6px 18px', fontSize: 13, fontWeight: year === y ? 800 : 500 }}>{y}</button>
              ))}
            </div>
          </div>
          <span className="station-security-note" style={{ fontSize: 12, color: '#555' }}><ShieldIcon size={14} color="#8c7333" />Isolated station tables: <strong>{site.brand} ({site.code})</strong></span>
        </div>
      </div>

      {year === thisYear && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1a1814', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}><CashIcon size={20} color="#967938" />This Month ({current.name} {year})</h3>
          <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0 }}>
            <div className="kpi-cell"><span className="kpi-label">Gross sales turnover</span><strong className="kpi-cell-value text-gold" style={{ fontSize: 20 }}>{rs(current.fuelRevenue)}</strong><span className="kpi-cell-sub">{current.liters.toLocaleString()} L dispensed</span></div>
            <div className="kpi-cell"><span className="kpi-label">Dealer margin (estimate)</span><strong className="kpi-cell-value" style={{ fontSize: 20, color: '#27ae60' }}>{rs(current.dealerMargin)}</strong><span className="kpi-cell-sub">Per-liter margins from Settings</span></div>
            <div className="kpi-cell"><span className="kpi-label">Expenses + salaries</span><strong className="kpi-cell-value text-red" style={{ fontSize: 20 }}>{rs(current.expenses + current.salaries)}</strong><span className="kpi-cell-sub">{rs(current.expenses)} expenses • {rs(current.salaries)} salaries</span></div>
            <div className="kpi-cell"><span className="kpi-label">Net station profit</span><strong className="kpi-cell-value" style={{ fontSize: 22, color: netColor(current.netProfit) }}>{rs(current.netProfit)}</strong><span className="kpi-cell-sub">Margin − expenses − salaries</span></div>
            <div className="kpi-cell"><span className="kpi-label">Withdrawn by owner</span><strong className="kpi-cell-value" style={{ fontSize: 20, color: '#1d4ed8' }}>{rs(current.transferred)}</strong><span className="kpi-cell-sub">{current.transfers.length} transfer(s)</span></div>
            <div className="kpi-cell"><span className="kpi-label">Retained / undrawn</span><strong className="kpi-cell-value text-gold" style={{ fontSize: 20 }}>{rs(current.retained)}</strong><span className="kpi-cell-sub">Profit not yet withdrawn</span></div>
          </div>
          <div style={{ background: '#faf6ee', border: '1px solid rgba(150,121,56,0.2)', borderRadius: 8, padding: '10px 16px', marginTop: 10, fontSize: 12, color: '#555' }}>
            <strong>Revenue ≠ Profit:</strong> turnover ({rs(current.fuelRevenue)}) is fuel sales; profit is the dealer margin minus real costs. <strong>Withdrawal ≠ Profit:</strong> {rs(current.transferred)} is money actually moved to your account. Margins are estimates — compare them with your OMC statement.
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1a1814', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUpIcon size={20} color="#967938" />Annual Performance Summary ({year})</h3>
        <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: 0 }}>
          <div className="kpi-cell"><span className="kpi-label">Annual gross turnover</span><strong className="kpi-cell-value text-gold" style={{ fontSize: 19 }}>{rs(totals.revenue)}</strong><span className="kpi-cell-sub">{totals.liters.toLocaleString()} L</span></div>
          <div className="kpi-cell"><span className="kpi-label">Annual margin (fuel + lube)</span><strong className="kpi-cell-value" style={{ fontSize: 19, color: '#27ae60' }}>{rs(totals.margin)}</strong><span className="kpi-cell-sub">Estimated commission</span></div>
          <div className="kpi-cell"><span className="kpi-label">Annual costs</span><strong className="kpi-cell-value text-red" style={{ fontSize: 19 }}>{rs(totals.costs)}</strong><span className="kpi-cell-sub">Expenses + salaries</span></div>
          <div className="kpi-cell"><span className="kpi-label">Annual net profit</span><strong className="kpi-cell-value" style={{ fontSize: 20, color: netColor(totals.net) }}>{rs(totals.net)}</strong><span className="kpi-cell-sub">Net station earnings</span></div>
          <div className="kpi-cell"><span className="kpi-label">Withdrawn by owner</span><strong className="kpi-cell-value" style={{ fontSize: 19, color: '#1d4ed8' }}>{rs(totals.transferred)}</strong><span className="kpi-cell-sub">To personal accounts</span></div>
          <div className="kpi-cell"><span className="kpi-label">Retained profit</span><strong className="kpi-cell-value text-gold" style={{ fontSize: 19 }}>{rs(totals.retained)}</strong><span className="kpi-cell-sub">Available for distribution</span></div>
        </div>
      </div>

      <div className="table-surface" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUpIcon size={18} color="#967938" />Monthly Financial Trajectory ({year})</h3>
            <p className="surface-sub">Margin, net profit and owner withdrawals, January to December</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
            {[['#27ae60', 'Margin'], ['#15803d', 'Net profit'], ['#1d4ed8', 'Withdrawn']].map(([c, l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: c, borderRadius: 3 }} /><span>{l}</span></div>)}
          </div>
        </div>
        <div style={{ width: '100%', overflowX: 'auto', paddingTop: 10 }}>
          <div style={{ minWidth: 700, height: 220, display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
            {monthly.map((m) => {
              const h = (v: number) => (chartMax > 0 ? (Math.max(0, v) / chartMax) * 170 : 0)
              return (
                <div key={m.mm} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}
                  title={`${m.name} ${year}\nMargin: ${rs(m.dealerMargin)}\nNet profit: ${rs(m.netProfit)}\nWithdrawn: ${rs(m.transferred)}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
                    {[[m.dealerMargin, '#27ae60'], [m.netProfit, '#15803d'], [m.transferred, '#1d4ed8']].map(([v, c], i) => (
                      <div key={i} style={{ width: '28%', maxWidth: 16, height: `${Math.max(h(v as number), (v as number) > 0 ? 4 : 0)}px`, background: c as string, borderRadius: '3px 3px 0 0' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: m.hasData ? 700 : 500, color: m.hasData ? '#1a1814' : '#9ca3af', marginTop: 8 }}>{m.name.slice(0, 3)}</span>
                  {!m.hasData && <span style={{ fontSize: 9, color: '#9ca3af', position: 'absolute', bottom: 26 }}>No data</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="table-surface" style={{ marginTop: 24 }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BuildingIcon size={18} color="#967938" />Monthly Financial Breakdown (January → December {year})</h3>
            <p className="surface-sub">Months without records are shown as 0 / No data.</p>
          </div>
          <span className="badge badge-gold font-bold">Full 12-month audit</span>
        </div>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Month</th><th>Volume (L)</th><th>Gross turnover</th><th>Dealer margin</th><th>Expenses</th><th>Salaries</th><th>Net profit</th><th>Withdrawn</th><th>Retained</th><th>Records</th></tr></thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.mm} style={{ opacity: m.hasData ? 1 : 0.65 }}>
                  <td className="font-bold"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CalendarIcon size={14} color={m.hasData ? '#8c7333' : '#9ca3af'} />{m.name} {year}</div></td>
                  <td>{m.liters.toLocaleString()} L</td><td>{rs(m.fuelRevenue)}</td>
                  <td style={{ color: m.hasData ? '#27ae60' : undefined, fontWeight: 600 }}>{rs(m.dealerMargin)}</td>
                  <td style={{ color: m.expenses > 0 ? '#b91c1c' : undefined }}>{rs(m.expenses)}</td>
                  <td style={{ color: m.salaries > 0 ? '#b91c1c' : undefined }}>{rs(m.salaries)}</td>
                  <td style={{ fontWeight: 700, color: m.hasData ? netColor(m.netProfit) : '#6b7280' }}>{rs(m.netProfit)}</td>
                  <td style={{ color: m.transferred > 0 ? '#1d4ed8' : undefined, fontWeight: m.transferred > 0 ? 600 : undefined }}>{rs(m.transferred)}</td>
                  <td>{m.hasData ? rs(m.retained) : 'Rs 0'}</td>
                  <td>{m.hasData ? <span className="badge" style={{ fontSize: 10.5, background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }}>{m.txCount}</span> : <span className="badge" style={{ fontSize: 10.5, background: '#f3f4f6', color: '#6b7280' }}>0</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f5ee', fontWeight: 800, borderTop: '2px solid #967938' }}>
                <td>TOTAL ({year})</td><td>{totals.liters.toLocaleString()} L</td><td className="text-gold">{rs(totals.revenue)}</td>
                <td style={{ color: '#27ae60' }}>{rs(monthly.reduce((s, m) => s + m.dealerMargin, 0))}</td>
                <td style={{ color: '#b91c1c' }}>{rs(monthly.reduce((s, m) => s + m.expenses, 0))}</td><td style={{ color: '#b91c1c' }}>{rs(monthly.reduce((s, m) => s + m.salaries, 0))}</td>
                <td style={{ color: netColor(totals.net) }}>{rs(totals.net)}</td><td style={{ color: '#1d4ed8' }}>{rs(totals.transferred)}</td><td className="text-gold">{rs(totals.retained)}</td><td>{totals.tx}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="table-surface" style={{ marginTop: 24 }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CreditCardIcon size={18} color="#967938" />Owner Withdrawals & Capital Transfers</h3>
            <p className="surface-sub">Money actually moved from station bank accounts to the owner. Lifetime total {rs(lifetime)} in {transfers.length} transfer(s).</p>
          </div>
          <button type="button" className="btn btn-primary" style={{ backgroundColor: accent, borderColor: accent, fontSize: 12.5 }} onClick={() => setTransferOpen(true)}>+ Record New Withdrawal</button>
        </div>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Beneficiary</th><th>Paid from</th><th>Status</th><th>By</th><th>Notes</th>{currentUser?.role === 'owner' && <th />}</tr></thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr><td colSpan={9} className="ui-empty">No withdrawals recorded yet.</td></tr>
              ) : transfers.map((t) => (
                <tr key={t.id}>
                  <td className="font-bold">{formatDate(t.date)}</td>
                  <td><span className="badge badge-outline" style={{ fontSize: 11, fontFamily: 'monospace' }}>{t.referenceNo}</span></td>
                  <td className="font-bold" style={{ color: '#1d4ed8', fontSize: 14 }}>{rs(t.amount)}</td>
                  <td><strong>{t.accountTitle}</strong><span style={{ fontSize: 11, color: '#686256', display: 'block' }}>{t.accountNumber}</span></td>
                  <td>{t.bankName}</td>
                  <td><span className="badge" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', fontSize: 11 }}>{t.status}</span></td>
                  <td>{t.transferredBy}</td>
                  <td style={{ fontSize: 12, color: '#686256' }}>{t.notes || '—'}</td>
                  {currentUser?.role === 'owner' && <td><RowActions><IconButton label="Delete withdrawal" tone="danger" onClick={() => void removeTransfer(t.id, t.amount, t.date)}><TrashIcon size={14} /></IconButton></RowActions></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {transferOpen && <OwnerTransferModal onClose={() => setTransferOpen(false)} />}

      <PrintReceiptModal isOpen={printOpen} title={`${site.name} — Annual Financial Audit (${year})`} onClose={() => setPrintOpen(false)} stationName={site.name} stationLocation={site.location} stationPhone={site.phone} defaultMode="a4">
        <div className="slip-meta-grid"><div><strong>NTN:</strong> {site.ntn}</div><div><strong>Fiscal year:</strong> {year}</div><div><strong>Printed:</strong> {new Date().toLocaleString()}</div><div><strong>By:</strong> {currentUser?.name}</div></div>
        <div className="slip-summary-list">
          <div className="slip-row"><span>Liters dispensed:</span><strong>{totals.liters.toLocaleString()} L</strong></div>
          <div className="slip-row"><span>Gross sales turnover:</span><strong>{rs(totals.revenue)}</strong></div>
          <div className="slip-row"><span>Estimated margin (fuel + lube):</span><strong>{rs(totals.margin)}</strong></div>
          <div className="slip-row"><span>Expenses + salaries:</span><strong>- {rs(totals.costs)}</strong></div>
          <div className="slip-row highlight"><span>Net estimated profit:</span><strong>{rs(totals.net)}</strong></div>
          <div className="slip-row"><span>Withdrawn by owner:</span><strong>{rs(totals.transferred)}</strong></div>
          <div className="slip-row"><span>Retained profit:</span><strong>{rs(totals.retained)}</strong></div>
        </div>
        <table className="slip-table">
          <thead><tr><th>Month</th><th>Liters</th><th>Turnover</th><th>Net profit</th><th>Withdrawn</th></tr></thead>
          <tbody>{monthly.map((m) => <tr key={m.mm}><td>{m.name}</td><td>{m.liters.toLocaleString()}</td><td>{Math.round(m.fuelRevenue).toLocaleString()}</td><td>{Math.round(m.netProfit).toLocaleString()}</td><td>{m.transferred.toLocaleString()}</td></tr>)}</tbody>
        </table>
        <p style={{ fontSize: 11, marginTop: 8 }}>Estimated figures based on the dealer margins configured in Settings; generated {todayISO()}.</p>
      </PrintReceiptModal>
    </div>
  )
}
