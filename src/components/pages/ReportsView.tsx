import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon, FileTextIcon, CheckCircleIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

export const ReportsView: React.FC = () => {
  const { activeSiteData } = useApp()
  const { fuelSales, lubricants, tanks, tankDips, customers, expenses, siteInfo } = activeSiteData

  const [activeReportTab, setActiveReportTab] = useState<'daily' | 'nozzles' | 'dip-audit' | 'profit'>('daily')
  const [printOpen, setPrintOpen] = useState(false)
  const [exportNotice, setExportNotice] = useState(false)

  // Calculations
  const totalFuelRevenue = fuelSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalFuelLiters = fuelSales.reduce((sum, s) => sum + s.netLiters, 0)
  const totalLubeRevenue = lubricants.reduce((sum, l) => sum + l.salePrice * 4, 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalCustomerReceivables = customers.reduce((sum, c) => sum + c.currentBalance, 0)

  // Estimated gross fuel margin (e.g. Rs 8.50 per liter dealer commission in Pakistan)
  const estimatedDealerMargin = totalFuelLiters * 8.64
  const estimatedLubeMargin = totalLubeRevenue * 0.18
  const grossProfit = estimatedDealerMargin + estimatedLubeMargin
  const netEstimatedProfit = grossProfit - totalExpenses

  const handleExportCSV = () => {
    let csvRows: string[] = []

    if (activeReportTab === 'daily') {
      csvRows = [
        'Component,Quantity,Turnover_PKR,Notes',
        `PMG Super,${fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.netLiters, 0)} L,${Math.round(fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.totalAmount, 0))},Retail customer vehicles`,
        `HSD Diesel,${fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.netLiters, 0)} L,${Math.round(fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.totalAmount, 0))},Commercial fleet and machinery`,
        `Hi-Octane,${fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.netLiters, 0)} L,${Math.round(fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.totalAmount, 0))},High compression engines`,
        `Lubricants,Various Packs,${totalLubeRevenue},Retail engine oils & grease`,
        `Total Operating Expenses,-,-${totalExpenses},Station operations & utilities`,
        `Net Estimated Profit,-,${Math.round(netEstimatedProfit)},Gross commission minus operational expenses`,
      ]
    } else if (activeReportTab === 'nozzles') {
      csvRows = [
        'Dispenser,Nozzle,Fuel_Type,Opening_Meter,Closing_Meter,Testing_Liters,Net_Liters,Rate_PKR,Total_Amount_PKR,Cashier',
        ...fuelSales.map(
          (s) =>
            `Dispenser ${s.dispenserNo},Nozzle ${s.nozzleNo},"${s.fuelType}",${s.openingMeter},${s.closingMeter},${s.testingLiters},${s.netLiters},${s.ratePerLiter},${s.totalAmount},"${s.cashierName}"`
        ),
      ]
    } else if (activeReportTab === 'dip-audit') {
      csvRows = [
        'Date,Tank_ID,Fuel_Type,Morning_Dip_mm,Closing_Dip_mm,Physical_Liters,Book_Liters,Variance_Liters,Water_Dip_mm,Inspector',
        ...tankDips.map(
          (d) =>
            `${d.date},${d.tankId},"${d.fuelType}",${d.morningDipMm},${d.closingDipMm},${d.closingPhysicalLiters},${d.bookStockLiters},${d.varianceLiters},${d.waterDipMm},"${d.inspector}"`
        ),
      ]
    } else {
      csvRows = [
        'Profit_Center,Basis_Quantity,Margin_Rate_PKR,Gross_Margin_PKR',
        `PMG Super Dealer Margin,${fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.netLiters, 0)} L,8.64,${Math.round(fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.netLiters, 0) * 8.64)}`,
        `HSD Diesel Dealer Margin,${fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.netLiters, 0)} L,8.64,${Math.round(fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.netLiters, 0) * 8.64)}`,
        `Hi-Octane Dealer Margin,${fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.netLiters, 0)} L,8.64,${Math.round(fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.netLiters, 0) * 8.64)}`,
        `Lubricants Gross Margin,Rs ${totalLubeRevenue},18%,${Math.round(estimatedLubeMargin)}`,
        `Operating Expenses Deduction,-,-,${-totalExpenses}`,
        `Net Estimated Station Profit,-,-,${Math.round(netEstimatedProfit)}`,
      ]
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mashaal-report-${activeReportTab}-${siteInfo.code.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setExportNotice(true)
    setTimeout(() => setExportNotice(false), 3500)
  }

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">EXECUTIVE AUDIT & ANALYTICS</span>
          <h2 className="page-heading">Station Reports & Intelligence</h2>
          <p className="page-sub">
            Daily consolidated audits, nozzle performance, tank dip loss/gain, and dealer commission profit analysis
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExportCSV}>
            <FileTextIcon size={16} />
            <span>Export CSV / Excel</span>
          </button>
          <button className="btn btn-primary" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Current Report</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="alert-ribbon-success">
          <CheckCircleIcon size={18} color="#27ae60" />
          <span>Report successfully formatted and exported for Excel analysis.</span>
        </div>
      )}

      {/* Report Switcher Tabs */}
      <div className="report-tab-strip">
        <button
          className={`report-tab-btn ${activeReportTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('daily')}
        >
          Daily Consolidated Audit
        </button>
        <button
          className={`report-tab-btn ${activeReportTab === 'nozzles' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('nozzles')}
        >
          Nozzle-wise Breakdown
        </button>
        <button
          className={`report-tab-btn ${activeReportTab === 'dip-audit' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('dip-audit')}
        >
          Tank Dip Variance (Loss / Gain)
        </button>
        <button
          className={`report-tab-btn ${activeReportTab === 'profit' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('profit')}
        >
          Dealer Profit & Margin Analysis
        </button>
      </div>

      {/* Report 1: Daily Consolidated */}
      {activeReportTab === 'daily' && (
        <div className="table-surface">
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading">Daily Consolidated Station Report</h3>
              <p className="surface-sub">Comprehensive overview of all revenue, outflows, and credit</p>
            </div>
          </div>

          <div className="executive-kpi-strip">
            <div className="kpi-cell">
              <span className="kpi-label">Gross Fuel Sales</span>
              <strong className="kpi-cell-value text-gold">Rs {Math.round(totalFuelRevenue).toLocaleString()}</strong>
              <span className="kpi-cell-sub">{totalFuelLiters.toLocaleString()} L dispensed</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Lubricant Sales</span>
              <strong className="kpi-cell-value">Rs {totalLubeRevenue.toLocaleString()}</strong>
              <span className="kpi-cell-sub">Counter retail sales</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Total Station Expenses</span>
              <strong className="kpi-cell-value text-red">Rs {totalExpenses.toLocaleString()}</strong>
              <span className="kpi-cell-sub">{expenses.length} operating vouchers</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Customer Receivables</span>
              <strong className="kpi-cell-value">Rs {totalCustomerReceivables.toLocaleString()}</strong>
              <span className="kpi-cell-sub">Active fleet credit</span>
            </div>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Quantity / Count</th>
                  <th>Total Turnover (PKR)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Motor Gasoline (PMG Super 92)</strong></td>
                  <td>{fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.netLiters, 0).toLocaleString()} L</td>
                  <td className="text-gold font-bold">Rs {Math.round(fuelSales.filter((s) => s.fuelType === 'PMG Super').reduce((a, b) => a + b.totalAmount, 0)).toLocaleString()}</td>
                  <td>Retail customer vehicles</td>
                </tr>
                <tr>
                  <td><strong>High Speed Diesel (HSD)</strong></td>
                  <td>{fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.netLiters, 0).toLocaleString()} L</td>
                  <td className="text-gold font-bold">Rs {Math.round(fuelSales.filter((s) => s.fuelType === 'HSD Diesel').reduce((a, b) => a + b.totalAmount, 0)).toLocaleString()}</td>
                  <td>Commercial trucks, tractors, buses</td>
                </tr>
                <tr>
                  <td><strong>Altron / Hi-Octane</strong></td>
                  <td>{fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.netLiters, 0).toLocaleString()} L</td>
                  <td className="text-gold font-bold">Rs {Math.round(fuelSales.filter((s) => s.fuelType === 'Hi-Octane').reduce((a, b) => a + b.totalAmount, 0)).toLocaleString()}</td>
                  <td>Luxury cars & sports sedans</td>
                </tr>
                <tr>
                  <td><strong>Motor Oils & Lubricants</strong></td>
                  <td>Various Packs</td>
                  <td className="text-green font-bold">Rs {totalLubeRevenue.toLocaleString()}</td>
                  <td>Quartz & Carient oil packs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Nozzle Breakdown */}
      {activeReportTab === 'nozzles' && (
        <div className="table-surface">
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading">Nozzle-wise Dispenser Performance</h3>
              <p className="surface-sub">Liters dispensed and total collected per individual nozzle</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Dispenser / Nozzle</th>
                  <th>Fuel Product</th>
                  <th>Opening</th>
                  <th>Closing</th>
                  <th>Testing (L)</th>
                  <th>Net Liters</th>
                  <th>Revenue (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {fuelSales.map((s) => (
                  <tr key={s.id}>
                    <td><strong>D{s.dispenserNo}-N{s.nozzleNo}</strong></td>
                    <td><span className="fuel-pill">{s.fuelType}</span></td>
                    <td>{s.openingMeter.toLocaleString()}</td>
                    <td>{s.closingMeter.toLocaleString()}</td>
                    <td>{s.testingLiters} L</td>
                    <td><strong>{s.netLiters.toLocaleString()} L</strong></td>
                    <td className="text-gold font-bold">Rs {Math.round(s.totalAmount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Tank Dip Audit */}
      {activeReportTab === 'dip-audit' && (
        <div className="table-surface">
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading">Tank Dip Loss & Gain Audit</h3>
              <p className="surface-sub">Physical dip stick verification vs calculated theoretical book stock</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Tank #</th>
                  <th>Fuel</th>
                  <th>Capacity</th>
                  <th>Morning Liters</th>
                  <th>Decanted (+)</th>
                  <th>Sales (-)</th>
                  <th>Theoretical Book</th>
                  <th>Actual Physical Dip</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {tankDips.map((d) => (
                  <tr key={d.id}>
                    <td><strong>Tank #{d.tankNo}</strong></td>
                    <td><span className="fuel-pill">{d.fuelType}</span></td>
                    <td>{tanks.find((t) => t.id === d.tankId)?.capacityLiters.toLocaleString()} L</td>
                    <td>{d.morningLiters.toLocaleString()} L</td>
                    <td>{d.decantedLiters > 0 ? `+${d.decantedLiters.toLocaleString()} L` : '0 L'}</td>
                    <td>-{d.dispensedLiters.toLocaleString()} L</td>
                    <td>{d.bookStockLiters.toLocaleString()} L</td>
                    <td><strong>{d.closingPhysicalLiters.toLocaleString()} L ({d.closingDipMm} mm)</strong></td>
                    <td>
                      {d.varianceLiters < 0 ? (
                        <span className="badge badge-danger">Loss: {Math.abs(d.varianceLiters)} L</span>
                      ) : (
                        <span className="badge badge-neutral">0 L (Balanced)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 4: Dealer Profit & Margin */}
      {activeReportTab === 'profit' && (
        <div className="table-surface">
          <div className="table-surface-header">
            <div>
              <h3 className="surface-heading">Estimated Dealer Margin & Net Profitability</h3>
              <p className="surface-sub">Calculation of authorized dealer commission minus daily operational overheads</p>
            </div>
          </div>

          <div className="executive-kpi-strip">
            <div className="kpi-cell">
              <span className="kpi-label">Gross Fuel Dealer Commission</span>
              <strong className="kpi-cell-value text-gold">Rs {Math.round(estimatedDealerMargin).toLocaleString()}</strong>
              <span className="kpi-cell-sub">Avg Rs 8.64/L margin on {totalFuelLiters.toLocaleString()} L</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Lubricants Retail Margin</span>
              <strong className="kpi-cell-value text-green">Rs {Math.round(estimatedLubeMargin).toLocaleString()}</strong>
              <span className="kpi-cell-sub">18% profit on lube counter sales</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Operational Overheads</span>
              <strong className="kpi-cell-value text-red">- Rs {totalExpenses.toLocaleString()}</strong>
              <span className="kpi-cell-sub">WAPDA, generator, staff meals</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Net Estimated Station Profit</span>
              <strong className="kpi-cell-value text-green font-bold">
                Rs {Math.round(netEstimatedProfit).toLocaleString()}
              </strong>
              <span className="kpi-cell-sub">Estimated net daily earnings</span>
            </div>
          </div>
        </div>
      )}

      {/* Print Slip */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Official Station Management Report"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-meta-grid">
          <div><strong>Report:</strong> {activeReportTab.toUpperCase()}</div>
          <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
          <div><strong>Manager:</strong> {siteInfo.managerName}</div>
          <div><strong>Station:</strong> {siteInfo.code}</div>
        </div>

        <div className="receipt-divider" />
        <div className="slip-summary-list">
          <div className="slip-row">
            <span>Total Fuel Revenue:</span>
            <strong>Rs {Math.round(totalFuelRevenue).toLocaleString()}</strong>
          </div>
          <div className="slip-row">
            <span>Total Fuel Liters Dispensed:</span>
            <span>{totalFuelLiters.toLocaleString()} Liters</span>
          </div>
          <div className="slip-row">
            <span>Lubricants Revenue:</span>
            <span>Rs {totalLubeRevenue.toLocaleString()}</span>
          </div>
          <div className="slip-row">
            <span>Operational Expenses:</span>
            <span className="text-red">- Rs {totalExpenses.toLocaleString()}</span>
          </div>
          <div className="receipt-divider" />
          <div className="slip-row highlight">
            <span>Net Estimated Profit:</span>
            <strong className="text-gold">Rs {Math.round(netEstimatedProfit).toLocaleString()}</strong>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
