import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { computeProfit } from '../../data/profit'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { CashIcon, PrinterIcon, FileTextIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { EmptyRow, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard, Tabs } from '../common/kit'
import { OwnerTransferModal } from '../../features/owner/OwnerTransferModal'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const OwnerFinancialView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const site = activeSiteData.siteInfo
  const thisYear = String(new Date().getFullYear())

  // everything the owner has taken out: bank transfers and cash taken from the safe
  const withdrawals = useMemo(() => [
    ...activeSiteData.ownerTransfers.map((t) => ({
      id: t.id, date: t.date, amount: t.amount, ref: t.referenceNo, title: t.accountTitle, sub: t.accountNumber, from: t.bankName,
      by: t.transferredBy, notes: t.notes || '', status: t.status, cash: false,
    })),
    ...activeSiteData.daybook.filter((e) => e.category === 'Owner Withdrawal').map((e) => ({
      id: e.id, date: e.date, amount: e.cashOut, ref: '', title: 'Cash taken by owner', sub: '', from: 'Cash in safe',
      by: e.handledBy, notes: e.particulars.replace(/^Owner cash withdrawal( — )?/, ''), status: 'Completed', cash: true,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [activeSiteData])

  // every year that has any recorded activity, plus the current year
  const availableYears = useMemo(() => {
    const years = new Set<string>([thisYear])
    const dates = [
      ...activeSiteData.fuelSales.map((r) => r.date), ...activeSiteData.expenses.map((r) => r.date),
      ...withdrawals.map((r) => r.date), ...activeSiteData.bankTransactions.map((r) => r.date),
      ...activeSiteData.salaryPayments.map((r) => r.date), ...activeSiteData.lubricantMovements.map((r) => r.date),
    ]
    for (const d of dates) if (d) years.add(d.slice(0, 4))
    return [...years].sort().reverse()
  }, [activeSiteData, withdrawals, thisYear])

  const [year, setYear] = useState(thisYear)
  const [printOpen, setPrintOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const monthly = useMemo(() => MONTH_NAMES.map((name, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const prefix = `${year}-${mm}`
    const p = computeProfit(activeSiteData, `${prefix}-01`, `${prefix}-31`)
    const transfers = withdrawals.filter((t) => t.date.startsWith(prefix))
    const transferred = transfers.reduce((s, t) => s + t.amount, 0)
    const salesCount = activeSiteData.fuelSales.filter((s) => s.date.startsWith(prefix)).length
    const expCount = activeSiteData.expenses.filter((e) => e.date.startsWith(prefix)).length
    const hasData = salesCount + expCount + transfers.length > 0
    return {
      mm, name, ...p, transferred, retained: p.netProfit - transferred, hasData, txCount: salesCount + expCount + transfers.length, transfers,
    }
  }), [activeSiteData, withdrawals, year])

  const totals = useMemo(() => monthly.reduce((a, m) => ({
    liters: a.liters + m.liters, revenue: a.revenue + m.fuelRevenue, margin: a.margin + m.dealerMargin + m.lubeMargin,
    costs: a.costs + m.expenses + m.salaries, net: a.net + m.netProfit, transferred: a.transferred + m.transferred,
    retained: a.retained + m.retained, tx: a.tx + m.txCount,
  }), { liters: 0, revenue: 0, margin: 0, costs: 0, net: 0, transferred: 0, retained: 0, tx: 0 }), [monthly])

  const current = monthly[new Date().getMonth()]
  const transfers = withdrawals
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
    toast.success(`The ${year} figures were saved as a file.`)
  }

  const removeTransfer = async (id: string, amount: number, date: string, cash: boolean) => {
    if (!(await confirm({ title: 'Delete this owner withdrawal?', message: `${rs(amount)} on ${formatDate(date)}. ${cash ? 'The cash goes back into the safe balance.' : 'The matching bank debit is removed too, so the bank balance goes back up.'} Recorded in the audit trail.`, confirmLabel: 'Delete withdrawal', tone: 'danger' }))) return
    const r = cash ? await act.removeDaybookEntry(id) : await act.removeOwnerTransfer(id)
    if (r.ok) toast.success('Withdrawal deleted.'); else toast.error(r.error)
  }

  const netClass = (n: number) => (n >= 0 ? 'text-green' : 'text-red')

  return (
    <div className="page-content-wrapper owner-financial-page">
      <PageHeader
        eyebrow="Profit & withdrawals"
        title="Profit & withdrawals"
        subtitle={`${site.name}. What the station earned in ${year}, and the money you have taken out.`}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={exportCsv}><FileTextIcon size={16} /><span>Save as Excel</span></button>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setTransferOpen(true)}><CashIcon size={16} /><span>Take money out</span></button>
          </>
        }
      />

      <div className="owner-year-row">
        <span className="owner-year-label">Year</span>
        <Tabs tabs={availableYears.map((y) => ({ id: y, label: y }))} active={year} onChange={setYear} />
      </div>

      {year === thisYear && (
        <section className="owner-block">
          <h3 className="owner-block-title">This month: {current.name} {year}</h3>
          <KpiStrip>
            <Kpi label="Fuel sold" value={rs(current.fuelRevenue)} sub={`${current.liters.toLocaleString()} litres`} />
            <Kpi label="Your earnings" value={rs(current.dealerMargin)} tone="green" sub="On fuel, from Settings rates" />
            <Kpi label="Costs" value={rs(current.expenses + current.salaries)} tone="red" sub={`${rs(current.expenses)} expenses, ${rs(current.salaries)} salaries`} />
            <Kpi label="Estimated profit" value={rs(current.netProfit)} tone={current.netProfit >= 0 ? 'green' : 'red'} sub="Earnings minus costs" />
            <Kpi label="Taken out by you" value={rs(current.transferred)} sub={`${current.transfers.length} time${current.transfers.length === 1 ? '' : 's'}`} />
            <Kpi label="Profit left in the station" value={rs(current.retained)} sub="Profit you have not taken out" />
          </KpiStrip>
          <p className="owner-note">Sales are not profit: profit is what you earn on the fuel, minus what it costs to run the station. Money taken out is not profit either; it is only what you moved to your own account. Earnings are estimates, so compare them with the oil company statement.</p>
        </section>
      )}

      <section className="owner-block">
        <h3 className="owner-block-title">Whole year {year}</h3>
        <KpiStrip>
          <Kpi label="Fuel sold" value={rs(totals.revenue)} sub={`${totals.liters.toLocaleString()} litres`} />
          <Kpi label="Your earnings" value={rs(totals.margin)} tone="green" sub="Fuel and lubricants" />
          <Kpi label="Costs" value={rs(totals.costs)} tone="red" sub="Expenses and salaries" />
          <Kpi label="Estimated profit" value={rs(totals.net)} tone={totals.net >= 0 ? 'green' : 'red'} sub="For the whole year" />
          <Kpi label="Taken out by you" value={rs(totals.transferred)} sub="To your own accounts" />
          <Kpi label="Profit left in the station" value={rs(totals.retained)} sub="Not taken out yet" />
        </KpiStrip>
      </section>

      <SectionCard
        title={`Month by month, ${year}`}
        subtitle="Your earnings, estimated profit and the money you took out."
        actions={
          <div className="owner-legend">
            <span><i style={{ background: 'var(--accent)' }} />Earnings</span>
            <span><i style={{ background: 'var(--ok)' }} />Profit</span>
            <span><i style={{ background: 'var(--info)' }} />Taken out</span>
          </div>
        }
      >
        <div className="owner-chart-wrap">
          <div className="owner-chart">
            {monthly.map((m) => {
              const h = (v: number) => (chartMax > 0 ? (Math.max(0, v) / chartMax) * 170 : 0)
              return (
                <div key={m.mm} className="owner-chart-col" title={`${m.name} ${year}\nEarnings: ${rs(m.dealerMargin)}\nProfit: ${rs(m.netProfit)}\nTaken out: ${rs(m.transferred)}`}>
                  <div className="owner-chart-bars">
                    {([[m.dealerMargin, 'var(--accent)'], [m.netProfit, 'var(--ok)'], [m.transferred, 'var(--info)']] as [number, string][]).map(([v, c], i) => (
                      <div key={i} className="owner-chart-bar" style={{ height: `${Math.max(h(v), v > 0 ? 4 : 0)}px`, background: c }} />
                    ))}
                  </div>
                  <span className={`owner-chart-label ${m.hasData ? '' : 'is-empty'}`}>{m.name.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Every month of ${year}`} subtitle="Months with nothing recorded show zero.">
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Month</th><th className="text-right">Litres sold</th><th className="text-right">Fuel sold</th><th className="text-right">Earnings</th>
                <th className="text-right">Costs</th><th className="text-right">Profit</th><th className="text-right">Taken out</th><th className="text-right">Left in station</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.mm} className={m.hasData ? undefined : 'owner-dim'}>
                  <td><strong>{m.name}</strong></td>
                  <td className="text-right">{m.liters.toLocaleString()} L</td>
                  <td className="text-right">{rs(m.fuelRevenue)}</td>
                  <td className="text-right">{rs(m.dealerMargin)}</td>
                  <td className="text-right">{rs(m.expenses + m.salaries)}<div className="text-muted text-xs">{rs(m.expenses)} + {rs(m.salaries)}</div></td>
                  <td className={`text-right ${m.hasData ? netClass(m.netProfit) : ''}`}><strong>{rs(m.netProfit)}</strong></td>
                  <td className="text-right">{rs(m.transferred)}</td>
                  <td className="text-right">{rs(m.retained)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="owner-total-row">
                <td>Whole year</td>
                <td className="text-right">{totals.liters.toLocaleString()} L</td>
                <td className="text-right">{rs(totals.revenue)}</td>
                <td className="text-right">{rs(monthly.reduce((s, m) => s + m.dealerMargin, 0))}</td>
                <td className="text-right">{rs(totals.costs)}</td>
                <td className={`text-right ${netClass(totals.net)}`}>{rs(totals.net)}</td>
                <td className="text-right">{rs(totals.transferred)}</td>
                <td className="text-right">{rs(totals.retained)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Money you have taken out"
        subtitle={`From a bank account or in cash from the safe. ${rs(lifetime)} in total, over ${transfers.length} time${transfers.length === 1 ? '' : 's'}.`}
        actions={<button type="button" className="btn btn-outline" onClick={() => setTransferOpen(true)}><CashIcon size={15} /><span>Take money out</span></button>}
      >
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Paid to</th><th>Taken from</th><th>Note</th>{currentUser?.role === 'owner' && <th />}</tr></thead>
            <tbody>
              {transfers.length === 0 ? (
                <EmptyRow colSpan={6}>You have not taken any money out yet.</EmptyRow>
              ) : transfers.map((t) => (
                <tr key={t.id}>
                  <td><strong>{formatDate(t.date)}</strong>{t.ref && <div className="text-muted text-xs">Ref {t.ref}</div>}</td>
                  <td className="text-right"><strong>{rs(t.amount)}</strong></td>
                  <td><strong>{t.title}</strong>{t.sub && <div className="text-muted text-xs">{t.sub}</div>}</td>
                  <td>{t.from}<div className="text-muted text-xs">Done by {t.by}</div></td>
                  <td className="text-muted">{t.notes || '—'}</td>
                  {currentUser?.role === 'owner' && <td><RowActions><IconButton label="Delete" tone="danger" onClick={() => void removeTransfer(t.id, t.amount, t.date, t.cash)}><TrashIcon size={14} /></IconButton></RowActions></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {transferOpen && <OwnerTransferModal onClose={() => setTransferOpen(false)} />}

      <PrintReceiptModal isOpen={printOpen} title={`${site.name} — Profit summary for ${year}`} onClose={() => setPrintOpen(false)} stationName={site.name} stationLocation={site.location} stationPhone={site.phone} defaultMode="a4">
        <div className="slip-meta-grid"><div><strong>NTN:</strong> {site.ntn}</div><div><strong>Year:</strong> {year}</div><div><strong>Printed:</strong> {new Date().toLocaleString()}</div><div><strong>By:</strong> {currentUser?.name}</div></div>
        <div className="slip-summary-list">
          <div className="slip-row"><span>Litres sold:</span><strong>{totals.liters.toLocaleString()} L</strong></div>
          <div className="slip-row"><span>Fuel sold:</span><strong>{rs(totals.revenue)}</strong></div>
          <div className="slip-row"><span>Your earnings (fuel + lubricants, estimate):</span><strong>{rs(totals.margin)}</strong></div>
          <div className="slip-row"><span>Expenses + salaries:</span><strong>- {rs(totals.costs)}</strong></div>
          <div className="slip-row highlight"><span>Estimated profit:</span><strong>{rs(totals.net)}</strong></div>
          <div className="slip-row"><span>Taken out by owner:</span><strong>{rs(totals.transferred)}</strong></div>
          <div className="slip-row"><span>Profit left in the station:</span><strong>{rs(totals.retained)}</strong></div>
        </div>
        <table className="slip-table">
          <thead><tr><th>Month</th><th>Litres</th><th>Fuel sold</th><th>Profit</th><th>Taken out</th></tr></thead>
          <tbody>{monthly.map((m) => <tr key={m.mm}><td>{m.name}</td><td>{m.liters.toLocaleString()}</td><td>{Math.round(m.fuelRevenue).toLocaleString()}</td><td>{Math.round(m.netProfit).toLocaleString()}</td><td>{m.transferred.toLocaleString()}</td></tr>)}</tbody>
        </table>
        <p style={{ fontSize: 11, marginTop: 8 }}>Estimated figures, based on the earnings per litre set in Settings. Printed {todayISO()}.</p>
      </PrintReceiptModal>
    </div>
  )
}
