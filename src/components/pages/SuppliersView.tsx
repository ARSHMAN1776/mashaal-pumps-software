import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon, CheckCircleIcon, XIcon, CashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

export const SuppliersView: React.FC = () => {
  const { activeSiteData, paySupplier, addDaybookEntry } = useApp()
  const { suppliers, siteInfo } = activeSiteData

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Vendor payment
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '')
  const [payAmount, setPayAmount] = useState<number>(25000)
  const [payNote, setPayNote] = useState('Payment against spare parts invoice')

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault()

    // Persist payment to supplier in AppContext & localStorage
    paySupplier(selectedSupplierId, payAmount)

    // Record cash outflow in station daybook
    const targetVendor = suppliers.find((s) => s.id === selectedSupplierId)
    addDaybookEntry({
      date: new Date().toISOString().split('T')[0],
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      particulars: `Vendor Payment: ${targetVendor?.name || 'Supplier'} — ${payNote}`,
      category: 'Expense',
      cashIn: 0,
      cashOut: payAmount,
      balanceAfter: 0,
      referenceNo: `VND-${Date.now().toString().slice(-4)}`,
      handledBy: siteInfo.managerName,
    })

    setModalOpen(false)
  }

  const totalSupplierPayables = suppliers.reduce((sum, s) => sum + s.balanceDue, 0)

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">VENDOR ACCOUNTS</span>
          <h2 className="page-heading">Suppliers & Vendor Payables</h2>
          <p className="page-sub">
            Filter distributors, generator technicians, pump calibrators, and supply invoices
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Vendor Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <CashIcon size={16} />
            <span>Make Vendor Payment</span>
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Registered Suppliers</span>
          <strong className="kpi-cell-value">{suppliers.length} Vendors</strong>
          <span className="kpi-cell-sub">Contractors & distributors</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Outstanding Payables</span>
          <strong className="kpi-cell-value text-gold">Rs {totalSupplierPayables.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Pending vendor bills</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Major Vendor</span>
          <strong className="kpi-cell-value">{suppliers[0]?.name}</strong>
          <span className="kpi-cell-sub">Primary supplier</span>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Station Vendor Directory</h3>
            <p className="surface-sub">Current payables and contact numbers</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Vendor / Company</th>
                <th>Category</th>
                <th>Contact Phone</th>
                <th>Balance Due (PKR)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((sup) => (
                <tr key={sup.id}>
                  <td>
                    <strong>{sup.name}</strong>
                    <div className="text-muted text-xs">{sup.company}</div>
                  </td>
                  <td>
                    <span className="category-tag">{sup.category}</span>
                  </td>
                  <td>{sup.phone}</td>
                  <td className="text-gold font-bold">Rs {sup.balanceDue.toLocaleString()}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setSelectedSupplierId(sup.id)
                        setPayAmount(Math.min(sup.balanceDue, 50000))
                        setModalOpen(true)
                      }}
                    >
                      Pay Vendor
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Make Payment */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Vendor Payment</h3>
                <span className="modal-sub">Deducts payable balance in vendor ledger</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="modal-form">
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <select
                  className="form-input"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.company}) — Balance Due: Rs {s.balanceDue.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-gold">Payment Amount (PKR)</label>
                <input
                  type="number"
                  className="form-input form-input-lg"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Description / Notes</label>
                <input
                  type="text"
                  className="form-input"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Vendor Payment</span>
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
        title="Station Vendor Payables Summary"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Category</th>
              <th>Phone</th>
              <th>Due (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.category}</td>
                <td>{s.phone}</td>
                <td>Rs {s.balanceDue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Total Vendor Payables:</span>
          <strong>Rs {totalSupplierPayables.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
