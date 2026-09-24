/**
 * Customers (fleet credit accounts), their credit slips (DEBIT = fuel taken on credit),
 * recoveries (CREDIT = money received) and manual ledger adjustments.
 *
 * Rules
 *  - A customer's balance is never stored: it is opening balance + slips + debit notes - recoveries - credit notes.
 *  - A customer that already has ledger history is never hard-deleted (that would erase financial records):
 *      no history            -> deleted
 *      history, balance = 0  -> archived (hidden from lists, ledger kept)
 *      history, balance != 0 -> refused until the balance is settled
 *  - A cash recovery automatically posts a cash-in line to the daybook; editing or deleting the
 *    recovery edits/removes that line too.
 */
import { FUEL_TYPES } from '../../types'
import type {
  CreditSaleSlip, Customer, CustomerAdjustment, CustomerRecovery, CustomerStatus, FuelType, RecoveryMethod,
} from '../../types'
import { rateOnDate } from '../../data/derive'
import { fail, ok, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import { newId } from '../../lib/ids'
import { round2 } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import {
  EPS, auditOp, checkDate, clean, fmt, guard, isNonNegative, isPositive, money, needManager, run,
  syncLinkedBankTx, syncLinkedDaybook, type ActionCtx,
} from './core'

/** A customer registered with this plate (or with no plates at all) accepts any vehicle. */
export const ANY_VEHICLE = 'GENERAL-FLEET'

export const normalizePlate = (p: string) => clean(p).toUpperCase().replace(/\s+/g, ' ')

export function parseVehicles(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(/[,\n;]/)) {
    const p = normalizePlate(part)
    if (p) seen.add(p)
  }
  return [...seen]
}

export const acceptsAnyVehicle = (c: Pick<Customer, 'vehicleNumbers'>) =>
  c.vehicleNumbers.length === 0 || c.vehicleNumbers.includes(ANY_VEHICLE)

// ===========================================================================
// Customers
// ===========================================================================
export interface CustomerInput {
  businessName: string
  name: string
  phone: string
  vehicleNumbers: string[]
  creditLimit: number
  openingBalance: number
  status: Exclude<CustomerStatus, 'Archived'>
}

function validateCustomer(c: ActionCtx, i: CustomerInput, selfId?: string): Result<never> | null {
  const business = clean(i.businessName)
  if (!business) return fail('Enter the business / transporter name.')
  if (!clean(i.phone)) return fail('Enter a phone number (used for WhatsApp statements).')
  if (!isNonNegative(money(i.creditLimit))) return fail('The credit limit cannot be negative.')
  if (!Number.isFinite(money(i.openingBalance))) return fail('Enter the opening balance as a number.')
  if (i.status !== 'Active' && i.status !== 'Hold') return fail('Status must be Active or Hold.')
  const dup = c.raw.customers.find((x) => x.id !== selfId && x.businessName.trim().toLowerCase() === business.toLowerCase())
  if (dup) return fail(`A customer named "${dup.businessName}" already exists${dup.status === 'Archived' ? ' (archived — restore it instead)' : ''}.`)
  return null
}

export function createCustomer(c: ActionCtx, i: CustomerInput): Promise<Result<Customer>> {
  return run(async () => {
    const denied = needManager(c, 'register customers')
    if (denied) return denied
    const bad = validateCustomer(c, i)
    if (bad) return bad
    const customer: Customer = {
      id: newId('CUST'), siteId: c.siteId, name: clean(i.name) || clean(i.businessName), businessName: clean(i.businessName),
      phone: clean(i.phone), vehicleNumbers: i.vehicleNumbers.map(normalizePlate).filter(Boolean),
      creditLimit: money(i.creditLimit), openingBalance: round2(money(i.openingBalance)), currentBalance: round2(money(i.openingBalance)),
      status: i.status,
    }
    await c.commit([
      op.insert('customers', customer),
      auditOp(c, 'customer.create', 'customer', customer.id, `Registered ${customer.businessName}`, {
        creditLimit: customer.creditLimit, openingBalance: customer.openingBalance,
      }),
    ])
    return ok(customer)
  })
}

export function updateCustomer(c: ActionCtx, id: string, i: CustomerInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit customers')
    if (denied) return denied
    const customer = c.raw.customers.find((x) => x.id === id)
    if (!customer) return fail('Customer not found.')
    const bad = validateCustomer(c, i, id)
    if (bad) return bad
    const next: Customer = {
      ...customer, name: clean(i.name) || clean(i.businessName), businessName: clean(i.businessName), phone: clean(i.phone),
      vehicleNumbers: i.vehicleNumbers.map(normalizePlate).filter(Boolean), creditLimit: money(i.creditLimit),
      openingBalance: round2(money(i.openingBalance)), status: i.status,
    }
    const ops: Op[] = [op.update('customers', next)]
    // names are copied onto slips/recoveries for printing; keep history readable if the business is renamed
    if (next.businessName !== customer.businessName) {
      for (const s of c.raw.creditSlips.filter((x) => x.customerId === id)) ops.push(op.update('credit_slips', { ...s, customerName: next.businessName }))
      for (const r of c.raw.recoveries.filter((x) => x.customerId === id)) ops.push(op.update('customer_recoveries', { ...r, customerName: next.businessName }))
    }
    ops.push(auditOp(c, 'customer.edit', 'customer', id, `Edited ${next.businessName}`, {
      before: { businessName: customer.businessName, creditLimit: customer.creditLimit, openingBalance: customer.openingBalance, status: customer.status, phone: customer.phone },
      after: { businessName: next.businessName, creditLimit: next.creditLimit, openingBalance: next.openingBalance, status: next.status, phone: next.phone },
    }))
    await c.commit(ops)
    return ok(undefined)
  })
}

export function restoreCustomer(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'restore customers')
    if (denied) return denied
    const customer = c.raw.customers.find((x) => x.id === id)
    if (!customer) return fail('Customer not found.')
    await c.commit([
      op.update('customers', { ...customer, status: 'Active' }),
      auditOp(c, 'customer.restore', 'customer', id, `Restored ${customer.businessName}`),
    ])
    return ok(undefined)
  })
}

export const customerHistoryCount = (c: ActionCtx, id: string) =>
  c.raw.creditSlips.filter((s) => s.customerId === id).length +
  c.raw.recoveries.filter((r) => r.customerId === id).length +
  c.raw.customerAdjustments.filter((a) => a.customerId === id).length

export function removeCustomer(c: ActionCtx, id: string): Promise<Result<{ mode: 'deleted' | 'archived' }>> {
  return run<{ mode: 'deleted' | 'archived' }>(async () => {
    const denied = needManager(c, 'delete customers')
    if (denied) return denied
    const customer = c.data.customers.find((x) => x.id === id)
    if (!customer) return fail('Customer not found.')
    const history = customerHistoryCount(c, id)
    if (history === 0) {
      if (Math.abs(customer.openingBalance) > EPS) {
        return fail(`${customer.businessName} carries an opening balance of ${fmt(customer.openingBalance)}. Record its recovery (or a credit note) first.`, 'BALANCE_DUE')
      }
      await c.commit([
        op.remove('customers', id),
        auditOp(c, 'customer.delete', 'customer', id, `Deleted ${customer.businessName}`),
      ])
      return ok({ mode: 'deleted' as const })
    }
    if (Math.abs(customer.currentBalance) > EPS) {
      return fail(
        `${customer.businessName} still ${customer.currentBalance > 0 ? 'owes' : 'has an advance of'} ${fmt(Math.abs(customer.currentBalance))}. ` +
        'Settle the balance (record a recovery or a credit/debit note) before removing this customer.', 'BALANCE_DUE')
    }
    await c.commit([
      op.update('customers', { ...c.raw.customers.find((x) => x.id === id)!, status: 'Archived' }),
      auditOp(c, 'customer.archive', 'customer', id, `Archived ${customer.businessName} (${history} ledger entries kept)`),
    ])
    return ok({ mode: 'archived' as const })
  })
}

// ===========================================================================
// Credit slips (DEBIT)
// ===========================================================================
export interface SlipInput {
  customerId: string
  vehicleNo: string
  driverName: string
  fuelType: FuelType
  liters: number
  date?: string
  /** VEHICLE_NOT_REGISTERED, LIMIT_EXCEEDED — accepted knowingly by a manager */
  acknowledge?: string[]
}

export function issueSlip(c: ActionCtx, i: SlipInput): Promise<Result<CreditSaleSlip>> {
  return run(async () => {
    const date = i.date || todayISO()
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const customer = c.data.customers.find((x) => x.id === i.customerId)
    if (!customer) return fail('Choose a customer.')
    if (customer.status === 'Hold') return fail(`${customer.businessName} is on HOLD — new credit slips are blocked until a manager reactivates the account.`, 'HOLD')
    if (customer.status === 'Archived') return fail(`${customer.businessName} is archived. Restore the account first.`, 'ARCHIVED')
    const plate = normalizePlate(i.vehicleNo)
    if (!plate) return fail('Enter the vehicle registration number.')
    if (!clean(i.driverName)) return fail('Enter the driver name.')
    if (!FUEL_TYPES.includes(i.fuelType)) return fail('Choose the fuel product.')
    const liters = money(i.liters)
    if (!isPositive(liters)) return fail('Liters must be more than 0.')
    // the price in force on the slip's date (a late slip for a day before a price change keeps the old rate)
    const rate = rateOnDate(c.data.tariffHistory, c.data.settings.rates, i.fuelType, date)
    if (!isPositive(rate)) return fail(`Set the ${i.fuelType} rate in Settings first.`)
    const total = round2(liters * rate)

    const notRegistered = !acceptsAnyVehicle(customer) && !customer.vehicleNumbers.includes(plate)
    const g1 = guard(c, i.acknowledge, 'VEHICLE_NOT_REGISTERED', notRegistered,
      `${plate} is not on ${customer.businessName}'s registered vehicle list (${customer.vehicleNumbers.join(', ')}).`)
    if (g1) return g1
    const after = customer.currentBalance + total
    const g2 = guard(c, i.acknowledge, 'LIMIT_EXCEEDED', after > customer.creditLimit + EPS,
      `This slip (${fmt(total)}) takes ${customer.businessName} to ${fmt(after)}, above the approved credit limit of ${fmt(customer.creditLimit)}.`)
    if (g2) return g2

    const slipNo = `SLIP-${await c.nextNo('slip')}`
    const slip: CreditSaleSlip = {
      id: newId('CS'), slipNo, date, customerId: customer.id, customerName: customer.businessName, vehicleNo: plate,
      driverName: clean(i.driverName), fuelType: i.fuelType, liters, rate, totalAmount: total, authorizedBy: c.user.name, createdAt: '',
    }
    const ops: Op[] = [op.insert('credit_slips', slip)]
    if (notRegistered) {
      const raw = c.raw.customers.find((x) => x.id === customer.id)!
      ops.push(op.update('customers', { ...raw, vehicleNumbers: [...raw.vehicleNumbers, plate] }))
    }
    await c.commit(ops)
    return ok(slip)
  })
}

export interface SlipEdit {
  vehicleNo: string
  driverName: string
  fuelType: FuelType
  liters: number
  date: string
  rate?: number
}

export function updateSlip(c: ActionCtx, id: string, i: SlipEdit): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit credit slips')
    if (denied) return denied
    const slip = c.raw.creditSlips.find((s) => s.id === id)
    if (!slip) return fail('Slip not found.')
    const bad = checkDate(c, i.date)
    if (bad) return bad
    if (!normalizePlate(i.vehicleNo)) return fail('Enter the vehicle registration number.')
    if (!clean(i.driverName)) return fail('Enter the driver name.')
    if (!FUEL_TYPES.includes(i.fuelType)) return fail('Choose the fuel product.')
    const liters = money(i.liters)
    if (!isPositive(liters)) return fail('Liters must be more than 0.')
    const rate = i.rate !== undefined ? money(i.rate) : i.fuelType === slip.fuelType ? slip.rate : rateOnDate(c.data.tariffHistory, c.data.settings.rates, i.fuelType, i.date)
    if (!isPositive(rate)) return fail('The rate per liter must be more than 0.')
    const total = round2(liters * rate)
    await c.commit([
      op.update('credit_slips', { ...slip, vehicleNo: normalizePlate(i.vehicleNo), driverName: clean(i.driverName), fuelType: i.fuelType, liters, rate, totalAmount: total, date: i.date }),
      auditOp(c, 'slip.edit', 'credit_slip', id, `Edited slip ${slip.slipNo}: ${fmt(slip.totalAmount)} → ${fmt(total)}`, {
        before: { liters: slip.liters, rate: slip.rate, total: slip.totalAmount, vehicle: slip.vehicleNo },
        after: { liters, rate, total, vehicle: normalizePlate(i.vehicleNo) },
      }),
    ])
    return ok(undefined)
  })
}

export function removeSlip(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete credit slips')
    if (denied) return denied
    const slip = c.raw.creditSlips.find((s) => s.id === id)
    if (!slip) return fail('Slip not found.')
    await c.commit([
      op.remove('credit_slips', id),
      auditOp(c, 'slip.delete', 'credit_slip', id, `Deleted slip ${slip.slipNo} (${slip.customerName}, ${fmt(slip.totalAmount)})`, { slip }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Recoveries (CREDIT)
// ===========================================================================
export interface RecoveryInput {
  customerId: string
  amount: number
  method: RecoveryMethod
  referenceNo: string
  date?: string
  /** bank account credited by a cheque / online transfer (managers only) */
  bankAccountId?: string
  /** OVERPAYMENT */
  acknowledge?: string[]
}

const recoveryDaybook = (r: { receiptNo: string; customerName: string; amount: number; date: string; method: RecoveryMethod }) => ({
  date: r.date,
  particulars: `Recovery ${r.receiptNo}: ${r.customerName} (${r.method})`,
  category: 'Customer Recovery' as const,
  cashIn: r.amount,
  referenceNo: r.receiptNo,
})

export function recordRecovery(c: ActionCtx, i: RecoveryInput): Promise<Result<CustomerRecovery>> {
  return run(async () => {
    const date = i.date || todayISO()
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const customer = c.data.customers.find((x) => x.id === i.customerId)
    if (!customer) return fail('Choose a customer.')
    if (customer.status === 'Archived') return fail(`${customer.businessName} is archived. Restore the account first.`)
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (i.method !== 'Cash' && !clean(i.referenceNo)) return fail('Enter the cheque number / transfer reference.')
    const over = guard(c, i.acknowledge, 'OVERPAYMENT', amount > customer.currentBalance + EPS,
      `${fmt(amount)} is more than ${customer.businessName} owes (${fmt(Math.max(0, customer.currentBalance))}). The extra would be kept as an advance.`)
    if (over) return over
    const bankId = i.method !== 'Cash' && c.user.role !== 'cashier' ? clean(i.bankAccountId) : ''
    if (bankId && !c.raw.bankAccounts.some((b) => b.id === bankId)) return fail('Choose a valid bank account.')

    const receiptNo = `RCP-${await c.nextNo('receipt')}`
    const rec: CustomerRecovery = {
      id: newId('REC'), receiptNo, date, customerId: customer.id, customerName: customer.businessName, paymentMethod: i.method,
      amount, referenceNo: clean(i.referenceNo) || (i.method === 'Cash' ? 'Cash' : ''), receivedBy: c.user.name, bankAccountId: bankId,
      // a cheque / online payment with no bank account yet waits for a manager to place it (see assignRecoveryBank)
      bankPending: i.method !== 'Cash' && !bankId, createdAt: '',
    }
    const ops: Op[] = [op.insert('customer_recoveries', rec)]
    if (i.method === 'Cash') {
      ops.push(...syncLinkedDaybook(c, 'recovery', rec.id, recoveryDaybook({ ...rec, method: i.method })))
    } else if (bankId) {
      ops.push(...syncLinkedBankTx(c, 'recovery', rec.id, {
        bankId, date, type: 'Credit Received', amount, description: `${i.method} from ${customer.businessName} (${rec.referenceNo}) — ${receiptNo}`,
      }))
    }
    await c.commit(ops)
    return ok(rec)
  })
}

export interface RecoveryEdit {
  amount: number
  method: RecoveryMethod
  referenceNo: string
  date: string
  bankAccountId?: string
  acknowledge?: string[]
}

export function updateRecovery(c: ActionCtx, id: string, i: RecoveryEdit): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit recoveries')
    if (denied) return denied
    const rec = c.raw.recoveries.find((r) => r.id === id)
    if (!rec) return fail('Recovery not found.')
    const customer = c.data.customers.find((x) => x.id === rec.customerId)
    if (!customer) return fail('The customer of this recovery no longer exists.')
    const bad = checkDate(c, i.date)
    if (bad) return bad
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (i.method !== 'Cash' && !clean(i.referenceNo)) return fail('Enter the cheque number / transfer reference.')
    const over = guard(c, i.acknowledge, 'OVERPAYMENT', amount > customer.currentBalance + rec.amount + EPS,
      `${fmt(amount)} is more than ${customer.businessName} owed at that point. The extra would be kept as an advance.`)
    if (over) return over
    const bankId = i.method !== 'Cash' ? clean(i.bankAccountId) : ''
    if (bankId && !c.raw.bankAccounts.some((b) => b.id === bankId)) return fail('Choose a valid bank account.')

    const next: CustomerRecovery = { ...rec, amount, paymentMethod: i.method, referenceNo: clean(i.referenceNo), date: i.date, bankAccountId: bankId, bankPending: i.method !== 'Cash' && !bankId }
    const ops: Op[] = [op.update('customer_recoveries', next)]
    ops.push(...syncLinkedDaybook(c, 'recovery', id, i.method === 'Cash' ? recoveryDaybook({ ...next, method: i.method }) : null))
    ops.push(...syncLinkedBankTx(c, 'recovery', id, bankId ? {
      bankId, date: i.date, type: 'Credit Received', amount, description: `${i.method} from ${rec.customerName} (${next.referenceNo}) — ${rec.receiptNo}`,
    } : null))
    ops.push(auditOp(c, 'recovery.edit', 'recovery', id, `Edited receipt ${rec.receiptNo}: ${fmt(rec.amount)} → ${fmt(amount)}`, {
      before: { amount: rec.amount, method: rec.paymentMethod, date: rec.date }, after: { amount, method: i.method, date: i.date },
    }))
    await c.commit(ops)
    return ok(undefined)
  })
}

/** A manager places a cheque / online payment noted by a cashier into a bank account: adds the bank line. */
export function assignRecoveryBank(c: ActionCtx, id: string, bankId: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'confirm bank receipts')
    if (denied) return denied
    const rec = c.raw.recoveries.find((r) => r.id === id)
    if (!rec) return fail('Receipt not found.')
    if (!rec.bankPending) return fail('This receipt is already placed in a bank account.')
    const bank = c.raw.bankAccounts.find((b) => b.id === bankId)
    if (!bank) return fail('Choose the bank account.')
    if (!bank.isActive) return fail(`${bank.bankName} is deactivated.`)
    await c.commit([
      op.update('customer_recoveries', { ...rec, bankAccountId: bank.id, bankPending: false }),
      ...syncLinkedBankTx(c, 'recovery', id, {
        bankId: bank.id, date: rec.date, type: 'Credit Received', amount: rec.amount,
        description: `${rec.paymentMethod} from ${rec.customerName} (${rec.referenceNo}) — ${rec.receiptNo}`,
      }),
      auditOp(c, 'recovery.bank', 'recovery', id, `Receipt ${rec.receiptNo} (${fmt(rec.amount)}) placed in ${bank.bankName}`),
    ])
    return ok(undefined)
  })
}

export function removeRecovery(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete recoveries')
    if (denied) return denied
    const rec = c.raw.recoveries.find((r) => r.id === id)
    if (!rec) return fail('Recovery not found.')
    await c.commit([
      op.remove('customer_recoveries', id),
      ...syncLinkedDaybook(c, 'recovery', id, null),
      ...syncLinkedBankTx(c, 'recovery', id, null),
      auditOp(c, 'recovery.delete', 'recovery', id, `Deleted receipt ${rec.receiptNo} (${rec.customerName}, ${fmt(rec.amount)})`, { recovery: rec }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Manual ledger adjustments (debit note / credit note)
// ===========================================================================
export interface AdjustmentInput {
  customerId: string
  kind: 'Debit' | 'Credit'
  amount: number
  reason: string
  date?: string
  referenceNo?: string
}

export function addAdjustment(c: ActionCtx, i: AdjustmentInput): Promise<Result<CustomerAdjustment>> {
  return run(async () => {
    const denied = needManager(c, 'post ledger adjustments')
    if (denied) return denied
    const customer = c.raw.customers.find((x) => x.id === i.customerId)
    if (!customer) return fail('Choose a customer.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (!clean(i.reason)) return fail('Enter the reason for this adjustment (it is kept in the audit trail).')
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const adj: CustomerAdjustment = {
      id: newId('ADJ'), date, customerId: i.customerId, kind: i.kind, amount, reason: clean(i.reason),
      referenceNo: clean(i.referenceNo), recordedBy: c.user.name, createdAt: '',
    }
    await c.commit([
      op.insert('customer_adjustments', adj),
      auditOp(c, 'adjustment.add', 'customer_adjustment', adj.id, `${i.kind} note ${fmt(amount)} for ${customer.businessName}: ${adj.reason}`),
    ])
    return ok(adj)
  })
}

export function updateAdjustment(c: ActionCtx, id: string, i: Omit<AdjustmentInput, 'customerId'>): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit ledger adjustments')
    if (denied) return denied
    const adj = c.raw.customerAdjustments.find((a) => a.id === id)
    if (!adj) return fail('Adjustment not found.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (!clean(i.reason)) return fail('Enter the reason for this adjustment.')
    const date = i.date || adj.date
    const bad = checkDate(c, date)
    if (bad) return bad
    await c.commit([
      op.update('customer_adjustments', { ...adj, kind: i.kind, amount, reason: clean(i.reason), date, referenceNo: clean(i.referenceNo) }),
      auditOp(c, 'adjustment.edit', 'customer_adjustment', id, `Edited ${adj.kind} note: ${fmt(adj.amount)} → ${i.kind} ${fmt(amount)}`),
    ])
    return ok(undefined)
  })
}

export function removeAdjustment(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete ledger adjustments')
    if (denied) return denied
    const adj = c.raw.customerAdjustments.find((a) => a.id === id)
    if (!adj) return fail('Adjustment not found.')
    await c.commit([
      op.remove('customer_adjustments', id),
      auditOp(c, 'adjustment.delete', 'customer_adjustment', id, `Deleted ${adj.kind} note ${fmt(adj.amount)}: ${adj.reason}`, { adjustment: adj }),
    ])
    return ok(undefined)
  })
}

