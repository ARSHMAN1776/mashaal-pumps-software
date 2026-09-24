/**
 * Backup files.
 *   v2 (current): { format: 'mashaal-backup', version: 2, raw: <stored facts of one station> }
 *   v1 (previous software): a StationData snapshot (balances stored as plain numbers). It is converted
 *       to facts on the way in — exactly like the database migration: opening balance = old balance
 *       minus/plus the transactions that come with it, so every balance is unchanged.
 */
import type { StationSettings } from '../types'
import { op, type Op } from './ops'
import { COLLECTION_KEYS, EMPTY_SETTINGS, emptyRaw, type RawStation } from './raw'
import { TABLES, type CollectionKey } from './tables'
import { todayISO } from '../lib/dates'

export interface BackupCheck {
  valid: boolean
  error?: string
  kind?: 'v2' | 'legacy'
  siteId?: string
  siteName?: string
  exportedAt?: string
  raw?: RawStation
  counts?: { tanks: number; nozzles: number; customers: number; records: number }
}

export function exportBackupJson(raw: RawStation): string {
  return JSON.stringify(
    { format: 'mashaal-backup', version: 2, exportedAt: new Date().toISOString(), siteId: raw.info.id, siteName: raw.info.name, raw },
    null, 2,
  )
}

const asArray = (v: unknown): Record<string, any>[] => (Array.isArray(v) ? (v as Record<string, any>[]) : [])
const n = (v: unknown, d = 0): number => {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : d
}
const s = (v: unknown, d = ''): string => (v === undefined || v === null ? d : String(v))
const noon = (date: string) => `${date || todayISO()}T12:00:00.000Z`

/** Converts a v1 (old software) station snapshot into stored facts. */
export function legacyToRaw(old: Record<string, any>, siteId: string): RawStation {
  const info = old.siteInfo ?? {}
  const st = old.settings ?? {}
  const settings: StationSettings = {
    ...EMPTY_SETTINGS,
    rates: {
      'PMG Super': n(st.rates?.['PMG Super']), 'HSD Diesel': n(st.rates?.['HSD Diesel']), 'Hi-Octane': n(st.rates?.['Hi-Octane']),
    },
    stationPhone: s(st.stationPhone), managerContact: s(st.managerContact), receiptHeader: s(st.receiptHeader),
    receiptFooter: s(st.receiptFooter), lowStockAlertPct: n(st.lowStockAlertPct, 20), cashDifferenceAlertLimit: n(st.cashDifferenceAlertLimit, 500),
  }
  const raw = emptyRaw({
    id: siteId, code: s(info.code), name: s(info.name), location: s(info.location),
    brand: info.brand === 'PSO' ? 'PSO' : 'TOTAL PARCO', brandColor: s(info.brandColor, '#967938'),
    phone: s(info.phone), managerName: s(info.managerName), ntn: s(info.ntn),
  }, settings)
  const shifts = asArray(old.shifts)

  raw.tanks = asArray(old.tanks).map((t) => ({
    id: s(t.id), siteId, tankNo: n(t.tankNo), fuelType: t.fuelType, capacityLiters: n(t.capacityLiters), minReserveLiters: n(t.minReserveLiters),
    initialLiters: n(t.currentLiters), initialDipMm: n(t.currentDipMm), currentLiters: 0, currentDipMm: 0, waterDipMm: 0, lastUpdated: '', estimatedBookLiters: 0, createdAt: '',
  }))
  raw.nozzles = asArray(old.nozzles).map((z) => ({
    id: s(z.id), siteId, tankId: s(z.tankId), dispenserNo: n(z.dispenserNo), nozzleNo: n(z.nozzleNo), fuelType: z.fuelType,
    initialMeter: Math.max(n(z.closingMeter), n(z.openingMeter)), openingMeter: 0, closingMeter: 0, testingLiters: n(z.testingLiters),
    ratePerLiter: 0, assignedStaff: s(z.assignedStaff), isActive: true,
  }))
  raw.shifts = shifts.map((r) => ({
    id: s(r.id), shiftName: r.shiftName ?? 'Morning', date: s(r.date, todayISO()), incharge: s(r.incharge), status: r.status === 'Open' ? 'Open' : 'Closed',
    startTime: s(r.startTime), endTime: s(r.endTime), totalFuelSales: n(r.totalFuelSales), totalLubeSales: n(r.totalLubeSales), creditSales: n(r.creditSales),
    digitalPayments: n(r.digitalPayments), shiftExpenses: n(r.shiftExpenses), creditRecoveries: n(r.creditRecoveries), expectedCash: n(r.expectedCash),
    actualCash: n(r.actualCash), shortageExcess: n(r.shortageExcess), notes: r.notes,
  }))
  raw.fuelSales = asArray(old.fuelSales).map((r) => ({
    id: s(r.id), date: s(r.date, todayISO()), shiftId: s(r.shiftId), shiftName: shifts.find((x) => x.id === r.shiftId)?.shiftName ?? 'Morning',
    nozzleId: s(r.nozzleId), dispenserNo: n(r.dispenserNo), nozzleNo: n(r.nozzleNo), fuelType: r.fuelType, openingMeter: n(r.openingMeter),
    closingMeter: Math.max(n(r.closingMeter), n(r.openingMeter)), testingLiters: n(r.testingLiters), netLiters: Math.max(0, n(r.netLiters)),
    ratePerLiter: n(r.ratePerLiter), totalAmount: n(r.totalAmount), cashierName: s(r.cashierName), createdAt: noon(s(r.date)),
  }))
  raw.tankDips = asArray(old.tankDips).map((r) => ({
    id: s(r.id), date: s(r.date, todayISO()), tankId: s(r.tankId), tankNo: n(r.tankNo), fuelType: r.fuelType, morningDipMm: n(r.morningDipMm),
    morningLiters: n(r.morningLiters), decantedLiters: n(r.decantedLiters), dispensedLiters: n(r.dispensedLiters), bookStockLiters: n(r.bookStockLiters),
    closingDipMm: n(r.closingDipMm), closingPhysicalLiters: n(r.closingPhysicalLiters), varianceLiters: n(r.varianceLiters), waterDipMm: n(r.waterDipMm),
    inspector: s(r.inspector), createdAt: noon(s(r.date)),
  }))
  const oldPayments = asArray(old.omcPayments)
  raw.omcInvoices = asArray(old.omcInvoices).map((r) => ({
    id: s(r.id), invoiceNo: s(r.invoiceNo), date: s(r.date, todayISO()), brand: s(r.brand), tankLorryNo: s(r.tankLorryNo), driverName: s(r.driverName),
    fuelType: r.fuelType, tankId: '', invoiceVolumeLiters: n(r.invoiceVolumeLiters), decantedVolumeLiters: n(r.decantedVolumeLiters),
    ratePerLiter: n(r.ratePerLiter), freightAmount: n(r.freightAmount), totalAmount: n(r.totalAmount),
    openingPaidAmount: n(r.paidAmount) - oldPayments.filter((p) => p.invoiceNo === r.invoiceNo).reduce((a, p) => a + n(p.amount), 0),
    paymentStatus: 'Pending', paidAmount: 0, createdAt: noon(s(r.date)),
  }))
  raw.omcPayments = oldPayments.filter((r) => n(r.amount) > 0).map((r) => ({
    id: s(r.id), date: s(r.date, todayISO()), invoiceNo: s(r.invoiceNo), paymentMethod: r.paymentMethod ?? 'Bank Transfer', bankName: s(r.bankName),
    bankAccountId: '', referenceNo: s(r.referenceNo), amount: n(r.amount), recordedBy: s(r.recordedBy),
  }))
  const bankTx = asArray(old.bankTransactions)
  const signed = (t: Record<string, any>) => (t.type === 'Deposit' ? n(t.amount) : -n(t.amount))
  raw.bankAccounts = asArray(old.bankAccounts).map((b) => ({
    id: s(b.id), bankName: s(b.bankName), accountTitle: s(b.accountTitle), accountNumber: s(b.accountNumber), branch: s(b.branch),
    openingBalance: n(b.currentBalance) - bankTx.filter((t) => t.bankId === b.id).reduce((a, t) => a + signed(t), 0), currentBalance: 0, isActive: true,
  }))
  const knownBanks = new Set(raw.bankAccounts.map((b) => b.id))
  raw.bankTransactions = bankTx.filter((t) => n(t.amount) > 0 && knownBanks.has(s(t.bankId))).map((t) => ({
    id: s(t.id), bankId: s(t.bankId), date: s(t.date, todayISO()), type: t.type, amount: n(t.amount), depositSlipNo: s(t.depositSlipNo), description: s(t.description),
    sourceType: undefined, sourceId: undefined, balanceAfter: 0, createdAt: noon(s(t.date)),
  }))
  raw.ownerTransfers = asArray(old.ownerTransfers).filter((r) => n(r.amount) > 0).map((r) => ({
    id: s(r.id), siteId, date: s(r.date, todayISO()), amount: n(r.amount), bankId: s(r.bankId), bankName: s(r.bankName), accountTitle: s(r.accountTitle),
    accountNumber: s(r.accountNumber), referenceNo: s(r.referenceNo), status: r.status === 'Pending' ? 'Pending' : 'Completed', notes: s(r.notes), transferredBy: s(r.transferredBy),
  }))
  raw.daybook = asArray(old.daybook).map((r, i) => ({
    id: s(r.id), seq: i + 1, date: s(r.date, todayISO()), time: s(r.time), particulars: s(r.particulars), category: r.category ?? 'Other',
    cashIn: n(r.cashIn), cashOut: n(r.cashOut), balanceAfter: 0, referenceNo: s(r.referenceNo), handledBy: s(r.handledBy),
  }))
  const slips = asArray(old.creditSlips)
  const recs = asArray(old.recoveries)
  raw.customers = asArray(old.customers).map((c) => ({
    id: s(c.id), siteId, name: s(c.name, s(c.businessName)), businessName: s(c.businessName, s(c.name)), phone: s(c.phone),
    vehicleNumbers: Array.isArray(c.vehicleNumbers) ? c.vehicleNumbers.map(String) : [], creditLimit: n(c.creditLimit),
    openingBalance: n(c.currentBalance) - slips.filter((x) => x.customerId === c.id).reduce((a, x) => a + n(x.totalAmount), 0)
      + recs.filter((x) => x.customerId === c.id).reduce((a, x) => a + n(x.amount), 0),
    currentBalance: 0, status: c.status === 'Hold' ? 'Hold' : 'Active',
  }))
  const knownCustomers = new Set(raw.customers.map((c) => c.id))
  raw.creditSlips = slips.filter((r) => knownCustomers.has(s(r.customerId))).map((r) => ({
    id: s(r.id), slipNo: s(r.slipNo), date: s(r.date, todayISO()), customerId: s(r.customerId), customerName: s(r.customerName), vehicleNo: s(r.vehicleNo),
    driverName: s(r.driverName), fuelType: r.fuelType, liters: Math.max(n(r.liters), 0.001), rate: n(r.rate), totalAmount: n(r.totalAmount),
    authorizedBy: s(r.authorizedBy), createdAt: noon(s(r.date)),
  }))
  raw.recoveries = recs.filter((r) => n(r.amount) > 0 && knownCustomers.has(s(r.customerId))).map((r) => ({
    id: s(r.id), receiptNo: s(r.receiptNo), date: s(r.date, todayISO()), customerId: s(r.customerId), customerName: s(r.customerName),
    paymentMethod: r.paymentMethod ?? 'Cash', amount: n(r.amount), referenceNo: s(r.referenceNo), receivedBy: s(r.receivedBy), bankAccountId: '', bankPending: false, createdAt: noon(s(r.date)),
  }))
  raw.expenses = asArray(old.expenses).filter((r) => n(r.amount) > 0).map((r) => ({
    id: s(r.id), voucherNo: s(r.voucherNo, s(r.id)), date: s(r.date, todayISO()), category: r.category ?? 'Misc', description: s(r.description),
    payee: s(r.payee), amount: n(r.amount), paymentMode: r.paymentMode === 'Bank' ? 'Bank' : 'Cash', approvedBy: s(r.approvedBy), bankAccountId: '',
  }))
  const staff = asArray(old.staff)
  raw.staff = staff.map((r) => ({
    id: s(r.id), siteId, name: s(r.name), role: r.role ?? 'Pump Attendant', phone: s(r.phone), monthlySalary: n(r.monthlySalary),
    dailyAdvanceLimit: n(r.dailyAdvanceLimit), currentAdvances: 0, joiningDate: s(r.joiningDate), status: ['On Duty', 'Off Duty', 'On Leave'].includes(r.status) ? r.status : 'On Duty', isActive: true,
  }))
  raw.staffAdvances = staff.filter((r) => n(r.currentAdvances) > 0).map((r) => ({
    id: `ADV-BF-${s(r.id)}`, staffId: s(r.id), date: todayISO(), amount: n(r.currentAdvances), reason: 'Balance brought forward from previous software',
    status: 'Outstanding', settledOn: '', settlementId: '', recordedBy: 'Migration', createdAt: '',
  }))
  raw.lubricants = asArray(old.lubricants).map((r) => ({
    id: s(r.id), name: s(r.name), brand: s(r.brand), grade: s(r.grade), packSize: s(r.packSize), openingStock: Math.max(0, n(r.stockCans)), stockCans: 0,
    minStockAlert: Math.max(0, n(r.minStockAlert)), costPrice: n(r.costPrice), salePrice: n(r.salePrice), isActive: true,
  }))
  raw.suppliers = asArray(old.suppliers).map((r) => ({
    id: s(r.id), name: s(r.name), company: s(r.company), category: s(r.category), phone: s(r.phone), openingBalance: n(r.balanceDue), balanceDue: 0, isActive: true,
  }))
  raw.tariffHistory = asArray(old.tariffHistory).map((r) => ({
    id: s(r.id), date: s(r.date, todayISO()), effectiveDate: s(r.effectiveDate), notificationNo: s(r.notificationNo), oldRates: r.oldRates, newRates: r.newRates,
    tankSnapshots: Array.isArray(r.tankSnapshots) ? r.tankSnapshots : [], netInventoryGainLoss: n(r.netInventoryGainLoss), revisedBy: s(r.revisedBy), notes: r.notes,
  }))
  return raw
}

const recordCount = (raw: RawStation) => COLLECTION_KEYS.reduce((a, k) => a + (raw[k] as unknown[]).length, 0)

/** Validates the text of a backup file (either format) before anything is changed. */
export function checkBackup(text: string): BackupCheck {
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { valid: false, error: `The file is not valid JSON (${(e as Error).message}).` }
  }
  if (!parsed || typeof parsed !== 'object') return { valid: false, error: 'The file does not contain a backup.' }

  if (parsed.format === 'mashaal-backup' && parsed.version === 2 && parsed.raw) {
    const raw = parsed.raw as RawStation
    if (!raw.info || !raw.settings || !Array.isArray(raw.tanks) || !Array.isArray(raw.customers)) {
      return { valid: false, error: 'This backup file is incomplete or damaged.' }
    }
    for (const k of COLLECTION_KEYS) if (!Array.isArray(raw[k])) (raw as unknown as Record<string, unknown>)[k] = []
    return {
      valid: true, kind: 'v2', siteId: String(parsed.siteId ?? raw.info.id), siteName: String(parsed.siteName ?? raw.info.name),
      exportedAt: String(parsed.exportedAt ?? ''), raw,
      counts: { tanks: raw.tanks.length, nozzles: raw.nozzles.length, customers: raw.customers.length, records: recordCount(raw) },
    }
  }

  const snapshot = parsed.data && parsed.data.siteInfo ? parsed.data : parsed
  if (snapshot.siteInfo && Array.isArray(snapshot.tanks) && Array.isArray(snapshot.nozzles)) {
    const siteId = String(parsed.siteId ?? snapshot.siteInfo.id ?? '') || (snapshot.siteInfo.brand === 'TOTAL PARCO' ? 'SITE-01' : 'SITE-02')
    const raw = legacyToRaw(snapshot, siteId)
    return {
      valid: true, kind: 'legacy', siteId, siteName: s(snapshot.siteInfo.name), exportedAt: String(parsed.exportedAt ?? ''), raw,
      counts: { tanks: raw.tanks.length, nozzles: raw.nozzles.length, customers: raw.customers.length, records: recordCount(raw) },
    }
  }
  return { valid: false, error: 'This file is not a Mashaal station backup (no tanks / nozzles / station data found).' }
}

// ---------------------------------------------------------------------------
// turning a backup into database operations
// ---------------------------------------------------------------------------

/** parents before children (for inserts); the reverse is used for purges */
const INSERT_ORDER: { table: keyof typeof TABLES; key: CollectionKey }[] = [
  'tanks', 'nozzles', 'bank_accounts', 'customers', 'suppliers', 'staff_members', 'lubricant_products', 'omc_invoices',
  'tank_dips', 'fuel_sales', 'shifts', 'omc_payments', 'bank_transactions', 'owner_transfers', 'daybook_entries', 'credit_slips',
  'customer_recoveries', 'customer_adjustments', 'expenses', 'staff_advances', 'staff_salary_payments', 'lubricant_movements',
  'supplier_transactions', 'tariff_revisions',
].map((table) => ({ table: table as keyof typeof TABLES, key: TABLES[table as keyof typeof TABLES].key }))

/** Replace ALL records of the station with the backup's records (one transaction). */
export function buildReplaceOps(raw: RawStation): Op[] {
  const ops: Op[] = []
  for (const { table } of [...INSERT_ORDER].reverse()) ops.push(op.purge(table))
  ops.push(op.settings(raw.settings))
  for (const { table, key } of INSERT_ORDER) {
    // daybook is inserted in its original order so the safe-cash sequence is preserved
    const rows = key === 'daybook' ? [...raw.daybook].sort((a, b) => a.seq - b.seq) : (raw[key] as object[])
    for (const r of rows) ops.push(op.insert(table, r))
  }
  return ops
}

/** Add only the records that are not in the database yet (existing ones are never touched). */
export function buildMergeOps(raw: RawStation): Op[] {
  const ops: Op[] = []
  for (const { table, key } of INSERT_ORDER) {
    const rows = key === 'daybook' ? [...raw.daybook].sort((a, b) => a.seq - b.seq) : (raw[key] as object[])
    for (const r of rows) ops.push(op.insertIgnore(table, r))
  }
  return ops
}
