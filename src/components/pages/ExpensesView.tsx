import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon, PrinterIcon, CheckCircleIcon, XIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const ExpensesView: React.FC = () => {
  const { activeSiteData, addExpense, addDaybookEntry } = useApp()
  const { expenses, siteInfo } = activeSiteData

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Expense Form
  const [voucherNo, setVoucherNo] = useState(`VOU-${Math.floor(100 + Math.random() * 900)}`)
  const [category, setCategory] = useState<any>('Staff Meals & Tea')
  const [payee, setPayee] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number>(3000)
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank'>('Cash')
  const [approvedBy, setApprovedBy] = useState(siteInfo.managerName)

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault()
    addExpense({
      voucherNo,
      date: new Date().toISOString().split('T')[0],
      category,
      description,
      payee,
      amount,
      paymentMode,
      approvedBy,
    })

    // If paid by cash, also deduct from daybook cash safe
    if (paymentMode === 'Cash') {
      addDaybookEntry({
        date: new Date().toISOString().split('T')[0],
        time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
        particulars: `Expense: ${category} (${description})`,
        category: 'Expense',
        cashIn: 0,
        cashOut: amount,
        balanceAfter: 0,
        referenceNo: voucherNo,
        handledBy: approvedBy,
      })
    }

    setModalOpen(false)
    setDescription('')
    setPayee('')
  }

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">STATION OVERHEADS</span>
          <h2 className="page-heading">Station Expenses & Vouchers</h2>
          <p className="page-sub">
            Generator diesel, electricity bills, dispenser repairs, staff food & tea, and station supplies
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Expense Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <PlusIcon size={16} />
            <span>New Expense Voucher</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Station Operating Expenses & Overheads Guide"
        urduTitle="اسٹیشن کے روزمرہ اخراجات کی رہنمائی"
        role="manager"
        roleLabel="Station Manager"
        purpose="Record forecourt operational expenses: generator diesel during load-shedding, commercial electricity, dispenser nozzle calibration/parts, staff meals, and municipal fees."
        steps={[
          {
            step: 1,
            title: 'Select Expense Category (مد کا انتخاب)',
            detail: 'Classify as Generator Fuel, WAPDA Electricity, Dispenser Spares, Staff Meals/Tea, or Municipal Fees.',
            urdu: 'صحیح شعبہ منتخب کریں جیسے جنریٹر ڈیزل، بجلی کا بل یا پمپ کی مرمت۔',
          },
          {
            step: 2,
            title: 'Choose Payment Mode (ادائیگی کا طریقہ)',
            detail: 'Pick "Physical Cash from Safe" for forecourt disbursements or "Bank Transfer" for corporate utility bills.',
            urdu: 'سیف سے نقد ادائیگی یا بینک چیک/آن لائن ٹرانسفر کا انتخاب کریں۔',
          },
          {
            step: 3,
            title: 'Enter Payee & Details (دکان دار اور تفصیل)',
            detail: 'Input vendor/hotel name and itemized description (e.g. 50L generator fuel or nozzle seal replacement).',
            urdu: 'دکان دار کا نام اور اخراجات کی مکمل تفصیل درج کریں۔',
          },
          {
            step: 4,
            title: 'Automatic Daybook Deduction (خودکار کٹوتی)',
            detail: 'Cash expenses automatically post a cash-out entry into the Daybook and deduct from safe cash.',
            urdu: 'نقد خرچ خودکار طور پر ڈے بک سے منہا ہو جائے گا۔',
          },
        ]}
        criticalChecks={[
          'Cash vouchers immediately reduce Daybook cash-in-hand — verify manager authorization.',
          'Always retain vendor physical cash memo or repair invoice attached to the voucher.',
          'Large corporate utility bills (WAPDA) should be settled via station Bank Account.',
        ]}
      />

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Total Recorded Expenses</span>
          <strong className="kpi-cell-value text-red">Rs {totalExpenseAmount.toLocaleString()}</strong>
          <span className="kpi-cell-sub">{expenses.length} Vouchers approved</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Cash Expenses from Safe</span>
          <strong className="kpi-cell-value">
            Rs {expenses.filter((e) => e.paymentMode === 'Cash').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Deducted from daily shift collections</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Bank Commercial Payments</span>
          <strong className="kpi-cell-value">
            Rs {expenses.filter((e) => e.paymentMode === 'Bank').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Electricity & corporate fees</span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Station Expense Vouchers</h3>
            <p className="surface-sub">Complete breakdown of operating costs</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Paid To (Payee)</th>
                <th>Mode</th>
                <th>Amount (PKR)</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>
                    <strong>{exp.voucherNo}</strong>
                  </td>
                  <td>{exp.date}</td>
                  <td>
                    <span className="category-tag">{exp.category}</span>
                  </td>
                  <td>{exp.description}</td>
                  <td>{exp.payee}</td>
                  <td>
                    <span className={`badge ${exp.paymentMode === 'Cash' ? 'badge-neutral' : 'badge-gold'}`}>
                      {exp.paymentMode}
                    </span>
                  </td>
                  <td className="text-red font-bold">Rs {exp.amount.toLocaleString()}</td>
                  <td>{exp.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Expense Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Create Station Expense Voucher</h3>
                <span className="modal-sub">Deducts directly from shift cash or company bank account</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Expense Category</label>
                  <select
                    className="form-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                  >
                    <option value="Staff Meals & Tea">Staff Meals &amp; Tea</option>
                    <option value="Generator Fuel">Generator Diesel &amp; Oil</option>
                    <option value="Electricity (WAPDA)">Electricity Bill (Commercial)</option>
                    <option value="Dispenser Spares & Repairs">Dispenser Spares &amp; Repairs</option>
                    <option value="Municipal & Legal">Municipal / Civil Defense Fees</option>
                    <option value="Stationery & Cleaning">Cleaning Supplies &amp; Stationery</option>
                    <option value="Misc">Miscellaneous</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Voucher Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={voucherNo}
                    onChange={(e) => setVoucherNo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Paid To (Payee Name / Vendor)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    placeholder="e.g. Al-Madina Hotel or Spare Parts Shop"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="form-input"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                  >
                    <option value="Cash">Physical Cash from Station Safe</option>
                    <option value="Bank">Bank Transfer / Cheque</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expense Description / Detail</label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 50 Liters generator diesel filled during load-shedding"
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label font-bold text-red">Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    required
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Approved By</label>
                  <input
                    type="text"
                    className="form-input"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Inline Calculation Strip */}
              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Category:</span>
                  <span className="calc-pill-val">{category}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Funding Source:</span>
                  <span className="calc-pill-val text-gold">{paymentMode === 'Cash' ? 'Cash Safe (Daybook)' : 'Bank Account'}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Total Expense:</span>
                  <span className="calc-pill-val text-red">Rs. {amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Expense Voucher</span>
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
        title="Station Expense Statement"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Category</th>
              <th>Payee</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.voucherNo}</td>
                <td>{e.category}</td>
                <td>{e.payee}</td>
                <td>Rs {e.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Total Operational Outflow:</span>
          <strong>Rs {totalExpenseAmount.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
