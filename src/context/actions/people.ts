/**
 * Staff, salary advances and payroll.
 *
 *  - An advance is cash out of the safe (posted to the daybook automatically) and stays "Outstanding"
 *    until it is deducted when the month's salary is paid.
 *  - Paying a salary deducts the outstanding advances (oldest first, never more than the salary), marks
 *    them Settled, and posts the net cash paid to the daybook. Deleting the salary payment reverses all of it.
 */
import { STAFF_ROLES } from '../../types'
import type { SalaryPayment, StaffAdvance, StaffMember, StaffRole, StaffStatus } from '../../types'
import { fail, ok, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import { newId } from '../../lib/ids'
import { round2 } from '../../lib/money'
import { monthISO, todayISO } from '../../lib/dates'
import {
  EPS, auditOp, checkDate, clean, fmt, guard, isNonNegative, isPositive, money, needManager, run, safeCash,
  syncLinkedDaybook, type ActionCtx,
} from './core'

const lc = (s: string) => s.trim().toLowerCase()

export interface StaffInput {
  name: string
  role: StaffRole
  phone: string
  monthlySalary: number
  dailyAdvanceLimit: number
  joiningDate: string
  status: StaffStatus
}

function validateStaff(c: ActionCtx, i: StaffInput, selfId?: string): Result<never> | null {
  if (!clean(i.name)) return fail('Enter the employee name.')
  if (!STAFF_ROLES.includes(i.role)) return fail('Choose the role.')
  if (!isNonNegative(money(i.monthlySalary))) return fail('Monthly salary cannot be negative.')
  if (!isNonNegative(money(i.dailyAdvanceLimit))) return fail('The advance limit cannot be negative.')
  if (c.raw.staff.some((s) => s.id !== selfId && lc(s.name) === lc(i.name) && s.isActive)) return fail('An active employee with this name already exists.')
  return null
}

export function addStaff(c: ActionCtx, i: StaffInput): Promise<Result<StaffMember>> {
  return run(async () => {
    const denied = needManager(c, 'add staff')
    if (denied) return denied
    const bad = validateStaff(c, i)
    if (bad) return bad
    const s: StaffMember = {
      id: newId('STF'), siteId: c.siteId, name: clean(i.name), role: i.role, phone: clean(i.phone), monthlySalary: money(i.monthlySalary),
      dailyAdvanceLimit: money(i.dailyAdvanceLimit), currentAdvances: 0, joiningDate: i.joiningDate || todayISO(), status: i.status, isActive: true,
    }
    await c.commit([op.insert('staff_members', s), auditOp(c, 'staff.add', 'staff', s.id, `Added employee ${s.name} (${s.role})`)])
    return ok(s)
  })
}

export function updateStaff(c: ActionCtx, id: string, i: StaffInput & { isActive: boolean }): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit staff')
    if (denied) return denied
    const s = c.raw.staff.find((x) => x.id === id)
    if (!s) return fail('Employee not found.')
    const bad = validateStaff(c, i, id)
    if (bad) return bad
    await c.commit([
      op.update('staff_members', { ...s, name: clean(i.name), role: i.role, phone: clean(i.phone), monthlySalary: money(i.monthlySalary), dailyAdvanceLimit: money(i.dailyAdvanceLimit), joiningDate: i.joiningDate, status: i.status, isActive: i.isActive }),
      auditOp(c, 'staff.edit', 'staff', id, `Edited employee ${i.name}`, { before: { salary: s.monthlySalary, role: s.role }, after: { salary: i.monthlySalary, role: i.role } }),
    ])
    return ok(undefined)
  })
}

export function setStaffStatus(c: ActionCtx, id: string, status: StaffStatus): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'change duty status')
    if (denied) return denied
    const s = c.raw.staff.find((x) => x.id === id)
    if (!s) return fail('Employee not found.')
    await c.commit([op.update('staff_members', { ...s, status })])
    return ok(undefined)
  })
}

export function removeStaff(c: ActionCtx, id: string): Promise<Result<{ mode: 'deleted' | 'deactivated' }>> {
  return run<{ mode: 'deleted' | 'deactivated' }>(async () => {
    const denied = needManager(c, 'remove staff')
    if (denied) return denied
    const s = c.data.staff.find((x) => x.id === id)
    if (!s) return fail('Employee not found.')
    if (s.currentAdvances > EPS) return fail(`${s.name} has ${fmt(s.currentAdvances)} of unsettled advances. Pay the salary (or delete the advances) first.`, 'BALANCE_DUE')
    const hasHistory = c.raw.staffAdvances.some((a) => a.staffId === id) || c.raw.salaryPayments.some((p) => p.staffId === id)
    if (!hasHistory) {
      await c.commit([op.remove('staff_members', id), auditOp(c, 'staff.delete', 'staff', id, `Deleted employee ${s.name}`)])
      return ok({ mode: 'deleted' as const })
    }
    await c.commit([
      op.update('staff_members', { ...c.raw.staff.find((x) => x.id === id)!, isActive: false, status: 'Off Duty' }),
      auditOp(c, 'staff.deactivate', 'staff', id, `Deactivated employee ${s.name} (payroll history kept)`),
    ])
    return ok({ mode: 'deactivated' as const })
  })
}

// ===========================================================================
// Advances
// ===========================================================================
export interface AdvanceInput {
  staffId: string
  amount: number
  reason: string
  date?: string
  /** DAILY_LIMIT, SALARY_LIMIT, NEGATIVE_SAFE */
  acknowledge?: string[]
}

export function issueAdvance(c: ActionCtx, i: AdvanceInput): Promise<Result<StaffAdvance>> {
  return run(async () => {
    const denied = needManager(c, 'issue salary advances')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const staff = c.data.staff.find((x) => x.id === i.staffId)
    if (!staff) return fail('Choose an employee.')
    if (!staff.isActive) return fail(`${staff.name} is deactivated.`)
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (!clean(i.reason)) return fail('Enter the reason for the advance.')
    const sameDay = c.raw.staffAdvances.filter((a) => a.staffId === staff.id && a.date === date).reduce((s, a) => s + a.amount, 0)
    const daily = guard(c, i.acknowledge, 'DAILY_LIMIT', staff.dailyAdvanceLimit > 0 && sameDay + amount > staff.dailyAdvanceLimit + EPS,
      `${staff.name}'s advance limit is ${fmt(staff.dailyAdvanceLimit)} per day (already ${fmt(sameDay)} today).`)
    if (daily) return daily
    const salary = guard(c, i.acknowledge, 'SALARY_LIMIT', staff.monthlySalary > 0 && staff.currentAdvances + amount > staff.monthlySalary + EPS,
      `Unsettled advances would reach ${fmt(staff.currentAdvances + amount)}, more than the monthly salary of ${fmt(staff.monthlySalary)}.`)
    if (salary) return salary
    const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', amount > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe.`)
    if (low) return low

    const adv: StaffAdvance = {
      id: newId('ADV'), staffId: staff.id, date, amount, reason: clean(i.reason), status: 'Outstanding', settledOn: '', settlementId: '', recordedBy: c.user.name, createdAt: '',
    }
    await c.commit([
      op.insert('staff_advances', adv),
      ...syncLinkedDaybook(c, 'staff_advance', adv.id, {
        date, particulars: `Staff Advance: ${staff.name} — ${adv.reason}`, category: 'Staff Advance', cashOut: amount, referenceNo: adv.id,
      }),
    ])
    return ok(adv)
  })
}

export function removeAdvance(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete advances')
    if (denied) return denied
    const a = c.raw.staffAdvances.find((x) => x.id === id)
    if (!a) return fail('Advance not found.')
    if (a.status === 'Settled') return fail('This advance was already deducted in a salary payment. Delete that salary payment first.')
    await c.commit([
      op.remove('staff_advances', id),
      ...syncLinkedDaybook(c, 'staff_advance', id, null),
      auditOp(c, 'advance.delete', 'staff_advance', id, `Deleted advance ${fmt(a.amount)}`, { advance: a }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Salary
// ===========================================================================
export interface SalaryInput {
  staffId: string
  /** YYYY-MM */
  period?: string
  date?: string
  notes?: string
  acknowledge?: string[]
}

export function paySalary(c: ActionCtx, i: SalaryInput): Promise<Result<SalaryPayment>> {
  return run(async () => {
    const denied = needManager(c, 'pay salaries')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const period = i.period || monthISO()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('Choose the salary month.')
    const staff = c.data.staff.find((x) => x.id === i.staffId)
    if (!staff) return fail('Choose an employee.')
    if (c.raw.salaryPayments.some((p) => p.staffId === staff.id && p.period === period)) {
      return fail(`${staff.name}'s salary for ${period} has already been paid.`)
    }
    const gross = round2(staff.monthlySalary)
    if (!isPositive(gross)) return fail(`${staff.name} has no monthly salary set.`)

    // deduct outstanding advances, oldest first, never more than the salary
    const outstanding = c.raw.staffAdvances.filter((a) => a.staffId === staff.id && a.status === 'Outstanding')
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    let deducted = 0
    const settle: StaffAdvance[] = []
    for (const a of outstanding) {
      if (deducted + a.amount <= gross + EPS) {
        deducted = round2(deducted + a.amount)
        settle.push(a)
      }
    }
    const net = round2(gross - deducted)
    const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', net > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe; the net salary is ${fmt(net)}.`)
    if (low) return low

    const pay: SalaryPayment = {
      id: newId('SAL'), staffId: staff.id, period, date, grossSalary: gross, advancesDeducted: deducted, netPaid: net, paidBy: c.user.name, notes: clean(i.notes),
    }
    const ops: Op[] = [op.insert('staff_salary_payments', pay)]
    for (const a of settle) ops.push(op.update('staff_advances', { ...a, status: 'Settled', settledOn: date, settlementId: pay.id }))
    if (net > EPS) {
      ops.push(...syncLinkedDaybook(c, 'salary', pay.id, {
        date, particulars: `Salary ${period}: ${staff.name} (net of ${fmt(deducted)} advances)`, category: 'Salary Payment', cashOut: net, referenceNo: pay.id,
      }))
    }
    ops.push(auditOp(c, 'salary.pay', 'salary', pay.id, `Paid ${staff.name} ${fmt(net)} for ${period}`, { gross, deducted }))
    await c.commit(ops)
    return ok(pay)
  })
}

export function removeSalaryPayment(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete salary payments')
    if (denied) return denied
    const pay = c.raw.salaryPayments.find((p) => p.id === id)
    if (!pay) return fail('Salary payment not found.')
    const ops: Op[] = [op.remove('staff_salary_payments', id), ...syncLinkedDaybook(c, 'salary', id, null)]
    for (const a of c.raw.staffAdvances.filter((x) => x.settlementId === id)) {
      ops.push(op.update('staff_advances', { ...a, status: 'Outstanding', settledOn: '', settlementId: '' }))
    }
    ops.push(auditOp(c, 'salary.delete', 'salary', id, `Deleted salary payment ${fmt(pay.netPaid)} (${pay.period})`, { payment: pay }))
    await c.commit(ops)
    return ok(undefined)
  })
}
