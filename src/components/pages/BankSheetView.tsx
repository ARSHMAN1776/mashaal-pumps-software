import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon, PrinterIcon, CheckCircleIcon, XIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const BankSheetView: React.FC = () => {
  const { activeSiteData, addDaybookEntry, addBankDeposit } = useApp()
  const { bankAccounts, bankTransactions, siteInfo } = activeSiteData

  const [modalOpen, setModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Deposit Form
  const [selectedBankId, setSelectedBankId] = useState(bankAccounts[0]?.id || '')
  const [depositAmount, setDepositAmount] = useState<number>(300000)
  const [slipNo, setSlipNo] = useState(`DEP-${Math.floor(100 + Math.random() * 900)}`)
  const [description, setDescription] = useState('Pump morning shift cash collection deposit')

  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId) || bankAccounts[0]
  const totalBankBalances = bankAccounts.reduce((sum, b) => sum + b.currentBalance, 0)

  const handleSaveDeposit = (e: React.FormEvent) => {
    e.preventDefault()

    // 1. Credit the bank account and add to bank transaction log
    addBankDeposit({
      bankId: selectedBank.id,
      amount: depositAmount,
      slipNo,
      description,
    })

    // 2. Also record in daybook as cash out from safe
    addDaybookEntry({
      date: new Date().toISOString().split('T')[0],
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      particulars: `Cash Deposited to ${selectedBank.bankName} (Slip #${slipNo})`,
      category: 'Bank Deposit',
      cashIn: 0,
      cashOut: depositAmount,
      balanceAfter: 0,
      referenceNo: slipNo,
      handledBy: siteInfo.managerName,
    })

    setModalOpen(false)
  }

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">STATION BANKING & LIQUIDITY</span>
          <h2 className="page-heading">Bank Sheet & Daily Cash Deposits</h2>
          <p className="page-sub">
            Station commercial accounts, daily cash deposits from pump collections, and bank transfer reconciliations
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Deposit Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <PlusIcon size={16} />
            <span>Record Cash Deposit to Bank</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Station Commercial Banking & Cash Remittances Guide"
        urduTitle="اسٹیشن کے بینک کھاتہ جات اور کیش جمع کی رہنمائی"
        role="manager"
        roleLabel="Station Manager &amp; Owner"
        purpose="Manage station commercial bank accounts, log cash deposit slips from daily shift collections, and track bank balances for OMC fuel pay orders."
        steps={[
          {
            step: 1,
            title: 'Deposit Physical Cash (بینک میں کیش جمع کروانا)',
            detail: 'Take cash from safe to the designated commercial bank branch (HBL, MCB, NBP, etc.).',
            urdu: 'سیف سے نقد رقم لے جا کر بینک میں جمع کروائیں۔',
          },
          {
            step: 2,
            title: 'Obtain Deposit Slip (بینک مہر شدہ رسید حاصل کریں)',
            detail: 'Ensure the bank teller provides a signed and stamped physical deposit slip voucher.',
            urdu: 'بینک کیشیر سے مہر شدہ اور دستخط شدہ ڈپازٹ سلپ لیں۔',
          },
          {
            step: 3,
            title: 'Record Deposit in System (سسٹم میں اندراج)',
            detail: 'Select bank account, enter deposited amount, and record stamped slip reference number.',
            urdu: 'بینک کا انتخاب کر کے سلپ نمبر اور جمع شدہ رقم درج کریں۔',
          },
          {
            step: 4,
            title: 'Automatic Daybook Deduction (ڈے بک سے خودکار کٹوتی)',
            detail: 'Saving instantly credits the bank account and creates a cash-out entry in the Daybook.',
            urdu: 'بینک بیلنس میں اضافہ ہو جائے گا اور ڈے بک سے اتنی رقم منہا ہو جائے گی۔',
          },
        ]}
        criticalChecks={[
          'Always verify teller stamp and deposit slip number before completing the transaction.',
          'Verify sufficient bank liquidity 24 hours prior to issuing OMC tanker fuel supply pay orders.',
        ]}
      />

      {/* Modern Bank Account Cards */}
      <div className="tanks-meter-row">
        {bankAccounts.map((bank) => (
          <div key={bank.id} className="tank-gauge-card">
            <div className="tank-card-top">
              <div>
                <span className="tank-number-tag">{bank.branch}</span>
                <h4 className="tank-fuel-title">{bank.bankName}</h4>
              </div>
              <span className="badge badge-neutral">Active Account</span>
            </div>

            <div className="bank-card-meta">
              <div className="meta-row">
                <span className="text-muted">Title:</span>
                <strong>{bank.accountTitle}</strong>
              </div>
              <div className="meta-row">
                <span className="text-muted">Account #:</span>
                <span className="font-mono">{bank.accountNumber}</span>
              </div>
            </div>

            <div className="tank-stats-row">
              <div className="tank-stat-item">
                <span className="stat-label">Available Balance</span>
                <strong className="stat-val text-gold">Rs {bank.currentBalance.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Total Station Bank Balances</span>
          <strong className="kpi-cell-value text-gold">Rs {totalBankBalances.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Across all {bankAccounts.length} company accounts</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Today's Total Deposits</span>
          <strong className="kpi-cell-value text-green">
            Rs {bankTransactions.filter((t) => t.type === 'Deposit').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Shift cash safely banked</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">OMC Wire Transfers</span>
          <strong className="kpi-cell-value">
            Rs {bankTransactions.filter((t) => t.type === 'OMC Online Transfer').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">RTGS payments disbursed</span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Recent Bank Transactions & Deposit Slips</h3>
            <p className="surface-sub">Logged physical deposit slips and company account movements</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Deposit Slip #</th>
                <th>Particulars / Description</th>
                <th>Amount (PKR)</th>
                <th>Account Balance After</th>
              </tr>
            </thead>
            <tbody>
              {bankTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>
                    <span className={`badge ${tx.type === 'Deposit' ? 'badge-success' : 'badge-neutral'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td>
                    <strong>{tx.depositSlipNo || '—'}</strong>
                  </td>
                  <td>{tx.description}</td>
                  <td className="text-gold font-bold">Rs {tx.amount.toLocaleString()}</td>
                  <td>Rs {tx.balanceAfter.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Deposit Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Cash Deposit to Bank Account</h3>
                <span className="modal-sub">Deducts cash from safe and credits station bank ledger</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDeposit} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Deposit Into Bank Account</label>
                  <select
                    className="form-input"
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} (Bal: Rs {b.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Bank Stamped Slip #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={slipNo}
                    onChange={(e) => setSlipNo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label font-bold text-gold">Deposit Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    required
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Deposit Description</label>
                  <input
                    type="text"
                    className="form-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Inline Calculation Strip */}
              {(() => {
                const b = bankAccounts.find((acc) => acc.id === selectedBankId) || bankAccounts[0]
                const balBefore = b?.currentBalance || 0
                const balAfter = balBefore + depositAmount
                return (
                  <div className="calc-preview-inline-strip">
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Bank Balance Before:</span>
                      <span className="calc-pill-val">Rs. {balBefore.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Cash Deposited:</span>
                      <span className="calc-pill-val text-green">+ Rs. {depositAmount.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">New Bank Balance:</span>
                      <span className="calc-pill-val text-gold">Rs. {balAfter.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Deposit Slip</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Slip Modal */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Bank Cash Deposit Summary"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-summary-list">
          <div className="slip-row">
            <span>Primary Account:</span>
            <strong>{bankAccounts[0]?.bankName}</strong>
          </div>
          <div className="slip-row">
            <span>Account Title:</span>
            <span>{bankAccounts[0]?.accountTitle}</span>
          </div>
          <div className="slip-row">
            <span>Total Liquid Bank Balance:</span>
            <strong className="text-gold">Rs {totalBankBalances.toLocaleString()}</strong>
          </div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
