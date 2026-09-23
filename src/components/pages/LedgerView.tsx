import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

export const LedgerView: React.FC = () => {
  const { activeSiteData } = useApp()
  const { customers, creditSlips, recoveries, siteInfo } = activeSiteData

  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '')
  const [printOpen, setPrintOpen] = useState(false)

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || customers[0]

  // Combine credit slips (Debit) and recoveries (Credit) into a sorted ledger
  const customerSlips = creditSlips.filter((s) => s.customerId === selectedCustomer?.id)
  const customerRecoveries = recoveries.filter((r) => r.customerId === selectedCustomer?.id)

  interface LedgerRow {
    id: string
    date: string
    refNo: string
    description: string
    debit: number
    credit: number
    balance: number
  }

  let running = 0
  const rows: LedgerRow[] = []

  // Add initial opening balance if any
  const initialOpening = Math.max(0, (selectedCustomer?.currentBalance || 0) - customerSlips.reduce((a, b) => a + b.totalAmount, 0) + customerRecoveries.reduce((a, b) => a + b.amount, 0))
  if (initialOpening > 0) {
    running += initialOpening
    rows.push({
      id: 'OP-BAL',
      date: '2026-09-01',
      refNo: 'B/F',
      description: 'Opening Balance brought forward',
      debit: initialOpening,
      credit: 0,
      balance: running,
    })
  }

  // Add slips
  customerSlips.forEach((s) => {
    running += s.totalAmount
    rows.push({
      id: s.id,
      date: s.date,
      refNo: s.slipNo,
      description: `Fuel Supplied: ${s.liters}L ${s.fuelType} (Vehicle: ${s.vehicleNo}, Driver: ${s.driverName})`,
      debit: s.totalAmount,
      credit: 0,
      balance: running,
    })
  })

  // Add recoveries
  customerRecoveries.forEach((r) => {
    running -= r.amount
    rows.push({
      id: r.id,
      date: r.date,
      refNo: r.receiptNo,
      description: `Payment Received: via ${r.paymentMethod} (Ref: ${r.referenceNo})`,
      debit: 0,
      credit: r.amount,
      balance: running,
    })
  })

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">PARTY STATEMENT</span>
          <h2 className="page-heading">Debit / Credit Running Ledger</h2>
          <p className="page-sub">
            Itemized transaction history, fuel credit debits, payment credits, and running account balance
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Customer Statement</span>
          </button>
        </div>
      </div>

      {/* Account Picker Ribbon */}
      <div className="account-selector-ribbon">
        <div className="form-group flex-1">
          <label className="form-label">Select Customer Account to Inspect</label>
          <select
            className="form-input form-input-lg"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName} — Balance: Rs {c.currentBalance.toLocaleString()} (Limit: Rs {c.creditLimit.toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Account Card */}
      {selectedCustomer && (
        <div className="executive-kpi-strip">
          <div className="kpi-cell">
            <span className="kpi-label">Client Name</span>
            <strong className="kpi-cell-value">{selectedCustomer.businessName}</strong>
            <span className="kpi-cell-sub">Proprietor: {selectedCustomer.name}</span>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Credit Limit Allowed</span>
            <strong className="kpi-cell-value">Rs {selectedCustomer.creditLimit.toLocaleString()}</strong>
            <span className="kpi-cell-sub">Phone: {selectedCustomer.phone}</span>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Total Fuel Debit</span>
            <strong className="kpi-cell-value text-red">
              Rs {rows.reduce((sum, r) => sum + r.debit, 0).toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Fuel delivered</span>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Current Net Balance Due</span>
            <strong className="kpi-cell-value text-gold">
              Rs {selectedCustomer.currentBalance.toLocaleString()}
            </strong>
            <span className="kpi-cell-sub">Payable to station</span>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Account Statement — {selectedCustomer?.businessName}</h3>
            <p className="surface-sub">Complete itemized audit trail</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Slip / Voucher #</th>
                <th>Description / Particulars</th>
                <th>Debit (Fuel Taken)</th>
                <th>Credit (Payment Received)</th>
                <th>Running Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <strong>{row.refNo}</strong>
                  </td>
                  <td>{row.description}</td>
                  <td className="text-red font-bold">
                    {row.debit > 0 ? `Rs ${Math.round(row.debit).toLocaleString()}` : '—'}
                  </td>
                  <td className="text-green font-bold">
                    {row.credit > 0 ? `Rs ${Math.round(row.credit).toLocaleString()}` : '—'}
                  </td>
                  <td className="text-gold font-bold">
                    Rs {Math.round(row.balance).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Statement Modal */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`Customer Account Statement: ${selectedCustomer?.businessName}`}
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-meta-grid">
          <div>
            <strong>Client:</strong> {selectedCustomer?.businessName}
          </div>
          <div>
            <strong>Contact:</strong> {selectedCustomer?.phone}
          </div>
          <div>
            <strong>Credit Limit:</strong> Rs {selectedCustomer?.creditLimit.toLocaleString()}
          </div>
          <div>
            <strong>Current Due:</strong> Rs {selectedCustomer?.currentBalance.toLocaleString()}
          </div>
        </div>

        <div className="receipt-divider" />

        <table className="slip-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>Particulars</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.refNo}</td>
                <td>{r.description}</td>
                <td>{r.debit > 0 ? `Rs ${Math.round(r.debit).toLocaleString()}` : '-'}</td>
                <td>{r.credit > 0 ? `Rs ${Math.round(r.credit).toLocaleString()}` : '-'}</td>
                <td>Rs {Math.round(r.balance).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Net Outstanding Balance Due:</span>
          <strong>Rs {selectedCustomer?.currentBalance.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
