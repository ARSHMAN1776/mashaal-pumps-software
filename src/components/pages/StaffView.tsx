import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { SalaryPayment, StaffMember, StaffRole, StaffStatus } from '../../types'
import { STAFF_ROLES } from '../../types'
import { formatDate, monthISO, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { planSalary } from '../../context/actions/people'
import { PrinterIcon, CheckCircleIcon, CashIcon, PlusIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard, Tabs } from '../common/kit'

const StaffModal: React.FC<{ member?: StaffMember; onClose: () => void }> = ({ member, onClose }) => {
  const [version] = useState(member?.updatedAt) // the record's version when this window was opened
  const { act } = useApp()
  const toast = useToast()
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'Pump Attendant')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [salary, setSalary] = useState(String(member?.monthlySalary ?? ''))
  const [limit, setLimit] = useState(String(member?.dailyAdvanceLimit ?? 5000))
  const [joined, setJoined] = useState(member?.joiningDate || todayISO())
  const [status, setStatus] = useState<StaffStatus>(member?.status ?? 'On Duty')
  const [active, setActive] = useState(member?.isActive ?? true)
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { name, role, phone, monthlySalary: Number(salary), dailyAdvanceLimit: Number(limit), joiningDate: joined, status }
    if (member) void run(() => act.updateStaff(member.id, { ...input, isActive: active, version }), () => { toast.success('Employee updated.'); onClose() })
    else void run(() => act.addStaff(input), (s) => { toast.success(`Added ${s.name}.`); onClose() })
  }

  return (
    <Modal title={member ? 'Edit Employee' : 'Add Employee'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Full name"><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Role"><select className="form-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
        </Grid2>
        <Grid2>
          <Field label="Phone"><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Joining date"><input type="date" className="form-input" value={joined} max={todayISO()} onChange={(e) => setJoined(e.target.value)} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Monthly salary (PKR)"><input type="number" min={0} step="any" className="form-input" value={salary} onChange={(e) => setSalary(e.target.value)} required /></Field>
          <Field label="Advance limit per day (PKR)" hint="0 = no daily limit"><input type="number" min={0} step="any" className="form-input" value={limit} onChange={(e) => setLimit(e.target.value)} required /></Field>
        </Grid2>
        {member && (
          <Grid2>
            <Field label="Duty status"><select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as StaffStatus)}><option>On Duty</option><option>Off Duty</option><option>On Leave</option></select></Field>
            <label className="ui-checkbox-row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active employee</span></label>
          </Grid2>
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : member ? 'Save changes' : 'Add employee'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const AdvanceModal: React.FC<{ staffId?: string; onClose: () => void }> = ({ staffId, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const list = activeSiteData.staff.filter((s) => s.isActive)
  const [id, setId] = useState(staffId ?? list[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const s = list.find((x) => x.id === id)
  const amt = Number(amount) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run((ack) => act.issueAdvance({ staffId: id, amount: Number(amount), reason, date, acknowledge: ack }), () => { toast.success(`Advance of ${rs(Number(amount))} issued — deducted from the safe.`); onClose() })
  }

  return (
    <Modal title="Issue Salary Advance" subtitle="Paid from the safe and deducted when the salary is paid" onClose={onClose} busy={busy} width={580}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Employee"><select className="form-input" value={id} onChange={(e) => setId(e.target.value)} required>{list.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role}) — salary {rs(m.monthlySalary)}</option>)}</select></Field>
          <Field label="Advance amount (PKR)" strong><input type="number" min={1} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Grid2>
          <Field label="Reason"><input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family medical emergency" required /></Field>
          <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        </Grid2>
        <CalcStrip items={[
          { label: 'Monthly salary', value: rs(s?.monthlySalary ?? 0) },
          { label: 'Already drawn', value: rs(s?.currentAdvances ?? 0), tone: 'red' },
          { label: 'New advance', value: `+ ${rs(amt)}`, tone: 'gold' },
          { label: 'Net pay after', value: rs(Math.max(0, (s?.monthlySalary ?? 0) - (s?.currentAdvances ?? 0) - amt)), tone: 'green' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || list.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Issue advance'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const SalaryModal: React.FC<{ staffId?: string; onClose: () => void; onPaid: (p: SalaryPayment) => void }> = ({ staffId, onClose, onPaid }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const list = activeSiteData.staff.filter((s) => s.isActive)
  const [id, setId] = useState(staffId ?? list[0]?.id ?? '')
  const [period, setPeriod] = useState(monthISO())
  const [absent, setAbsent] = useState('0')
  const [other, setOther] = useState('')
  const [reason, setReason] = useState('')
  const { busy, error, run } = useSubmit()
  const s = list.find((x) => x.id === id)
  const gross = s?.monthlySalary ?? 0
  const outstanding = activeSiteData.staffAdvances.filter((a) => a.staffId === id && a.status === 'Outstanding')
  const plan = planSalary(gross, Number(absent) || 0, Number(other) || 0, outstanding)
  const perDay = Math.round(gross / 30)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      (ack) => act.paySalary({ staffId: id, period, absentDays: Number(absent) || 0, otherDeduction: Number(other) || 0, deductionNote: reason, acknowledge: ack }),
      (p) => { toast.success(`Salary paid: ${rs(p.netPaid)}.`); onPaid(p); onClose() },
    )
  }

  return (
    <Modal title="Pay Monthly Salary" subtitle="Check the amount at the bottom, then press Pay salary" onClose={onClose} busy={busy} width={560}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Employee"><select className="form-input" value={id} onChange={(e) => setId(e.target.value)} required>{list.map((m) => <option key={m.id} value={m.id}>{m.name} — {rs(m.monthlySalary)}</option>)}</select></Field>
          <Field label="Salary month"><input type="month" className="form-input" value={period} onChange={(e) => setPeriod(e.target.value)} required /></Field>
        </Grid2>
        <Grid2>
          <Field label="Days absent" hint={`Each day absent takes off Rs ${perDay.toLocaleString()} (salary ÷ 30)`}><input type="number" min={0} max={31} step="0.5" className="form-input" value={absent} onChange={(e) => setAbsent(e.target.value)} /></Field>
          <Field label="Other deduction (Rs)" hint="Only if needed (fine, damage …)"><input type="number" min={0} step="any" className="form-input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" /></Field>
        </Grid2>
        {(Number(other) || 0) > 0 && <Field label="Reason for the deduction"><input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>}
        <CalcStrip items={[
          { label: 'Monthly salary', value: rs(gross) },
          { label: 'Taken off', value: `− ${rs(plan.deduction + plan.advances)}`, tone: 'red' },
          { label: 'You pay', value: rs(plan.net), tone: 'green' },
        ]} />
        {plan.deduction + plan.advances > 0 && (
          <p className="ui-muted" style={{ margin: 0, fontSize: 12.5 }}>
            {[plan.absent > 0 && `Absent: ${rs(plan.absent)}`, plan.other > 0 && `Other: ${rs(plan.other)}`, plan.advances > 0 && `Advances already taken: ${rs(plan.advances)}`].filter(Boolean).join('  •  ')}
          </p>
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || list.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Pay salary'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const StaffView: React.FC = () => {
  const { activeSiteData, act } = useApp()
  const { staff, staffAdvances, salaryPayments, siteInfo } = activeSiteData
  const confirm = useConfirm()
  const toast = useToast()
  const [tab, setTab] = useState<'roster' | 'advances' | 'salaries'>('roster')
  const [staffForm, setStaffForm] = useState<{ member?: StaffMember } | null>(null)
  const [advanceFor, setAdvanceFor] = useState<string | null>(null)
  const [salaryFor, setSalaryFor] = useState<string | null>(null)
  const [slip, setSlip] = useState<{ member: StaffMember; payment?: SalaryPayment } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const shown = staff.filter((s) => showInactive || s.isActive)
  const active = staff.filter((s) => s.isActive)
  const payroll = active.reduce((a, s) => a + s.monthlySalary, 0)
  const advances = active.reduce((a, s) => a + s.currentAdvances, 0)
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Removed employee'

  const cycleDuty = async (s: StaffMember) => {
    const next: StaffStatus = s.status === 'On Duty' ? 'Off Duty' : s.status === 'Off Duty' ? 'On Leave' : 'On Duty'
    const r = await act.setStaffStatus(s.id, next)
    if (!r.ok) toast.error(r.error)
  }
  const removeStaff = async (s: StaffMember) => {
    const yes = await confirm({ title: `Remove ${s.name}?`, message: 'An employee without payroll history is deleted; one with history is deactivated (records kept). Unsettled advances must be cleared first.', confirmLabel: 'Remove employee', tone: 'danger' })
    if (!yes) return
    const r = await act.removeStaff(s.id)
    if (r.ok) toast.success(r.value.mode === 'deleted' ? 'Employee deleted.' : 'Employee deactivated — payroll history kept.'); else toast.error(r.error)
  }
  const removeAdvance = async (id: string) => {
    if (!(await confirm({ title: 'Delete this advance?', message: 'The cash-out line in the daybook is removed too.', confirmLabel: 'Delete advance', tone: 'danger' }))) return
    const r = await act.removeAdvance(id)
    if (r.ok) toast.success('Advance deleted.'); else toast.error(r.error)
  }
  const removeSalary = async (p: SalaryPayment) => {
    if (!(await confirm({ title: 'Delete this salary payment?', message: `${name(p.staffId)} — ${p.period}, net ${rs(p.netPaid)}. The advances it settled become outstanding again and the cash line is removed.`, confirmLabel: 'Delete payment', tone: 'danger' }))) return
    const r = await act.removeSalaryPayment(p.id)
    if (r.ok) toast.success('Salary payment deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="WORKFORCE & ATTENDANCE"
        title="Staff Directory & Payroll"
        subtitle="Pump attendants, cashiers, supervisors, duty status, salary advances and monthly salary payments"
        actions={
          <>
            <button type="button" className="btn btn-outline" style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }} onClick={() => setStaffForm({})}><PlusIcon size={16} /><span>Add Employee</span></button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdvanceFor('')} disabled={active.length === 0}><CashIcon size={16} /><span>Issue Advance</span></button>
            <button type="button" className="btn btn-primary" onClick={() => setSalaryFor('')} disabled={active.length === 0}><CheckCircleIcon size={16} /><span>Pay Salary</span></button>
          </>
        }
      />

      <KpiStrip>
        <Kpi label="Active staff" value={`${active.length} employees`} sub={`${active.filter((s) => s.status === 'On Duty').length} on duty now`} />
        <Kpi label="Monthly payroll" value={rs(payroll)} sub="Base salaries" />
        <Kpi label="Unsettled advances" value={rs(advances)} tone="gold" sub="Deducted at salary payment" />
        <Kpi label="Net payable payroll" value={rs(payroll - advances)} tone="green" sub="After advances" />
      </KpiStrip>

      <Tabs
        tabs={[{ id: 'roster', label: 'Staff roster', count: shown.length }, { id: 'advances', label: 'Advances', count: staffAdvances.length }, { id: 'salaries', label: 'Salary payments', count: salaryPayments.length }]}
        active={tab}
        onChange={(t) => setTab(t as typeof tab)}
      />

      {tab === 'roster' && (
        <SectionCard title="Station Staff Roster" subtitle="Click the duty badge to change status" actions={<label className="ui-checkbox-row" style={{ margin: 0 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /><span>Show deactivated</span></label>}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Employee</th><th>Role</th><th>Phone</th><th>Duty</th><th>Salary</th><th>Advances</th><th>Net payable</th><th /></tr></thead>
              <tbody>
                {shown.length === 0 ? <EmptyRow colSpan={8}>No staff yet. Click "Add Employee".</EmptyRow> : shown.map((m) => (
                  <tr key={m.id} style={m.isActive ? undefined : { opacity: 0.55 }}>
                    <td><strong>{m.name}</strong><div className="text-muted text-xs">Joined {m.joiningDate ? formatDate(m.joiningDate) : '—'}{!m.isActive && ' • deactivated'}</div></td>
                    <td><span className="category-tag">{m.role}</span></td>
                    <td>{m.phone || '—'}</td>
                    <td>
                      <button type="button" className={`badge ${m.status === 'On Duty' ? 'badge-success' : m.status === 'Off Duty' ? 'badge-neutral' : 'badge-warning'}`} onClick={() => void cycleDuty(m)} disabled={!m.isActive} style={{ cursor: 'pointer' }} title="Click to change">{m.status}</button>
                    </td>
                    <td>{rs(m.monthlySalary)}</td>
                    <td className="text-red font-bold">{m.currentAdvances > 0 ? `- ${rs(m.currentAdvances)}` : 'Rs 0'}</td>
                    <td className="text-gold font-bold">{rs(m.monthlySalary - m.currentAdvances)}</td>
                    <td>
                      <RowActions>
                        <button type="button" className="btn btn-outline ui-mini-btn" disabled={!m.isActive} onClick={() => setAdvanceFor(m.id)}>Advance</button>
                        <button type="button" className="btn btn-outline ui-mini-btn" disabled={!m.isActive} onClick={() => setSalaryFor(m.id)}>Pay salary</button>
                        <IconButton label="Print pay slip" onClick={() => setSlip({ member: m })}><PrinterIcon size={14} /></IconButton>
                        <IconButton label="Edit employee" onClick={() => setStaffForm({ member: m })}><EditIcon size={14} /></IconButton>
                        <IconButton label="Remove employee" tone="danger" onClick={() => void removeStaff(m)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 'advances' && (
        <SectionCard title="Salary Advances" subtitle="Newest first">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Date</th><th>Employee</th><th>Reason</th><th>Amount</th><th>Status</th><th>Issued by</th><th /></tr></thead>
              <tbody>
                {staffAdvances.length === 0 ? <EmptyRow colSpan={7}>No advances recorded.</EmptyRow> : staffAdvances.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.date)}</td><td><strong>{name(a.staffId)}</strong></td><td>{a.reason}</td><td className="text-red font-bold">{rs(a.amount)}</td>
                    <td><span className={`badge ${a.status === 'Outstanding' ? 'badge-warning' : 'badge-success'}`}>{a.status}{a.settledOn ? ` ${formatDate(a.settledOn)}` : ''}</span></td>
                    <td>{a.recordedBy}</td>
                    <td>{a.status === 'Outstanding' && <RowActions><IconButton label="Delete advance" tone="danger" onClick={() => void removeAdvance(a.id)}><TrashIcon size={14} /></IconButton></RowActions>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 'salaries' && (
        <SectionCard title="Salary Payments" subtitle="Newest first">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Paid on</th><th>Employee</th><th>Month</th><th>Salary</th><th>Absent / other</th><th>Advances</th><th>Net paid</th><th>Paid by</th><th /></tr></thead>
              <tbody>
                {salaryPayments.length === 0 ? <EmptyRow colSpan={9}>No salaries paid yet.</EmptyRow> : salaryPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td><td><strong>{name(p.staffId)}</strong></td><td>{p.period}</td><td>{rs(p.grossSalary)}</td>
                    <td className="text-red" title={p.deductionNote || undefined}>{p.deduction > 0 ? `- ${rs(p.deduction)}${p.absentDays > 0 ? ` (${p.absentDays} d)` : ''}` : '—'}</td>
                    <td className="text-red">{p.advancesDeducted > 0 ? `- ${rs(p.advancesDeducted)}` : '—'}</td><td className="text-green font-bold">{rs(p.netPaid)}</td><td>{p.paidBy}</td>
                    <td><RowActions>
                      <IconButton label="Print pay slip" onClick={() => { const m = staff.find((s) => s.id === p.staffId); if (m) setSlip({ member: m, payment: p }) }}><PrinterIcon size={14} /></IconButton>
                      <IconButton label="Delete salary payment" tone="danger" onClick={() => void removeSalary(p)}><TrashIcon size={14} /></IconButton>
                    </RowActions></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {staffForm && <StaffModal member={staffForm.member} onClose={() => setStaffForm(null)} />}
      {advanceFor !== null && <AdvanceModal staffId={advanceFor || undefined} onClose={() => setAdvanceFor(null)} />}
      {salaryFor !== null && <SalaryModal staffId={salaryFor || undefined} onClose={() => setSalaryFor(null)} onPaid={(p) => { const m = staff.find((s) => s.id === p.staffId); if (m) setSlip({ member: m, payment: p }) }} />}

      <PrintReceiptModal isOpen={slip !== null} onClose={() => setSlip(null)} title="Staff Monthly Salary & Advance Slip" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        {slip && (
          <>
            <div className="slip-meta-grid">
              <div><strong>Staff:</strong> {slip.member.name}</div><div><strong>Role:</strong> {slip.member.role}</div>
              <div><strong>Month:</strong> {slip.payment?.period ?? monthISO()}</div><div><strong>Contact:</strong> {slip.member.phone || '—'}</div>
            </div>
            <div className="receipt-divider" />
            <div className="slip-summary-list">
              <div className="slip-row"><span>Base monthly salary:</span><strong>{rs(slip.payment?.grossSalary ?? slip.member.monthlySalary)}</strong></div>
              {(slip.payment?.deduction ?? 0) > 0 && <div className="slip-row"><span>Absent / other deductions{slip.payment?.deductionNote ? ` (${slip.payment.deductionNote})` : ''}:</span><span className="text-red">- {rs(slip.payment?.deduction ?? 0)}</span></div>}
              <div className="slip-row"><span>Advances deducted:</span><span className="text-red">- {rs(slip.payment?.advancesDeducted ?? slip.member.currentAdvances)}</span></div>
              <div className="receipt-divider" />
              <div className="slip-row highlight"><span>{slip.payment ? 'Net paid:' : 'Net payable:'}</span><strong>{rs(slip.payment?.netPaid ?? slip.member.monthlySalary - slip.member.currentAdvances)}</strong></div>
            </div>
            <div className="receipt-divider" />
            <div className="slip-signatures"><div><div className="sig-line" /><span>Employee signature</span></div><div><div className="sig-line" /><span>Station manager</span></div></div>
          </>
        )}
      </PrintReceiptModal>

      <ModuleGuide
        title="Staff Roster, Duty Shifts & Salary Guide"
        urduTitle="اسٹاف حاضری، شفٹ ڈیوٹی اور تنخواہ کی رہنمائی"
        role="manager"
        roleLabel="Station Manager"
        purpose="Keep the staff list, toggle duty status, issue advances from the safe, and pay the monthly salary with advances deducted automatically."
        steps={[
          { step: 1, title: 'Duty status (ڈیوٹی اسٹیٹس)', detail: 'Click the status badge to cycle On Duty → Off Duty → On Leave. It is saved for everyone.', urdu: 'ڈیوٹی بٹن پر کلک کر کے حاضری لگائیں۔' },
          { step: 2, title: 'Issue advance (ایڈوانس)', detail: 'Enter the amount and reason. The limit per day and the salary are checked. Cash leaves the safe automatically.', urdu: 'ایڈوانس رقم اور وجہ درج کریں، رقم ڈے بک سے کٹ جائے گی۔' },
          { step: 3, title: 'Pay salary (تنخواہ)', detail: 'Choose the month. Unsettled advances are deducted and the net cash is posted to the daybook.', urdu: 'ماہانہ تنخواہ میں سے ایڈوانس خودکار منہا ہو جاتا ہے۔' },
          { step: 4, title: 'Correct mistakes (درستگی)', detail: 'Advances and salary payments can be deleted; everything they posted is reversed.', urdu: 'غلط اندراج حذف کریں، تمام اثرات واپس ہو جائیں گے۔' },
        ]}
        criticalChecks={[
          'Advances must not exceed the policy limit for that role.',
          'Obtain a signature or thumb impression on the printed advance / pay slip.',
        ]}
      />
    </div>
  )
}
