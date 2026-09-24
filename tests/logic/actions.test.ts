import { describe, expect, it } from 'vitest'
import { failed, freshBackend, must, openStation as baseOpen, type BackendKind } from './harness'
import { safeCash } from '../../src/data/derive'
import type { Backend } from '../../src/data/backend'

const S1 = 'SITE-01'
const S2 = 'SITE-02'

const KINDS: BackendKind[] = ['memory', 'pglite']

describe.each(KINDS)('%s backend', (kind) => {
  const openStation = async (site: string, user: string, be?: Backend) => baseOpen(site, user, be ?? (await freshBackend(kind)))

  describe('derived balances match the figures the old software showed', () => {
    it('SITE-01', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const d = st.data
      expect(d.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(480000)
      expect(safeCash(d)).toBe(650000)
      expect(d.bankAccounts[0].currentBalance).toBe(4_280_500)
      expect(d.tanks.find((t) => t.id === 'T1-S1')!.currentLiters).toBe(31200)
      expect(d.nozzles.find((n) => n.id === 'N1-S1')!.closingMeter).toBe(414210)
      expect(d.omcInvoices[0].paymentStatus).toBe('Paid')
      expect(d.lubricants[0].stockCans).toBe(20)
    })
    it('the two stations never see each other', async () => {
      const a = await openStation(S1, 'naveed.akhtar')
      expect(a.data.customers.some((c) => c.id === 'CUST-S2-01')).toBe(false)
      const b = await openStation(S2, 'tariq.manager')
      expect(b.data.customers.map((c) => c.id)).toEqual(['CUST-S2-01'])
      // a SITE-01 user cannot load SITE-02
      // (the memory backend refuses; real row-level security answers with empty tables)
      const other = await a.be.loadStation(S2, 'manager').catch(() => null)
      expect(other === null || (other.customers.length === 0 && other.daybook.length === 0)).toBe(true)
    })
  })

  describe('nozzles: add and delete', () => {
    it('adds a nozzle with its tank, fuel and starting meter', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const nz = must(await st.act.addNozzle({ dispenserNo: 3, nozzleNo: 1, tankId: 'T3-S1', initialMeter: 1000, testingLiters: 5, assignedStaff: 'Rashid' }))
      const found = st.data.nozzles.find((n) => n.id === nz.id)!
      expect(found.fuelType).toBe('Hi-Octane')
      expect(found.closingMeter).toBe(1000)
      expect(found.ratePerLiter).toBe(295.5)
      expect(st.data.siteInfo.nozzlesCount).toBe(5)
      // it survives a reload from the "database"
      await st.reload()
      expect(st.data.nozzles.some((n) => n.id === nz.id)).toBe(true)
    })

    it('rejects duplicates, unknown tanks and bad numbers', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.addNozzle({ dispenserNo: 1, nozzleNo: 1, tankId: 'T1-S1', initialMeter: 0, testingLiters: 0, assignedStaff: '' })).error).toMatch(/already exists/)
      expect(failed(await st.act.addNozzle({ dispenserNo: 9, nozzleNo: 1, tankId: 'NOPE', initialMeter: 0, testingLiters: 0, assignedStaff: '' })).error).toMatch(/tank/i)
      expect(failed(await st.act.addNozzle({ dispenserNo: 0, nozzleNo: 1, tankId: 'T1-S1', initialMeter: 0, testingLiters: 0, assignedStaff: '' })).error).toMatch(/whole number/)
      expect(failed(await st.act.addNozzle({ dispenserNo: 9, nozzleNo: 1, tankId: 'T1-S1', initialMeter: -5, testingLiters: 0, assignedStaff: '' })).error).toMatch(/negative/)
    })

    it('deletes a nozzle; its recorded readings stay in the history', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      must(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 414710, testingLiters: 10, cashierName: 'Zahid' }))
      const r = must(await st.act.removeNozzle('N1-S1'))
      expect(r.historyKept).toBe(1)
      expect(st.data.nozzles.some((n) => n.id === 'N1-S1')).toBe(false)
      expect(st.data.fuelSales).toHaveLength(1)
      expect(st.data.siteInfo.nozzlesCount).toBe(3)
      await st.reload()
      expect(st.data.nozzles.some((n) => n.id === 'N1-S1')).toBe(false)
    })

    it('a cashier cannot add or delete nozzles', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.addNozzle({ dispenserNo: 7, nozzleNo: 1, tankId: 'T1-S1', initialMeter: 0, testingLiters: 0, assignedStaff: '' })).code).toBe('FORBIDDEN')
      expect(failed(await st.act.removeNozzle('N1-S1')).code).toBe('FORBIDDEN')
    })

    it('a tank that still has nozzles cannot be deleted; an unused tank can', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.removeTank('T1-S1')).error).toMatch(/nozzle/)
      const t = must(await st.act.addTank({ tankNo: 4, fuelType: 'PMG Super', capacityLiters: 10000, minReserveLiters: 1000, initialLiters: 500, initialDipMm: 100 }))
      must(await st.act.removeTank(t.id))
      expect(st.data.tanks).toHaveLength(3)
    })
  })

  describe('meter readings', () => {
    it('advances the nozzle meter and computes net liters and amount', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const sale = must(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 415210, testingLiters: 10, cashierName: 'Zahid' }))
      expect(sale.netLiters).toBe(990)
      expect(sale.totalAmount).toBeCloseTo(990 * 276.45, 2)
      expect(st.data.nozzles.find((n) => n.id === 'N1-S1')!.closingMeter).toBe(415210)
    })
    it('blocks overlapping / gapped readings for cashiers, lets a manager acknowledge', async () => {
      const cashier = await openStation(S1, 'tariq.cashier')
      const overlap = failed(await cashier.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414000, closingMeter: 414500, testingLiters: 0, cashierName: 'x' }))
      expect(overlap.code).toBe('METER_OVERLAP')
      const gap = failed(await cashier.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414500, closingMeter: 415000, testingLiters: 0, cashierName: 'x' }))
      expect(gap.code).toBe('METER_GAP')

      const mgr = await openStation(S1, 'naveed.akhtar')
      failed(await mgr.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414500, closingMeter: 415000, testingLiters: 0, cashierName: 'x' }))
      must(await mgr.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414500, closingMeter: 415000, testingLiters: 0, cashierName: 'x', acknowledge: ['METER_GAP'] }))
    })
    it('validates the readings', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 414210, testingLiters: 0, cashierName: 'x' })).error).toMatch(/greater/)
      expect(failed(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 414215, testingLiters: 10, cashierName: 'x' })).error).toMatch(/Testing liters/)
    })
    it('deleting the latest reading moves the nozzle meter back', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const sale = must(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 415210, testingLiters: 0, cashierName: 'x' }))
      must(await st.act.removeFuelSale(sale.id))
      expect(st.data.nozzles.find((n) => n.id === 'N1-S1')!.closingMeter).toBe(414210)
    })
    it('tank book stock falls with sales after the last dip and rises with deliveries', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      must(await st.act.recordFuelSale({ nozzleId: 'N1-S1', shiftName: 'Morning', openingMeter: 414210, closingMeter: 415210, testingLiters: 0, cashierName: 'x' }))
      expect(st.data.tanks.find((t) => t.id === 'T1-S1')!.estimatedBookLiters).toBe(31200 - 1000)
      must(await st.act.addOmcInvoice({ invoiceNo: 'INV-1', tankLorryNo: 'TL-1', driverName: 'D', fuelType: 'HSD Diesel', tankId: 'T1-S1', invoiceVolumeLiters: 5000, decantedVolumeLiters: 5000, ratePerLiter: 260, freightAmount: 1000 }))
      expect(st.data.tanks.find((t) => t.id === 'T1-S1')!.estimatedBookLiters).toBe(31200 - 1000 + 5000)
      must(await st.act.recordDip({ tankId: 'T1-S1', morningDipMm: 1, morningLiters: 35200, decantedLiters: 0, dispensedLiters: 0, closingDipMm: 1500, closingPhysicalLiters: 35000, waterDipMm: 0, inspector: 'N' }))
      const t = st.data.tanks.find((x) => x.id === 'T1-S1')!
      expect(t.currentLiters).toBe(35000)
      expect(t.estimatedBookLiters).toBe(35000)
    })
  })

  describe('customers: add / edit / delete', () => {
    const input = { businessName: 'Test Transport', name: 'Owner', phone: '0300-1', vehicleNumbers: ['AA-1'], creditLimit: 100000, openingBalance: 0, status: 'Active' as const }

    it('creates, edits and lists', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const c = must(await st.act.createCustomer(input))
      must(await st.act.updateCustomer(c.id, { ...input, businessName: 'Test Transport Co', creditLimit: 250000, status: 'Hold' }))
      const got = st.data.customers.find((x) => x.id === c.id)!
      expect(got.businessName).toBe('Test Transport Co')
      expect(got.creditLimit).toBe(250000)
      expect(got.status).toBe('Hold')
      await st.reload()
      expect(st.data.customers.find((x) => x.id === c.id)!.status).toBe('Hold')
    })
    it('rejects duplicates and missing data', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.createCustomer({ ...input, businessName: 'al-hafiz goods transport ryk' })).error).toMatch(/already exists/)
      expect(failed(await st.act.createCustomer({ ...input, businessName: '' })).error).toMatch(/name/)
      expect(failed(await st.act.createCustomer({ ...input, phone: '' })).error).toMatch(/phone/)
      expect(failed(await st.act.createCustomer({ ...input, creditLimit: -1 })).error).toMatch(/negative/)
    })
    it('deletes a customer that has no history', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const r = must(await st.act.removeCustomer('CUST-03'))
      expect(r.mode).toBe('deleted')
      expect(st.data.customers.some((c) => c.id === 'CUST-03')).toBe(false)
      await st.reload()
      expect(st.data.customers.some((c) => c.id === 'CUST-03')).toBe(false)
    })
    it('refuses to remove a customer who still owes money, archives once settled, and can be restored', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.removeCustomer('CUST-01')).code).toBe('BALANCE_DUE')
      must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 480000, method: 'Cash', referenceNo: '' }))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(0)
      expect(must(await st.act.removeCustomer('CUST-01')).mode).toBe('archived')
      const archived = st.data.customers.find((c) => c.id === 'CUST-01')!
      expect(archived.status).toBe('Archived')
      expect(st.data.creditSlips.filter((s) => s.customerId === 'CUST-01')).toHaveLength(1) // ledger kept
      must(await st.act.restoreCustomer('CUST-01'))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.status).toBe('Active')
    })
    it('a cashier cannot register, edit or delete customers', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.createCustomer(input)).code).toBe('FORBIDDEN')
      expect(failed(await st.act.removeCustomer('CUST-03')).code).toBe('FORBIDDEN')
    })
  })

  describe('debit: credit slips', () => {
    it('issue, balance goes up, edit, delete', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const slip = must(await st.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'x-1', driverName: 'Ali', fuelType: 'HSD Diesel', liters: 100 }))
      expect(slip.slipNo).toBe('SLIP-1001')
      expect(slip.totalAmount).toBeCloseTo(27645, 2)
      expect(st.data.customers.find((c) => c.id === 'CUST-02')!.currentBalance).toBeCloseTo(27645, 2)
      must(await st.act.updateSlip(slip.id, { vehicleNo: 'X-1', driverName: 'Ali', fuelType: 'HSD Diesel', liters: 200, date: slip.date }))
      expect(st.data.customers.find((c) => c.id === 'CUST-02')!.currentBalance).toBeCloseTo(55290, 2)
      must(await st.act.removeSlip(slip.id))
      expect(st.data.customers.find((c) => c.id === 'CUST-02')!.currentBalance).toBe(0)
    })
    it('slip numbers are unique and increasing', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const a = must(await st.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'X', driverName: 'a', fuelType: 'HSD Diesel', liters: 1 }))
      const b = must(await st.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'X', driverName: 'a', fuelType: 'HSD Diesel', liters: 1 }))
      expect(a.slipNo).not.toBe(b.slipNo)
    })
    it('credit limit: cashier is blocked, manager can knowingly override', async () => {
      const cashier = await openStation(S1, 'tariq.cashier')
      const r = failed(await cashier.act.issueSlip({ customerId: 'CUST-03', vehicleNo: 'ABC-123', driverName: 'a', fuelType: 'HSD Diesel', liters: 1000 }))
      expect(r.code).toBe('LIMIT_EXCEEDED')
      expect(failed(await cashier.act.issueSlip({ customerId: 'CUST-03', vehicleNo: 'ABC-123', driverName: 'a', fuelType: 'HSD Diesel', liters: 1000, acknowledge: ['LIMIT_EXCEEDED'] })).code).toBe('LIMIT_EXCEEDED')
      const mgr = await openStation(S1, 'naveed.akhtar')
      must(await mgr.act.issueSlip({ customerId: 'CUST-03', vehicleNo: 'ABC-123', driverName: 'a', fuelType: 'HSD Diesel', liters: 1000, acknowledge: ['LIMIT_EXCEEDED'] }))
    })
    it('vehicle must be registered; a manager may register a new plate on the spot', async () => {
      const cashier = await openStation(S1, 'tariq.cashier')
      expect(failed(await cashier.act.issueSlip({ customerId: 'CUST-03', vehicleNo: 'ZZZ-999', driverName: 'a', fuelType: 'HSD Diesel', liters: 10 })).code).toBe('VEHICLE_NOT_REGISTERED')
      const mgr = await openStation(S1, 'naveed.akhtar')
      must(await mgr.act.issueSlip({ customerId: 'CUST-03', vehicleNo: 'zzz-999', driverName: 'a', fuelType: 'HSD Diesel', liters: 10, acknowledge: ['VEHICLE_NOT_REGISTERED'] }))
      expect(mgr.data.customers.find((c) => c.id === 'CUST-03')!.vehicleNumbers).toContain('ZZZ-999')
      // a customer registered with no plates accepts any vehicle
      must(await cashier.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'ANYTHING-1', driverName: 'a', fuelType: 'HSD Diesel', liters: 10 }))
    })
    it('a customer on hold cannot take fuel', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const c = st.data.customers.find((x) => x.id === 'CUST-02')!
      must(await st.act.updateCustomer(c.id, { businessName: c.businessName, name: c.name, phone: c.phone, vehicleNumbers: c.vehicleNumbers, creditLimit: c.creditLimit, openingBalance: c.openingBalance, status: 'Hold' }))
      expect(failed(await st.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'X', driverName: 'a', fuelType: 'HSD Diesel', liters: 1 })).code).toBe('HOLD')
    })
    it('a cashier cannot edit or delete a slip', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.removeSlip('CS-801')).code).toBe('FORBIDDEN')
    })
  })

  describe('credit: recoveries', () => {
    it('a cash recovery reduces the balance AND posts a cash-in to the daybook; deleting reverses both', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const before = safeCash(st.data)
      const rec = must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 100000, method: 'Cash', referenceNo: '' }))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(380000)
      expect(safeCash(st.data)).toBe(before + 100000)
      expect(st.data.daybook.at(-1)!.sourceId).toBe(rec.id)
      must(await st.act.removeRecovery(rec.id))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(480000)
      expect(safeCash(st.data)).toBe(before)
    })
    it('editing a recovery updates the balance and the cash line; switching to cheque removes the cash line', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const before = safeCash(st.data)
      const rec = must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 100000, method: 'Cash', referenceNo: '' }))
      must(await st.act.updateRecovery(rec.id, { amount: 60000, method: 'Cash', referenceNo: 'x', date: rec.date }))
      expect(safeCash(st.data)).toBe(before + 60000)
      must(await st.act.updateRecovery(rec.id, { amount: 60000, method: 'Cheque', referenceNo: 'CHQ-1', date: rec.date, bankAccountId: 'BANK-01' }))
      expect(safeCash(st.data)).toBe(before)
      expect(st.data.bankAccounts[0].currentBalance).toBe(4_280_500 + 60000)
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(420000)
    })
    it('cheques need a reference; overpayment needs manager authorization', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 1000, method: 'Cheque', referenceNo: '' })).error).toMatch(/cheque number/i)
      expect(failed(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 999999, method: 'Cash', referenceNo: '' })).code).toBe('OVERPAYMENT')
      must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 500000, method: 'Cash', referenceNo: '', acknowledge: ['OVERPAYMENT'] }))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(-20000) // advance
    })
    it('a cashier can record a cash recovery but cannot delete it', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      const rec = must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 5000, method: 'Cash', referenceNo: '' }))
      expect(failed(await st.act.removeRecovery(rec.id)).code).toBe('FORBIDDEN')
    })
  })

  describe('ledger adjustments (debit / credit notes)', () => {
    it('a debit note raises and a credit note lowers the balance; both can be edited and deleted', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const d = must(await st.act.addAdjustment({ customerId: 'CUST-01', kind: 'Debit', amount: 5000, reason: 'Late fee' }))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(485000)
      must(await st.act.updateAdjustment(d.id, { kind: 'Credit', amount: 2000, reason: 'Discount' }))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(478000)
      must(await st.act.removeAdjustment(d.id))
      expect(st.data.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(480000)
      expect(failed(await st.act.addAdjustment({ customerId: 'CUST-01', kind: 'Debit', amount: 5, reason: '' })).error).toMatch(/reason/)
    })
    it('every change is kept in the audit trail', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      must(await st.act.removeCustomer('CUST-03'))
      const log = await st.be.loadAudit(S1, 10)
      expect(log[0].action).toBe('customer.delete')
      expect(log[0].actor).toBe('Naveed Akhtar')
    })
  })

  describe('expenses, daybook, bank', () => {
    it('a cash expense posts to the daybook; a bank expense posts to the bank; edit + delete follow', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const cash0 = safeCash(st.data)
      const e = must(await st.act.addExpense({ category: 'Generator Fuel', payee: 'Pump', description: 'diesel', amount: 3000, paymentMode: 'Cash' }))
      expect(e.voucherNo).toBe('VOU-1001')
      expect(safeCash(st.data)).toBe(cash0 - 3000)
      must(await st.act.updateExpense(e.id, { category: 'Generator Fuel', payee: 'Pump', description: 'diesel', amount: 3500, paymentMode: 'Bank', bankAccountId: 'BANK-01' }))
      expect(safeCash(st.data)).toBe(cash0)
      expect(st.data.bankAccounts[0].currentBalance).toBe(4_280_500 - 3500)
      must(await st.act.removeExpense(e.id))
      expect(st.data.bankAccounts[0].currentBalance).toBe(4_280_500)
      expect(st.data.expenses).toHaveLength(0)
    })
    it('a cashier can record only cash expenses', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.addExpense({ category: 'Misc', payee: 'x', description: 'y', amount: 10, paymentMode: 'Bank', bankAccountId: 'BANK-01' })).code).toBe('FORBIDDEN')
      must(await st.act.addExpense({ category: 'Misc', payee: 'x', description: 'y', amount: 10, paymentMode: 'Cash' }))
    })
    it('the safe cannot silently go negative', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.addDaybookEntry({ particulars: 'big', category: 'Expense', direction: 'OUT', amount: 9_999_999 })).code).toBe('NEGATIVE_SAFE')
    })
    it('cashiers are locked to today', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.addDaybookEntry({ date: '2020-01-01', particulars: 'old', category: 'Other', direction: 'IN', amount: 5 })).code).toBe('FORBIDDEN')
    })
    it('a bank deposit moves money from the safe to the bank; deleting it reverses both', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const cash0 = safeCash(st.data)
      must(await st.act.depositToBank({ bankId: 'BANK-01', amount: 200000, slipNo: 'DEP-1', description: 'x', funding: 'cash' }))
      expect(safeCash(st.data)).toBe(cash0 - 200000)
      expect(st.data.bankAccounts[0].currentBalance).toBe(4_480_500)
      const tx = st.data.bankTransactions.find((t) => t.depositSlipNo === 'DEP-1')!
      must(await st.act.removeBankTransaction(tx.id))
      expect(safeCash(st.data)).toBe(cash0)
      expect(st.data.bankAccounts[0].currentBalance).toBe(4_280_500)
    })
    it('an external credit does not touch the safe; a withdrawal moves bank money to the safe', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const cash0 = safeCash(st.data)
      must(await st.act.depositToBank({ bankId: 'BANK-01', amount: 1000, slipNo: 'CHQ-9', description: 'cheque', funding: 'external' }))
      expect(safeCash(st.data)).toBe(cash0)
      must(await st.act.withdrawFromBank({ bankId: 'BANK-01', amount: 50000, description: 'cash' }))
      expect(safeCash(st.data)).toBe(cash0 + 50000)
      expect(failed(await st.act.withdrawFromBank({ bankId: 'BANK-01', amount: 99_999_999, description: '' })).code).toBe('NEGATIVE_BANK')
    })
    it('a bank account with history is deactivated, not deleted, and only when empty', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.removeBankAccount('BANK-01')).code).toBe('BALANCE_DUE')
      const acc = must(await st.act.addBankAccount({ bankName: 'MCB', accountTitle: 't', accountNumber: '123', branch: 'b', openingBalance: 0 }))
      expect(must(await st.act.removeBankAccount(acc.id)).mode).toBe('deleted')
    })
    it('only the owner can withdraw capital, and never more than the bank holds', async () => {
      const mgr = await openStation(S1, 'naveed.akhtar')
      expect(failed(await mgr.act.addOwnerTransfer({ amount: 1, bankId: 'BANK-01', accountTitle: 't', accountNumber: '1' })).code).toBe('FORBIDDEN')
      const owner = await openStation(S1, 'owner')
      expect(failed(await owner.act.addOwnerTransfer({ amount: 99_999_999, bankId: 'BANK-01', accountTitle: 't', accountNumber: '1' })).error).toMatch(/Insufficient/)
      const t = must(await owner.act.addOwnerTransfer({ amount: 100000, bankId: 'BANK-01', accountTitle: 'Owner', accountNumber: '0184' }))
      expect(owner.data.bankAccounts[0].currentBalance).toBe(4_180_500)
      must(await owner.act.removeOwnerTransfer(t.id))
      expect(owner.data.bankAccounts[0].currentBalance).toBe(4_280_500)
    })
  })

  describe('OMC purchases', () => {
    it('payments are limited to the outstanding amount and post to the right account', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const inv = must(await st.act.addOmcInvoice({ invoiceNo: 'INV-2', tankLorryNo: 'TL', driverName: 'D', fuelType: 'PMG Super', invoiceVolumeLiters: 1000, decantedVolumeLiters: 1000, ratePerLiter: 100, freightAmount: 0 }))
      expect(inv.totalAmount).toBe(100000)
      expect(failed(await st.act.payOmcInvoice({ invoiceNo: 'INV-2', amount: 150000, method: 'Bank Transfer', bankAccountId: 'BANK-01', referenceNo: 'R' })).code).toBe('OVERPAYMENT')
      must(await st.act.payOmcInvoice({ invoiceNo: 'INV-2', amount: 40000, method: 'Bank Transfer', bankAccountId: 'BANK-01', referenceNo: 'R1' }))
      let d = st.data
      expect(d.omcInvoices.find((i) => i.invoiceNo === 'INV-2')!.paymentStatus).toBe('Partial')
      expect(d.bankAccounts[0].currentBalance).toBe(4_240_500)
      const cash0 = safeCash(d)
      const p2 = must(await st.act.payOmcInvoice({ invoiceNo: 'INV-2', amount: 60000, method: 'Cash', referenceNo: 'R2' }))
      d = st.data
      expect(d.omcInvoices.find((i) => i.invoiceNo === 'INV-2')!.paymentStatus).toBe('Paid')
      expect(safeCash(d)).toBe(cash0 - 60000)
      must(await st.act.removeOmcPayment(p2.id))
      expect(st.data.omcInvoices.find((i) => i.invoiceNo === 'INV-2')!.paymentStatus).toBe('Partial')
      expect(safeCash(st.data)).toBe(cash0)
    })
    it('an invoice with payments cannot be deleted; duplicate numbers are refused', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.removeOmcInvoice('OMC-INV-881')).error).toMatch(/payments/)
      expect(failed(await st.act.addOmcInvoice({ invoiceNo: 'tp-pk-98124', tankLorryNo: 'TL', driverName: 'D', fuelType: 'PMG Super', invoiceVolumeLiters: 1, decantedVolumeLiters: 1, ratePerLiter: 1, freightAmount: 0 })).error).toMatch(/already exists/)
    })
  })

  describe('staff, advances and payroll', () => {
    it('advance -> daybook out; salary deducts the advance and posts the net; deleting the salary reverses it', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const cash0 = safeCash(st.data)
      const adv = must(await st.act.issueAdvance({ staffId: 'STF-02', amount: 2000, reason: 'family' }))
      expect(safeCash(st.data)).toBe(cash0 - 2000)
      expect(st.data.staff.find((s) => s.id === 'STF-02')!.currentAdvances).toBe(2000)
      const sal = must(await st.act.paySalary({ staffId: 'STF-02' }))
      expect(sal.netPaid).toBe(38000)
      expect(safeCash(st.data)).toBe(cash0 - 2000 - 38000)
      expect(st.data.staff.find((s) => s.id === 'STF-02')!.currentAdvances).toBe(0)
      expect(failed(await st.act.paySalary({ staffId: 'STF-02' })).error).toMatch(/already been paid/)
      expect(failed(await st.act.removeAdvance(adv.id)).error).toMatch(/already deducted/)
      must(await st.act.removeSalaryPayment(sal.id))
      expect(st.data.staff.find((s) => s.id === 'STF-02')!.currentAdvances).toBe(2000)
      expect(safeCash(st.data)).toBe(cash0 - 2000)
    })
    it('respects the daily advance limit; staff with history are deactivated, not deleted', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      expect(failed(await st.act.issueAdvance({ staffId: 'STF-02', amount: 6000, reason: 'x' })).code).toBe('DAILY_LIMIT')
      must(await st.act.issueAdvance({ staffId: 'STF-02', amount: 1000, reason: 'x' }))
      expect(failed(await st.act.removeStaff('STF-02')).code).toBe('BALANCE_DUE')
    })
    it('a cashier cannot touch payroll', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.issueAdvance({ staffId: 'STF-02', amount: 100, reason: 'x' })).code).toBe('FORBIDDEN')
    })
  })

  describe('lubricants', () => {
    it('a counter sale reduces stock and posts cash; restock and adjustments change stock; guards hold', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      const cash0 = safeCash(st.data)
      const sale = must(await st.act.sellLube({ productId: 'LUB-01', quantity: 3, counterparty: 'walk-in' }))
      expect(sale.totalAmount).toBe(34200)
      expect(st.data.lubricants[0].stockCans).toBe(17)
      expect(safeCash(st.data)).toBe(cash0 + 34200)
      expect(failed(await st.act.sellLube({ productId: 'LUB-01', quantity: 99, counterparty: '' })).error).toMatch(/in stock/)
      expect(failed(await st.act.sellLube({ productId: 'LUB-01', quantity: 1, counterparty: '', unitPrice: 1 })).code).toBe('FORBIDDEN')
      const mgr = await openStation(S1, 'naveed.akhtar', st.be)
      must(await mgr.act.restockLube({ productId: 'LUB-01', quantity: 10, unitCost: 9300, supplierName: 's', referenceNo: 'r' }))
      expect(mgr.data.lubricants[0].stockCans).toBe(27)
      must(await mgr.act.adjustLubeStock({ productId: 'LUB-01', quantity: 2, direction: 'out', reason: 'damaged' }))
      expect(mgr.data.lubricants[0].stockCans).toBe(25)
      must(await mgr.act.removeLubeMovement(sale.id))
      expect(mgr.data.lubricants[0].stockCans).toBe(28)
      expect(safeCash(mgr.data)).toBe(cash0)
    })
  })

  describe('suppliers', () => {
    it('bills raise and payments lower the balance; payments post to cash or bank', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      must(await st.act.addSupplierBill({ supplierId: 'SUP-01', amount: 50000, referenceNo: 'B1', note: 'spares' }))
      expect(st.data.suppliers[0].balanceDue).toBe(50000)
      const cash0 = safeCash(st.data)
      const p = must(await st.act.paySupplier({ supplierId: 'SUP-01', amount: 20000, source: 'Cash', referenceNo: '', note: 'part' }))
      expect(st.data.suppliers[0].balanceDue).toBe(30000)
      expect(safeCash(st.data)).toBe(cash0 - 20000)
      expect(failed(await st.act.paySupplier({ supplierId: 'SUP-01', amount: 90000, source: 'Bank', bankAccountId: 'BANK-01', referenceNo: '', note: '' })).code).toBe('OVERPAYMENT')
      must(await st.act.removeSupplierTransaction(p.id))
      expect(st.data.suppliers[0].balanceDue).toBe(50000)
      expect(safeCash(st.data)).toBe(cash0)
    })
  })

  describe('settings and OGRA revision', () => {
    it('a new tariff changes every nozzle rate and records the stock gain/loss', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const log = must(await st.act.applyOgraPriceChange({ newRates: { 'PMG Super': 270, 'HSD Diesel': 280, 'Hi-Octane': 300 }, effectiveDate: '2026-09-25 00:00', notificationNo: 'N-1' }))
      expect(log.netInventoryGainLoss).toBe(Math.round(31200 * 3.55) + Math.round(16450 * 1.64) + Math.round(6500 * 4.5))
      expect(st.data.settings.rates['HSD Diesel']).toBe(280)
      expect(st.data.nozzles.find((n) => n.id === 'N1-S1')!.ratePerLiter).toBe(280)
      expect(st.data.tariffHistory).toHaveLength(1)
    })
    it('the cash-difference limit and dealer margins are saved (not overwritten)', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      must(await st.act.saveSettings({ ...st.data.settings, cashDifferenceAlertLimit: 1500, margins: { 'PMG Super': 9, 'HSD Diesel': 8, 'Hi-Octane': 10 } }))
      await st.reload()
      expect(st.data.settings.cashDifferenceAlertLimit).toBe(1500)
      expect(st.data.settings.margins['HSD Diesel']).toBe(8)
    })
    it('a cashier cannot change settings', async () => {
      const st = await openStation(S1, 'tariq.cashier')
      expect(failed(await st.act.saveSettings(st.data.settings)).code).toBe('FORBIDDEN')
    })
  })

  describe('atomicity', () => {
    it('a failing step leaves the data unchanged', async () => {
      const st = await openStation(S1, 'naveed.akhtar')
      const before = JSON.stringify(st.raw.daybook)
      // recovery whose linked bank account does not exist -> whole transaction fails
      const r = await st.act.recordRecovery({ customerId: 'CUST-01', amount: 1000, method: 'Cheque', referenceNo: 'C1', bankAccountId: 'BANK-01' })
      must(r)
      await st.reload()
      expect(st.data.recoveries.filter((x) => x.referenceNo === 'C1')).toHaveLength(1)
      // now force a database-level failure through the backend directly
      await expect(st.be.applyOps(S1, [
        { t: 'daybook_entries', a: 'insert', row: { id: 'ATOM-1', date: '2026-09-25', particulars: 'p', category: 'Other', cash_in: 5 } },
        { t: 'credit_slips', a: 'insert', row: { id: 'ATOM-2', slip_no: 'S', date: '2026-09-25', customer_id: 'NOPE', fuel_type: 'HSD Diesel', liters: 1, rate: 1, total_amount: 1 } },
      ])).rejects.toThrow()
      await st.reload()
      expect(st.raw.daybook.some((d) => d.id === 'ATOM-1')).toBe(false)
      expect(JSON.stringify(st.raw.daybook)).toBe(before)
    })
  })

})
