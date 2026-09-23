import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { BuildingIcon, PlusIcon, PrinterIcon, CheckCircleIcon, XIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import type { FuelType } from '../../types'

export const OmcLedgerView: React.FC = () => {
  const { activeSiteData, addOmcInvoice, addOmcPayment } = useApp()
  const { omcInvoices, omcPayments, siteInfo } = activeSiteData

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // New Invoice Form
  const [invoiceNo, setInvoiceNo] = useState(`INV-PK-${Math.floor(10000 + Math.random() * 90000)}`)
  const [tankLorryNo, setTankLorryNo] = useState('TL-7740 (Depot)')
  const [driverName, setDriverName] = useState('Muhammad Ramzan')
  const [fuelType, setFuelType] = useState<FuelType>('HSD Diesel')
  const [invoiceVolumeLiters, setInvoiceVolumeLiters] = useState(25000)
  const [decantedVolumeLiters, setDecantedVolumeLiters] = useState(25000)
  const [ratePerLiter, setRatePerLiter] = useState(264.10)
  const [freightAmount, setFreightAmount] = useState(38000)

  // Payment Form
  const [payInvoiceNo, setPayInvoiceNo] = useState(omcInvoices[0]?.invoiceNo || '')
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'Pay Order' | 'Cheque' | 'Cash'>('Bank Transfer')
  const [payBank, setPayBank] = useState('HBL Khanpur')
  const [payRef, setPayRef] = useState(`RTGS-${Math.floor(100000 + Math.random() * 900000)}`)
  const [payAmount, setPayAmount] = useState<number>(1688000)

  const totalInvoiceAmount = (decantedVolumeLiters * ratePerLiter) + freightAmount

  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault()
    addOmcInvoice({
      invoiceNo,
      date: new Date().toISOString().split('T')[0],
      brand: siteInfo.brand,
      tankLorryNo,
      driverName,
      fuelType,
      invoiceVolumeLiters,
      decantedVolumeLiters,
      ratePerLiter,
      freightAmount,
      totalAmount: totalInvoiceAmount,
      paymentStatus: 'Pending',
      paidAmount: 0,
    })
    setInvoiceModalOpen(false)
  }

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault()
    addOmcPayment({
      date: new Date().toISOString().split('T')[0],
      invoiceNo: payInvoiceNo,
      paymentMethod: payMethod,
      bankName: payBank,
      referenceNo: payRef,
      amount: payAmount,
      recordedBy: siteInfo.managerName,
    })
    setPaymentModalOpen(false)
  }

  const totalInvoiced = omcInvoices.reduce((acc, i) => acc + i.totalAmount, 0)
  const totalPaid = omcInvoices.reduce((acc, i) => acc + i.paidAmount, 0)
  const netOmcBalance = totalInvoiced - totalPaid

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">OIL MARKETING COMPANY LEDGER</span>
          <h2 className="page-heading">{siteInfo.brand} Purchases & Ledger</h2>
          <p className="page-sub">
            Fuel tanker delivery invoices, decanted volumes, freight charges, and RTGS/Cheque payments
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print OMC Statement</span>
          </button>
          <button className="btn btn-secondary" onClick={() => setPaymentModalOpen(true)}>
            <BuildingIcon size={16} />
            <span>Record Payment</span>
          </button>
          <button className="btn btn-primary" onClick={() => setInvoiceModalOpen(true)}>
            <PlusIcon size={16} />
            <span>New Tanker Delivery</span>
          </button>
        </div>
      </div>

      <ModuleGuide
        title="OMC Supply & Tanker Deliveries SOP"
        urduTitle="آئل مارکیٹنگ کمپنی اور ٹینکر ڈلیوری کے اصول"
        role="manager"
        roleLabel="Station Manager / Owner"
        purpose="Track bulk fuel tanker receipts, decanting variance against depot invoices, cartage freight, and bank remittances (RTGS / Pay Orders)."
        steps={[
          {
            step: 1,
            title: 'Tanker Arrival & Dip Verification (ٹینکر کی آمد اور پیمائش)',
            detail: 'Inspect depot seal numbers and measure tanker dip before decanting into underground tanks.',
            urdu: 'ڈپو کی سیل چیک کریں اور زیر زمین ٹینک میں اتارنے سے پہلے ٹینکر کی پیمائش کریں۔',
          },
          {
            step: 2,
            title: 'Record Decanted Liters (اتاری گئی مقدار کا اندراج)',
            detail: 'Enter invoiced liters vs. actual decanted volume to catch any transit shortages immediately.',
            urdu: 'انوائس کے لیٹر اور اصل اتاری گئی مقدار کا اندراج کریں تاکہ کمی بیشی سامنے آ سکے۔',
          },
          {
            step: 3,
            title: 'Bank Remittance to OMC (بینک ادائیگی)',
            detail: 'Record RTGS, pay order, or online company transfer to clear supplier balance accurately.',
            urdu: 'بینک ٹرانسفر، پے آرڈر یا آن لائن رقم کی ادائیگی کا اندراج کر کے بیلنس برابر کریں۔',
          },
        ]}
        criticalChecks={[
          'Always test fuel water paste before decanting to ensure zero water contamination from the depot.',
          'Decanted volume must reflect exact temperature-corrected volume recorded in underground dip report.',
        ]}
      />

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Primary OMC Supplier</span>
          <strong className="kpi-cell-value">{siteInfo.brand}</strong>
          <span className="kpi-cell-sub">Contracted supply depot</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Fuel Purchased</span>
          <strong className="kpi-cell-value text-gold">Rs {Math.round(totalInvoiced).toLocaleString()}</strong>
          <span className="kpi-cell-sub">{omcInvoices.length} Tanker Lorries Decanted</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Payments Disbursed</span>
          <strong className="kpi-cell-value text-green">Rs {Math.round(totalPaid).toLocaleString()}</strong>
          <span className="kpi-cell-sub">Bank transfers / Pay orders cleared</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Net Payable Balance</span>
          <strong className="kpi-cell-value" style={{ color: netOmcBalance > 0 ? '#b45309' : '#27ae60' }}>
            Rs {Math.round(netOmcBalance).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">{netOmcBalance > 0 ? 'Pending remittance to OMC' : 'All invoices cleared'}</span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Tank Lorry Delivery Invoices</h3>
            <p className="surface-sub">Decanted bulk liters from company depot tankers</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Tank Lorry & Driver</th>
                <th>Fuel Product</th>
                <th>Decanted (L)</th>
                <th>OMC Rate</th>
                <th>Freight</th>
                <th>Total Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {omcInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <strong>{inv.invoiceNo}</strong>
                  </td>
                  <td>{inv.date}</td>
                  <td>
                    <div>{inv.tankLorryNo}</div>
                    <div className="text-muted text-xs">Driver: {inv.driverName}</div>
                  </td>
                  <td>
                    <span className="fuel-pill">{inv.fuelType}</span>
                  </td>
                  <td>
                    <strong>{inv.decantedVolumeLiters.toLocaleString()} L</strong>
                  </td>
                  <td>Rs {inv.ratePerLiter}</td>
                  <td>Rs {inv.freightAmount.toLocaleString()}</td>
                  <td className="text-gold font-bold">Rs {inv.totalAmount.toLocaleString()}</td>
                  <td>
                    <span
                      className={`badge ${
                        inv.paymentStatus === 'Paid'
                          ? 'badge-success'
                          : inv.paymentStatus === 'Partial'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                    >
                      {inv.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">OMC Payment Vouchers & Bank Remittances</h3>
            <p className="surface-sub">Official settlement vouchers logged to company bank account</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice Ref</th>
                <th>Payment Mode</th>
                <th>Bank & Transaction #</th>
                <th>Amount (PKR)</th>
                <th>Authorized By</th>
              </tr>
            </thead>
            <tbody>
              {omcPayments.map((p) => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td>
                    <strong>{p.invoiceNo}</strong>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{p.paymentMethod}</span>
                  </td>
                  <td>
                    <div>{p.bankName}</div>
                    <div className="text-muted text-xs">Ref: {p.referenceNo}</div>
                  </td>
                  <td className="text-green font-bold">Rs {p.amount.toLocaleString()}</td>
                  <td>{p.recordedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Tanker Delivery */}
      {invoiceModalOpen && (
        <div className="modal-backdrop" onClick={() => setInvoiceModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record {siteInfo.brand} Fuel Delivery (Decanted)</h3>
                <span className="modal-sub">Enter official tanker invoice details and decanted quantity</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setInvoiceModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="modal-form-compact">
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Invoice Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tank Lorry Reg #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={tankLorryNo}
                    onChange={(e) => setTankLorryNo(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Driver Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Fuel Product</label>
                  <select
                    className="form-input"
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value as FuelType)}
                  >
                    <option value="HSD Diesel">HSD Diesel</option>
                    <option value="PMG Super">PMG Super 92</option>
                    <option value="Hi-Octane">Hi-Octane</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Volume (L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={invoiceVolumeLiters}
                    onChange={(e) => setInvoiceVolumeLiters(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label font-bold text-gold">Decanted Volume (L)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={decantedVolumeLiters}
                    onChange={(e) => setDecantedVolumeLiters(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Rate / Liter (Ex-Depot)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={ratePerLiter}
                    onChange={(e) => setRatePerLiter(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Freight Charges (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={freightAmount}
                    onChange={(e) => setFreightAmount(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Product Cost</span>
                  <span className="calc-pill-val">Rs {(decantedVolumeLiters * ratePerLiter).toLocaleString()}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Freight / Cartage</span>
                  <span className="calc-pill-val">+ Rs {freightAmount.toLocaleString()}</span>
                </div>
                <div className="calc-pill-item highlight-green">
                  <span className="calc-pill-label">Total Invoice Payable</span>
                  <span className="calc-pill-val">Rs {Math.round(totalInvoiceAmount).toLocaleString()}</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setInvoiceModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Tanker Invoice</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Payment */}
      {paymentModalOpen && (
        <div className="modal-backdrop" onClick={() => setPaymentModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Payment to {siteInfo.brand}</h3>
                <span className="modal-sub">Log bank transfer, pay order, or RTGS payment voucher</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setPaymentModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Against Invoice #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={payInvoiceNo}
                    onChange={(e) => setPayInvoiceNo(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-input"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                  >
                    <option value="Bank Transfer">Bank Transfer (RTGS / Online)</option>
                    <option value="Pay Order">Bank Pay Order</option>
                    <option value="Cheque">Crossed Cheque</option>
                    <option value="Cash">Cash Deposit</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Remitting Bank Account</label>
                  <input
                    type="text"
                    className="form-input"
                    value={payBank}
                    onChange={(e) => setPayBank(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reference / Pay Order #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-gold">Payment Amount (PKR)</label>
                <input
                  type="number"
                  className="form-input"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  required
                />
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Payment Voucher</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Modal */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`${siteInfo.brand} Company Account & Ledger Statement`}
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-summary-list">
          <div className="slip-row">
            <span>Total Fuel Invoiced:</span>
            <strong>Rs {totalInvoiced.toLocaleString()}</strong>
          </div>
          <div className="slip-row">
            <span>Total Payments Remitted:</span>
            <span>Rs {totalPaid.toLocaleString()}</span>
          </div>
          <div className="receipt-divider" />
          <div className="slip-row highlight">
            <span>Net Outstanding Payable to OMC:</span>
            <strong>Rs {netOmcBalance.toLocaleString()}</strong>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
