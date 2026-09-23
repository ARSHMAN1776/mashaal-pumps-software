import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon, PrinterIcon, CheckCircleIcon, XIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const TankDipView: React.FC = () => {
  const { activeSiteData, addTankDip } = useApp()
  const { tanks, tankDips, siteInfo } = activeSiteData

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Dip Form State
  const [selectedTankId, setSelectedTankId] = useState(tanks[0]?.id || '')
  const [morningDipMm, setMorningDipMm] = useState(1890)
  const [morningLiters, setMorningLiters] = useState(33890)
  const [decantedLiters, setDecantedLiters] = useState(0)
  const [dispensedLiters, setDispensedLiters] = useState(2690)
  const [closingDipMm, setClosingDipMm] = useState(1840)
  const [closingPhysicalLiters, setClosingPhysicalLiters] = useState(31200)
  const [waterDipMm, setWaterDipMm] = useState(0)
  const [inspector, setInspector] = useState(siteInfo.managerName)

  const selectedTank = tanks.find((t) => t.id === selectedTankId) || tanks[0]

  const bookStockLiters = morningLiters + decantedLiters - dispensedLiters
  const varianceLiters = closingPhysicalLiters - bookStockLiters

  const handleOpenAddModal = (tankId?: string) => {
    if (tankId) {
      const t = tanks.find((tk) => tk.id === tankId)
      if (t) {
        setSelectedTankId(t.id)
        setMorningDipMm(t.currentDipMm)
        setMorningLiters(t.currentLiters)
        setClosingDipMm(t.currentDipMm)
        setClosingPhysicalLiters(t.currentLiters)
      }
    }
    setModalOpen(true)
  }

  const handleSaveDip = (e: React.FormEvent) => {
    e.preventDefault()
    addTankDip({
      date: new Date().toISOString().split('T')[0],
      tankId: selectedTank.id,
      tankNo: selectedTank.tankNo,
      fuelType: selectedTank.fuelType,
      morningDipMm,
      morningLiters,
      decantedLiters,
      dispensedLiters,
      bookStockLiters,
      closingDipMm,
      closingPhysicalLiters,
      varianceLiters,
      waterDipMm,
      inspector,
    })
    setModalOpen(false)
  }

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">PHYSICAL INVENTORY AUDIT</span>
          <h2 className="page-heading">Tank Dip & Physical Stock</h2>
          <p className="page-sub">
            Dip rod calibration, decanted volumes, daily meter sales, and book vs physical stock variance
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Dip Audit Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenAddModal()}>
            <PlusIcon size={16} />
            <span>Record Daily Dip</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Underground Tank Dip & Stock Calibration"
        urduTitle="زیر زمین ٹینک پیمائش (ڈپ) اور اسٹاک آڈٹ"
        role="manager"
        roleLabel="Station Manager"
        purpose="Measure underground fuel levels with brass dip rod, detect bottom water contamination using water-finding paste, and audit theoretical book stock vs physical stick readings."
        steps={[
          {
            step: 1,
            title: 'Take Morning Dip (صبح کی پیمائش)',
            detail: 'Insert clean brass dip rod into sounding pipe. Read millimeter level and record equivalent liters.',
            urdu: 'پیتل کی ڈپ راڈ ٹینک میں ڈال کر ملی میٹر اور لیٹر ریڈنگ نوٹ کریں۔',
          },
          {
            step: 2,
            title: 'Record Decanted Tanker Fuel (ڈیکینٹنگ)',
            detail: 'If an OMC bowser / tank lorry arrived, record invoice volume decanted into underground tank.',
            urdu: 'اگر سپلائی کا تیل آیا ہے تو ٹینکر سے خالی کروائے گئے لیٹر درج کریں۔',
          },
          {
            step: 3,
            title: 'Water Paste Test (پانی کی جانچ)',
            detail: 'Apply Kolor Kut water finding paste to bottom 100mm of rod. Confirm 0 mm water indication.',
            urdu: 'راڈ کے نچلے حصے پر واٹر پیسٹ لگائیں تاکہ ٹینک میں پانی نہ ہونے کی تصدیق ہو۔',
          },
          {
            step: 4,
            title: 'Compute Variance (نقصان یا بچت کا آڈٹ)',
            detail: 'Closing physical stock is compared with book stock. Any temperature/evaporation variance is logged.',
            urdu: 'بُک اسٹاک اور فزیکل اسٹاک کا موازنہ کر کے کمی یا بیشی چیک کریں۔',
          },
        ]}
        criticalChecks={[
          'Water paste turning dark pink / red indicates water contamination — STOP fuel dispensing immediately!',
          'Standard allowable temperature & evaporation variance is ±0.5% of total tank volume.',
          'Allow tanker fuel to settle for 15 minutes before taking final decanting dip reading.',
        ]}
      />

      {/* Fluid Tank Cards - Modern Gauges */}
      <div className="tanks-meter-row">
        {tanks.map((tank) => {
          const fillPct = Math.round((tank.currentLiters / tank.capacityLiters) * 100)
          const isLow = tank.currentLiters <= tank.minReserveLiters

          return (
            <div key={tank.id} className={`tank-gauge-card ${isLow ? 'low-stock-glow' : ''}`}>
              <div className="tank-card-top">
                <div>
                  <span className="tank-number-tag">Underground Tank #{tank.tankNo}</span>
                  <h4 className="tank-fuel-title">{tank.fuelType}</h4>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => handleOpenAddModal(tank.id)}>
                  Log Dip
                </button>
              </div>

              <div className="tank-progress-track">
                <div
                  className={`tank-progress-fill ${isLow ? 'fill-low' : 'fill-good'}`}
                  style={{ width: `${Math.min(100, fillPct)}%` }}
                />
              </div>

              <div className="tank-stats-row">
                <div className="tank-stat-item">
                  <span className="stat-label">Stock Liters</span>
                  <strong className="stat-val">{tank.currentLiters.toLocaleString()} L</strong>
                </div>
                <div className="tank-stat-item">
                  <span className="stat-label">Physical Dip</span>
                  <strong className="stat-val">{tank.currentDipMm} mm</strong>
                </div>
                <div className="tank-stat-item">
                  <span className="stat-label">Capacity</span>
                  <strong className="stat-val">{tank.capacityLiters.toLocaleString()} L</strong>
                </div>
                <div className="tank-stat-item">
                  <span className="stat-label">Water Dip</span>
                  <strong className="stat-val text-green">0 mm (Clear)</strong>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dip Log Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Historical Tank Dip Records</h3>
            <p className="surface-sub">Comparison of theoretical book stock vs measured physical stick readings</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date & Tank</th>
                <th>Fuel</th>
                <th>Morning Dip</th>
                <th>Decanted (L)</th>
                <th>Sales (L)</th>
                <th>Expected Book Stock</th>
                <th>Closing Physical Dip</th>
                <th>Variance (Gain/Loss)</th>
                <th>Water Dip</th>
                <th>Inspector</th>
              </tr>
            </thead>
            <tbody>
              {tankDips.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>Tank #{d.tankNo}</strong>
                    <div className="text-muted text-xs">{d.date}</div>
                  </td>
                  <td>
                    <span className="fuel-pill">{d.fuelType}</span>
                  </td>
                  <td>
                    <strong>{d.morningDipMm} mm</strong>
                    <div className="text-muted text-xs">{d.morningLiters.toLocaleString()} L</div>
                  </td>
                  <td>{d.decantedLiters > 0 ? `+${d.decantedLiters.toLocaleString()} L` : '—'}</td>
                  <td>-{d.dispensedLiters.toLocaleString()} L</td>
                  <td>{d.bookStockLiters.toLocaleString()} L</td>
                  <td>
                    <strong>{d.closingDipMm} mm</strong>
                    <div className="text-muted text-xs">{d.closingPhysicalLiters.toLocaleString()} L</div>
                  </td>
                  <td>
                    {d.varianceLiters < 0 ? (
                      <span className="badge badge-danger">Loss: {Math.abs(d.varianceLiters)} L</span>
                    ) : d.varianceLiters > 0 ? (
                      <span className="badge badge-success">Gain: +{d.varianceLiters} L</span>
                    ) : (
                      <span className="badge badge-neutral">0 L (Exact)</span>
                    )}
                  </td>
                  <td>
                    <span className="text-green font-bold">{d.waterDipMm} mm</span>
                  </td>
                  <td>{d.inspector}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Add Dip Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Tank Physical Dip (mm)</h3>
                <span className="modal-sub">
                  Calibrate morning dip, sales, decanting and calculate stock variance
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDip} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Select Underground Tank</label>
                  <select
                    className="form-input"
                    value={selectedTankId}
                    onChange={(e) => {
                      const t = tanks.find((tk) => tk.id === e.target.value)
                      if (t) {
                        setSelectedTankId(t.id)
                        setMorningDipMm(t.currentDipMm)
                        setMorningLiters(t.currentLiters)
                        setClosingDipMm(t.currentDipMm)
                        setClosingPhysicalLiters(t.currentLiters)
                      }
                    }}
                  >
                    {tanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tank #{t.tankNo} — {t.fuelType} (Capacity: {t.capacityLiters.toLocaleString()} L)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Inspecting Officer</label>
                  <input
                    type="text"
                    className="form-input"
                    value={inspector}
                    onChange={(e) => setInspector(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Morning Dip Stick (mm)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={morningDipMm}
                    onChange={(e) => setMorningDipMm(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Morning Equivalent Volume (L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={morningLiters}
                    onChange={(e) => setMorningLiters(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Decanted from OMC Bowser (+ L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={decantedLiters}
                    onChange={(e) => setDecantedLiters(Number(e.target.value))}
                  />
                  <small className="form-help">Enter 0 if no fuel tanker arrived</small>
                </div>
                <div className="form-group">
                  <label className="form-label">Dispensed via Nozzles (- L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={dispensedLiters}
                    onChange={(e) => setDispensedLiters(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label font-bold">Closing Dip (mm)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={closingDipMm}
                    onChange={(e) => setClosingDipMm(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label font-bold text-gold">Physical Volume (L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={closingPhysicalLiters}
                    onChange={(e) => setClosingPhysicalLiters(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Water Paste (mm)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={waterDipMm}
                    onChange={(e) => setWaterDipMm(Number(e.target.value))}
                  />
                  <small className="form-help">0 mm = Clear (Safe)</small>
                </div>
              </div>

              {/* Inline Calculation Strip */}
              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Book Stock:</span>
                  <span className="calc-pill-val">{bookStockLiters.toLocaleString()} L</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Physical Dip:</span>
                  <span className="calc-pill-val text-gold">{closingPhysicalLiters.toLocaleString()} L</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Dip Variance:</span>
                  <span
                    className={`calc-pill-val ${
                      varianceLiters < 0 ? 'text-red' : varianceLiters > 0 ? 'text-green' : ''
                    }`}
                  >
                    {varianceLiters < 0
                      ? `Loss: ${Math.abs(varianceLiters)} L`
                      : varianceLiters > 0
                      ? `Gain: +${varianceLiters} L`
                      : '0 L (Balanced)'}
                  </span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Dip Audit</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Audit Sheet */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Daily Tank Dip & Stock Calibration Audit"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Tank</th>
              <th>Fuel</th>
              <th>Morning (mm)</th>
              <th>Decanted</th>
              <th>Sales</th>
              <th>Book Stock</th>
              <th>Closing (mm)</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {tankDips.map((d) => (
              <tr key={d.id}>
                <td>Tank #{d.tankNo}</td>
                <td>{d.fuelType}</td>
                <td>{d.morningDipMm}mm</td>
                <td>{d.decantedLiters}L</td>
                <td>{d.dispensedLiters}L</td>
                <td>{d.bookStockLiters}L</td>
                <td>{d.closingDipMm}mm</td>
                <td>{d.varianceLiters}L</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-signatures">
          <div>
            <div className="sig-line" />
            <span>Dip Inspector</span>
          </div>
          <div>
            <div className="sig-line" />
            <span>Station Manager</span>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
