import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { isLowTank, safeCash } from '../../data/derive'
import { addDays, formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import {
  GasPumpIcon, DropletIcon, CashIcon, UsersIcon, FileTextIcon, AlertCircleIcon, BuildingIcon, ArrowRightIcon, PrinterIcon,
  TrendingUpIcon, ChevronRightIcon, PlusIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

export const DashboardView: React.FC = () => {
  const { activeSiteData, setActiveModule, currentUser } = useApp()
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const isManager = currentUser?.role !== 'cashier'

  const { siteInfo, tanks, fuelSales, customers, omcInvoices, expenses, settings } = activeSiteData
  const dayLabel = date === todayISO() ? 'Today' : formatDate(date)

  const day = useMemo(() => {
    const sales = fuelSales.filter((s) => s.date === date)
    const prev = fuelSales.filter((s) => s.date === addDays(date, -1))
    return {
      sales,
      amount: sales.reduce((s, x) => s + x.totalAmount, 0),
      liters: sales.reduce((s, x) => s + x.netLiters, 0),
      prevAmount: prev.reduce((s, x) => s + x.totalAmount, 0),
      expenses: expenses.filter((e) => e.date === date),
    }
  }, [fuelSales, expenses, date])

  const totalCustomerCredit = customers.filter((c) => c.status !== 'Archived').reduce((s, c) => s + Math.max(0, c.currentBalance), 0)
  const currentSafeCash = safeCash(activeSiteData)
  const dayExpenses = day.expenses.reduce((s, e) => s + e.amount, 0)
  const pendingOmc = omcInvoices.find((i) => i.paymentStatus !== 'Paid')
  const lowStockTanks = tanks.filter((t) => isLowTank(t, settings.lowStockAlertPct))
  const trend = day.prevAmount > 0 ? Math.round(((day.amount - day.prevAmount) / day.prevAmount) * 100) : null

  const tankStatus = (current: number, capacity: number, minReserve: number) => {
    const pct = Math.round((current / capacity) * 100)
    if (current <= minReserve || pct < settings.lowStockAlertPct) return { label: 'Low reserve', statusClass: 'status-low' }
    if (pct < 40) return { label: 'Normal dip', statusClass: 'status-normal' }
    return { label: 'Optimal dip', statusClass: 'status-optimal' }
  }

  return (
    <div className="dashboard-page-container">
      {(lowStockTanks.length > 0 || pendingOmc) && (
        <section className="dashboard-alert-banner">
          {lowStockTanks.map((tank) => (
            <div key={tank.id} className="dash-alert-pill warning">
              <AlertCircleIcon size={15} color="#b45309" />
              <span><strong>Low dip alert:</strong> {tank.fuelType} (Tank #{tank.tankNo}) is at {tank.currentLiters.toLocaleString()} L ({Math.round((tank.currentLiters / tank.capacityLiters) * 100)}% of capacity).</span>
              <button type="button" className="dash-alert-link" onClick={() => setActiveModule('tank-dip')}>Check dip</button>
            </div>
          ))}
          {isManager && pendingOmc && (
            <div className="dash-alert-pill info">
              <BuildingIcon size={15} color="#8a671d" />
              <span><strong>OMC invoice pending:</strong> {pendingOmc.brand} invoice #{pendingOmc.invoiceNo} has {rs(pendingOmc.totalAmount - pendingOmc.paidAmount)} payable.</span>
              <button type="button" className="dash-alert-link" onClick={() => setActiveModule('omc-ledger')}>View ledger</button>
            </div>
          )}
        </section>
      )}

      <div className="ui-filter-bar" style={{ margin: '0 0 14px' }}>
        <div className="form-group">
          <label className="form-label">Sales & expenses for</label>
          <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setDate(todayISO())}>Today</button>
      </div>

      <section className="dashboard-summary-grid">
        <div className="summary-card" onClick={() => setActiveModule('fuel-sales')} role="button" tabIndex={0}>
          <div className="summary-card-inner">
            <div className="summary-icon-box sales"><GasPumpIcon size={20} /></div>
            <div className="summary-card-content">
              <div className="summary-card-header"><span className="summary-title">Fuel sales — {dayLabel}</span><ChevronRightIcon size={15} className="summary-arrow" /></div>
              <div className="summary-primary-value">{rs(day.amount)}</div>
              <div className="summary-footer-meta">
                <span className="summary-sub-text">{day.liters.toLocaleString()} liters dispensed</span>
                {trend !== null && (
                  <span className="summary-trend-pill"><TrendingUpIcon size={11} /> {trend > 0 ? '+' : ''}{trend}% <span className="trend-lbl">vs previous day</span></span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="summary-card" onClick={() => setActiveModule('daybook')} role="button" tabIndex={0}>
          <div className="summary-card-inner">
            <div className="summary-icon-box safe"><CashIcon size={20} /></div>
            <div className="summary-card-content">
              <div className="summary-card-header"><span className="summary-title">Cash in safe (register)</span><ChevronRightIcon size={15} className="summary-arrow" /></div>
              <div className="summary-primary-value">{rs(currentSafeCash)}</div>
              <div className="summary-footer-meta"><span className="summary-sub-text">Current station closing balance</span></div>
            </div>
          </div>
        </div>

        <div className="summary-card" onClick={() => setActiveModule('customers')} role="button" tabIndex={0}>
          <div className="summary-card-inner">
            <div className="summary-icon-box credit"><UsersIcon size={20} /></div>
            <div className="summary-card-content">
              <div className="summary-card-header"><span className="summary-title">Customer credit balance</span><ChevronRightIcon size={15} className="summary-arrow" /></div>
              <div className="summary-primary-value">{rs(totalCustomerCredit)}</div>
              <div className="summary-footer-meta"><span className="summary-sub-text">Receivables from fleet accounts</span></div>
            </div>
          </div>
        </div>

        <div className="summary-card" onClick={() => setActiveModule('expenses')} role="button" tabIndex={0}>
          <div className="summary-card-inner">
            <div className="summary-icon-box expense"><FileTextIcon size={20} /></div>
            <div className="summary-card-content">
              <div className="summary-card-header"><span className="summary-title">Station expenses — {dayLabel}</span><ChevronRightIcon size={15} className="summary-arrow" /></div>
              <div className="summary-primary-value">{rs(dayExpenses)}</div>
              <div className="summary-footer-meta"><span className="summary-sub-text">{day.expenses.length} voucher(s)</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-tanks-section">
        <div className="tanks-section-header">
          <div className="tanks-header-left">
            <div className="tanks-header-icon-box"><DropletIcon size={18} /></div>
            <div>
              <h2 className="tanks-section-title">Underground Tanks Storage</h2>
              <p className="tanks-section-subtitle">Latest measured stock, dip readings in mm, and remaining capacity</p>
            </div>
          </div>
          <div className="tanks-header-right">
            <button type="button" className="btn-view-all-tanks" onClick={() => setActiveModule('tank-dip')}><span>View all tanks</span><ArrowRightIcon size={14} /></button>
          </div>
        </div>

        {tanks.length === 0 ? (
          <div className="ui-empty">No tanks are set up yet. A manager can add them in Tank Dip & Stock.</div>
        ) : (
          <div className="tanks-cards-grid">
            {tanks.map((tank) => {
              const fillPct = Math.max(0, Math.min(100, Math.round((tank.currentLiters / tank.capacityLiters) * 100)))
              const { label, statusClass } = tankStatus(tank.currentLiters, tank.capacityLiters, tank.minReserveLiters)
              const theme = tank.fuelType === 'HSD Diesel' ? 'fuel-hsd' : tank.fuelType === 'PMG Super' ? 'fuel-pmg' : 'fuel-octane'
              return (
                <div key={tank.id} className={`tank-item-card ${theme} ${statusClass}`}>
                  <div className="tank-card-top-row">
                    <div className="tank-title-group">
                      <div className="tank-icon-bubble"><DropletIcon size={16} /></div>
                      <div className="tank-labels"><span className="tank-seq-tag">Tank #{tank.tankNo}</span><h3 className="tank-product-name">{tank.fuelType}</h3></div>
                    </div>
                    <span className={`tank-status-pill ${statusClass}`}>{label}</span>
                  </div>
                  <div className="tank-progress-wrapper"><div className="tank-progress-track"><div className={`tank-progress-bar ${theme}`} style={{ width: `${fillPct}%` }} /></div></div>
                  <div className="tank-stats-2x2">
                    <div className="tank-metric-item"><span className="metric-label">Measured stock</span><strong className="metric-value">{tank.currentLiters.toLocaleString()} L</strong></div>
                    <div className="tank-metric-item"><span className="metric-label">Dip measurement</span><strong className="metric-value">{tank.currentDipMm} mm</strong></div>
                    <div className="tank-metric-item"><span className="metric-label">Tank capacity</span><strong className="metric-value">{tank.capacityLiters.toLocaleString()} L</strong></div>
                    <div className="tank-metric-item"><span className="metric-label">Fill level</span><strong className="metric-value">{fillPct}%</strong></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="dashboard-quick-actions-bar">
        <span className="quick-actions-title">Quick actions</span>
        <div className="quick-actions-list">
          <button type="button" className="btn-quick-action" onClick={() => setActiveModule('fuel-sales')}><PlusIcon size={14} /> Add nozzle reading</button>
          <button type="button" className="btn-quick-action" onClick={() => setActiveModule('tank-dip')}><DropletIcon size={14} /> Log tank dip</button>
          <button type="button" className="btn-quick-action" onClick={() => setActiveModule('daybook')}><CashIcon size={14} /> Record daybook cash</button>
          <button type="button" className="btn-quick-action" onClick={() => setPrintModalOpen(true)}><PrinterIcon size={14} /> Print daily sales slip</button>
        </div>
      </section>

      <PrintReceiptModal isOpen={printModalOpen} onClose={() => setPrintModalOpen(false)} title="Daily Fuel Sales Summary Slip" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid">
          <div><strong>Report:</strong> Daily fuel sales</div>
          <div><strong>Date:</strong> {formatDate(date)}</div>
          <div><strong>Prepared by:</strong> {currentUser?.name}</div>
          <div><strong>Station:</strong> {siteInfo.code}</div>
        </div>
        <div className="receipt-divider" />
        <table className="slip-table">
          <thead><tr><th>Nozzle</th><th>Shift</th><th>Fuel</th><th>Liters</th><th>Amount</th></tr></thead>
          <tbody>{day.sales.map((s) => <tr key={s.id}><td>D{s.dispenserNo}-N{s.nozzleNo}</td><td>{s.shiftName}</td><td>{s.fuelType}</td><td>{s.netLiters.toLocaleString()} L</td><td>{rs(s.totalAmount)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-summary-list">
          <div className="slip-row highlight"><span>Total fuel revenue:</span><strong>{rs(day.amount)}</strong></div>
          <div className="slip-row"><span>Total volume dispensed:</span><strong>{day.liters.toLocaleString()} liters</strong></div>
          <div className="slip-row"><span>Safe cash closing:</span><strong>{rs(currentSafeCash)}</strong></div>
          <div className="slip-row"><span>Customer credit balance:</span><span>{rs(totalCustomerCredit)}</span></div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
