import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon, PrinterIcon, CheckCircleIcon, XIcon, ShieldIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const DaybookView: React.FC = () => {
  const { activeSiteData, addDaybookEntry, currentUser } = useApp()
  const { daybook, siteInfo } = activeSiteData
  const isCashier = currentUser?.role === 'cashier'

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Daybook form state
  const todayStr = new Date().toISOString().split('T')[0]
  const [entryDate, setEntryDate] = useState(todayStr)
  const [time] = useState(new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()))
  const [particulars, setParticulars] = useState('')
  const [category, setCategory] = useState<any>('Shift Fuel')
  const [entryType, setEntryType] = useState<'IN' | 'OUT'>('IN')
  const [amount, setAmount] = useState<number>(50000)
  const [referenceNo, setReferenceNo] = useState('')
  const [handledBy, setHandledBy] = useState(siteInfo.managerName)

  const currentBalance = daybook.length > 0 ? daybook[daybook.length - 1].balanceAfter : 0
  const totalCashIn = daybook.reduce((sum, d) => sum + d.cashIn, 0)
  const totalCashOut = daybook.reduce((sum, d) => sum + d.cashOut, 0)

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault()
    const cashIn = entryType === 'IN' ? amount : 0
    const cashOut = entryType === 'OUT' ? amount : 0
    const balanceAfter = currentBalance + cashIn - cashOut

    addDaybookEntry({
      date: isCashier ? todayStr : entryDate,
      time,
      particulars,
      category,
      cashIn,
      cashOut,
      balanceAfter,
      referenceNo,
      handledBy,
    })

    setModalOpen(false)
    setParticulars('')
    setAmount(0)
    setEntryDate(todayStr)
  }

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">STATION CASHBOOK REGISTER</span>
          <h2 className="page-heading">Station Daybook (Cash Flow)</h2>
          <p className="page-sub">
            Chronological audit of daily shift inflows, customer recoveries, station expenses, and bank deposits
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Daybook</span>
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <PlusIcon size={16} />
            <span>Add Cash Voucher</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Station Daybook (Cash Movement Register) Guide"
        urduTitle="اسٹیشن ڈے بک (روزنامچہ کیش رجسٹر) کی رہنمائی"
        role="manager"
        roleLabel="Station Manager &amp; Head Cashier"
        purpose="Real-time chronological recording of every rupee entering or leaving station cash safe — cashier shift collections, customer recoveries, daily expenses, and bank deposits."
        steps={[
          {
            step: 1,
            title: 'Choose Cash Direction (رقم کی آمد یا خرچ)',
            detail: 'Select Cash IN (+) for collections and recoveries, or Cash OUT (-) for expenses and bank deposits.',
            urdu: 'آمد کے لیے کیش ان (+) اور اخراجات یا بینک جمع کے لیے کیش آؤٹ (-) منتخب کریں۔',
          },
          {
            step: 2,
            title: 'Pick Voucher Category (شعبہ / مد کا انتخاب)',
            detail: 'Classify as Shift Fuel, Customer Recovery, Bank Deposit, Expense, Staff Advance, or Lube Sale.',
            urdu: 'صحیح کیٹیگری منتخب کریں تاکہ کھاتہ درست رہے۔',
          },
          {
            step: 3,
            title: 'Enter Amount & Particulars (رقم اور تفصیل)',
            detail: 'Input exact rupee amount and note who handed over or received the cash with reference slip number.',
            urdu: 'رقم اور مکمل تفصیل بمعہ رسید نمبر درج کریں۔',
          },
          {
            step: 4,
            title: 'Safe Cash Balance Sync (محفوظ کیش کی تصدیق)',
            detail: 'The running cash in safe balance automatically adjusts immediately upon saving.',
            urdu: 'واؤچر محفوظ ہوتے ہی سیف میں موجود نقد رقم خودکار طور پر اپ ڈیٹ ہو جائے گی۔',
          },
        ]}
        criticalChecks={[
          'Physical cash counted in the safe MUST always match the Safe Cash in Hand balance.',
          'Whenever cash is taken to the bank, immediately log a "Bank Deposit" voucher with bank deposit slip number.',
          'Cashier shift mode restricts backdating past dates to ensure forecourt honesty.',
        ]}
      />

      {isCashier && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            backgroundColor: '#fefce8',
            border: '1px solid #fef08a',
            color: '#854d0e',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldIcon size={16} color="#854d0e" />
          <span>
            <strong>Cashier Shift Mode:</strong> Real-time voucher entry is active. Historical daybook backdating and record deletion are restricted by Station Security Policy.
          </span>
        </div>
      )}

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Opening Cash in Safe</span>
          <strong className="kpi-cell-value">Rs {(daybook[0]?.cashIn || 450000).toLocaleString()}</strong>
          <span className="kpi-cell-sub">Brought forward balance</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Cash Collected (+)</span>
          <strong className="kpi-cell-value text-green">+ Rs {totalCashIn.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Sales & customer cash</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Cash Disbursed (-)</span>
          <strong className="kpi-cell-value text-red">- Rs {totalCashOut.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Expenses & bank deposits</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Current Safe Cash in Hand</span>
          <strong className="kpi-cell-value text-gold">Rs {currentBalance.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Available station cash reserve</span>
        </div>
      </div>

      {/* Daybook Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Daily Cash Movement Entries</h3>
            <p className="surface-sub">Ordered chronologically by transaction timestamp</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Particulars / Description</th>
                <th>Category</th>
                <th>Ref Slip #</th>
                <th>Cash In (+)</th>
                <th>Cash Out (-)</th>
                <th>Safe Balance</th>
                <th>Handled By</th>
                <th>Security / Audit</th>
              </tr>
            </thead>
            <tbody>
              {daybook.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.time}</strong>
                    <div className="text-muted text-xs">{entry.date}</div>
                  </td>
                  <td>
                    <span className="font-semibold">{entry.particulars}</span>
                  </td>
                  <td>
                    <span className="category-tag">{entry.category}</span>
                  </td>
                  <td>{entry.referenceNo || '—'}</td>
                  <td className="text-green font-bold">
                    {entry.cashIn > 0 ? `+ Rs ${entry.cashIn.toLocaleString()}` : '—'}
                  </td>
                  <td className="text-red font-bold">
                    {entry.cashOut > 0 ? `- Rs ${entry.cashOut.toLocaleString()}` : '—'}
                  </td>
                  <td className="text-gold font-bold">
                    Rs {entry.balanceAfter.toLocaleString()}
                  </td>
                  <td>{entry.handledBy}</td>
                  <td>
                    <span
                      className="badge badge-outline"
                      style={{
                        fontSize: '11px',
                        color: '#686256',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ShieldIcon size={12} color="#686256" />
                      <span>Audit Locked</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Add Daybook Voucher Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Add Daybook Cash Transaction</h3>
                <span className="modal-sub">Record physical cash movement into or out of station safe</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Transaction Flow</label>
                  <div className="role-pills-row" style={{ marginTop: '2px' }}>
                    <button
                      type="button"
                      className={`role-pill-btn ${entryType === 'IN' ? 'active' : ''}`}
                      onClick={() => setEntryType('IN')}
                      style={entryType === 'IN' ? { backgroundColor: '#15803d', color: '#fff' } : {}}
                    >
                      Cash IN (Collection +)
                    </button>
                    <button
                      type="button"
                      className={`role-pill-btn ${entryType === 'OUT' ? 'active' : ''}`}
                      onClick={() => setEntryType('OUT')}
                      style={entryType === 'OUT' ? { backgroundColor: '#b91c1c', color: '#fff' } : {}}
                    >
                      Cash OUT (Payment -)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Voucher Date</span>
                    {isCashier && <span style={{ color: '#b45309', fontSize: '11px' }}>🔒 Locked to Today</span>}
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={isCashier ? todayStr : entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    disabled={isCashier}
                    style={isCashier ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' } : {}}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                  >
                    <option value="Fuel Sales">Daily Fuel Sales Handover</option>
                    <option value="Customer Recovery">Customer Credit Recovery</option>
                    <option value="Lube Sale">Lubricant Sale</option>
                    <option value="Bank Deposit">Bank Cash Deposit</option>
                    <option value="Expense">Station Operating Expense</option>
                    <option value="Staff Advance">Staff Salary Advance</option>
                    <option value="OMC Payment">OMC Settlement</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gold">Cash Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    required
                    min={1}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Particulars</label>
                <input
                  type="text"
                  className="form-input"
                  value={particulars}
                  onChange={(e) => setParticulars(e.target.value)}
                  placeholder="e.g. Morning Shift Handover by Zahid Khan, HBL Cash Deposit"
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Reference / Slip #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. SH-01, RCP-102, or DEP-45"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Handled By</label>
                  <input
                    type="text"
                    className="form-input"
                    value={handledBy}
                    onChange={(e) => setHandledBy(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Inline Calculation Strip */}
              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Current Safe Cash:</span>
                  <span className="calc-pill-val">Rs. {currentBalance.toLocaleString()}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">{entryType === 'IN' ? 'Cash Coming IN:' : 'Cash Going OUT:'}</span>
                  <span className={`calc-pill-val ${entryType === 'IN' ? 'text-green' : 'text-red'}`}>
                    {entryType === 'IN' ? `+ Rs. ${amount.toLocaleString()}` : `- Rs. ${amount.toLocaleString()}`}
                  </span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Projected Safe Balance:</span>
                  <span className="calc-pill-val text-gold">
                    Rs. {(entryType === 'IN' ? currentBalance + amount : Math.max(0, currentBalance - amount)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Cash Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Daybook */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Official Station Daily Cash Register (Daybook)"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Particulars</th>
              <th>Ref</th>
              <th>Cash In</th>
              <th>Cash Out</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {daybook.map((d) => (
              <tr key={d.id}>
                <td>{d.time}</td>
                <td>{d.particulars}</td>
                <td>{d.referenceNo || '—'}</td>
                <td>{d.cashIn > 0 ? `Rs ${d.cashIn.toLocaleString()}` : '—'}</td>
                <td>{d.cashOut > 0 ? `Rs ${d.cashOut.toLocaleString()}` : '—'}</td>
                <td>Rs {d.balanceAfter.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Closing Physical Safe Balance:</span>
          <strong>Rs {currentBalance.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
