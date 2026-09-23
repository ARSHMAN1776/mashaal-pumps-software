import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { GasPumpIcon, PlusIcon, PrinterIcon, CheckCircleIcon, XIcon, WhatsAppIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import type { FuelType } from '../../types'

export const FuelSalesView: React.FC = () => {
  const { activeSiteData, addFuelSale } = useApp()
  const { nozzles, fuelSales, settings, siteInfo } = activeSiteData

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [selectedNozzleId, setSelectedNozzleId] = useState(nozzles[0]?.id || '')
  const [openingMeter, setOpeningMeter] = useState<number>(0)
  const [closingMeter, setClosingMeter] = useState<number>(0)
  const [testingLiters, setTestingLiters] = useState<number>(10)
  const [cashierName, setCashierName] = useState('Zahid Khan')

  const selectedNozzle = nozzles.find((n) => n.id === selectedNozzleId) || nozzles[0]
  const fuelRate = settings.rates[selectedNozzle?.fuelType as FuelType] || 276.45

  const netLiters = Math.max(0, (closingMeter > openingMeter ? closingMeter - openingMeter : 0) - testingLiters)
  const totalAmount = netLiters * fuelRate

  const handleOpenAddModal = (nozzleId?: string) => {
    const targetNozzle = nozzles.find((n) => n.id === (nozzleId || nozzles[0]?.id)) || nozzles[0]
    setSelectedNozzleId(targetNozzle.id)
    setOpeningMeter(targetNozzle.openingMeter)
    setClosingMeter(targetNozzle.closingMeter)
    setTestingLiters(targetNozzle.testingLiters || 10)
    setCashierName(targetNozzle.assignedStaff || 'Zahid Khan')
    setModalOpen(true)
  }

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault()
    if (closingMeter <= openingMeter) {
      alert('Closing meter must be greater than opening meter.')
      return
    }

    addFuelSale({
      date: new Date().toISOString().split('T')[0],
      shiftId: 'SH-01',
      nozzleId: selectedNozzle.id,
      dispenserNo: selectedNozzle.dispenserNo,
      nozzleNo: selectedNozzle.nozzleNo,
      fuelType: selectedNozzle.fuelType,
      openingMeter,
      closingMeter,
      testingLiters,
      netLiters,
      ratePerLiter: fuelRate,
      totalAmount,
      cashierName,
    })

    setModalOpen(false)
  }

  const totalSoldLiters = fuelSales.reduce((sum, s) => sum + s.netLiters, 0)
  const totalFuelAmount = fuelSales.reduce((sum, s) => sum + s.totalAmount, 0)

  const handleSendWhatsAppSummary = () => {
    const isParco = siteInfo.brand === 'TOTAL PARCO'
    const todayStr = new Date().toISOString().split('T')[0]

    let message = ''
    if (isParco) {
      message = [
        `🔴 *TOTAL PARCO - FORECOURT DISPENSER SALES* 🔴`,
        `⛽ *DAILY SALES & NOZZLE METER SUMMARY*`,
        `══════════════════════════`,
        `🏢 *Station:* ${siteInfo.name}`,
        `📍 *Location:* ${siteInfo.location}`,
        `📅 *Date:* ${todayStr}`,
        `══════════════════════════`,
        `⛽ *DISPENSER NOZZLE BREAKDOWN*`,
        ...fuelSales.map((s) => `🔹 D${s.dispenserNo}-N${s.nozzleNo} (${s.fuelType}): ${s.netLiters.toLocaleString()} L • Rs. ${Math.round(s.totalAmount).toLocaleString()}`),
        `══════════════════════════`,
        `📊 *SHIFT TOTALS*`,
        `🔹 *Total Fuel Dispensed:* ${totalSoldLiters.toLocaleString()} Liters`,
        `💰 *GROSS FUEL REVENUE:* Rs. ${Math.round(totalFuelAmount).toLocaleString()} PKR`,
        `══════════════════════════`,
        `✍️ *Recorded By:* ${siteInfo.managerName || 'Shift Incharge'}`,
        `🔐 *System Verification:* TP-NOZZLE-${todayStr}-VERIFIED`,
        `✅ *Total Parco Pakistan • Energy for a Brighter Tomorrow*`
      ].join('\n')
    } else {
      message = [
        `🟢 *PAKISTAN STATE OIL (PSO) - FORECOURT SALES* 🟢`,
        `⛽ *DAILY SALES & NOZZLE METER SUMMARY*`,
        `══════════════════════════`,
        `🏢 *Station:* ${siteInfo.name}`,
        `📍 *Location:* ${siteInfo.location}`,
        `📅 *Date:* ${todayStr}`,
        `══════════════════════════`,
        `⛽ *DISPENSER NOZZLE BREAKDOWN*`,
        ...fuelSales.map((s) => `🔹 D${s.dispenserNo}-N${s.nozzleNo} (${s.fuelType}): ${s.netLiters.toLocaleString()} L • Rs. ${Math.round(s.totalAmount).toLocaleString()}`),
        `══════════════════════════`,
        `📊 *SHIFT TOTALS*`,
        `🔹 *Total Fuel Dispensed:* ${totalSoldLiters.toLocaleString()} Liters`,
        `💰 *GROSS FUEL REVENUE:* Rs. ${Math.round(totalFuelAmount).toLocaleString()} PKR`,
        `══════════════════════════`,
        `✍️ *Recorded By:* ${siteInfo.managerName || 'Shift Incharge'}`,
        `🔐 *System Verification:* PSO-NOZZLE-${todayStr}-VERIFIED`,
        `✅ *Pakistan State Oil (PSO) • Fueling the Nation's Journey*`
      ].join('\n')
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="page-content-wrapper">
      {/* Page Header */}
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">DAILY DISPENSER LOG</span>
          <h2 className="page-heading">Fuel Sales & Nozzle Readings</h2>
          <p className="page-sub">
            Opening and closing meter readings, testing deduction, and net fuel revenue
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: '#15803d', borderColor: '#86efac', backgroundColor: '#f0fdf4' }}
            onClick={handleSendWhatsAppSummary}
            title="Dispatch shift dispenser summary via WhatsApp"
          >
            <WhatsAppIcon size={16} color="#15803d" />
            <span>WhatsApp Summary</span>
          </button>
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Nozzle Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenAddModal()}>
            <PlusIcon size={16} />
            <span>Enter Meter Reading</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Forecourt Nozzle Meter Readings Guide"
        urduTitle="نوزل میٹر ریڈنگ اور پیمائش کی رہنمائی"
        role="cashier"
        roleLabel="Forecourt Cashier"
        purpose="Record electronic/mechanical meter readings for each dispenser nozzle, deduct calibration testing liters, and compute net fuel sales revenue."
        steps={[
          {
            step: 1,
            title: 'Select Nozzle (نوزل کا انتخاب)',
            detail: 'Choose the dispenser and nozzle number (Super, Diesel, or Hi-Octane).',
            urdu: 'ڈسپنسر اور نوزل منتخب کریں تاکہ گزشتہ میٹر ریڈنگ خودکار طور پر آ جائے۔',
          },
          {
            step: 2,
            title: 'Verify Opening Meter (ابتدائی میٹر ریڈنگ)',
            detail: 'Check that opening meter matches the closing reading from previous shift.',
            urdu: 'پچھلی شفٹ کی آخری ریڈنگ کی تصدیق کریں۔',
          },
          {
            step: 3,
            title: 'Enter Current Closing Meter (موجودہ کلو زنگ میٹر)',
            detail: 'Input the exact dial number shown on the physical fuel dispenser display.',
            urdu: 'ڈسپنسر میٹر پر نظر آنے والی موجودہ ریڈنگ درج کریں۔',
          },
          {
            step: 4,
            title: 'Deduct Testing Liters (پیمائش کین کی کٹوتی)',
            detail: 'Deduct any 5L or 10L calibration testing poured back into the underground tank.',
            urdu: 'پیمانہ چیکنگ کے دوران ٹینک میں واپس ڈالا گیا تیل منہا کریں۔',
          },
        ]}
        criticalChecks={[
          'Closing meter MUST always be strictly greater than opening meter.',
          'Always log testing/inspection liters so the cashier is not held responsible for unpaid cash.',
          'For commercial fleet vehicles purchasing on credit, immediately record a Credit Slip in the Customers module.',
        ]}
      />

      {/* Summary strip */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Total Sold Liters Today</span>
          <strong className="kpi-cell-value">{totalSoldLiters.toLocaleString()} L</strong>
          <span className="kpi-cell-sub">Across all {nozzles.length} dispensers</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Fuel Revenue</span>
          <strong className="kpi-cell-value text-gold">Rs {Math.round(totalFuelAmount).toLocaleString()}</strong>
          <span className="kpi-cell-sub">Official OGRA tariff applied</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Active Fuel Nozzles</span>
          <strong className="kpi-cell-value">{nozzles.length} Operational</strong>
          <span className="kpi-cell-sub">Dispenser pumps calibrated</span>
        </div>
      </div>

      {/* Modern Dispensers Overview Grid */}
      <div className="section-surface">
        <div className="section-surface-header">
          <div>
            <h3 className="section-title">Dispensers & Nozzle Status</h3>
            <p className="section-subtitle">Click on any nozzle to update closing meter reading</p>
          </div>
        </div>

        <div className="nozzles-compact-grid">
          {nozzles.map((nozzle) => {
            const currentRate = settings.rates[nozzle.fuelType]
            return (
              <div
                key={nozzle.id}
                className="nozzle-status-item"
                onClick={() => handleOpenAddModal(nozzle.id)}
              >
                <div className="nozzle-badge-header">
                  <div className="nozzle-name-tag">
                    <GasPumpIcon size={18} color="#b88d2b" />
                    <strong>Dispenser {nozzle.dispenserNo} • Nozzle {nozzle.nozzleNo}</strong>
                  </div>
                  <span className="fuel-pill">{nozzle.fuelType}</span>
                </div>

                <div className="nozzle-reading-details">
                  <div className="reading-row">
                    <span className="r-label">Opening Meter:</span>
                    <strong className="r-val">{nozzle.openingMeter.toLocaleString()}</strong>
                  </div>
                  <div className="reading-row">
                    <span className="r-label">Current Meter:</span>
                    <strong className="r-val highlight">{nozzle.closingMeter.toLocaleString()}</strong>
                  </div>
                  <div className="reading-row">
                    <span className="r-label">Price / Liter:</span>
                    <span className="r-val">Rs {currentRate}</span>
                  </div>
                  <div className="reading-row">
                    <span className="r-label">Attendant:</span>
                    <span className="r-val text-muted">{nozzle.assignedStaff}</span>
                  </div>
                </div>

                <button className="btn btn-secondary btn-block mt-3">Update Reading</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detailed Log Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Today's Recorded Nozzle Sales</h3>
            <p className="surface-sub">Calculations showing testing liters deductions and net amount</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Nozzle</th>
                <th>Fuel Product</th>
                <th>Opening Meter</th>
                <th>Closing Meter</th>
                <th>Testing Deduction</th>
                <th>Net Liters Sold</th>
                <th>OGRA Rate</th>
                <th>Total Revenue (PKR)</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              {fuelSales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <strong>D{sale.dispenserNo}-N{sale.nozzleNo}</strong>
                  </td>
                  <td>
                    <span className="fuel-pill">{sale.fuelType}</span>
                  </td>
                  <td>{sale.openingMeter.toLocaleString()}</td>
                  <td>{sale.closingMeter.toLocaleString()}</td>
                  <td>{sale.testingLiters} L</td>
                  <td>
                    <strong>{sale.netLiters.toLocaleString()} L</strong>
                  </td>
                  <td>Rs {sale.ratePerLiter}</td>
                  <td className="text-right text-gold">
                    <strong>Rs {Math.round(sale.totalAmount).toLocaleString()}</strong>
                  </td>
                  <td>{sale.cashierName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Entry Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Enter Nozzle Meter Reading</h3>
                <span className="modal-sub">
                  Dispenser #{selectedNozzle?.dispenserNo} • Nozzle #{selectedNozzle?.nozzleNo} ({selectedNozzle?.fuelType})
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSale} className="modal-form-compact">
              {/* Nozzle Selector Row */}
              <div className="form-group">
                <label className="form-label">Select Active Dispenser &amp; Nozzle</label>
                <select
                  className="form-input"
                  value={selectedNozzleId}
                  onChange={(e) => {
                    const target = nozzles.find((n) => n.id === e.target.value)
                    if (target) {
                      setSelectedNozzleId(target.id)
                      setOpeningMeter(target.closingMeter || target.openingMeter)
                      setClosingMeter((target.closingMeter || target.openingMeter) + 500)
                      setTestingLiters(target.testingLiters || 10)
                      setCashierName(target.assignedStaff || cashierName)
                    }
                  }}
                >
                  {nozzles.map((n) => (
                    <option key={n.id} value={n.id}>
                      Dispenser {n.dispenserNo} — Nozzle {n.nozzleNo} ({n.fuelType}) — Rate: Rs {settings.rates[n.fuelType]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Opening Meter Reading</label>
                  <input
                    type="number"
                    className="form-input"
                    value={openingMeter}
                    onChange={(e) => setOpeningMeter(Number(e.target.value))}
                    required
                  />
                  <small className="form-help">Previous shift dial reading</small>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gold">Closing Meter Reading</label>
                  <input
                    type="number"
                    className="form-input"
                    value={closingMeter}
                    onChange={(e) => setClosingMeter(Number(e.target.value))}
                    required
                  />
                  <small className="form-help">Current physical dial reading</small>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Calibration Testing (Liters)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={testingLiters}
                    onChange={(e) => setTestingLiters(Number(e.target.value))}
                    required
                    min={0}
                  />
                  <small className="form-help">Deducted from sales (5L/10L can)</small>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Attendant</label>
                  <input
                    type="text"
                    className="form-input"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Inline Calculation Strip (Zero-Scroll) */}
              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Gross Liters:</span>
                  <span className="calc-pill-val">
                    {Math.max(0, closingMeter - openingMeter).toLocaleString()} L
                  </span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Testing:</span>
                  <span className="calc-pill-val text-red">- {testingLiters} L</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Net Sold:</span>
                  <span className="calc-pill-val text-green">{netLiters.toLocaleString()} L</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Rate/L:</span>
                  <span className="calc-pill-val">Rs {fuelRate}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Net Sales Amount:</span>
                  <span className="calc-pill-val text-gold">
                    Rs {Math.round(totalAmount).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    handleSaveSale({ preventDefault: () => {} } as React.FormEvent)
                    setPrintOpen(true)
                  }}
                >
                  <PrinterIcon size={16} />
                  <span>Save &amp; Print Slip</span>
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Reading</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Slip */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Nozzle Meter Reading Sheet"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Dispenser</th>
              <th>Fuel</th>
              <th>Opening</th>
              <th>Closing</th>
              <th>Testing</th>
              <th>Net (L)</th>
              <th>Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {fuelSales.map((s) => (
              <tr key={s.id}>
                <td>D{s.dispenserNo}-N{s.nozzleNo}</td>
                <td>{s.fuelType}</td>
                <td>{s.openingMeter}</td>
                <td>{s.closingMeter}</td>
                <td>{s.testingLiters}L</td>
                <td>{s.netLiters}L</td>
                <td>Rs {Math.round(s.totalAmount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Total Net Liters:</span>
          <strong>{totalSoldLiters.toLocaleString()} L</strong>
        </div>
        <div className="slip-row highlight">
          <span>Total Fuel Revenue:</span>
          <strong>Rs {Math.round(totalFuelAmount).toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
