import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon, CheckCircleIcon, XIcon, CashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import type { StaffMember } from '../../types'

export const StaffView: React.FC = () => {
  const { activeSiteData, updateStaffAdvance, updateStaffStatus, addDaybookEntry } = useApp()
  const { staff, siteInfo } = activeSiteData

  // No longer uses local state for staff list — reads directly from AppContext
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)

  // Advance Form
  const [advanceStaffId, setAdvanceStaffId] = useState(staff[0]?.id || '')
  const [advanceAmount, setAdvanceAmount] = useState<number>(2000)
  const [advanceReason, setAdvanceReason] = useState('Emergency family advance')

  const handleToggleDuty = (id: string, currentStatus: StaffMember['status']) => {
    const nextStatus: StaffMember['status'] =
      currentStatus === 'On Duty' ? 'Off Duty' : currentStatus === 'Off Duty' ? 'On Leave' : 'On Duty'
    updateStaffStatus(id, nextStatus)
  }

  const handleSaveAdvance = (e: React.FormEvent) => {
    e.preventDefault()
    const target = staff.find((s) => s.id === advanceStaffId)
    if (!target) return

    // Persist advance to AppContext (and therefore localStorage)
    updateStaffAdvance(advanceStaffId, advanceAmount)

    // Also record cash outflow in the station daybook
    addDaybookEntry({
      date: new Date().toISOString().split('T')[0],
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      particulars: `Staff Advance: ${target.name} — ${advanceReason}`,
      category: 'Staff Advance',
      cashIn: 0,
      cashOut: advanceAmount,
      balanceAfter: 0, // auto-computed by addDaybookEntry fix
      referenceNo: `ADV-${Date.now()}`,
      handledBy: siteInfo.managerName,
    })

    setAdvanceModalOpen(false)
  }

  const handlePrintSlip = (member: StaffMember) => {
    setSelectedStaff(member)
    setPrintOpen(true)
  }

  const totalMonthlyPayroll = staff.reduce((sum, s) => sum + s.monthlySalary, 0)
  const totalAdvancesTaken = staff.reduce((sum, s) => sum + s.currentAdvances, 0)

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">WORKFORCE &amp; ATTENDANCE</span>
          <h2 className="page-heading">Staff Directory &amp; Payroll Advances</h2>
          <p className="page-sub">
            Pump attendants, cashiers, shift supervisors, attendance monitoring, and monthly salary slips
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Payroll Summary</span>
          </button>
          <button className="btn btn-primary" onClick={() => setAdvanceModalOpen(true)}>
            <CashIcon size={16} />
            <span>Issue Salary Advance</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Staff Roster, Duty Shifts & Salary Advances Guide"
        urduTitle="اسٹاف حاضری، شفٹ ڈیوٹی اور ایڈوانس تنخواہ کی رہنمائی"
        role="manager"
        roleLabel="Station Manager"
        purpose="Monitor pump attendants and security guards, toggle daily duty status (On Duty / Off Duty / On Leave), issue salary advances, and deduct advances at month-end payroll settlement."
        steps={[
          {
            step: 1,
            title: 'Attendance & Duty Toggle (ڈیوٹی اسٹیٹس تبدیل کریں)',
            detail: 'Click the duty status button on any staff card to cycle between On Duty, Off Duty, and On Leave.',
            urdu: 'ملازم کے ڈیوٹی بٹن پر کلک کر کے حاضری لگائیں یا رخصت درج کریں۔',
          },
          {
            step: 2,
            title: 'Issue Salary Advance (ایڈوانس رقم جاری کریں)',
            detail: 'Click "Issue Salary Advance", select employee, enter valid reason, and confirm PKR amount.',
            urdu: 'ایڈوانس رقم اور وجہ درج کر کے منظوری دیں۔',
          },
          {
            step: 3,
            title: 'Automatic Daybook Outflow (ڈے بک سے کیش کٹوتی)',
            detail: 'The advance cash is automatically logged as a Daybook cash-out entry from the safe register.',
            urdu: 'رقم سیف سے ادا ہو کر ڈے بک میں خودکار طور پر درج ہو جائے گی۔',
          },
          {
            step: 4,
            title: 'Print Monthly Salary Slip (تنخواہ پرچی پرنٹ کریں)',
            detail: 'Click "Print Pay Slip" on any staff member to view base salary, advances taken, and net pay.',
            urdu: 'ماہانہ تنخواہ میں سے ایڈوانس منہا کر کے کمپیوٹرائزڈ پرچی پرنٹ کریں۔',
          },
        ]}
        criticalChecks={[
          'Ensure employee advances do not exceed the established policy limit for that role.',
          'Always obtain physical thumb impression or signature on the printed advance voucher.',
        ]}
      />

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Active Station Staff</span>
          <strong className="kpi-cell-value">{staff.length} Employees</strong>
          <span className="kpi-cell-sub">{staff.filter((s) => s.status === 'On Duty').length} Currently On Duty</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Monthly Payroll</span>
          <strong className="kpi-cell-value">Rs {totalMonthlyPayroll.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Base monthly salaries</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Current Advances Outstanding</span>
          <strong className="kpi-cell-value text-gold">Rs {totalAdvancesTaken.toLocaleString()}</strong>
          <span className="kpi-cell-sub">To be deducted at month-end</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Net Payable Payroll</span>
          <strong className="kpi-cell-value text-green">
            Rs {(totalMonthlyPayroll - totalAdvancesTaken).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Net disbursement after advance</span>
        </div>
      </div>

      {/* Staff Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Station Staff Roster</h3>
            <p className="surface-sub">Click attendance badge to toggle duty status (On Duty / Off Duty / On Leave)</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Duty Status</th>
                <th>Monthly Base Salary</th>
                <th>Advances Taken</th>
                <th>Net Payable</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <div className="text-muted text-xs">Joined: {member.joiningDate}</div>
                  </td>
                  <td>
                    <span className="category-tag">{member.role}</span>
                  </td>
                  <td>{member.phone}</td>
                  <td>
                    <button
                      className={`badge ${
                        member.status === 'On Duty'
                          ? 'badge-success'
                          : member.status === 'Off Duty'
                          ? 'badge-neutral'
                          : 'badge-warning'
                      }`}
                      onClick={() => handleToggleDuty(member.id, member.status)}
                      title="Click to toggle status"
                      style={{ cursor: 'pointer' }}
                    >
                      {member.status}
                    </button>
                  </td>
                  <td>Rs {member.monthlySalary.toLocaleString()}</td>
                  <td className="text-red font-bold">
                    {member.currentAdvances > 0 ? `- Rs ${member.currentAdvances.toLocaleString()}` : 'Rs 0'}
                  </td>
                  <td className="text-gold font-bold">
                    Rs {(member.monthlySalary - member.currentAdvances).toLocaleString()}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handlePrintSlip(member)}>
                      <PrinterIcon size={14} /> Pay Slip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Advance Modal */}
      {advanceModalOpen && (
        <div className="modal-backdrop" onClick={() => setAdvanceModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Issue Staff Salary Advance</h3>
                <span className="modal-sub">Deducts from safe cash and logs against monthly payroll</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setAdvanceModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdvance} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Select Staff Member</label>
                  <select
                    className="form-input"
                    value={advanceStaffId}
                    onChange={(e) => setAdvanceStaffId(e.target.value)}
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role}) — Salary: Rs {s.monthlySalary.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gold">Advance Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                    required
                    min={100}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Advance Reason / Emergency</label>
                <input
                  type="text"
                  className="form-input"
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  placeholder="e.g. Family medical emergency or Eid festival advance"
                  required
                />
              </div>

              {/* Inline Calculation Strip */}
              {(() => {
                const s = staff.find((m) => m.id === advanceStaffId) || staff[0]
                const salary = s?.monthlySalary || 0
                const curAdv = s?.currentAdvances || 0
                const rem = Math.max(0, salary - (curAdv + advanceAmount))
                return (
                  <div className="calc-preview-inline-strip">
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Monthly Salary:</span>
                      <span className="calc-pill-val">Rs. {salary.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Already Drawn:</span>
                      <span className="calc-pill-val text-red">Rs. {curAdv.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">New Advance:</span>
                      <span className="calc-pill-val text-gold">+ Rs. {advanceAmount.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Remaining Net Pay:</span>
                      <span className="calc-pill-val text-green">Rs. {rem.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAdvanceModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Issue Advance Slip</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Slip Modal */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Staff Monthly Salary &amp; Advance Slip"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <div className="slip-meta-grid">
          <div>
            <strong>Staff:</strong> {selectedStaff?.name || staff[0]?.name}
          </div>
          <div>
            <strong>Role:</strong> {selectedStaff?.role || staff[0]?.role}
          </div>
          <div>
            <strong>Month:</strong> {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div>
            <strong>Contact:</strong> {selectedStaff?.phone || staff[0]?.phone}
          </div>
        </div>

        <div className="receipt-divider" />

        <div className="slip-summary-list">
          <div className="slip-row">
            <span>Base Monthly Salary:</span>
            <strong>Rs {(selectedStaff?.monthlySalary || staff[0]?.monthlySalary || 0).toLocaleString()}</strong>
          </div>
          <div className="slip-row">
            <span>Salary Advances Deducted:</span>
            <span className="text-red">
              - Rs {(selectedStaff?.currentAdvances || staff[0]?.currentAdvances || 0).toLocaleString()}
            </span>
          </div>
          <div className="receipt-divider" />
          <div className="slip-row highlight">
            <span>Net Payable Balance:</span>
            <strong>
              Rs{' '}
              {(
                (selectedStaff?.monthlySalary || staff[0]?.monthlySalary || 0) -
                (selectedStaff?.currentAdvances || staff[0]?.currentAdvances || 0)
              ).toLocaleString()}
            </strong>
          </div>
        </div>

        <div className="receipt-divider" />
        <div className="slip-signatures">
          <div>
            <div className="sig-line" />
            <span>Employee Signature</span>
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
