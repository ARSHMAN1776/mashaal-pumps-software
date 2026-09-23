import React, { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import {
  TrendingUpIcon,
  CashIcon,
  CreditCardIcon,
  CalendarIcon,
  PrinterIcon,
  FileTextIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldIcon,
  BuildingIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const OwnerFinancialView: React.FC = () => {
  const { activeSiteData, activeSiteId, currentUser, addOwnerTransfer } = useApp()
  const site = activeSiteData?.siteInfo
  const isParco = site?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01'

  // ── Year Filter State ───────────────────────────────────────────────────
  // Discover all years available in the station's actual business database
  const availableYears = useMemo(() => {
    const years = new Set<string>()
    // Current year default
    years.add('2026')
    years.add('2025')

    activeSiteData.fuelSales.forEach((s) => {
      if (s.date) years.add(s.date.slice(0, 4))
    })
    activeSiteData.expenses.forEach((e) => {
      if (e.date) years.add(e.date.slice(0, 4))
    })
    ;(activeSiteData.ownerTransfers || []).forEach((t) => {
      if (t.date) years.add(t.date.slice(0, 4))
    })
    activeSiteData.bankTransactions.forEach((b) => {
      if (b.date) years.add(b.date.slice(0, 4))
    })

    return Array.from(years).sort().reverse()
  }, [activeSiteData])

  const [selectedYear, setSelectedYear] = useState<string>('2026')
  const [printOpen, setPrintOpen] = useState(false)
  const [exportNotice, setExportNotice] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null)

  // ── New Transfer Modal Form State ───────────────────────────────────────
  const [transferForm, setTransferForm] = useState({
    bankId: activeSiteData?.bankAccounts[0]?.id || '',
    amount: '',
    bankName: 'Habib Bank Limited (HBL)',
    accountTitle: currentUser?.name || 'Station Owner Personal Account',
    accountNumber: '0184-77291039-01',
    referenceNo: '',
    date: new Date().toISOString().split('T')[0],
    notes: 'Owner profit withdrawal',
  })
  const [transferFormError, setTransferFormError] = useState<string | null>(null)

  // ── 12-Month Financial Calculation Engine ───────────────────────────────
  // Strictly isolates records to activeSiteData and the selected year
  const monthlyData = useMemo(() => {
    return MONTH_NAMES.map((monthName, idx) => {
      const monthNum = String(idx + 1).padStart(2, '0')
      const prefix = `${selectedYear}-${monthNum}`

      // Real recorded transactions for this specific month
      const monthFuelSales = activeSiteData.fuelSales.filter((s) => s.date.startsWith(prefix))
      const monthExpenses = activeSiteData.expenses.filter((e) => e.date.startsWith(prefix))
      const monthTransfers = (activeSiteData.ownerTransfers || []).filter((t) => t.date.startsWith(prefix))

      const totalLiters = monthFuelSales.reduce((sum, s) => sum + s.netLiters, 0)
      const grossRevenue = monthFuelSales.reduce((sum, s) => sum + s.totalAmount, 0)
      // Official dealer margin in Pakistan is Rs. 8.64/L for PMG & HSD
      const grossMargin = totalLiters * 8.64
      const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
      const netProfit = grossMargin - totalExpenses
      const bankTransferred = monthTransfers.reduce((sum, t) => sum + t.amount, 0)
      const retainedAmount = netProfit - bankTransferred
      const transactionCount = monthFuelSales.length + monthExpenses.length + monthTransfers.length
      const hasData = monthFuelSales.length > 0 || monthExpenses.length > 0 || monthTransfers.length > 0

      return {
        monthIndex: idx,
        monthNumber: monthNum,
        monthName,
        totalLiters,
        grossRevenue,
        grossMargin,
        totalExpenses,
        netProfit,
        bankTransferred,
        retainedAmount,
        transactionCount,
        hasData,
        transfersList: monthTransfers,
      }
    })
  }, [selectedYear, activeSiteData])

  // ── Annual Summary Totals for Selected Year ─────────────────────────────
  const annualTotals = useMemo(() => {
    return monthlyData.reduce(
      (acc, m) => ({
        liters: acc.liters + m.totalLiters,
        revenue: acc.revenue + m.grossRevenue,
        grossMargin: acc.grossMargin + m.grossMargin,
        expenses: acc.expenses + m.totalExpenses,
        netProfit: acc.netProfit + m.netProfit,
        bankTransferred: acc.bankTransferred + m.bankTransferred,
        retainedAmount: acc.retainedAmount + m.retainedAmount,
        transactionCount: acc.transactionCount + m.transactionCount,
      }),
      {
        liters: 0,
        revenue: 0,
        grossMargin: 0,
        expenses: 0,
        netProfit: 0,
        bankTransferred: 0,
        retainedAmount: 0,
        transactionCount: 0,
      }
    )
  }, [monthlyData])

  // ── Current Operational Month (e.g. September 2026) ─────────────────────
  const currentMonthIndex = new Date().getMonth()
  const currentMonthStats = monthlyData[currentMonthIndex] || monthlyData[8] // Fallback to September if outside

  // ── Lifetime Bank Transfers to Owner (All Recorded) ─────────────────────
  const allRecordedTransfers = useMemo(() => {
    return [...(activeSiteData.ownerTransfers || [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [activeSiteData.ownerTransfers])

  const totalLifetimeTransferred = useMemo(() => {
    return allRecordedTransfers.reduce((sum, t) => sum + t.amount, 0)
  }, [allRecordedTransfers])

  // ── Handle Recording New Bank Transfer to Owner ─────────────────────────
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTransferFormError(null)

    const numAmount = parseFloat(transferForm.amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setTransferFormError('Please enter a valid positive transfer amount.')
      return
    }

    const sourceBank = activeSiteData.bankAccounts.find((b) => b.id === transferForm.bankId)
    if (sourceBank && numAmount > sourceBank.currentBalance) {
      setTransferFormError(
        `Insufficient funds in ${sourceBank.bankName}. Available balance: Rs. ${sourceBank.currentBalance.toLocaleString()}`
      )
      return
    }

    if (!transferForm.accountNumber.trim()) {
      setTransferFormError('Destination account number or IBAN is required.')
      return
    }

    const refNo = transferForm.referenceNo.trim() || `RTGS-OWN-${Date.now().toString().slice(-6)}`

    addOwnerTransfer({
      siteId: activeSiteId || 'SITE-01',
      date: transferForm.date,
      amount: numAmount,
      bankId: transferForm.bankId,
      bankName: transferForm.bankName,
      accountTitle: transferForm.accountTitle,
      accountNumber: transferForm.accountNumber,
      referenceNo: refNo,
      status: 'Completed',
      notes: transferForm.notes,
      transferredBy: currentUser?.name || 'Station Owner',
    })

    setTransferModalOpen(false)
    setTransferSuccessMsg(
      `Successfully recorded Rs. ${numAmount.toLocaleString()} transfer to ${transferForm.accountTitle} (${transferForm.bankName}). Ref: ${refNo}`
    )
    setTransferForm({
      bankId: activeSiteData?.bankAccounts[0]?.id || '',
      amount: '',
      bankName: 'Habib Bank Limited (HBL)',
      accountTitle: currentUser?.name || 'Station Owner Personal Account',
      accountNumber: '0184-77291039-01',
      referenceNo: '',
      date: new Date().toISOString().split('T')[0],
      notes: 'Owner profit withdrawal',
    })

    setTimeout(() => setTransferSuccessMsg(null), 6000)
  }

  // ── CSV Export for Accountants ──────────────────────────────────────────
  const handleExportCSV = () => {
    const header = [
      'Month',
      'Year',
      'Liters_Dispensed',
      'Gross_Sales_Revenue_PKR',
      'Gross_Dealer_Margin_PKR',
      'Operating_Expenses_PKR',
      'Net_Station_Profit_PKR',
      'Amount_Transferred_To_Bank_PKR',
      'Retained_Pending_Profit_PKR',
      'Transaction_Count',
      'Data_Status',
    ]

    const rows = monthlyData.map((m) => [
      m.monthName,
      selectedYear,
      m.totalLiters,
      Math.round(m.grossRevenue),
      Math.round(m.grossMargin),
      m.totalExpenses,
      Math.round(m.netProfit),
      m.bankTransferred,
      Math.round(m.retainedAmount),
      m.transactionCount,
      m.hasData ? 'Active Records' : '0 / No Data',
    ])

    const summaryRow = [
      'ANNUAL TOTAL',
      selectedYear,
      annualTotals.liters,
      Math.round(annualTotals.revenue),
      Math.round(annualTotals.grossMargin),
      annualTotals.expenses,
      Math.round(annualTotals.netProfit),
      annualTotals.bankTransferred,
      Math.round(annualTotals.retainedAmount),
      annualTotals.transactionCount,
      'Annual Summary',
    ]

    const csvContent = [header, ...rows, summaryRow].map((e) => e.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mashaal-owner-financials-${site?.code.replace(/\s+/g, '-')}-${selectedYear}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setExportNotice(true)
    setTimeout(() => setExportNotice(false), 3500)
  }

  // Chart max value for clean scaling
  const chartMax = useMemo(() => {
    const maxVal = Math.max(
      ...monthlyData.map((m) => Math.max(m.grossMargin, Math.abs(m.netProfit), m.bankTransferred)),
      100000
    )
    return Math.ceil(maxVal / 100000) * 100000
  }, [monthlyData])

  return (
    <div className="page-content-wrapper owner-financial-page">
      {/* ── Top Header Banner with Dynamic Year Filter ── */}
      <div className="page-title-banner" style={{ flexDirection: 'column', gap: '16px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-gold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <ShieldIcon size={12} /> Executive Financial Intelligence
              </span>
              <span className={`badge ${isParco ? 'badge-parco' : 'badge-pso'}`} style={{ fontSize: '11px' }}>
                {site?.code || 'SITE 01'} • {site?.brand || 'TOTAL PARCO'}
              </span>
            </div>
            <h2 className="page-heading" style={{ fontSize: '24px', letterSpacing: '-0.02em' }}>
              {site?.name} — Financial &amp; Annual Performance
            </h2>
            <p className="page-sub">
              Audited forecourt turnover, dealer margins, station operating costs, net profits, and bank transfers for {selectedYear}.
            </p>
          </div>

          <div className="page-actions" style={{ alignItems: 'center', gap: '10px' }}>
            <button className="btn btn-outline" onClick={handleExportCSV}>
              <FileTextIcon size={16} />
              <span>Export CSV</span>
            </button>
            <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
              <PrinterIcon size={16} />
              <span>Print Financial Audit</span>
            </button>
            <button
              className="btn btn-primary"
              style={{ backgroundColor: isParco ? '#9e1b1b' : '#006a4e', borderColor: isParco ? '#9e1b1b' : '#006a4e' }}
              onClick={() => setTransferModalOpen(true)}
            >
              <CreditCardIcon size={16} />
              <span>Record Owner Bank Transfer</span>
            </button>
          </div>
        </div>

        {/* Year Filter & Station Scope Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(150, 121, 56, 0.15)',
          }}
        >
          {/* Year Selector Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#8c7333', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarIcon size={16} /> Select Fiscal Year:
            </span>
            <div className="report-tab-strip" style={{ margin: 0, padding: '3px', background: '#f5f0e6', borderRadius: '8px' }}>
              {availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`report-tab-btn ${selectedYear === yr ? 'active' : ''}`}
                  onClick={() => setSelectedYear(yr)}
                  style={{ padding: '6px 18px', fontSize: '13px', fontWeight: selectedYear === yr ? 800 : 500 }}
                >
                  {yr}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '12px', color: '#736b5e' }}>
              (Showing data strictly for {selectedYear})
            </span>
          </div>

          {/* Station Guarantee Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="station-security-note" style={{ fontSize: '12px', color: '#555' }}>
              <ShieldIcon size={14} color="#8c7333" />
              Isolated Station Database: <strong>{site?.brand} ({site?.code})</strong>
            </span>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="alert-ribbon-success" style={{ margin: '14px 0 0' }}>
          <CheckCircleIcon size={18} color="#27ae60" />
          <span>Annual financial breakdown for {selectedYear} exported successfully for accounting records.</span>
        </div>
      )}

      {transferSuccessMsg && (
        <div className="alert-ribbon-success" style={{ margin: '14px 0 0' }}>
          <CheckCircleIcon size={18} color="#27ae60" />
          <span>{transferSuccessMsg}</span>
        </div>
      )}

      {/* ── Section 4: Current Month Profit & Financial Snapshot ── */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1814', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CashIcon size={20} color="#967938" />
              Current Month Financial Health ({currentMonthStats.monthName} {selectedYear})
            </h3>
            <span style={{ fontSize: '12px', color: '#686256' }}>
              Live forecourt sales, dealer margin commission, operational costs, and personal bank transfers
            </span>
          </div>
          <span className="badge badge-gold" style={{ fontSize: '11px', fontWeight: 700 }}>
            {currentMonthStats.hasData ? `${currentMonthStats.transactionCount} Active Records` : 'No Data Recorded Yet'}
          </span>
        </div>

        <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0 }}>
          {/* 1. Gross Revenue */}
          <div className="kpi-cell">
            <span className="kpi-label">Gross Sales Turnover (PKR)</span>
            <strong className="kpi-cell-value text-gold" style={{ fontSize: '20px' }}>
              Rs. {Math.round(currentMonthStats.grossRevenue).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">{currentMonthStats.totalLiters.toLocaleString()} Liters dispensed</span>
          </div>

          {/* 2. Gross Margin */}
          <div className="kpi-cell">
            <span className="kpi-label">Dealer Commission (Margin)</span>
            <strong className="kpi-cell-value" style={{ fontSize: '20px', color: '#27ae60' }}>
              Rs. {Math.round(currentMonthStats.grossMargin).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">@ Rs. 8.64 / Liter average margin</span>
          </div>

          {/* 3. Operating Expenses */}
          <div className="kpi-cell">
            <span className="kpi-label">Station Operating Expenses</span>
            <strong className="kpi-cell-value text-red" style={{ fontSize: '20px' }}>
              Rs. {currentMonthStats.totalExpenses.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">WAPDA, Generator, Staff &amp; Spares</span>
          </div>

          {/* 4. Net Profit */}
          <div className="kpi-cell">
            <span className="kpi-label">Net Station Profit (This Month)</span>
            <strong
              className="kpi-cell-value"
              style={{ fontSize: '22px', color: currentMonthStats.netProfit >= 0 ? '#15803d' : '#b91c1c' }}
            >
              Rs. {Math.round(currentMonthStats.netProfit).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Margin minus Operating Expenses</span>
          </div>

          {/* 5. Transferred to Bank */}
          <div className="kpi-cell">
            <span className="kpi-label">Transferred to Owner Bank</span>
            <strong className="kpi-cell-value" style={{ fontSize: '20px', color: '#1d4ed8' }}>
              Rs. {currentMonthStats.bankTransferred.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">{currentMonthStats.transfersList.length} transfers recorded</span>
          </div>

          {/* 6. Retained Profit */}
          <div className="kpi-cell">
            <span className="kpi-label">Retained / Undrawn Balance</span>
            <strong className="kpi-cell-value text-gold" style={{ fontSize: '20px' }}>
              Rs. {Math.round(currentMonthStats.retainedAmount).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Liquid cash retained at station</span>
          </div>
        </div>

        {/* Financial Principles Banner (Strict Distinction) */}
        <div style={{ background: '#faf6ee', border: '1px solid rgba(150, 121, 56, 0.2)', borderRadius: '8px', padding: '10px 16px', marginTop: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#8c7333', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              FINANCIAL INTEGRITY RULE:
            </span>
          </div>
          <span style={{ fontSize: '12px', color: '#555' }}>
            <strong>Revenue &ne; Profit:</strong> Turnover (Rs. {Math.round(currentMonthStats.grossRevenue).toLocaleString()}) reflects fuel sales; Station profit is the dealer margin minus actual operational costs.
          </span>
          <span style={{ fontSize: '12px', color: '#555' }}>
            <strong>Bank Transfer &ne; Profit:</strong> Transferred amount (Rs. {currentMonthStats.bankTransferred.toLocaleString()}) reflects actual capital moved to the owner&apos;s bank account.
          </span>
        </div>
      </div>

      {/* ── Section 6: Selected Year Annual Overview ── */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1814', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUpIcon size={20} color="#967938" />
              Annual Performance Summary ({selectedYear})
            </h3>
            <span style={{ fontSize: '12px', color: '#686256' }}>
              Cumulative financial metrics across all 12 months for {site?.name}
            </span>
          </div>
          <span className="badge badge-gold font-bold">
            {annualTotals.transactionCount} Total Annual Transactions
          </span>
        </div>

        <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: 0 }}>
          <div className="kpi-cell">
            <span className="kpi-label">Annual Gross Turnover</span>
            <strong className="kpi-cell-value text-gold" style={{ fontSize: '19px' }}>
              Rs. {Math.round(annualTotals.revenue).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">{annualTotals.liters.toLocaleString()} Liters volume</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Annual Dealer Margin</span>
            <strong className="kpi-cell-value" style={{ fontSize: '19px', color: '#27ae60' }}>
              Rs. {Math.round(annualTotals.grossMargin).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Gross forecourt commission</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Annual Operating Costs</span>
            <strong className="kpi-cell-value text-red" style={{ fontSize: '19px' }}>
              Rs. {annualTotals.expenses.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Total station vouchers</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Annual Net Profit</span>
            <strong
              className="kpi-cell-value"
              style={{ fontSize: '20px', color: annualTotals.netProfit >= 0 ? '#15803d' : '#b91c1c' }}
            >
              Rs. {Math.round(annualTotals.netProfit).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Net station earnings</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Total Transferred to Owner</span>
            <strong className="kpi-cell-value" style={{ fontSize: '19px', color: '#1d4ed8' }}>
              Rs. {annualTotals.bankTransferred.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Paid to personal accounts</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Pending / Retained Profit</span>
            <strong className="kpi-cell-value text-gold" style={{ fontSize: '19px' }}>
              Rs. {Math.round(annualTotals.retainedAmount).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Available for distribution</span>
          </div>
        </div>
      </div>

      {/* ── Section 7: Monthly Financial Trend Chart (Jan → Dec) ── */}
      <div className="table-surface" style={{ marginTop: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUpIcon size={18} color="#967938" />
              Monthly Financial Trajectory ({selectedYear})
            </h3>
            <p className="surface-sub">
              Visual trajectory of Monthly Profit, Dealer Margin, and Bank Transfers from January to December
            </p>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: '#27ae60', borderRadius: '3px' }} />
              <span>Gross Margin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: '#15803d', borderRadius: '3px' }} />
              <span>Net Profit</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: '#1d4ed8', borderRadius: '3px' }} />
              <span>Bank Transfers</span>
            </div>
          </div>
        </div>

        {/* Clean Responsive Bar Chart */}
        <div style={{ width: '100%', overflowX: 'auto', paddingTop: '10px' }}>
          <div style={{ minWidth: '700px', height: '220px', display: 'flex', alignItems: 'flex-end', gap: '14px', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px' }}>
            {monthlyData.map((m) => {
              const marginHeight = chartMax > 0 ? (m.grossMargin / chartMax) * 170 : 0
              const profitHeight = chartMax > 0 ? (Math.max(0, m.netProfit) / chartMax) * 170 : 0
              const transferHeight = chartMax > 0 ? (m.bankTransferred / chartMax) * 170 : 0

              return (
                <div
                  key={m.monthNumber}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    position: 'relative',
                  }}
                  title={`${m.monthName} ${selectedYear}:\nMargin: Rs. ${Math.round(m.grossMargin).toLocaleString()}\nNet Profit: Rs. ${Math.round(m.netProfit).toLocaleString()}\nTransferred: Rs. ${m.bankTransferred.toLocaleString()}`}
                >
                  {/* Bars Cluster */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', width: '100%', justifyContent: 'center' }}>
                    {/* Gross Margin Bar */}
                    <div
                      style={{
                        width: '28%',
                        maxWidth: '16px',
                        height: `${Math.max(marginHeight, m.hasData ? 4 : 0)}px`,
                        background: '#27ae60',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    {/* Net Profit Bar */}
                    <div
                      style={{
                        width: '28%',
                        maxWidth: '16px',
                        height: `${Math.max(profitHeight, m.hasData ? 4 : 0)}px`,
                        background: '#15803d',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    {/* Bank Transfer Bar */}
                    <div
                      style={{
                        width: '28%',
                        maxWidth: '16px',
                        height: `${Math.max(transferHeight, m.bankTransferred > 0 ? 4 : 0)}px`,
                        background: '#1d4ed8',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Month Label */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: m.hasData ? 700 : 500,
                      color: m.hasData ? '#1a1814' : '#9ca3af',
                      marginTop: '8px',
                    }}
                  >
                    {m.monthName.slice(0, 3)}
                  </span>
                  {!m.hasData && (
                    <span style={{ fontSize: '9px', color: '#9ca3af', position: 'absolute', bottom: '26px' }}>
                      No data
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Section 3: Full 12-Month Financial Breakdown Table ── */}
      <div className="table-surface" style={{ marginTop: '24px' }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BuildingIcon size={18} color="#967938" />
              Monthly Financial Breakdown (January &rarr; December {selectedYear})
            </h3>
            <p className="surface-sub">
              Granular financial audit for {site?.name}. Months with no records explicitly marked as <strong>0 / No Data</strong>.
            </p>
          </div>
          <span className="badge badge-gold font-bold">
            Full 12-Month Fiscal Audit
          </span>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Volume (L)</th>
                <th>Gross Turnover (PKR)</th>
                <th>Dealer Margin (PKR)</th>
                <th>Station Expenses</th>
                <th>Net Profit</th>
                <th>Transferred to Bank</th>
                <th>Pending / Retained</th>
                <th>Txns</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => (
                <tr key={m.monthNumber} style={{ opacity: m.hasData ? 1 : 0.65 }}>
                  <td className="font-bold">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CalendarIcon size={14} color={m.hasData ? '#8c7333' : '#9ca3af'} />
                      <span>{m.monthName} {selectedYear}</span>
                    </div>
                  </td>
                  <td>{m.hasData ? `${m.totalLiters.toLocaleString()} L` : '0 L'}</td>
                  <td>{m.hasData ? `Rs. ${Math.round(m.grossRevenue).toLocaleString()}` : 'Rs. 0'}</td>
                  <td style={{ color: m.hasData ? '#27ae60' : undefined, fontWeight: m.hasData ? 600 : undefined }}>
                    {m.hasData ? `Rs. ${Math.round(m.grossMargin).toLocaleString()}` : 'Rs. 0'}
                  </td>
                  <td style={{ color: m.hasData && m.totalExpenses > 0 ? '#b91c1c' : undefined }}>
                    {m.hasData && m.totalExpenses > 0 ? `Rs. ${m.totalExpenses.toLocaleString()}` : 'Rs. 0'}
                  </td>
                  <td style={{ fontWeight: 700, color: !m.hasData ? '#6b7280' : m.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                    {m.hasData ? `Rs. ${Math.round(m.netProfit).toLocaleString()}` : 'Rs. 0'}
                  </td>
                  <td style={{ color: m.bankTransferred > 0 ? '#1d4ed8' : undefined, fontWeight: m.bankTransferred > 0 ? 600 : undefined }}>
                    {m.bankTransferred > 0 ? `Rs. ${m.bankTransferred.toLocaleString()}` : 'Rs. 0'}
                  </td>
                  <td style={{ color: m.retainedAmount > 0 ? '#8c7333' : undefined, fontWeight: m.retainedAmount > 0 ? 600 : undefined }}>
                    {m.hasData ? `Rs. ${Math.round(m.retainedAmount).toLocaleString()}` : 'Rs. 0'}
                  </td>
                  <td>{m.transactionCount}</td>
                  <td>
                    {m.hasData ? (
                      <span className="badge badge-parco" style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }}>
                        Active Records ({m.transactionCount})
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: '10.5px', background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }}>
                        0 / No Data
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f5ee', fontWeight: 800, borderTop: '2px solid #967938' }}>
                <td>TOTAL ({selectedYear})</td>
                <td>{annualTotals.liters.toLocaleString()} L</td>
                <td className="text-gold">Rs. {Math.round(annualTotals.revenue).toLocaleString()}</td>
                <td style={{ color: '#27ae60' }}>Rs. {Math.round(annualTotals.grossMargin).toLocaleString()}</td>
                <td style={{ color: '#b91c1c' }}>Rs. {annualTotals.expenses.toLocaleString()}</td>
                <td style={{ color: annualTotals.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                  Rs. {Math.round(annualTotals.netProfit).toLocaleString()}
                </td>
                <td style={{ color: '#1d4ed8' }}>Rs. {annualTotals.bankTransferred.toLocaleString()}</td>
                <td className="text-gold">Rs. {Math.round(annualTotals.retainedAmount).toLocaleString()}</td>
                <td>{annualTotals.transactionCount}</td>
                <td>
                  <span className="badge badge-gold" style={{ fontSize: '11px' }}>
                    Annual Sum
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Section 5: Bank Account Transfers To Owner ── */}
      <div className="table-surface" style={{ marginTop: '24px' }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCardIcon size={18} color="#967938" />
              Owner Bank Account Transfers &amp; Capital Withdrawals
            </h3>
            <p className="surface-sub">
              Historical record of profits actually transferred from station commercial accounts to the owner&apos;s personal bank account
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ backgroundColor: isParco ? '#9e1b1b' : '#006a4e', borderColor: isParco ? '#9e1b1b' : '#006a4e', fontSize: '12.5px' }}
            onClick={() => setTransferModalOpen(true)}
          >
            + Record New Transfer
          </button>
        </div>

        {/* Transfer KPI strip */}
        <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: '0 0 16px' }}>
          <div className="kpi-cell">
            <span className="kpi-label">This Month Transferred</span>
            <strong className="kpi-cell-value" style={{ fontSize: '19px', color: '#1d4ed8' }}>
              Rs. {currentMonthStats.bankTransferred.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">{currentMonthStats.monthName} {selectedYear}</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">This Year Transferred</span>
            <strong className="kpi-cell-value" style={{ fontSize: '19px', color: '#1d4ed8' }}>
              Rs. {annualTotals.bankTransferred.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Total transfers in {selectedYear}</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Lifetime Recorded Transfers</span>
            <strong className="kpi-cell-value text-gold" style={{ fontSize: '19px' }}>
              Rs. {totalLifetimeTransferred.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">{allRecordedTransfers.length} total transfer slips</span>
          </div>

          <div className="kpi-cell">
            <span className="kpi-label">Pending / Unwithdrawn Profit</span>
            <strong className="kpi-cell-value" style={{ fontSize: '19px', color: '#15803d' }}>
              Rs. {Math.round(annualTotals.retainedAmount).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Available station profit</span>
          </div>
        </div>

        {/* Transfer Log Table */}
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference / Ref No</th>
                <th>Transfer Amount (PKR)</th>
                <th>Destination Owner Account</th>
                <th>Destination Bank</th>
                <th>Status</th>
                <th>Authorized By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {allRecordedTransfers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#736b5e' }}>
                    No bank transfers recorded yet. Click &quot;Record New Transfer&quot; to log an owner profit withdrawal.
                  </td>
                </tr>
              ) : (
                allRecordedTransfers.map((tx) => (
                  <tr key={tx.id}>
                    <td className="font-bold">{tx.date}</td>
                    <td>
                      <span className="badge badge-outline" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                        {tx.referenceNo}
                      </span>
                    </td>
                    <td className="font-bold" style={{ color: '#1d4ed8', fontSize: '14px' }}>
                      Rs. {tx.amount.toLocaleString()}
                    </td>
                    <td>
                      <strong>{tx.accountTitle}</strong>
                      <span style={{ fontSize: '11px', color: '#686256', display: 'block' }}>{tx.accountNumber}</span>
                    </td>
                    <td>{tx.bankName}</td>
                    <td>
                      <span className="badge badge-parco" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', fontSize: '11px' }}>
                        {tx.status}
                      </span>
                    </td>
                    <td>{tx.transferredBy}</td>
                    <td style={{ fontSize: '12px', color: '#686256' }}>{tx.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Record New Owner Bank Transfer ── */}
      {transferModalOpen && (
        <div className="modal-backdrop" onClick={() => setTransferModalOpen(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCardIcon size={20} color="#967938" />
                  Record Bank Transfer to Owner
                </h3>
                <p className="modal-sub">
                  Transfer station profits to personal bank account ({site?.name})
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setTransferModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              {transferFormError && (
                <div className="auth-error-notice">
                  <AlertCircleIcon size={14} color="#b91c1c" />
                  <span>{transferFormError}</span>
                </div>
              )}

              {/* Source Station Account */}
              <div className="form-field-group">
                <label className="form-field-label">Source Station Bank Account</label>
                <select
                  className="auth-text-input"
                  value={transferForm.bankId}
                  onChange={(e) => setTransferForm({ ...transferForm, bankId: e.target.value })}
                  required
                >
                  {activeSiteData.bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} — Balance: Rs. {b.currentBalance.toLocaleString()} ({b.accountNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Transfer Amount */}
              <div className="form-field-group">
                <label className="form-field-label">Transfer Amount (PKR)</label>
                <input
                  type="number"
                  className="auth-text-input"
                  placeholder="e.g. 500000"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  min="1"
                  step="any"
                  required
                />
              </div>

              {/* Destination Bank Name */}
              <div className="form-field-group">
                <label className="form-field-label">Destination Bank Name</label>
                <input
                  type="text"
                  className="auth-text-input"
                  placeholder="e.g. Meezan Bank / HBL / Bank Alfalah"
                  value={transferForm.bankName}
                  onChange={(e) => setTransferForm({ ...transferForm, bankName: e.target.value })}
                  required
                />
              </div>

              {/* Destination Account Title */}
              <div className="form-field-group">
                <label className="form-field-label">Destination Account Title (Owner Name)</label>
                <input
                  type="text"
                  className="auth-text-input"
                  placeholder="e.g. Chaudhry Tariq Mehmood"
                  value={transferForm.accountTitle}
                  onChange={(e) => setTransferForm({ ...transferForm, accountTitle: e.target.value })}
                  required
                />
              </div>

              {/* Destination Account Number / IBAN */}
              <div className="form-field-group">
                <label className="form-field-label">Account Number or IBAN</label>
                <input
                  type="text"
                  className="auth-text-input"
                  placeholder="e.g. PK72MEZN001928374619"
                  value={transferForm.accountNumber}
                  onChange={(e) => setTransferForm({ ...transferForm, accountNumber: e.target.value })}
                  required
                />
              </div>

              {/* Date & Reference */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-field-group">
                  <label className="form-field-label">Transfer Date</label>
                  <input
                    type="date"
                    className="auth-text-input"
                    value={transferForm.date}
                    onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field-group">
                  <label className="form-field-label">RTGS / Cheque / Ref No</label>
                  <input
                    type="text"
                    className="auth-text-input"
                    placeholder="e.g. RTGS-88192"
                    value={transferForm.referenceNo}
                    onChange={(e) => setTransferForm({ ...transferForm, referenceNo: e.target.value })}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-field-group">
                <label className="form-field-label">Particulars / Notes</label>
                <input
                  type="text"
                  className="auth-text-input"
                  placeholder="e.g. September profit drawing"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setTransferModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: isParco ? '#9e1b1b' : '#006a4e', borderColor: isParco ? '#9e1b1b' : '#006a4e' }}
                >
                  Confirm Bank Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Receipt Modal */}
      {printOpen && (
        <PrintReceiptModal
          isOpen={printOpen}
          title={`${site?.name} — Annual Financial Audit Report (${selectedYear})`}
          onClose={() => setPrintOpen(false)}
        >
          <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '10px', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>{site?.name}</h3>
              <p style={{ margin: '4px 0' }}>{site?.location}</p>
              <p style={{ margin: '4px 0' }}>NTN: {site?.ntn} | Phone: {site?.phone}</p>
              <p style={{ margin: '4px 0', fontWeight: 'bold' }}>AUDITED ANNUAL FINANCIAL STATEMENT — {selectedYear}</p>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <p><strong>Total Annual Liters Dispensed:</strong> {annualTotals.liters.toLocaleString()} Liters</p>
              <p><strong>Total Gross Sales Turnover:</strong> Rs. {Math.round(annualTotals.revenue).toLocaleString()}</p>
              <p><strong>Gross Dealer Margin (Commission):</strong> Rs. {Math.round(annualTotals.grossMargin).toLocaleString()}</p>
              <p><strong>Operating Expenses Deducted:</strong> - Rs. {annualTotals.expenses.toLocaleString()}</p>
              <p><strong>Net Audited Station Profit:</strong> Rs. {Math.round(annualTotals.netProfit).toLocaleString()}</p>
              <p><strong>Transferred to Owner Personal Bank:</strong> Rs. {annualTotals.bankTransferred.toLocaleString()}</p>
              <p><strong>Retained Undistributed Profit:</strong> Rs. {Math.round(annualTotals.retainedAmount).toLocaleString()}</p>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Liters</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Turnover (Rs)</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Net Profit (Rs)</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Transferred (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.monthNumber} style={{ borderBottom: '1px dotted #ccc' }}>
                    <td style={{ padding: '4px' }}>{m.monthName}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>{m.totalLiters.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>{Math.round(m.grossRevenue).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>{Math.round(m.netProfit).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>{m.bankTransferred.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '10px', textAlign: 'center', fontSize: '11px' }}>
              <p>Computer-generated verified owner financial statement.</p>
              <p>Printed on: {new Date().toLocaleString()} by {currentUser?.name || 'Owner'}</p>
            </div>
          </div>
        </PrintReceiptModal>
      )}
    </div>
  )
}
