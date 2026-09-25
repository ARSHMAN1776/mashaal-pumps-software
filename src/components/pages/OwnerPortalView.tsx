import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { computeProfit } from '../../data/profit'
import { isLowTank, safeCash } from '../../data/derive'
import { monthISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { CashIcon, PrinterIcon, AlertCircleIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { EmptyRow, Kpi, KpiStrip, PageHeader, SectionCard } from '../common/kit'
import { OwnerTransferModal } from '../../features/owner/OwnerTransferModal'
import { PendingBankNotice } from '../../features/customers/PendingBankNotice'

const monthLabel = (ym: string) => {
  if (ym === 'all') return 'All time'
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export const OwnerPortalView: React.FC = () => {
  const { activeSiteData } = useApp()
  const site = activeSiteData.siteInfo
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
  const marginRates = profit.fuel.map((f) => `${f.fuelType} Rs ${settings.margins[f.fuelType]}`).join(' • ')
  const owe = omcPayables + vendorPayables

  return (
    <div className="page-content-wrapper owner-portal-root">
      <PageHeader
        eyebrow="Home"
        title="Owner overview"
        subtitle={`${site.name} · ${monthLabel(selected)}. Sales, profit, cash and what people owe.`}
        actions={
          <>
            <select className="form-input owner-select" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Choose a month">
              <option value="all">All time</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={15} /><span>Print</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setTransferOpen(true)}><CashIcon size={15} /><span>Take money out</span></button>
          </>
        }
      />

      <PendingBankNotice />

      {lowTanks.length > 0 && (
        <div className="owner-alerts">
          {lowTanks.map((t) => (
            <div key={t.id} className="owner-alert">
              <AlertCircleIcon size={16} />
              <span><strong>{t.fuelType} tank #{t.tankNo} is running low</strong>: about {Math.round(t.currentLiters).toLocaleString()} L left.</span>
            </div>
          ))}
        </div>
      )}

      <KpiStrip>
        <Kpi label="Fuel sold" value={rs(profit.fuelRevenue)} sub={`${profit.liters.toLocaleString()} litres`} />
        <Kpi label="Estimated profit" value={rs(profit.netProfit)} tone={profit.netProfit >= 0 ? 'green' : 'red'} sub="After expenses and salaries" />
        <Kpi label="Cash in the safe" value={rs(safe)} sub="Ready to bank or use" />
        <Kpi label="Money in the bank" value={rs(bankTotal)} sub={`${bankAccounts.length} account${bankAccounts.length === 1 ? '' : 's'}`} />
        <Kpi label="Customers owe you" value={rs(receivables)} sub="Fuel given on credit" />
        <Kpi label="You owe" value={rs(owe)} sub="Oil company and suppliers" />
      </KpiStrip>

      <div className="owner-grid">
        <SectionCard title="How the profit is made" subtitle={`${monthLabel(selected)}. Estimated from the earnings per litre set in Settings.`}>
          <div className="owner-sum">
            <div className="owner-sum-row"><span>Fuel sold</span><strong>{rs(profit.fuelRevenue)}</strong></div>
            <div className="owner-sum-row plus">
              <span>Earnings on fuel<small>{profit.fuel.length ? profit.fuel.map((f) => `${f.fuelType}: ${rs(f.margin)}`).join('  ·  ') : `Rates: ${marginRates}`}</small></span>
              <strong>+ {rs(profit.dealerMargin)}</strong>
            </div>
            <div className="owner-sum-row plus"><span>Earnings on oil & lubricants</span><strong>+ {rs(profit.lubeMargin)}</strong></div>
            <div className="owner-sum-row minus"><span>Expenses</span><strong>− {rs(profit.expenses)}</strong></div>
            <div className="owner-sum-row minus"><span>Salaries</span><strong>− {rs(profit.salaries)}</strong></div>
            <div className="owner-sum-total">
              <span>Estimated profit</span>
              <strong className={profit.netProfit >= 0 ? 'text-green' : 'text-red'}>{rs(profit.netProfit)}</strong>
            </div>
          </div>
          {expenseCategories.length > 0 && (
            <div className="owner-cats">
              <span className="owner-cats-title">Where the expenses went</span>
              {expenseCategories.map(([cat, amt]) => <span key={cat} className="owner-cat">{cat}<strong>{rs(amt)}</strong></span>)}
            </div>
          )}
          <div className="owner-sum-foot">
            <button type="button" className="btn btn-outline" onClick={() => setTransferOpen(true)}><CashIcon size={15} /><span>Take money out</span></button>
          </div>
        </SectionCard>

        <SectionCard title="Cash and bank" subtitle="Where your money is right now." actions={<strong>{rs(safe + bankTotal)}</strong>}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Where</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                <tr><td><strong>Cash in the safe</strong><div className="text-muted text-xs">From the cash book</div></td><td className="text-right"><strong>{rs(safe)}</strong></td></tr>
                {bankAccounts.map((b) => (
                  <tr key={b.id} className={b.isActive ? undefined : 'owner-dim'}>
                    <td><strong>{b.bankName}</strong><div className="text-muted text-xs">{b.accountNumber}{b.branch ? ` · ${b.branch}` : ''}</div></td>
                    <td className="text-right"><strong>{rs(b.currentBalance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Fuel sold by type" subtitle={`${monthLabel(selected)}. How much of each fuel you sold.`} actions={<span className="badge badge-gold">{profit.liters.toLocaleString()} L in total</span>}>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Fuel</th><th className="text-right">Litres sold</th><th>Share of sales</th><th className="text-right">Sales</th><th className="text-right">Your earnings</th></tr></thead>
            <tbody>
              {profit.fuel.map((f) => {
                const share = profit.liters > 0 ? (f.liters / profit.liters) * 100 : 0
                return (
                  <tr key={f.fuelType}>
                    <td><span className="fuel-chip" data-fuel={f.fuelType}>{f.fuelType}</span></td>
                    <td className="text-right"><strong>{f.liters.toLocaleString()} L</strong></td>
                    <td>
                      <div className="owner-share">
                        <div className="owner-share-track"><div className="owner-share-fill" data-fuel={f.fuelType} style={{ width: `${share}%` }} /></div>
                        <span>{Math.round(share)}%</span>
                      </div>
                    </td>
                    <td className="text-right">{rs(f.revenue)}</td>
                    <td className="text-right text-green"><strong>{rs(f.margin)}</strong></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Customers who owe the most" subtitle="Follow these up first." actions={<span className="badge badge-danger">{rs(receivables)} owed in total</span>}>
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Customer</th><th>Phone</th><th className="text-right">Credit limit</th><th className="text-right">Owes</th><th>Limit used</th></tr></thead>
            <tbody>
              {topDebtors.length === 0 ? <EmptyRow colSpan={5}>Nobody owes you anything right now.</EmptyRow> : topDebtors.map((c) => {
                const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 0
                return (
                  <tr key={c.id}>
                    <td><strong>{c.businessName}</strong><div className="text-muted text-xs">{c.name}</div></td>
                    <td>{c.phone}</td>
                    <td className="text-right">{rs(c.creditLimit)}</td>
                    <td className="text-right"><strong className="text-red">{rs(c.currentBalance)}</strong></td>
                    <td><span className={`badge ${pct > 80 ? 'badge-danger' : 'badge-outline'}`}>{pct}% used</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {transferOpen && <OwnerTransferModal onClose={() => setTransferOpen(false)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title={`Owner summary — ${monthLabel(selected)}`} stationName={site.name} stationLocation={site.location} stationPhone={site.phone} defaultMode="a4">
        <div className="slip-meta-grid">
          <div><strong>Station:</strong> {site.name}</div><div><strong>Period:</strong> {monthLabel(selected)}</div>
          <div><strong>Station code:</strong> {site.code}</div><div><strong>Printed:</strong> {new Date().toLocaleString()}</div>
        </div>
        <table className="slip-table">
          <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            <tr><td>Fuel sold</td><td style={{ textAlign: 'right' }}>{profit.liters.toLocaleString()} L</td></tr>
            <tr><td>Fuel sales</td><td style={{ textAlign: 'right' }}>{rs(profit.fuelRevenue)}</td></tr>
            <tr><td>Earnings on fuel (estimate, from Settings)</td><td style={{ textAlign: 'right' }}>+ {rs(profit.dealerMargin)}</td></tr>
            <tr><td>Earnings on oil & lubricants</td><td style={{ textAlign: 'right' }}>+ {rs(profit.lubeMargin)}</td></tr>
            <tr><td>Expenses</td><td style={{ textAlign: 'right' }}>- {rs(profit.expenses)}</td></tr>
            <tr><td>Salaries</td><td style={{ textAlign: 'right' }}>- {rs(profit.salaries)}</td></tr>
            <tr><td><strong>Estimated profit</strong></td><td style={{ textAlign: 'right' }}><strong>{rs(profit.netProfit)}</strong></td></tr>
            <tr><td>Cash in the safe</td><td style={{ textAlign: 'right' }}>{rs(safe)}</td></tr>
            <tr><td>Money in the bank</td><td style={{ textAlign: 'right' }}>{rs(bankTotal)}</td></tr>
            <tr><td>Customers owe you</td><td style={{ textAlign: 'right' }}>{rs(receivables)}</td></tr>
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-signatures"><div><div className="sig-line" /><span>Station manager</span></div><div><div className="sig-line" /><span>Station owner</span></div></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="How to read this page"
        urduTitle="اسٹیشن اونر کے لیے ماہانہ منافع اور اخراجات کا خلاصہ"
        role="owner"
        roleLabel="Owner"
        purpose="Your sales, estimated profit, cash, bank money and what people owe, for any month."
        steps={[
          { step: 1, title: 'Choose a month (ماہانہ انتخاب)', detail: 'Use the month box at the top, or pick "All time".', urdu: 'ڈراپ ڈاؤن سے مہینہ منتخب کریں۔' },
          { step: 2, title: 'Earnings on fuel (ڈیلر کمیشن)', detail: `Litres sold × the earning per litre set in Settings (${marginRates}). This is an estimate, so compare it with the oil company statement.`, urdu: 'ڈیلر مارجن سیٹنگز میں مقرر شرح کے مطابق حساب ہوتا ہے۔' },
          { step: 3, title: 'Costs (اخراجات)', detail: 'Expenses and salaries are taken off your earnings to give the estimated profit.', urdu: 'اخراجات اور تنخواہیں منہا کر کے اصل بچت دیکھیں۔' },
          { step: 4, title: 'Check cash and bank (کیش اور بینک)', detail: 'Look at the cash in the safe and the bank balances first, then press "Take money out" to record money you take for yourself.', urdu: 'رقم منتقل کرنے سے پہلے سیف اور بینک بیلنس دیکھیں۔' },
        ]}
        criticalChecks={[
          'Match the cash in the safe with the Cash book before you take money out.',
          'Keep enough money back for the next fuel delivery payment.',
          'Money taken from a bank account cannot be more than that account holds.',
        ]}
      />
    </div>
  )
}
