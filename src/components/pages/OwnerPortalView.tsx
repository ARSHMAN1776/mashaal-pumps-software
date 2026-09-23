import React, { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import {
  GasPumpIcon,
  CashIcon,
  UsersIcon,
  CreditCardIcon,
  PrinterIcon,
  ShieldIcon,
  AlertCircleIcon,
  CalendarIcon,
  PlusIcon,
  CheckCircleIcon,
  XIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const OwnerPortalView: React.FC = () => {
  const { activeSiteData, activeSiteId, addOwnerTransfer } = useApp()
  const site = activeSiteData?.siteInfo
  const isParco = site?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01'

  // ── Available Months Dropdown Extraction ────────────────────────────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    const allDates = [
      ...(activeSiteData?.fuelSales || []).map((s) => s.date),
      ...(activeSiteData?.expenses || []).map((e) => e.date),
      ...(activeSiteData?.daybook || []).map((d) => d.date),
      ...(activeSiteData?.creditSlips || []).map((c) => c.date),
    ]

    allDates.forEach((d) => {
      if (d && d.length >= 7) {
        set.add(d.slice(0, 7))
      }
    })

    const currentMonth = new Date().toISOString().slice(0, 7)
    set.add(currentMonth)

    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [activeSiteData])

  // Default to latest month
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || 'all')
  const [printOpen, setPrintOpen] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)

  // Owner transfer form state
  const [transferAmount, setTransferAmount] = useState<number>(100000)
  const [selectedBankId, setSelectedBankId] = useState<string>(activeSiteData.bankAccounts[0]?.id || '')
  const [personalAccountTitle, setPersonalAccountTitle] = useState('Chaudhry Tariq Mehmood (Personal)')
  const [personalAccountNumber, setPersonalAccountNumber] = useState('0018-9284-1029-44')
  const [transferRef, setTransferRef] = useState('')
  const [transferNotes, setTransferNotes] = useState('Monthly Profit Distribution')

  const formatMonthLabel = (ym: string): string => {
    if (ym === 'all') return 'All Recorded History'
    try {
      const [year, month] = ym.split('-')
      const d = new Date(Number(year), Number(month) - 1, 1)
      return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    } catch {
      return ym
    }
  }

  // Helper: Filter records by selected YYYY-MM
  const matchesMonth = (dateStr: string, ym: string): boolean => {
    if (ym === 'all') return true
    return (dateStr || '').startsWith(ym)
  }

  // Filtered Fuel Sales
  const filteredSales = useMemo(() => {
    return (activeSiteData?.fuelSales || []).filter((s) => matchesMonth(s.date, selectedMonth))
  }, [activeSiteData, selectedMonth])

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return (activeSiteData?.expenses || []).filter((e) => matchesMonth(e.date, selectedMonth))
  }, [activeSiteData, selectedMonth])

  // Sales aggregates
  const totalSalesPkr = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalAmount, 0), [filteredSales])
  const totalLiters = useMemo(() => filteredSales.reduce((sum, s) => sum + s.netLiters, 0), [filteredSales])

  // Product breakdown
  const superLiters = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.netLiters, 0),
    [filteredSales]
  )
  const superPkr = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.totalAmount, 0),
    [filteredSales]
  )

  const dieselLiters = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.netLiters, 0),
    [filteredSales]
  )
  const dieselPkr = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.totalAmount, 0),
    [filteredSales]
  )

  const octaneLiters = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.netLiters, 0),
    [filteredSales]
  )
  const octanePkr = useMemo(
    () => filteredSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.totalAmount, 0),
    [filteredSales]
  )

  // Operating Expenses
  const totalExpensesPkr = useMemo(() => filteredExpenses.reduce((sum, e) => sum + e.amount, 0), [filteredExpenses])

  // Dealer Margin / Commission (standard dealer margin in Pakistan ~Rs. 8.64/L)
  const estimatedDealerMargin = totalLiters * 8.64
  const estimatedNetProfit = estimatedDealerMargin - totalExpensesPkr

  // Categorized expenses
  const expenseCategories = useMemo(() => {
    const map: Record<string, number> = {}
    for (const exp of filteredExpenses) {
      map[exp.category] = (map[exp.category] || 0) + exp.amount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filteredExpenses])

  // Cash Safe totals
  const totalSafeCash = useMemo(() => {
    const db = activeSiteData?.daybook || []
    return db.length > 0 ? db[db.length - 1].balanceAfter : 0
  }, [activeSiteData])

  // Bank Balances
  const totalBankBalances = useMemo(() => {
    return (activeSiteData?.bankAccounts || []).reduce((sum, b) => sum + b.currentBalance, 0)
  }, [activeSiteData])

  // Receivables
  const totalCustomerReceivables = useMemo(() => {
    return (activeSiteData?.customers || []).reduce((sum, c) => sum + c.currentBalance, 0)
  }, [activeSiteData])

  // Payables
  const totalOmcPayables = useMemo(() => {
    return (activeSiteData?.omcInvoices || []).reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0)
  }, [activeSiteData])

  const totalSupplierPayables = useMemo(() => {
    return (activeSiteData?.suppliers || []).reduce((sum, s) => sum + s.balanceDue, 0)
  }, [activeSiteData])

  // Low tanks alert
  const lowTanks = useMemo(() => {
    return (activeSiteData?.tanks || []).filter((t) => t.currentLiters <= t.minReserveLiters)
  }, [activeSiteData])

  // Top Debtors
  const topDebtors = useMemo(() => {
    return [...(activeSiteData?.customers || [])].sort((a, b) => b.currentBalance - a.currentBalance).slice(0, 5)
  }, [activeSiteData])

  // Handle owner transfer submission
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    const targetBank = activeSiteData.bankAccounts.find((b) => b.id === selectedBankId) || activeSiteData.bankAccounts[0]

    addOwnerTransfer({
      siteId: activeSiteId || 'SITE-01',
      date: new Date().toISOString().split('T')[0],
      amount: transferAmount,
      bankId: targetBank.id,
      bankName: targetBank.bankName,
      accountTitle: personalAccountTitle,
      accountNumber: personalAccountNumber,
      referenceNo: transferRef || `OTX-${Date.now().toString().slice(-5)}`,
      status: 'Completed',
      notes: transferNotes,
      transferredBy: 'Station Owner',
    })

    setTransferModalOpen(false)
  }

  return (
    <div className="page-content-wrapper owner-portal-root">
      {/* ── 1. Top Executive Banner with Month Dropdown Filter ── */}
      <div className="page-title-banner" style={{ flexDirection: 'column', gap: '14px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-gold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <ShieldIcon size={12} /> Executive Command
              </span>
              <span className={`badge ${isParco ? 'badge-parco' : 'badge-pso'}`} style={{ fontSize: '11px' }}>
                {site?.code || 'SITE 01'} • {site?.brand || 'TOTAL PARCO'}
              </span>
            </div>
            <h2 className="page-heading" style={{ fontSize: '24px', letterSpacing: '-0.02em', margin: '2px 0 4px' }}>
              {site?.name} — Owner Financial Portal
            </h2>
            <p className="page-sub" style={{ margin: 0 }}>
              Forecourt performance, dealer margin commission, safe cash liquidity, and audited monthly profit.
            </p>
          </div>

          {/* Right Action: Clean Month Dropdown Filter & Print */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* CLEAN MONTH DROPDOWN FILTER */}
            <div className="owner-month-filter-cluster">
              <span className="owner-month-label">
                <CalendarIcon size={14} color="#967938" />
                <span>Month:</span>
              </span>
              <select
                className="owner-month-dropdown"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Filter Owner Portal by Month"
              >
                <option value="all">All Recorded History</option>
                {availableMonths.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatMonthLabel(ym)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setTransferModalOpen(true)}
              style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }}
            >
              <PlusIcon size={15} />
              <span>Withdraw Capital</span>
            </button>

            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}>
              <PrinterIcon size={15} />
              <span>Print Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. On-Module Guide for Station Owner ── */}
      <ModuleGuide
        title="Owner Executive Portal & Margin Auditing"
        urduTitle="اسٹیشن اونر کے لیے ماہانہ منافع اور اخراجات کا خلاصہ"
        role="owner"
        roleLabel="Station Owner"
        purpose="Provides top-level visibility into fuel liters sold, gross dealer commission, station operating costs, cash liquidity in safe/banks, and net owner profit take-home."
        steps={[
          {
            step: 1,
            title: 'Filter by Month (ماہانہ انتخاب)',
            detail: 'Use the Month dropdown in the header to select any calendar month or view all historical records.',
            urdu: 'اوپر دیے گئے ڈراپ ڈاؤن سے مہینہ منتخب کریں تاکہ اس ماہ کا آڈٹ دیکھا جا سکے۔',
          },
          {
            step: 2,
            title: 'Verify Dealer Margin (ڈیلر کمیشن)',
            detail: 'Dealer commission averages Rs. 8.64/L in Pakistan. It is automatically computed from total dispensed fuel volume.',
            urdu: 'حکومت کی طرف سے مقرر کردہ ڈیلر مارجن کے مطابق کل منافع کا حساب خودکار ہوتا ہے۔',
          },
          {
            step: 3,
            title: 'Monitor Operating Costs (اسٹیشن کے اخراجات)',
            detail: 'Review categorized station expenses (WAPDA electricity, generator diesel, dispenser maintenance, staff tea/meals).',
            urdu: 'ماہانہ بل، جنریٹر ڈیزل اور مرمت کے اخراجات کو کمیشن سے منہا کر کے اصل بچت جانچیں۔',
          },
          {
            step: 4,
            title: 'Check Solvency & Safe Cash (کیش اور بینک بیلنس)',
            detail: 'Confirm physical cash in station safe and verified commercial bank balances before transferring profits.',
            urdu: 'سیف میں موجود رقم اور بینک بیلنس دیکھ کر ذاتی اکاؤنٹ میں رقم منتقل کریں۔',
          },
        ]}
        criticalChecks={[
          'Always reconcile physical safe cash with the Daybook before authorizing owner bank distributions.',
          'Review the Top Fleet Accounts table to ensure commercial transporters do not exceed authorized credit limits.',
          'Keep a working capital reserve in station bank accounts for upcoming OMC fuel tanker pay orders.',
        ]}
      />

      {/* Low Stock Warning Banner if applicable */}
      {lowTanks.length > 0 && (
        <div className="dashboard-alert-banner" style={{ margin: '0 0 16px' }}>
          {lowTanks.map((tank) => (
            <div key={tank.id} className="dash-alert-pill warning">
              <AlertCircleIcon size={15} color="#b45309" />
              <span>
                <strong>Underground Tank Dip Alert:</strong> {tank.fuelType} (Tank #{tank.tankNo}) has only{' '}
                {tank.currentLiters.toLocaleString()} Liters remaining (below {tank.minReserveLiters.toLocaleString()} L safety reserve).
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Executive Financial KPI Matrix ── */}
      <div className="executive-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="kpi-cell">
          <span className="kpi-label">Gross Fuel Revenue ({formatMonthLabel(selectedMonth)})</span>
          <strong className="kpi-cell-value text-gold" style={{ fontSize: '20px' }}>
            Rs. {Math.round(totalSalesPkr).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">{totalLiters.toLocaleString()} Liters dispensed</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Dealer Margin (Gross Commission)</span>
          <strong className="kpi-cell-value" style={{ fontSize: '20px', color: '#15803d' }}>
            Rs. {Math.round(estimatedDealerMargin).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">@ Rs. 8.64/L avg dealer commission</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Net Owner Profit Take-Home</span>
          <strong
            className="kpi-cell-value"
            style={{ fontSize: '20px', color: estimatedNetProfit >= 0 ? '#15803d' : '#b91c1c' }}
          >
            Rs. {Math.round(estimatedNetProfit).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">After Rs. {totalExpensesPkr.toLocaleString()} operating expenses</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Station Cash in Safe</span>
          <strong className="kpi-cell-value text-gold" style={{ fontSize: '20px' }}>
            Rs. {totalSafeCash.toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Liquid cash ready for deposit</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Bank Accounts Liquidity</span>
          <strong className="kpi-cell-value" style={{ fontSize: '20px' }}>
            Rs. {totalBankBalances.toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">{(activeSiteData?.bankAccounts || []).length} station accounts</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Fleet Credit Receivables</span>
          <strong className="kpi-cell-value text-red" style={{ fontSize: '20px' }}>
            Rs. {totalCustomerReceivables.toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Uncollected customer balance</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Pending Payables (OMC & Vendors)</span>
          <strong className="kpi-cell-value" style={{ fontSize: '20px', color: '#c2410c' }}>
            Rs. {(totalOmcPayables + totalSupplierPayables).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Fuel invoices & vendor balances</span>
        </div>
      </div>

      {/* ── 4. Station Profitability Breakdown Card for Selected Month ── */}
      <div
        className="table-surface"
        style={{
          marginTop: '18px',
          padding: '20px',
          borderLeft: `4px solid ${isParco ? '#9e1b1b' : '#006a4e'}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span className={`badge ${isParco ? 'badge-parco' : 'badge-pso'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                {site?.code} • {site?.brand}
              </span>
              <span className="badge badge-gold" style={{ fontSize: '10.5px' }}>
                Month: {formatMonthLabel(selectedMonth)}
              </span>
            </div>
            <h4 style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 2px', color: '#1a1814' }}>
              Monthly Station Earning & Expense Audit
            </h4>
            <span style={{ fontSize: '12px', color: '#736b5e' }}>{site?.location}</span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '12px', color: '#736b5e', display: 'block' }}>Monthly Volume Sold</span>
            <strong style={{ fontSize: '18px', color: '#1a1814' }}>{totalLiters.toLocaleString()} Liters</strong>
          </div>
        </div>

        <div
          style={{
            background: isParco ? '#faf6ee' : '#f0f7f4',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '14px',
            border: `1px solid ${isParco ? 'rgba(158, 27, 27, 0.12)' : 'rgba(0, 106, 78, 0.12)'}`,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: isParco ? '#8c7333' : '#006a4e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Forecourt Turnover & Dealer Commission ({formatMonthLabel(selectedMonth)})
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#555' }}>Total Forecourt Turnover (Gross Sales):</span>
            <strong>Rs. {Math.round(totalSalesPkr).toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13.5px' }}>
            <span style={{ color: '#15803d', fontWeight: 700 }}>+ Dealer Margin Earned (@ Rs. 8.64/L):</span>
            <strong style={{ color: '#15803d' }}>+ Rs. {Math.round(estimatedDealerMargin).toLocaleString()}</strong>
          </div>
          <div style={{ fontSize: '11.5px', color: '#686256', marginLeft: '6px', marginBottom: '10px' }}>
            • PMG Super ({superLiters.toLocaleString()} L): Rs. {Math.round(superLiters * 8.64).toLocaleString()} | HSD Diesel ({dieselLiters.toLocaleString()} L): Rs. {Math.round(dieselLiters * 8.64).toLocaleString()}
          </div>

          <div style={{ borderTop: `1px dashed ${isParco ? '#e2d8c3' : '#b8dfd1'}`, paddingTop: '10px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#b91c1c', fontWeight: 600 }}>- Station Operating Expenses:</span>
              <strong style={{ color: '#b91c1c' }}>- Rs. {totalExpensesPkr.toLocaleString()}</strong>
            </div>
            {expenseCategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {expenseCategories.map(([cat, amt]) => (
                  <span
                    key={cat}
                    style={{
                      fontSize: '11px',
                      background: '#fff',
                      border: `1px solid ${isParco ? '#ebd9c8' : '#b8dfd1'}`,
                      borderRadius: '4px',
                      padding: '2px 8px',
                      color: isParco ? '#7c2d12' : '#065f46',
                    }}
                  >
                    {cat}: Rs. {amt.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#686256', display: 'block' }}>Net Monthly Profit Take-Home (Dealer Margin minus Expenses)</span>
            <strong style={{ fontSize: '24px', color: estimatedNetProfit >= 0 ? '#15803d' : '#b91c1c' }}>
              Rs. {Math.round(estimatedNetProfit).toLocaleString()}
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setTransferModalOpen(true)}
            style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CashIcon size={14} />
            <span>Transfer Profit to Owner Account &rarr;</span>
          </button>
        </div>
      </div>

      {/* ── 5. Stacked Full-Width Sections: Fuel Breakdown & Station Liquidity ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
        {/* Fuel Product Distribution */}
        <div className="table-surface" style={{ margin: 0, width: '100%' }}>
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GasPumpIcon size={18} color="#967938" />
                Product Volume Distribution ({formatMonthLabel(selectedMonth)})
              </h3>
              <p className="surface-sub">Comparison across Super, Diesel, and Hi-Octane</p>
            </div>
            <span className="badge badge-gold font-bold">{totalLiters.toLocaleString()} L Total</span>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Liters Sold</th>
                  <th>Share</th>
                  <th>Gross Sales</th>
                  <th>Dealer Commission</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb' }} />
                      <strong>PMG Super</strong>
                    </div>
                  </td>
                  <td className="font-bold">{superLiters.toLocaleString()} L</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${totalLiters > 0 ? (superLiters / totalLiters) * 100 : 0}%`, height: '100%', background: '#2563eb' }} />
                      </div>
                      <span style={{ fontSize: '11.5px', minWidth: '32px' }}>
                        {totalLiters > 0 ? Math.round((superLiters / totalLiters) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="text-gold font-bold">Rs. {Math.round(superPkr).toLocaleString()}</td>
                  <td className="text-green font-bold">Rs. {Math.round(superLiters * 8.64).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#059669' }} />
                      <strong>HSD Diesel</strong>
                    </div>
                  </td>
                  <td className="font-bold">{dieselLiters.toLocaleString()} L</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${totalLiters > 0 ? (dieselLiters / totalLiters) * 100 : 0}%`, height: '100%', background: '#059669' }} />
                      </div>
                      <span style={{ fontSize: '11.5px', minWidth: '32px' }}>
                        {totalLiters > 0 ? Math.round((dieselLiters / totalLiters) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="text-gold font-bold">Rs. {Math.round(dieselPkr).toLocaleString()}</td>
                  <td className="text-green font-bold">Rs. {Math.round(dieselLiters * 8.64).toLocaleString()}</td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#b45309' }} />
                      <strong>Hi-Octane</strong>
                    </div>
                  </td>
                  <td className="font-bold">{octaneLiters.toLocaleString()} L</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${totalLiters > 0 ? (octaneLiters / totalLiters) * 100 : 0}%`, height: '100%', background: '#b45309' }} />
                      </div>
                      <span style={{ fontSize: '11.5px', minWidth: '32px' }}>
                        {totalLiters > 0 ? Math.round((octaneLiters / totalLiters) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="text-gold font-bold">Rs. {Math.round(octanePkr).toLocaleString()}</td>
                  <td className="text-green font-bold">Rs. {Math.round(octaneLiters * 8.64).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Bank Accounts & Liquidity */}
        <div className="table-surface" style={{ margin: 0 }}>
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCardIcon size={18} color="#967938" />
                Station Liquidity & Bank Accounts
              </h3>
              <p className="surface-sub">Safe cash register & verified bank balances</p>
            </div>
            <strong className="text-gold font-bold">
              Rs. {(totalSafeCash + totalBankBalances).toLocaleString()}
            </strong>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Account / Asset</th>
                  <th>Details</th>
                  <th>Balance (PKR)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#faf6ee' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CashIcon size={16} color="#8c7333" />
                      <strong>Physical Cash in Safe</strong>
                    </div>
                  </td>
                  <td className="text-muted text-xs">Daybook Shift Register</td>
                  <td className="text-gold font-bold">Rs. {totalSafeCash.toLocaleString()}</td>
                </tr>
                {(activeSiteData?.bankAccounts || []).map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.bankName}</strong>
                      <div className="text-muted text-xs">{b.accountNumber}</div>
                    </td>
                    <td className="text-muted text-xs">{b.branch}</td>
                    <td className="font-bold">Rs. {b.currentBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 6. Top Fleet Debtors Table ── */}
      <div className="table-surface" style={{ marginTop: '20px' }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UsersIcon size={18} color="#967938" />
              Major Transporter Accounts (Credit Khata Aging)
            </h3>
            <p className="surface-sub">Clients with significant outstanding receivables requiring management follow-up</p>
          </div>
          <span className="badge badge-danger font-bold">
            Rs. {totalCustomerReceivables.toLocaleString()} Total Outstanding
          </span>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Customer / Transporter</th>
                <th>Contact</th>
                <th>Approved Limit</th>
                <th>Current Balance Due</th>
                <th>Limit Utilization</th>
              </tr>
            </thead>
            <tbody>
              {topDebtors.map((c) => {
                const utilization = Math.round((c.currentBalance / c.creditLimit) * 100)
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.businessName}</strong>
                      <div className="text-muted text-xs">{c.name}</div>
                    </td>
                    <td>{c.phone}</td>
                    <td>Rs. {c.creditLimit.toLocaleString()}</td>
                    <td>
                      <strong className="text-red">Rs. {c.currentBalance.toLocaleString()}</strong>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: utilization > 80 ? '#fee2e2' : '#f1f5f9',
                          color: utilization > 80 ? '#b91c1c' : '#334155',
                          fontWeight: 700,
                        }}
                      >
                        {utilization}% Used
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 7. Modal: Owner Capital / Profit Withdrawal ── */}
      {transferModalOpen && (
        <div className="modal-backdrop" onClick={() => setTransferModalOpen(false)}>
          <div
            className="modal-container compact-zero-scroll"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '580px' }}
          >
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Withdraw Station Profit / Capital</h3>
                <span className="modal-sub">Transfer station earnings to owner personal bank account</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setTransferModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Source Station Bank</label>
                  <select
                    className="form-input"
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                  >
                    {(activeSiteData?.bankAccounts || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (Bal: Rs {b.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gold">Withdrawal Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                    required
                    min={1000}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Beneficiary Account Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={personalAccountTitle}
                    onChange={(e) => setPersonalAccountTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Beneficiary Account / IBAN</label>
                  <input
                    type="text"
                    className="form-input"
                    value={personalAccountNumber}
                    onChange={(e) => setPersonalAccountNumber(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Online Ref / Cheque #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder="e.g. IBFT-98124 or CHQ-00192"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Transfer Purpose</label>
                  <input
                    type="text"
                    className="form-input"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Withdrawing From:</span>
                  <span className="calc-pill-val">
                    {(activeSiteData?.bankAccounts || []).find((b) => b.id === selectedBankId)?.bankName || 'Bank'}
                  </span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Net Transfer Amount:</span>
                  <span className="calc-pill-val text-gold">Rs. {transferAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setTransferModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Execute Transfer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 8. Print Owner Audit Statement Modal ── */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`Owner Monthly Performance Audit — ${formatMonthLabel(selectedMonth)}`}
        stationName={site?.name || 'Mashaal Station'}
        stationLocation={site?.location || 'Station Forecourt'}
        stationPhone={site?.phone || '0300-0000000'}
        defaultMode="a4"
      >
        <div className="slip-meta-grid">
          <div><strong>Station:</strong> {site?.name}</div>
          <div><strong>Audited Month:</strong> {formatMonthLabel(selectedMonth)}</div>
          <div><strong>Dealer Code:</strong> {site?.code}</div>
          <div><strong>Print Timestamp:</strong> {new Date().toLocaleString()}</div>
        </div>

        <table className="slip-table">
          <thead>
            <tr>
              <th>Metric / Financial Category</th>
              <th style={{ textAlign: 'right' }}>Amount / Liters</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Forecourt Fuel Liters Dispensed</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalLiters.toLocaleString()} Liters</td>
            </tr>
            <tr>
              <td>Gross Fuel Sales Revenue (PKR)</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>Rs. {Math.round(totalSalesPkr).toLocaleString()}</td>
            </tr>
            <tr style={{ background: '#f0fdf4' }}>
              <td>Gross Dealer Margin (Commission @ Rs. 8.64/L)</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                + Rs. {Math.round(estimatedDealerMargin).toLocaleString()}
              </td>
            </tr>
            <tr style={{ background: '#fef2f2' }}>
              <td>Station Operating Expenses</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                - Rs. {totalExpensesPkr.toLocaleString()}
              </td>
            </tr>
            <tr style={{ background: '#fefce8' }}>
              <td><strong>Net Station Profit Take-Home</strong></td>
              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '15px' }}>
                Rs. {Math.round(estimatedNetProfit).toLocaleString()}
              </td>
            </tr>
            <tr>
              <td>Physical Cash in Station Safe</td>
              <td style={{ textAlign: 'right' }}>Rs. {totalSafeCash.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Total Bank Accounts Balance</td>
              <td style={{ textAlign: 'right' }}>Rs. {totalBankBalances.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Uncollected Commercial Fleet Credit (Khata)</td>
              <td style={{ textAlign: 'right', color: '#b91c1c' }}>Rs. {totalCustomerReceivables.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-signatures">
          <div>
            <div className="sig-line" />
            <span>Station Manager</span>
          </div>
          <div>
            <div className="sig-line" />
            <span>Station Owner</span>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
