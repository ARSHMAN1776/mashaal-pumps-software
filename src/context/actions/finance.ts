/**
 * Money movements: daybook (cash safe), expenses, bank accounts, OMC purchases, suppliers, owner withdrawals.
 *
 * Every record that moves cash or bank money writes its own cash-book / bank line in the SAME transaction,
 * tagged with (sourceType, sourceId). Editing or deleting the record edits or removes that line, so the
 * cash book and bank balances always agree with the records behind them.
 */
import { DAYBOOK_CATEGORIES, EXPENSE_CATEGORIES } from '../../types'
import type {
  BankAccount, BankTxType, DaybookCategory, ExpenseCategory, ExpenseRecord, FuelType, OmcInvoice, OmcPayment, OmcPaymentMethod,
  OwnerTransferRecord, Supplier, SupplierTransaction,
} from '../../types'
import { fail, ok, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import { newId } from '../../lib/ids'
import { round2 } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import {
  EPS, auditOp, bankBalance, bankTxInsertOp, checkDate, checkVersion, clean, daybookInsertOp, fmt, guard, isManager, isNonNegative,
  isPositive, money, needManager, needRole, run, safeCash, syncLinkedBankTx, syncLinkedDaybook, type ActionCtx,
} from './core'

const lc = (s: string) => s.trim().toLowerCase()

// ===========================================================================
// Daybook (manual cash entries)
// ===========================================================================
export interface DaybookEntryInput {
  date?: string
  particulars: string
  category: DaybookCategory
  direction: 'IN' | 'OUT'
  amount: number
  referenceNo?: string
  handledBy?: string
  acknowledge?: string[]
}

export function addDaybookEntry(c: ActionCtx, i: DaybookEntryInput): Promise<Result<void>> {
  return run(async () => {
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (!clean(i.particulars)) return fail('Enter a description.')
    if (!DAYBOOK_CATEGORIES.includes(i.category)) return fail('Choose a category.')
    if (i.category === 'Owner Withdrawal') return fail('Owner withdrawals are recorded by the owner in Financial & Annual Performance (Owner Withdrawal).')
    const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', i.direction === 'OUT' && amount > safeCash(c) + EPS,
      `Only ${fmt(safeCash(c))} is recorded in the safe. This payment of ${fmt(amount)} would make the cash balance negative.`)
    if (low) return low
    await c.commit([daybookInsertOp(c, {
      date, particulars: clean(i.particulars), category: i.category,
      cashIn: i.direction === 'IN' ? amount : 0, cashOut: i.direction === 'OUT' ? amount : 0,
      referenceNo: clean(i.referenceNo), handledBy: clean(i.handledBy),
    })])
    return ok(undefined)
  })
}

export function removeDaybookEntry(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete cash-book entries')
    if (denied) return denied
    const e = c.raw.daybook.find((x) => x.id === id)
    if (!e) return fail('Entry not found.')
    if (e.sourceType === 'owner_cash') {
      const notOwner = needRole(c, ['owner'], 'delete owner cash withdrawals')
      if (notOwner) return notOwner
    } else if (e.sourceType) {
      return fail('This cash line was created by another record (a recovery, expense, deposit ...). Delete or edit that record instead.')
    }
    await c.commit([
      op.remove('daybook_entries', id),
      auditOp(c, 'daybook.delete', 'daybook', id, `Deleted cash entry "${e.particulars}" (in ${fmt(e.cashIn)}, out ${fmt(e.cashOut)})`, { entry: e }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Expenses
// ===========================================================================
export interface ExpenseInput {
  category: ExpenseCategory
  payee: string
  description: string
  amount: number
  paymentMode: 'Cash' | 'Bank'
  bankAccountId?: string
  date?: string
  voucherNo?: string
  acknowledge?: string[]
  /** updatedAt of the record when the edit window was opened */
  version?: string
}

const expenseDaybook = (e: { category: string; description: string; amount: number; date: string; voucherNo: string }) => ({
  date: e.date,
  particulars: `Expense: ${e.category} (${e.description})`,
  category: 'Expense' as const,
  cashOut: e.amount,
  referenceNo: e.voucherNo,
})
const expenseBankTx = (e: { bankAccountId: string; category: string; payee: string; amount: number; date: string; voucherNo: string }) => ({
  bankId: e.bankAccountId, date: e.date, type: 'Expense Payment' as const, amount: e.amount,
  description: `Expense ${e.voucherNo}: ${e.category} — ${e.payee}`,
})

function validateExpense(c: ActionCtx, i: ExpenseInput): Result<never> | null {
  if (!EXPENSE_CATEGORIES.includes(i.category)) return fail('Choose the expense category.')
  if (!clean(i.payee)) return fail('Enter who was paid (payee).')
  if (!clean(i.description)) return fail('Enter a description.')
  if (!isPositive(money(i.amount))) return fail('The amount must be more than 0.')
  if (i.paymentMode === 'Bank') {
    if (!isManager(c)) return fail('Cashiers can only record cash expenses from the safe.', 'FORBIDDEN')
    if (!c.raw.bankAccounts.some((b) => b.id === i.bankAccountId)) return fail('Choose the bank account this was paid from.')
  }
  return null
}

export function addExpense(c: ActionCtx, i: ExpenseInput): Promise<Result<ExpenseRecord>> {
  return run(async () => {
    const date = i.date || todayISO()
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const bad = validateExpense(c, i)
    if (bad) return bad
    const amount = round2(money(i.amount))
    const voucherNo = clean(i.voucherNo) || `VOU-${await c.nextNo('voucher')}`
    if (c.raw.expenses.some((e) => lc(e.voucherNo) === lc(voucherNo))) return fail(`Voucher ${voucherNo} already exists.`)
    const low = i.paymentMode === 'Cash'
      ? guard(c, i.acknowledge, 'NEGATIVE_SAFE', amount > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe; this ${fmt(amount)} expense would make it negative.`)
      : guard(c, i.acknowledge, 'NEGATIVE_BANK', amount > bankBalance(c, clean(i.bankAccountId)) + EPS, `The selected bank account holds only ${fmt(bankBalance(c, clean(i.bankAccountId)))}.`)
    if (low) return low

    const exp: ExpenseRecord = {
      id: newId('EXP'), voucherNo, date, category: i.category, description: clean(i.description), payee: clean(i.payee), amount,
      paymentMode: i.paymentMode, approvedBy: c.user.name, bankAccountId: i.paymentMode === 'Bank' ? clean(i.bankAccountId) : '',
    }
    const ops: Op[] = [op.insert('expenses', exp)]
    ops.push(...(i.paymentMode === 'Cash'
      ? syncLinkedDaybook(c, 'expense', exp.id, expenseDaybook(exp))
      : syncLinkedBankTx(c, 'expense', exp.id, expenseBankTx(exp))))
    await c.commit(ops)
    return ok(exp)
  })
}

export function updateExpense(c: ActionCtx, id: string, i: ExpenseInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit expenses')
    if (denied) return denied
    const old = c.raw.expenses.find((e) => e.id === id)
    if (!old) return fail('Expense not found.')
    const stale = checkVersion(old, i.version)
    if (stale) return stale
    const date = i.date || old.date
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const bad = validateExpense(c, i)
    if (bad) return bad
    const voucherNo = clean(i.voucherNo) || old.voucherNo
    if (c.raw.expenses.some((e) => e.id !== id && lc(e.voucherNo) === lc(voucherNo))) return fail(`Voucher ${voucherNo} already exists.`)
    const amount = round2(money(i.amount))
    const next: ExpenseRecord = {
      ...old, voucherNo, date, category: i.category, description: clean(i.description), payee: clean(i.payee), amount,
      paymentMode: i.paymentMode, bankAccountId: i.paymentMode === 'Bank' ? clean(i.bankAccountId) : '',
    }
    const ops: Op[] = [op.update('expenses', next, i.version)]
    ops.push(...syncLinkedDaybook(c, 'expense', id, next.paymentMode === 'Cash' ? expenseDaybook(next) : null))
    ops.push(...syncLinkedBankTx(c, 'expense', id, next.paymentMode === 'Bank' ? expenseBankTx(next) : null))
    ops.push(auditOp(c, 'expense.edit', 'expense', id, `Edited voucher ${old.voucherNo}: ${fmt(old.amount)} → ${fmt(amount)}`, {
      before: { amount: old.amount, mode: old.paymentMode, category: old.category }, after: { amount, mode: next.paymentMode, category: next.category },
    }))
    await c.commit(ops)
    return ok(undefined)
  })
}

export function removeExpense(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete expenses')
    if (denied) return denied
    const e = c.raw.expenses.find((x) => x.id === id)
    if (!e) return fail('Expense not found.')
    await c.commit([
      op.remove('expenses', id),
      ...syncLinkedDaybook(c, 'expense', id, null),
      ...syncLinkedBankTx(c, 'expense', id, null),
      auditOp(c, 'expense.delete', 'expense', id, `Deleted voucher ${e.voucherNo} (${e.category}, ${fmt(e.amount)})`, { expense: e }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Bank accounts
// ===========================================================================
export interface BankAccountInput {
  bankName: string
  accountTitle: string
  accountNumber: string
  branch: string
  openingBalance: number
  version?: string
}

function validateBankAccount(c: ActionCtx, i: BankAccountInput, selfId?: string): Result<never> | null {
  if (!clean(i.bankName)) return fail('Enter the bank name.')
  if (!clean(i.accountNumber)) return fail('Enter the account number.')
  if (!Number.isFinite(money(i.openingBalance))) return fail('Enter the opening balance as a number.')
  if (c.raw.bankAccounts.some((b) => b.id !== selfId && lc(b.bankName) === lc(i.bankName) && lc(b.accountNumber) === lc(i.accountNumber))) {
    return fail('This bank account is already registered.')
  }
  return null
}

export function addBankAccount(c: ActionCtx, i: BankAccountInput): Promise<Result<BankAccount>> {
  return run(async () => {
    const denied = needManager(c, 'add bank accounts')
    if (denied) return denied
    const bad = validateBankAccount(c, i)
    if (bad) return bad
    const acc: BankAccount = {
      id: newId('BANK'), bankName: clean(i.bankName), accountTitle: clean(i.accountTitle), accountNumber: clean(i.accountNumber),
      branch: clean(i.branch), openingBalance: round2(money(i.openingBalance)), currentBalance: round2(money(i.openingBalance)), isActive: true,
    }
    await c.commit([op.insert('bank_accounts', acc), auditOp(c, 'bank.add', 'bank_account', acc.id, `Added bank account ${acc.bankName} ${acc.accountNumber}`)])
    return ok(acc)
  })
}

export function updateBankAccount(c: ActionCtx, id: string, i: BankAccountInput & { isActive: boolean }): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit bank accounts')
    if (denied) return denied
    const acc = c.raw.bankAccounts.find((b) => b.id === id)
    if (!acc) return fail('Bank account not found.')
    const stale = checkVersion(acc, i.version)
    if (stale) return stale
    const bad = validateBankAccount(c, i, id)
    if (bad) return bad
    await c.commit([
      op.update('bank_accounts', {
        ...acc, bankName: clean(i.bankName), accountTitle: clean(i.accountTitle), accountNumber: clean(i.accountNumber),
        branch: clean(i.branch), openingBalance: round2(money(i.openingBalance)), isActive: i.isActive,
      }, i.version),
      auditOp(c, 'bank.edit', 'bank_account', id, `Edited bank account ${i.bankName}`, { before: { opening: acc.openingBalance }, after: { opening: i.openingBalance } }),
    ])
    return ok(undefined)
  })
}

const bankInUse = (c: ActionCtx, id: string) =>
  c.raw.bankTransactions.some((t) => t.bankId === id) || c.raw.ownerTransfers.some((t) => t.bankId === id) ||
  c.raw.expenses.some((e) => e.bankAccountId === id) || c.raw.omcPayments.some((p) => p.bankAccountId === id) ||
  c.raw.recoveries.some((r) => r.bankAccountId === id) || c.raw.supplierTransactions.some((t) => t.bankAccountId === id)

export function removeBankAccount(c: ActionCtx, id: string): Promise<Result<{ mode: 'deleted' | 'deactivated' }>> {
  return run<{ mode: 'deleted' | 'deactivated' }>(async () => {
    const denied = needManager(c, 'delete bank accounts')
    if (denied) return denied
    const acc = c.data.bankAccounts.find((b) => b.id === id)
    if (!acc) return fail('Bank account not found.')
    if (Math.abs(acc.currentBalance) > EPS) {
      return fail(`${acc.bankName} still holds ${fmt(acc.currentBalance)}. Move the balance out (withdrawal / transfer) before removing the account.`, 'BALANCE_DUE')
    }
    if (!bankInUse(c, id)) {
      await c.commit([op.remove('bank_accounts', id), auditOp(c, 'bank.delete', 'bank_account', id, `Deleted bank account ${acc.bankName}`)])
      return ok({ mode: 'deleted' as const })
    }
    await c.commit([
      op.update('bank_accounts', { ...c.raw.bankAccounts.find((b) => b.id === id)!, isActive: false }),
      auditOp(c, 'bank.deactivate', 'bank_account', id, `Deactivated bank account ${acc.bankName} (history kept)`),
    ])
    return ok({ mode: 'deactivated' as const })
  })
}

// ---- bank deposits / withdrawals / fees -----------------------------------
export interface BankDepositInput {
  bankId: string
  amount: number
  slipNo: string
  description: string
  date?: string
  /** cash = taken from the safe; external = cheque / online credit that never touched the safe */
  funding: 'cash' | 'external'
  acknowledge?: string[]
}

export function depositToBank(c: ActionCtx, i: BankDepositInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'record bank deposits')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const acc = c.data.bankAccounts.find((b) => b.id === i.bankId)
    if (!acc) return fail('Choose a bank account.')
    if (!acc.isActive) return fail('This bank account is deactivated.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    if (!clean(i.slipNo)) return fail('Enter the bank deposit slip number.')
    const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', i.funding === 'cash' && amount > safeCash(c) + EPS,
      `Only ${fmt(safeCash(c))} is recorded in the safe; depositing ${fmt(amount)} would make the cash balance negative.`)
    if (low) return low
    const tx = bankTxInsertOp({
      bankId: acc.id, date, type: i.funding === 'cash' ? 'Deposit' : 'Credit Received', amount, depositSlipNo: clean(i.slipNo),
      description: clean(i.description) || 'Deposit',
    })
    const txId = String(tx.row!.id)
    const ops: Op[] = [tx]
    if (i.funding === 'cash') {
      ops.push(...syncLinkedDaybook(c, 'bank_deposit', txId, {
        date, particulars: `Cash deposited to ${acc.bankName} (Slip #${clean(i.slipNo)})`, category: 'Bank Deposit', cashOut: amount, referenceNo: clean(i.slipNo),
      }))
    }
    await c.commit(ops)
    return ok(undefined)
  })
}

export interface BankWithdrawalInput { bankId: string; amount: number; description: string; date?: string; acknowledge?: string[] }

export function withdrawFromBank(c: ActionCtx, i: BankWithdrawalInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'record bank withdrawals')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const acc = c.data.bankAccounts.find((b) => b.id === i.bankId)
    if (!acc) return fail('Choose a bank account.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    const low = guard(c, i.acknowledge, 'NEGATIVE_BANK', amount > acc.currentBalance + EPS, `${acc.bankName} holds only ${fmt(acc.currentBalance)}.`)
    if (low) return low
    const tx = bankTxInsertOp({ bankId: acc.id, date, type: 'Withdrawal', amount, description: clean(i.description) || 'Cash withdrawal' })
    const txId = String(tx.row!.id)
    await c.commit([tx, ...syncLinkedDaybook(c, 'bank_withdrawal', txId, {
      date, particulars: `Cash withdrawn from ${acc.bankName}`, category: 'Bank Withdrawal', cashIn: amount,
    })])
    return ok(undefined)
  })
}

export interface BankFeeInput { bankId: string; amount: number; description: string; date?: string }

export function addBankFee(c: ActionCtx, i: BankFeeInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'record bank charges')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const acc = c.data.bankAccounts.find((b) => b.id === i.bankId)
    if (!acc) return fail('Choose a bank account.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    await c.commit([bankTxInsertOp({ bankId: acc.id, date, type: 'Bank Fee', amount, description: clean(i.description) || 'Bank charges' })])
    return ok(undefined)
  })
}

export function removeBankTransaction(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete bank transactions')
    if (denied) return denied
    const tx = c.raw.bankTransactions.find((t) => t.id === id)
    if (!tx) return fail('Transaction not found.')
    if (tx.sourceType && tx.sourceType !== 'bank_deposit' && tx.sourceType !== 'bank_withdrawal') {
      return fail('This bank line was created by another record (a payment, expense, transfer ...). Delete or edit that record instead.')
    }
    await c.commit([
      op.remove('bank_transactions', id),
      ...syncLinkedDaybook(c, 'bank_deposit', id, null),
      ...syncLinkedDaybook(c, 'bank_withdrawal', id, null),
      auditOp(c, 'bank_tx.delete', 'bank_transaction', id, `Deleted bank entry ${tx.type} ${fmt(tx.amount)} (${tx.date})`, { tx }),
    ])
    return ok(undefined)
  })
}

export interface BankTxEditInput {
  bankId: string
  amount: number
  date: string
  /** deposits only */
  slipNo?: string
  description: string
  /** deposits only: cash = taken from the safe; external = cheque / online credit */
  funding?: 'cash' | 'external'
  version?: string
  acknowledge?: string[]
}

const BANK_EDIT_CREDITS: BankTxType[] = ['Deposit', 'Credit Received']

/** Fix a deposit, withdrawal or bank charge that was typed wrongly, without deleting it and starting again. */
export function updateBankTransaction(c: ActionCtx, id: string, i: BankTxEditInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit bank entries')
    if (denied) return denied
    const tx = c.raw.bankTransactions.find((t) => t.id === id)
    if (!tx) return fail('Transaction not found.')
    if (tx.sourceType && tx.sourceType !== 'bank_deposit' && tx.sourceType !== 'bank_withdrawal') {
      return fail('This bank line was created by another record (a payment, expense, transfer ...). Edit that record instead.')
    }
    const isDeposit = BANK_EDIT_CREDITS.includes(tx.type)
    const isWithdrawal = tx.type === 'Withdrawal'
    if (!isDeposit && !isWithdrawal && tx.type !== 'Bank Fee') return fail('This kind of bank line cannot be edited here.')
    const stale = checkVersion(tx, i.version)
    if (stale) return stale
    const date = i.date || tx.date
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const acc = c.data.bankAccounts.find((b) => b.id === i.bankId)
    if (!acc) return fail('Choose a bank account.')
    if (!acc.isActive && acc.id !== tx.bankId) return fail('This bank account is deactivated.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    const slip = clean(i.slipNo)
    if (isDeposit && !slip) return fail('Enter the bank deposit slip number.')
    if (!isDeposit && !clean(i.description)) return fail('Enter what this is for.')

    const funding = isDeposit ? (i.funding ?? (tx.type === 'Deposit' ? 'cash' : 'external')) : undefined
    const type: BankTxType = isDeposit ? (funding === 'cash' ? 'Deposit' : 'Credit Received') : tx.type
    const effect = (t: BankTxType, a: number) => (BANK_EDIT_CREDITS.includes(t) ? a : -a)

    // the account that ends up holding this entry, and (if it moved) the one that no longer does
    const sameBank = acc.id === tx.bankId
    const newBalance = acc.currentBalance - (sameBank ? effect(tx.type, tx.amount) : 0) + effect(type, amount)
    const bankLow = guard(c, i.acknowledge, 'NEGATIVE_BANK', newBalance < -EPS && newBalance < acc.currentBalance - EPS,
      `${acc.bankName} would be left with ${fmt(newBalance)}.`)
    if (bankLow) return bankLow
    if (!sameBank) {
      const old = c.data.bankAccounts.find((b) => b.id === tx.bankId)
      const oldBalance = (old?.currentBalance ?? 0) - effect(tx.type, tx.amount)
      const oldLow = guard(c, i.acknowledge, 'NEGATIVE_BANK', !!old && oldBalance < -EPS && oldBalance < (old?.currentBalance ?? 0) - EPS,
        `${old?.bankName ?? 'The old account'} would be left with ${fmt(oldBalance)}.`)
      if (oldLow) return oldLow
    }
    const linked = c.raw.daybook.find((e) => e.sourceId === id && (e.sourceType === 'bank_deposit' || e.sourceType === 'bank_withdrawal'))
    const safeBefore = safeCash(c) + (linked ? linked.cashOut - linked.cashIn : 0)
    const safeLow = guard(c, i.acknowledge, 'NEGATIVE_SAFE', isDeposit && funding === 'cash' && amount > safeBefore + EPS,
      `Only ${fmt(safeBefore)} would be in the safe; ${fmt(amount)} would make the cash balance negative.`)
    if (safeLow) return safeLow

    const description = clean(i.description) || (isDeposit ? 'Deposit' : isWithdrawal ? 'Cash withdrawal' : 'Bank charges')
    const ops: Op[] = [op.update('bank_transactions', {
      ...tx, bankId: acc.id, date, type, amount, depositSlipNo: isDeposit ? slip : '', description,
    }, i.version)]
    if (isDeposit) {
      ops.push(...syncLinkedDaybook(c, 'bank_deposit', id, funding === 'cash'
        ? { date, particulars: `Cash deposited to ${acc.bankName} (Slip #${slip})`, category: 'Bank Deposit', cashOut: amount, referenceNo: slip }
        : null))
    } else if (isWithdrawal) {
      ops.push(...syncLinkedDaybook(c, 'bank_withdrawal', id, { date, particulars: `Cash withdrawn from ${acc.bankName}`, category: 'Bank Withdrawal', cashIn: amount }))
    }
    ops.push(auditOp(c, 'bank_tx.edit', 'bank_transaction', id, `Edited bank entry ${tx.type} ${fmt(tx.amount)} → ${type} ${fmt(amount)} (${date})`, {
      before: { bankId: tx.bankId, date: tx.date, type: tx.type, amount: tx.amount, slip: tx.depositSlipNo, description: tx.description },
      after: { bankId: acc.id, date, type, amount, slip, description },
    }))
    await c.commit(ops)
    return ok(undefined)
  })
}

// ===========================================================================
// OMC purchases
// ===========================================================================
export interface OmcInvoiceInput {
  invoiceNo: string
  date?: string
  tankLorryNo: string
  driverName: string
  fuelType: FuelType
  tankId?: string
  invoiceVolumeLiters: number
  decantedVolumeLiters: number
  ratePerLiter: number
  freightAmount: number
  version?: string
}

function validateInvoice(c: ActionCtx, i: OmcInvoiceInput, selfId?: string): Result<never> | null {
  if (!clean(i.invoiceNo)) return fail('Enter the invoice number.')
  if (c.raw.omcInvoices.some((x) => x.id !== selfId && lc(x.invoiceNo) === lc(i.invoiceNo))) return fail(`Invoice ${clean(i.invoiceNo)} already exists.`)
  if (!clean(i.tankLorryNo)) return fail('Enter the tank lorry registration number.')
  if (!isNonNegative(money(i.invoiceVolumeLiters))) return fail('Invoice volume cannot be negative.')
  if (!isPositive(money(i.decantedVolumeLiters))) return fail('Decanted volume must be more than 0.')
  if (!isPositive(money(i.ratePerLiter))) return fail('The rate per liter must be more than 0.')
  if (!isNonNegative(money(i.freightAmount))) return fail('Freight cannot be negative.')
  // the fuel must be booked into a tank, otherwise the stock figure would never include it
  const tank = c.raw.tanks.find((t) => t.id === i.tankId)
  if (!i.tankId || !tank) return fail('Choose the tank the fuel was unloaded into.')
  if (tank.fuelType !== i.fuelType) return fail(`Tank #${tank.tankNo} holds ${tank.fuelType}, not ${i.fuelType}.`)
  return null
}

export function addOmcInvoice(c: ActionCtx, i: OmcInvoiceInput): Promise<Result<OmcInvoice>> {
  return run(async () => {
    const denied = needManager(c, 'record OMC deliveries')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date) ?? validateInvoice(c, i)
    if (bad) return bad
    const decanted = money(i.decantedVolumeLiters)
    const inv: OmcInvoice = {
      id: newId('OMC-INV'), invoiceNo: clean(i.invoiceNo), date, brand: c.data.siteInfo.brand, tankLorryNo: clean(i.tankLorryNo),
      driverName: clean(i.driverName), fuelType: i.fuelType, tankId: i.tankId ?? '', invoiceVolumeLiters: money(i.invoiceVolumeLiters),
      decantedVolumeLiters: decanted, ratePerLiter: money(i.ratePerLiter), freightAmount: money(i.freightAmount),
      totalAmount: round2(decanted * money(i.ratePerLiter) + money(i.freightAmount)), openingPaidAmount: 0, paymentStatus: 'Pending', paidAmount: 0, createdAt: '',
    }
    await c.commit([op.insert('omc_invoices', inv), auditOp(c, 'omc.invoice', 'omc_invoice', inv.id, `Recorded invoice ${inv.invoiceNo} (${fmt(inv.totalAmount)})`)])
    return ok(inv)
  })
}

export function updateOmcInvoice(c: ActionCtx, id: string, i: OmcInvoiceInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit OMC invoices')
    if (denied) return denied
    const inv = c.data.omcInvoices.find((x) => x.id === id)
    const raw = c.raw.omcInvoices.find((x) => x.id === id)
    if (!inv || !raw) return fail('Invoice not found.')
    const stale = checkVersion(raw, i.version)
    if (stale) return stale
    const date = i.date || inv.date
    const bad = checkDate(c, date) ?? validateInvoice(c, i, id)
    if (bad) return bad
    const total = round2(money(i.decantedVolumeLiters) * money(i.ratePerLiter) + money(i.freightAmount))
    if (total + EPS < inv.paidAmount) return fail(`The new total (${fmt(total)}) is less than the ${fmt(inv.paidAmount)} already paid on this invoice.`)
    const ops: Op[] = [op.update('omc_invoices', {
      ...raw, invoiceNo: clean(i.invoiceNo), date, tankLorryNo: clean(i.tankLorryNo), driverName: clean(i.driverName), fuelType: i.fuelType,
      tankId: i.tankId ?? '', invoiceVolumeLiters: money(i.invoiceVolumeLiters), decantedVolumeLiters: money(i.decantedVolumeLiters),
      ratePerLiter: money(i.ratePerLiter), freightAmount: money(i.freightAmount), totalAmount: total,
    }, i.version)]
    if (clean(i.invoiceNo) !== raw.invoiceNo) {
      for (const p of c.raw.omcPayments.filter((x) => x.invoiceNo === raw.invoiceNo)) ops.push(op.update('omc_payments', { ...p, invoiceNo: clean(i.invoiceNo) }))
    }
    ops.push(auditOp(c, 'omc.invoice.edit', 'omc_invoice', id, `Edited invoice ${raw.invoiceNo}: ${fmt(raw.totalAmount)} → ${fmt(total)}`))
    await c.commit(ops)
    return ok(undefined)
  })
}

export function removeOmcInvoice(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete OMC invoices')
    if (denied) return denied
    const inv = c.raw.omcInvoices.find((x) => x.id === id)
    if (!inv) return fail('Invoice not found.')
    if (c.raw.omcPayments.some((p) => p.invoiceNo === inv.invoiceNo)) return fail('This invoice has payments recorded. Delete those payments first.')
    if (inv.openingPaidAmount > EPS) return fail('This invoice carries an amount paid before the migration and cannot be deleted.')
    await c.commit([op.remove('omc_invoices', id), auditOp(c, 'omc.invoice.delete', 'omc_invoice', id, `Deleted invoice ${inv.invoiceNo} (${fmt(inv.totalAmount)})`, { invoice: inv })])
    return ok(undefined)
  })
}

export interface OmcPaymentInput {
  invoiceNo: string
  amount: number
  method: OmcPaymentMethod
  /** required unless the method is Cash */
  bankAccountId?: string
  referenceNo: string
  date?: string
  acknowledge?: string[]
}

const omcDaybook = (p: { invoiceNo: string; amount: number; date: string; referenceNo: string }) => ({
  date: p.date, particulars: `Cash paid to OMC against invoice ${p.invoiceNo}`, category: 'OMC Payment' as const, cashOut: p.amount, referenceNo: p.referenceNo,
})

export function payOmcInvoice(c: ActionCtx, i: OmcPaymentInput): Promise<Result<OmcPayment>> {
  return run(async () => {
    const denied = needManager(c, 'record OMC payments')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const inv = c.data.omcInvoices.find((x) => x.invoiceNo === i.invoiceNo)
    if (!inv) return fail('Choose the invoice this payment is for.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    const due = round2(inv.totalAmount - inv.paidAmount)
    const over = guard(c, i.acknowledge, 'OVERPAYMENT', amount > due + EPS, `Invoice ${inv.invoiceNo} has only ${fmt(due)} outstanding.`)
    if (over) return over
    if (!clean(i.referenceNo)) return fail('Enter the reference / pay-order / cheque number.')
    let bankName = ''
    const bankId = i.method === 'Cash' ? '' : clean(i.bankAccountId)
    if (i.method === 'Cash') {
      const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', amount > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe.`)
      if (low) return low
    } else {
      const acc = c.data.bankAccounts.find((b) => b.id === bankId)
      if (!acc) return fail('Choose the bank account this was paid from.')
      bankName = acc.bankName
      const low = guard(c, i.acknowledge, 'NEGATIVE_BANK', amount > acc.currentBalance + EPS, `${acc.bankName} holds only ${fmt(acc.currentBalance)}.`)
      if (low) return low
    }
    const pay: OmcPayment = {
      id: newId('PAY'), date, invoiceNo: inv.invoiceNo, paymentMethod: i.method, bankName, bankAccountId: bankId,
      referenceNo: clean(i.referenceNo), amount, recordedBy: c.user.name,
    }
    const ops: Op[] = [op.insert('omc_payments', pay)]
    ops.push(...(i.method === 'Cash'
      ? syncLinkedDaybook(c, 'omc_payment', pay.id, omcDaybook(pay))
      : syncLinkedBankTx(c, 'omc_payment', pay.id, {
        bankId, date, type: 'OMC Online Transfer', amount, description: `${i.method} to OMC — invoice ${inv.invoiceNo} (${pay.referenceNo})`,
      })))
    await c.commit(ops)
    return ok(pay)
  })
}

export function removeOmcPayment(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete OMC payments')
    if (denied) return denied
    const p = c.raw.omcPayments.find((x) => x.id === id)
    if (!p) return fail('Payment not found.')
    await c.commit([
      op.remove('omc_payments', id),
      ...syncLinkedDaybook(c, 'omc_payment', id, null),
      ...syncLinkedBankTx(c, 'omc_payment', id, null),
      auditOp(c, 'omc.payment.delete', 'omc_payment', id, `Deleted OMC payment ${fmt(p.amount)} for invoice ${p.invoiceNo}`, { payment: p }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Suppliers
// ===========================================================================
export interface SupplierInput { name: string; company: string; category: string; phone: string; openingBalance: number; version?: string }

function validateSupplier(c: ActionCtx, i: SupplierInput, selfId?: string): Result<never> | null {
  if (!clean(i.name)) return fail('Enter the supplier name.')
  if (!Number.isFinite(money(i.openingBalance))) return fail('Enter the opening balance as a number.')
  if (c.raw.suppliers.some((s) => s.id !== selfId && lc(s.name) === lc(i.name))) return fail('A supplier with this name already exists.')
  return null
}

export function addSupplier(c: ActionCtx, i: SupplierInput): Promise<Result<Supplier>> {
  return run(async () => {
    const denied = needManager(c, 'add suppliers')
    if (denied) return denied
    const bad = validateSupplier(c, i)
    if (bad) return bad
    const s: Supplier = {
      id: newId('SUP'), name: clean(i.name), company: clean(i.company), category: clean(i.category), phone: clean(i.phone),
      openingBalance: round2(money(i.openingBalance)), balanceDue: round2(money(i.openingBalance)), isActive: true,
    }
    await c.commit([op.insert('suppliers', s), auditOp(c, 'supplier.add', 'supplier', s.id, `Added supplier ${s.name}`)])
    return ok(s)
  })
}

export function updateSupplier(c: ActionCtx, id: string, i: SupplierInput & { isActive: boolean }): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit suppliers')
    if (denied) return denied
    const s = c.raw.suppliers.find((x) => x.id === id)
    if (!s) return fail('Supplier not found.')
    const stale = checkVersion(s, i.version)
    if (stale) return stale
    const bad = validateSupplier(c, i, id)
    if (bad) return bad
    await c.commit([
      op.update('suppliers', { ...s, name: clean(i.name), company: clean(i.company), category: clean(i.category), phone: clean(i.phone), openingBalance: round2(money(i.openingBalance)), isActive: i.isActive }, i.version),
      auditOp(c, 'supplier.edit', 'supplier', id, `Edited supplier ${i.name}`),
    ])
    return ok(undefined)
  })
}

export function removeSupplier(c: ActionCtx, id: string): Promise<Result<{ mode: 'deleted' | 'deactivated' }>> {
  return run<{ mode: 'deleted' | 'deactivated' }>(async () => {
    const denied = needManager(c, 'delete suppliers')
    if (denied) return denied
    const s = c.data.suppliers.find((x) => x.id === id)
    if (!s) return fail('Supplier not found.')
    if (Math.abs(s.balanceDue) > EPS) return fail(`${s.name} still has a balance of ${fmt(s.balanceDue)}. Settle it before removing the supplier.`, 'BALANCE_DUE')
    if (!c.raw.supplierTransactions.some((t) => t.supplierId === id)) {
      await c.commit([op.remove('suppliers', id), auditOp(c, 'supplier.delete', 'supplier', id, `Deleted supplier ${s.name}`)])
      return ok({ mode: 'deleted' as const })
    }
    await c.commit([
      op.update('suppliers', { ...c.raw.suppliers.find((x) => x.id === id)!, isActive: false }),
      auditOp(c, 'supplier.deactivate', 'supplier', id, `Deactivated supplier ${s.name} (history kept)`),
    ])
    return ok({ mode: 'deactivated' as const })
  })
}

export interface SupplierBillInput { supplierId: string; amount: number; referenceNo: string; note: string; date?: string }

export function addSupplierBill(c: ActionCtx, i: SupplierBillInput): Promise<Result<SupplierTransaction>> {
  return run(async () => {
    const denied = needManager(c, 'record supplier bills')
    if (denied) return denied
    const s = c.raw.suppliers.find((x) => x.id === i.supplierId)
    if (!s) return fail('Choose a supplier.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const tx: SupplierTransaction = {
      id: newId('SUPTX'), supplierId: s.id, date, type: 'Bill', amount, referenceNo: clean(i.referenceNo), note: clean(i.note),
      paymentSource: '', bankAccountId: '', sourceType: '', sourceId: '', recordedBy: c.user.name, createdAt: '',
    }
    await c.commit([op.insert('supplier_transactions', tx)])
    return ok(tx)
  })
}

export interface SupplierPaymentInput {
  supplierId: string
  amount: number
  source: 'Cash' | 'Bank'
  bankAccountId?: string
  referenceNo: string
  note: string
  date?: string
  acknowledge?: string[]
}

export function paySupplier(c: ActionCtx, i: SupplierPaymentInput): Promise<Result<SupplierTransaction>> {
  return run(async () => {
    const denied = needManager(c, 'pay suppliers')
    if (denied) return denied
    const s = c.data.suppliers.find((x) => x.id === i.supplierId)
    if (!s) return fail('Choose a supplier.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('The amount must be more than 0.')
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const over = guard(c, i.acknowledge, 'OVERPAYMENT', amount > s.balanceDue + EPS, `${s.name} is owed only ${fmt(Math.max(0, s.balanceDue))}.`)
    if (over) return over
    let bankId = ''
    if (i.source === 'Cash') {
      const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', amount > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe.`)
      if (low) return low
    } else {
      bankId = clean(i.bankAccountId)
      const acc = c.data.bankAccounts.find((b) => b.id === bankId)
      if (!acc) return fail('Choose the bank account this was paid from.')
      const low = guard(c, i.acknowledge, 'NEGATIVE_BANK', amount > acc.currentBalance + EPS, `${acc.bankName} holds only ${fmt(acc.currentBalance)}.`)
      if (low) return low
    }
    const tx: SupplierTransaction = {
      id: newId('SUPTX'), supplierId: s.id, date, type: 'Payment', amount, referenceNo: clean(i.referenceNo), note: clean(i.note),
      paymentSource: i.source, bankAccountId: bankId, sourceType: '', sourceId: '', recordedBy: c.user.name, createdAt: '',
    }
    const ops: Op[] = [op.insert('supplier_transactions', tx)]
    ops.push(...(i.source === 'Cash'
      ? syncLinkedDaybook(c, 'supplier_payment', tx.id, { date, particulars: `Vendor Payment: ${s.name} — ${tx.note || 'payment'}`, category: 'Vendor Payment', cashOut: amount, referenceNo: tx.referenceNo })
      : syncLinkedBankTx(c, 'supplier_payment', tx.id, { bankId, date, type: 'Vendor Payment', amount, description: `Payment to ${s.name}${tx.note ? ` — ${tx.note}` : ''}` })))
    await c.commit(ops)
    return ok(tx)
  })
}

export function removeSupplierTransaction(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete supplier entries')
    if (denied) return denied
    const tx = c.raw.supplierTransactions.find((t) => t.id === id)
    if (!tx) return fail('Entry not found.')
    if (tx.sourceType === 'lube_restock') return fail('This bill was created by a lubricant stock entry. Delete that stock entry (Lubricants page) instead.')
    await c.commit([
      op.remove('supplier_transactions', id),
      ...syncLinkedDaybook(c, 'supplier_payment', id, null),
      ...syncLinkedBankTx(c, 'supplier_payment', id, null),
      auditOp(c, 'supplier_tx.delete', 'supplier_transaction', id, `Deleted supplier ${tx.type.toLowerCase()} ${fmt(tx.amount)}`, { tx }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Owner withdrawals
// ===========================================================================
export interface OwnerTransferInput {
  amount: number
  bankId: string
  accountTitle: string
  accountNumber: string
  referenceNo?: string
  notes?: string
  date?: string
}

export function addOwnerTransfer(c: ActionCtx, i: OwnerTransferInput): Promise<Result<OwnerTransferRecord>> {
  return run(async () => {
    const denied = needRole(c, ['owner'], 'record owner withdrawals')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const acc = c.data.bankAccounts.find((b) => b.id === i.bankId)
    if (!acc) return fail('Choose the station bank account the money leaves from.')
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('Enter a valid positive transfer amount.')
    if (amount > acc.currentBalance + EPS) return fail(`Insufficient funds in ${acc.bankName}. Available balance: ${fmt(acc.currentBalance)}.`)
    if (!clean(i.accountNumber)) return fail('Enter the destination account number or IBAN.')
    if (!clean(i.accountTitle)) return fail('Enter the destination account title.')
    const t: OwnerTransferRecord = {
      id: newId('OTX'), siteId: c.siteId, date, amount, bankId: acc.id, bankName: acc.bankName, accountTitle: clean(i.accountTitle),
      accountNumber: clean(i.accountNumber), referenceNo: clean(i.referenceNo) || `RTGS-OWN-${Date.now().toString().slice(-6)}`,
      status: 'Completed', notes: clean(i.notes), transferredBy: c.user.name,
    }
    await c.commit([
      op.insert('owner_transfers', t),
      ...syncLinkedBankTx(c, 'owner_transfer', t.id, {
        bankId: acc.id, date, type: 'Owner Transfer', amount, description: `Owner withdrawal to ${t.accountTitle} (${t.accountNumber}) — ${t.referenceNo}`,
      }),
      auditOp(c, 'owner.transfer', 'owner_transfer', t.id, `Owner withdrawal ${fmt(amount)} from ${acc.bankName}`),
    ])
    return ok(t)
  })
}

export interface OwnerCashInput { amount: number; date?: string; notes?: string; acknowledge?: string[] }

/** The owner takes cash out of the safe (no bank involved): one cash-book line, kept apart from ordinary payments. */
export function addOwnerCashWithdrawal(c: ActionCtx, i: OwnerCashInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needRole(c, ['owner'], 'record owner withdrawals')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const amount = round2(money(i.amount))
    if (!isPositive(amount)) return fail('Enter a valid positive amount.')
    const low = guard(c, i.acknowledge, 'NEGATIVE_SAFE', amount > safeCash(c) + EPS, `Only ${fmt(safeCash(c))} is recorded in the safe.`)
    if (low) return low
    const note = clean(i.notes)
    const line = daybookInsertOp(c, {
      date, particulars: `Owner cash withdrawal${note ? ` — ${note}` : ''}`, category: 'Owner Withdrawal',
      cashOut: amount, referenceNo: '', sourceType: 'owner_cash', sourceId: '',
    })
    await c.commit([line, auditOp(c, 'owner.cash', 'daybook', String(line.row!.id), `Owner took ${fmt(amount)} cash from the safe`)])
    return ok(undefined)
  })
}

export function removeOwnerTransfer(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needRole(c, ['owner'], 'delete owner withdrawals')
    if (denied) return denied
    const t = c.raw.ownerTransfers.find((x) => x.id === id)
    if (!t) return fail('Transfer not found.')
    await c.commit([
      op.remove('owner_transfers', id),
      ...syncLinkedBankTx(c, 'owner_transfer', id, null),
      auditOp(c, 'owner.transfer.delete', 'owner_transfer', id, `Deleted owner withdrawal ${fmt(t.amount)} (${t.date})`, { transfer: t }),
    ])
    return ok(undefined)
  })
}
