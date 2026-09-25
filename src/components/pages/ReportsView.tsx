import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { computeProfit } from '../../data/profit'
import { addDays, formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PrinterIcon, FileTextIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { EmptyRow, FilterBar, Kpi, KpiStrip, PageHeader, SectionCard, Tabs } from '../common/kit'
import { useToast } from '../common/Toast'

type Tab = 'daily' | 'nozzles' | 'dip-audit' | 'profit'

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

export const ReportsView: React.FC = () => {
  const { activeSiteData } = useApp()
  const toast = useToast()
  const { fuelSales, tanks, tankDips, customers, siteInfo, settings, lubricantMovements } = activeSiteData

  const monthStart = `${todayISO().slice(0, 8)}01`
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayISO())
  const [tab, setTab] = useState<Tab>('daily')
  const [printOpen, setPrintOpen] = useState(false)

  const profit = useMemo(() => computeProfit(activeSiteData, from || undefined, to || undefined), [activeSiteData, from, to])
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to)
  const sales = useMemo(() => fuelSales.filter((s) => inRange(s.date)), [fuelSales, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const dips = useMemo(() => tankDips.filter((d) => inRange(d.date)), [tankDips, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const receivables = customers.filter((c) => c.status !== 'Archived').reduce((s, c) => s + Math.max(0, c.currentBalance), 0)
  const lubeCans = lubricantMovements.filter((m) => m.type === 'Sale' && inRange(m.date)).reduce((s, m) => s + m.quantity, 0)
  const periodLabel = `${from ? formatDate(from) : 'start'} – ${to ? formatDate(to) : 'today'}`

  const preset = (kind: 'today' | 'week' | 'month' | 'all') => {
    const t = todayISO()
    if (kind === 'today') { setFrom(t); setTo(t) }
    else if (kind === 'week') { setFrom(addDays(t, -6)); setTo(t) }
    else if (kind === 'month') { setFrom(monthStart); setTo(t) }
    else { setFrom(''); setTo('') }
  }

  const exportCsv = () => {
    let rows: unknown[][]
    if (tab === 'daily' || tab === 'profit') {
      rows = [
        ['Component', 'Liters', 'Revenue_PKR', 'Dealer_margin_PKR'],
        ...profit.fuel.map((f) => [f.fuelType, f.liters, Math.round(f.revenue), Math.round(f.margin)]),
        ['Lubricants (counter sales)', `${lubeCans} cans`, Math.round(profit.lubeSales), Math.round(profit.lubeMargin)],
        ['Operating expenses', '', '', -Math.round(profit.expenses)],
        ['Staff salaries (gross)', '', '', -Math.round(profit.salaries)],
        ['Net estimated profit', '', '', Math.round(profit.netProfit)],
      ]
    } else if (tab === 'nozzles') {
      rows = [
        ['Date', 'Shift', 'Dispenser', 'Nozzle', 'Fuel', 'Opening', 'Closing', 'Testing_L', 'Net_L', 'Rate', 'Amount_PKR', 'Attendant'],
        ...sales.map((s) => [s.date, s.shiftName, s.dispenserNo, s.nozzleNo, s.fuelType, s.openingMeter, s.closingMeter, s.testingLiters, s.netLiters, s.ratePerLiter, s.totalAmount, s.cashierName]),
      ]
    } else {
      rows = [
        ['Date', 'Tank', 'Fuel', 'Morning_mm', 'Closing_mm', 'Physical_L', 'Book_L', 'Variance_L', 'Water_mm', 'Inspector'],
        ...dips.map((d) => [d.date, d.tankNo, d.fuelType, d.morningDipMm, d.closingDipMm, d.closingPhysicalLiters, d.bookStockLiters, d.varianceLiters, d.waterDipMm, d.inspector]),
      ]
    }
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mashaal-report-${tab}-${siteInfo.code.replace(/\s+/g, '-')}-${todayISO()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Report exported for Excel.')
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Reports"
        title="Reports"
        subtitle="Sales, fuel stock and estimated profit for any period you choose."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={exportCsv}><FileTextIcon size={16} /><span>Save as Excel</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print report</span></button>
          </>
        }
      />

      <FilterBar>
        <div className="form-group"><label className="form-label">From</label><input type="date" className="form-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">To</label><input type="date" className="form-input" value={to} min={from || undefined} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => preset('today')}>Today</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => preset('week')}>Last 7 days</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => preset('month')}>This month</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => preset('all')}>All time</button>
      </FilterBar>

      <Tabs
        tabs={[{ id: 'daily', label: 'Consolidated audit' }, { id: 'nozzles', label: 'Nozzle-wise breakdown' }, { id: 'dip-audit', label: 'Tank dip variance' }, { id: 'profit', label: 'Dealer profit & margin' }]}
        active={tab}
        onChange={(t) => setTab(t as Tab)}
      />

      {tab === 'daily' && (
        <SectionCard title="Consolidated Station Report" subtitle={`Revenue, outflows and credit — ${periodLabel}`}>
          <KpiStrip>
            <Kpi label="Gross fuel sales" value={rs(profit.fuelRevenue)} tone="gold" sub={`${profit.liters.toLocaleString()} L dispensed`} />
            <Kpi label="Lubricant sales" value={rs(profit.lubeSales)} sub={`${lubeCans} can(s) sold at the counter`} />
            <Kpi label="Station expenses" value={rs(profit.expenses)} tone="red" sub="Vouchers in this period" />
            <Kpi label="Customer receivables" value={rs(receivables)} sub="Outstanding today" />
          </KpiStrip>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Component</th><th>Quantity</th><th>Turnover (PKR)</th></tr></thead>
              <tbody>
                {profit.fuel.map((f) => <tr key={f.fuelType}><td><strong>{f.fuelType}</strong></td><td>{f.liters.toLocaleString()} L</td><td className="text-gold font-bold">{rs(f.revenue)}</td></tr>)}
                <tr><td><strong>Motor oils & lubricants</strong></td><td>{lubeCans} cans</td><td className="text-green font-bold">{rs(profit.lubeSales)}</td></tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 'nozzles' && (
        <SectionCard title="Nozzle-wise Dispenser Performance" subtitle={`Liters and revenue per reading — ${periodLabel}`}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Date</th><th>Nozzle</th><th>Fuel</th><th>Opening</th><th>Closing</th><th>Testing</th><th>Net liters</th><th>Revenue</th></tr></thead>
              <tbody>
                {sales.length === 0 ? <EmptyRow colSpan={8}>No readings in this period.</EmptyRow> : sales.map((s) => (
                  <tr key={s.id}><td>{formatDate(s.date)} <span className="text-muted text-xs">{s.shiftName}</span></td><td><strong>D{s.dispenserNo}-N{s.nozzleNo}</strong></td><td><span className="fuel-pill">{s.fuelType}</span></td><td>{s.openingMeter.toLocaleString()}</td><td>{s.closingMeter.toLocaleString()}</td><td>{s.testingLiters} L</td><td><strong>{s.netLiters.toLocaleString()} L</strong></td><td className="text-gold font-bold">{rs(s.totalAmount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 'dip-audit' && (
        <SectionCard title="Tank Dip Loss & Gain Audit" subtitle={`Physical dip stick vs book stock — ${periodLabel}`}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Date</th><th>Tank</th><th>Fuel</th><th>Capacity</th><th>Morning</th><th>Received (+)</th><th>Sales (−)</th><th>Book</th><th>Physical</th><th>Variance</th></tr></thead>
              <tbody>
                {dips.length === 0 ? <EmptyRow colSpan={10}>No dip records in this period.</EmptyRow> : dips.map((d) => (
                  <tr key={d.id}>
                    <td>{formatDate(d.date)}</td><td><strong>#{d.tankNo}</strong></td><td><span className="fuel-pill">{d.fuelType}</span></td>
                    <td>{tanks.find((t) => t.id === d.tankId)?.capacityLiters.toLocaleString() ?? '—'} L</td><td>{d.morningLiters.toLocaleString()} L</td>
                    <td>{d.decantedLiters > 0 ? `+${d.decantedLiters.toLocaleString()} L` : '—'}</td><td>-{d.dispensedLiters.toLocaleString()} L</td><td>{d.bookStockLiters.toLocaleString()} L</td>
                    <td><strong>{d.closingPhysicalLiters.toLocaleString()} L ({d.closingDipMm} mm)</strong></td>
                    <td>{d.varianceLiters < 0 ? <span className="badge badge-danger">Loss: {Math.abs(d.varianceLiters)} L</span> : d.varianceLiters > 0 ? <span className="badge badge-success">Gain: +{d.varianceLiters} L</span> : <span className="badge badge-neutral">0 L (balanced)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 'profit' && (
        <SectionCard title="Estimated Dealer Margin & Net Profitability" subtitle={`Dealer commission (margins from Settings) plus lubricant margin, minus expenses and salaries — ${periodLabel}`}>
          <KpiStrip>
            <Kpi label="Fuel dealer commission" value={rs(profit.dealerMargin)} tone="gold" sub={`On ${profit.liters.toLocaleString()} L at the margins set in Settings`} />
            <Kpi label="Lubricant margin" value={rs(profit.lubeMargin)} tone="green" sub="Sales minus cost of cans sold" />
            <Kpi label="Expenses + salaries" value={`- ${rs(profit.expenses + profit.salaries)}`} tone="red" sub={`Expenses ${rs(profit.expenses)} • salaries ${rs(profit.salaries)}`} />
            <Kpi label="Net estimated profit" value={rs(profit.netProfit)} tone={profit.netProfit >= 0 ? 'green' : 'red'} sub="Estimate — not an accountant's statement" />
          </KpiStrip>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Profit centre</th><th>Liters</th><th>Margin / L</th><th>Gross margin (PKR)</th></tr></thead>
              <tbody>
                {profit.fuel.map((f) => <tr key={f.fuelType}><td><strong>{f.fuelType} dealer margin</strong></td><td>{f.liters.toLocaleString()} L</td><td>Rs {settings.margins[f.fuelType]}</td><td className="text-gold font-bold">{rs(f.margin)}</td></tr>)}
                <tr><td><strong>Lubricants gross margin</strong></td><td>{lubeCans} cans</td><td>—</td><td className="text-green font-bold">{rs(profit.lubeMargin)}</td></tr>
                <tr><td><strong>Operating expenses</strong></td><td>—</td><td>—</td><td className="text-red font-bold">- {rs(profit.expenses)}</td></tr>
                <tr><td><strong>Staff salaries (gross)</strong></td><td>—</td><td>—</td><td className="text-red font-bold">- {rs(profit.salaries)}</td></tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Official Station Management Report" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid"><div><strong>Period:</strong> {periodLabel}</div><div><strong>Station:</strong> {siteInfo.code}</div></div>
        <div className="receipt-divider" />
        <div className="slip-summary-list">
          <div className="slip-row"><span>Fuel revenue:</span><strong>{rs(profit.fuelRevenue)}</strong></div>
          <div className="slip-row"><span>Fuel dispensed:</span><span>{profit.liters.toLocaleString()} L</span></div>
          <div className="slip-row"><span>Dealer commission (est.):</span><span>{rs(profit.dealerMargin)}</span></div>
          <div className="slip-row"><span>Lubricant margin:</span><span>{rs(profit.lubeMargin)}</span></div>
          <div className="slip-row"><span>Operating expenses:</span><span className="text-red">- {rs(profit.expenses)}</span></div>
          <div className="slip-row"><span>Staff salaries:</span><span className="text-red">- {rs(profit.salaries)}</span></div>
          <div className="receipt-divider" />
          <div className="slip-row highlight"><span>Net estimated profit:</span><strong>{rs(profit.netProfit)}</strong></div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
