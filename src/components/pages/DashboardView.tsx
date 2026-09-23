import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import {
  GasPumpIcon,
  DropletIcon,
  CashIcon,
  UsersIcon,
  FileTextIcon,
  AlertCircleIcon,
  BuildingIcon,
  ArrowRightIcon,
  PrinterIcon,
  TrendingUpIcon,
  ChevronRightIcon,
  PlusIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

export const DashboardView: React.FC = () => {
  const { activeSiteData, setActiveModule } = useApp()
  const [printModalOpen, setPrintModalOpen] = useState(false)

  const { siteInfo, tanks, fuelSales, daybook, customers, omcInvoices, expenses } = activeSiteData

  const totalFuelSalesPkr = fuelSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalFuelLiters = fuelSales.reduce((sum, s) => sum + s.netLiters, 0)
  const totalCustomerCredit = customers.reduce((sum, c) => sum + c.currentBalance, 0)
  const currentSafeCash = daybook.length > 0 ? daybook[daybook.length - 1].balanceAfter : 0
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const pendingOmcInvoice = omcInvoices.find((i) => i.paymentStatus !== 'Paid')
  const lowStockTanks = tanks.filter((t) => t.currentLiters <= t.minReserveLiters)

  // Determine status color and label for tank
  const getTankStatus = (current: number, capacity: number, minReserve: number) => {
    const pct = Math.round((current / capacity) * 100)
    if (current <= minReserve || pct < 20) {
      return { label: 'Low Reserve', statusClass: 'status-low' }
    }
    if (pct < 40) {
      return { label: 'Normal Dip', statusClass: 'status-normal' }
    }
    return { label: 'Optimal Dip', statusClass: 'status-optimal' }
  }

  return (
    <div className="dashboard-page-container">
      {/* Dynamic Operational Notice Banner if alerts exist */}
      {(lowStockTanks.length > 0 || pendingOmcInvoice) && (
        <section className="dashboard-alert-banner">
          {lowStockTanks.map((tank) => (
            <div key={tank.id} className="dash-alert-pill warning">
              <AlertCircleIcon size={15} color="#b45309" />
              <span>
                <strong>Low Dip Alert:</strong> {tank.fuelType} (Tank #{tank.tankNo}) is at {tank.currentLiters.toLocaleString()} L ({Math.round((tank.currentLiters / tank.capacityLiters) * 100)}% capacity).
              </span>
              <button type="button" className="dash-alert-link" onClick={() => setActiveModule('tank-dip')}>
                Check Dip
              </button>
            </div>
          ))}

          {pendingOmcInvoice && (
            <div className="dash-alert-pill info">
              <BuildingIcon size={15} color="#8a671d" />
              <span>
                <strong>OMC Invoice Pending:</strong> {pendingOmcInvoice.brand} invoice #{pendingOmcInvoice.invoiceNo} has Rs. {(pendingOmcInvoice.totalAmount - pendingOmcInvoice.paidAmount).toLocaleString()} payable.
              </span>
              <button type="button" className="dash-alert-link" onClick={() => setActiveModule('omc-ledger')}>
                View Ledger
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. Four Executive Summary Cards */}
      <section className="dashboard-summary-grid">
        {/* Card 1: Total Fuel Sales */}
        <div
          className="summary-card"
          onClick={() => setActiveModule('fuel-sales')}
          role="button"
          tabIndex={0}
        >
          <div className="summary-card-inner">
            <div className="summary-icon-box sales">
              <GasPumpIcon size={20} />
            </div>

            <div className="summary-card-content">
              <div className="summary-card-header">
                <span className="summary-title">Total Fuel Sales</span>
                <ChevronRightIcon size={15} className="summary-arrow" />
              </div>

              <div className="summary-primary-value">
                Rs. {Math.round(totalFuelSalesPkr).toLocaleString()}
              </div>

              <div className="summary-footer-meta">
                <span className="summary-sub-text">{totalFuelLiters.toLocaleString()} Liters Dispensed</span>
                <span className="summary-trend-pill">
                  <TrendingUpIcon size={11} /> 12% <span className="trend-lbl">vs. last shift</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Cash in Safe */}
        <div
          className="summary-card"
          onClick={() => setActiveModule('daybook')}
          role="button"
          tabIndex={0}
        >
          <div className="summary-card-inner">
            <div className="summary-icon-box safe">
              <CashIcon size={20} />
            </div>

            <div className="summary-card-content">
              <div className="summary-card-header">
                <span className="summary-title">Cash in Safe (Register)</span>
                <ChevronRightIcon size={15} className="summary-arrow" />
              </div>

              <div className="summary-primary-value">
                Rs. {currentSafeCash.toLocaleString()}
              </div>

              <div className="summary-footer-meta">
                <span className="summary-sub-text">Current Station Closing Balance</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Customer Credit */}
        <div
          className="summary-card"
          onClick={() => setActiveModule('customers')}
          role="button"
          tabIndex={0}
        >
          <div className="summary-card-inner">
            <div className="summary-icon-box credit">
              <UsersIcon size={20} />
            </div>

            <div className="summary-card-content">
              <div className="summary-card-header">
                <span className="summary-title">Customer Credit Balance</span>
                <ChevronRightIcon size={15} className="summary-arrow" />
              </div>

              <div className="summary-primary-value">
                Rs. {totalCustomerCredit.toLocaleString()}
              </div>

              <div className="summary-footer-meta">
                <span className="summary-sub-text">Pending Receivables from Fleet Accounts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Daily Expenses */}
        <div
          className="summary-card"
          onClick={() => setActiveModule('expenses')}
          role="button"
          tabIndex={0}
        >
          <div className="summary-card-inner">
            <div className="summary-icon-box expense">
              <FileTextIcon size={20} />
            </div>

            <div className="summary-card-content">
              <div className="summary-card-header">
                <span className="summary-title">Daily Station Expenses</span>
                <ChevronRightIcon size={15} className="summary-arrow" />
              </div>

              <div className="summary-primary-value">
                Rs. {totalExpenses.toLocaleString()}
              </div>

              <div className="summary-footer-meta">
                <span className="summary-sub-text">{expenses.length} Approved Vouchers</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Operational Underground Tanks Storage Section */}
      <section className="dashboard-tanks-section">
        <div className="tanks-section-header">
          <div className="tanks-header-left">
            <div className="tanks-header-icon-box">
              <DropletIcon size={18} />
            </div>
            <div>
              <h2 className="tanks-section-title">Underground Tanks Storage</h2>
              <p className="tanks-section-subtitle">
                Real-time tank calibrations, dip readings in mm, and remaining capacity
              </p>
            </div>
          </div>

          <div className="tanks-header-right">
            <button
              type="button"
              className="btn-view-all-tanks"
              onClick={() => setActiveModule('tank-dip')}
            >
              <span>View All Tanks</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>

        {/* Horizontal Tank Cards Grid */}
        <div className="tanks-cards-grid">
          {tanks.map((tank) => {
            const fillPct = Math.min(100, Math.round((tank.currentLiters / tank.capacityLiters) * 100))
            const { label, statusClass } = getTankStatus(tank.currentLiters, tank.capacityLiters, tank.minReserveLiters)

            // Fuel color theme
            const fuelThemeClass =
              tank.fuelType.includes('Diesel') || tank.fuelType.includes('HSD')
                ? 'fuel-hsd'
                : tank.fuelType.includes('Super') || tank.fuelType.includes('PMG')
                ? 'fuel-pmg'
                : 'fuel-octane'

            return (
              <div key={tank.id} className={`tank-item-card ${fuelThemeClass} ${statusClass}`}>
                {/* Top Row: Tank ID, Fuel Name, Status Badge */}
                <div className="tank-card-top-row">
                  <div className="tank-title-group">
                    <div className="tank-icon-bubble">
                      <DropletIcon size={16} />
                    </div>
                    <div className="tank-labels">
                      <span className="tank-seq-tag">Tank #{tank.tankNo}</span>
                      <h3 className="tank-product-name">{tank.fuelType}</h3>
                    </div>
                  </div>

                  <span className={`tank-status-pill ${statusClass}`}>{label}</span>
                </div>

                {/* Progress Bar Track */}
                <div className="tank-progress-wrapper">
                  <div className="tank-progress-track">
                    <div
                      className={`tank-progress-bar ${fuelThemeClass}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                {/* 2x2 Key Tank Metrics Grid */}
                <div className="tank-stats-2x2">
                  <div className="tank-metric-item">
                    <span className="metric-label">Current Stock</span>
                    <strong className="metric-value">{tank.currentLiters.toLocaleString()} L</strong>
                  </div>

                  <div className="tank-metric-item">
                    <span className="metric-label">Dip Measurement</span>
                    <strong className="metric-value">{tank.currentDipMm} mm</strong>
                  </div>

                  <div className="tank-metric-item">
                    <span className="metric-label">Tank Capacity</span>
                    <strong className="metric-value">{tank.capacityLiters.toLocaleString()} L</strong>
                  </div>

                  <div className="tank-metric-item">
                    <span className="metric-label">Fill Level</span>
                    <strong className="metric-value">{fillPct}%</strong>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Quick Action Shortcuts Floating Strip */}
      <section className="dashboard-quick-actions-bar">
        <span className="quick-actions-title">Quick Actions</span>
        <div className="quick-actions-list">
          <button
            type="button"
            className="btn-quick-action"
            onClick={() => setActiveModule('fuel-sales')}
          >
            <PlusIcon size={14} /> Add Nozzle Reading
          </button>
          <button
            type="button"
            className="btn-quick-action"
            onClick={() => setActiveModule('tank-dip')}
          >
            <DropletIcon size={14} /> Log Tank Dip
          </button>
          <button
            type="button"
            className="btn-quick-action"
            onClick={() => setActiveModule('daybook')}
          >
            <CashIcon size={14} /> Record Daybook Cash
          </button>
          <button
            type="button"
            className="btn-quick-action"
            onClick={() => setPrintModalOpen(true)}
          >
            <PrinterIcon size={14} /> Print Daily Sales Slip
          </button>
        </div>
      </section>

      {/* Print Slip Modal */}
      <PrintReceiptModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Daily Fuel Sales Summary Slip"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-meta-grid">
          <div>
            <strong>Report:</strong> Daily Fuel Sales
          </div>
          <div>
            <strong>Date:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <div>
            <strong>Manager:</strong> {siteInfo.managerName}
          </div>
          <div>
            <strong>Station Status:</strong> Online & Active
          </div>
        </div>

        <div className="receipt-divider" />

        <table className="slip-table">
          <thead>
            <tr>
              <th>Dispenser/Nozzle</th>
              <th>Fuel</th>
              <th>Liters</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {fuelSales.map((s) => (
              <tr key={s.id}>
                <td>D{s.dispenserNo}-N{s.nozzleNo}</td>
                <td>{s.fuelType}</td>
                <td>{s.netLiters.toLocaleString()} L</td>
                <td>Rs {s.totalAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />

        <div className="slip-summary-list">
          <div className="slip-row highlight">
            <span>Total Fuel Revenue:</span>
            <strong>Rs {totalFuelSalesPkr.toLocaleString()}</strong>
          </div>
          <div className="slip-row">
            <span>Total Volume Dispensed:</span>
            <strong>{totalFuelLiters.toLocaleString()} Liters</strong>
          </div>
          <div className="slip-row">
            <span>Safe Cash Closing:</span>
            <strong>Rs {currentSafeCash.toLocaleString()}</strong>
          </div>
          <div className="slip-row">
            <span>Customer Credit Balance:</span>
            <span>Rs {totalCustomerCredit.toLocaleString()}</span>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
