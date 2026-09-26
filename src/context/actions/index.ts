import type { ActionCtx } from './core'
import * as forecourt from './forecourt'
import * as customers from './customers'
import * as finance from './finance'
import * as people from './people'
import * as lubes from './lubes'
import * as settings from './settings'

export type { ActionCtx } from './core'
export type { Result } from '../../data/errors'

type Fn<A extends unknown[], R> = (c: ActionCtx, ...a: A) => R

/**
 * Every business operation the screens can perform, bound to "the current station, user and data".
 * Each one validates, builds ONE database transaction, and returns a Result (never throws).
 */
export function bindActions(getCtx: () => ActionCtx) {
  const b = <A extends unknown[], R>(fn: Fn<A, R>) => (...a: A): R => fn(getCtx(), ...a)
  return {
    // tanks & nozzles & readings & dips
    addTank: b(forecourt.addTank),
    updateTank: b(forecourt.updateTank),
    removeTank: b(forecourt.removeTank),
    addNozzle: b(forecourt.addNozzle),
    updateNozzle: b(forecourt.updateNozzle),
    removeNozzle: b(forecourt.removeNozzle),
    recordFuelSale: b(forecourt.recordFuelSale),
    removeFuelSale: b(forecourt.removeFuelSale),
    recordDip: b(forecourt.recordDip),
    removeDip: b(forecourt.removeDip),
    // customers, debit (slips), credit (recoveries), adjustments
    createCustomer: b(customers.createCustomer),
    updateCustomer: b(customers.updateCustomer),
    restoreCustomer: b(customers.restoreCustomer),
    removeCustomer: b(customers.removeCustomer),
    issueSlip: b(customers.issueSlip),
    updateSlip: b(customers.updateSlip),
    removeSlip: b(customers.removeSlip),
    recordRecovery: b(customers.recordRecovery),
    assignRecoveryBank: b(customers.assignRecoveryBank),
    updateRecovery: b(customers.updateRecovery),
    removeRecovery: b(customers.removeRecovery),
    addAdjustment: b(customers.addAdjustment),
    updateAdjustment: b(customers.updateAdjustment),
    removeAdjustment: b(customers.removeAdjustment),
    // cash, expenses, banks, OMC, suppliers, owner
    addDaybookEntry: b(finance.addDaybookEntry),
    removeDaybookEntry: b(finance.removeDaybookEntry),
    addExpense: b(finance.addExpense),
    updateExpense: b(finance.updateExpense),
    removeExpense: b(finance.removeExpense),
    addBankAccount: b(finance.addBankAccount),
    updateBankAccount: b(finance.updateBankAccount),
    removeBankAccount: b(finance.removeBankAccount),
    depositToBank: b(finance.depositToBank),
    withdrawFromBank: b(finance.withdrawFromBank),
    addBankFee: b(finance.addBankFee),
    updateBankTransaction: b(finance.updateBankTransaction),
    removeBankTransaction: b(finance.removeBankTransaction),
    addOmcInvoice: b(finance.addOmcInvoice),
    updateOmcInvoice: b(finance.updateOmcInvoice),
    removeOmcInvoice: b(finance.removeOmcInvoice),
    payOmcInvoice: b(finance.payOmcInvoice),
    removeOmcPayment: b(finance.removeOmcPayment),
    addSupplier: b(finance.addSupplier),
    updateSupplier: b(finance.updateSupplier),
    removeSupplier: b(finance.removeSupplier),
    addSupplierBill: b(finance.addSupplierBill),
    paySupplier: b(finance.paySupplier),
    removeSupplierTransaction: b(finance.removeSupplierTransaction),
    addOwnerTransfer: b(finance.addOwnerTransfer),
    addOwnerCashWithdrawal: b(finance.addOwnerCashWithdrawal),
    removeOwnerTransfer: b(finance.removeOwnerTransfer),
    // staff & payroll
    addStaff: b(people.addStaff),
    updateStaff: b(people.updateStaff),
    setStaffStatus: b(people.setStaffStatus),
    removeStaff: b(people.removeStaff),
    issueAdvance: b(people.issueAdvance),
    removeAdvance: b(people.removeAdvance),
    paySalary: b(people.paySalary),
    removeSalaryPayment: b(people.removeSalaryPayment),
    // lubricants
    addProduct: b(lubes.addProduct),
    updateProduct: b(lubes.updateProduct),
    removeProduct: b(lubes.removeProduct),
    sellLube: b(lubes.sellLube),
    restockLube: b(lubes.restockLube),
    adjustLubeStock: b(lubes.adjustLubeStock),
    removeLubeMovement: b(lubes.removeLubeMovement),
    // settings & backup
    saveSettings: b(settings.saveSettings),
    applyOgraPriceChange: b(settings.applyOgraPriceChange),
    restoreBackup: b(settings.restoreBackup),
    mergeBackup: b(settings.mergeBackup),
  }
}

export type Actions = ReturnType<typeof bindActions>

export { ANY_VEHICLE, acceptsAnyVehicle, normalizePlate, parseVehicles } from './customers'
