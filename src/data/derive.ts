/**
 * derive(raw) — turns the stored FACTS of one station into the numbers the screens show.
 *
 * Nothing calculated here is ever written back to the database, so a balance can never
 * be out of step with the transactions behind it: edit or delete a transaction and the
 * balance simply recalculates.
 *
 *   customer due      = opening + credit slips + debit notes - recoveries - credit notes
 *   safe cash         = running total of the daybook (cash in - cash out)
 *   bank balance      = opening + credits - debits
 *   tank level        = latest dip reading (or the initial level before any dip)
 *   nozzle meter      = closing meter of the latest recorded reading (or the initial meter)
 *   OMC paid          = amount paid before migration + recorded payments
 *   lubricant stock   = opening + restocks - sales +/- adjustments
 *   supplier due      = opening + bills - payments
 *   staff advances    = advances not yet settled through payroll
 */
import { BANK_CREDIT_TYPES } from '../types'
import type {
  BankAccount, BankTransaction, Customer, DaybookEntry, FuelType, LubricantProduct, Nozzle, OmcInvoice, StaffMember,
  StationData, Supplier, Tank,
} from '../types'
import { formatDate } from '../lib/dates'
import { round2 } from '../lib/money'
import type { RawStation } from './raw'

const EPS = 0.005

/** newest first: date desc, then createdAt desc */
const newestFirst = <T extends { date: string; createdAt?: string }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')

/** oldest first: date asc, then createdAt asc */
const oldestFirst = <T extends { date: string; createdAt?: string }>(a: T, b: T) => -newestFirst(a, b)

function latestBy<T extends { date: string; createdAt?: string }>(list: T[]): T | undefined {
  let best: T | undefined
  for (const r of list) {
    if (!best || newestFirst(r, best) < 0) best = r
  }
  return best
}

const sumBy = <T>(list: T[], pick: (t: T) => number) => list.reduce((s, t) => s + pick(t), 0)

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const item of list) {
    const k = key(item)
    const bucket = m.get(k)
    if (bucket) bucket.push(item)
    else m.set(k, [item])
  }
  return m
}

/** Is record `r` newer than the baseline reading (a dip, or the moment the tank was registered)? */
function isAfter(r: { date: string; createdAt: string }, base: { date: string; createdAt: string; byDate: boolean }): boolean {
  if (base.byDate) {
    return r.date > base.date || (r.date === base.date && r.createdAt > base.createdAt)
  }
  return r.createdAt > base.createdAt
}

export function deriveStation(raw: RawStation): StationData {
  const rates = raw.settings.rates

  // ---- tanks -------------------------------------------------------------
  const dipsByTank = groupBy(raw.tankDips, (d) => d.tankId)
  const nozzleTank = new Map(raw.nozzles.map((n) => [n.id, n.tankId]))

  const tanks: Tank[] = raw.tanks
    .map((t) => {
      const latest = latestBy(dipsByTank.get(t.id) ?? [])
      const currentLiters = latest ? latest.closingPhysicalLiters : t.initialLiters
      const base = latest
        ? { date: latest.date, createdAt: latest.createdAt, byDate: true }
        : { date: '', createdAt: t.createdAt, byDate: false }
      const delivered = sumBy(
        raw.omcInvoices.filter((i) => i.tankId === t.id && isAfter(i, base)),
        (i) => i.decantedVolumeLiters,
      )
      const sold = sumBy(
        raw.fuelSales.filter((s) => nozzleTank.get(s.nozzleId) === t.id && isAfter(s, base)),
        (s) => s.netLiters,
      )
      return {
        ...t,
        currentLiters,
        currentDipMm: latest ? latest.closingDipMm : t.initialDipMm,
        waterDipMm: latest ? latest.waterDipMm : 0,
        lastUpdated: latest ? formatDate(latest.date) : '',
        estimatedBookLiters: Math.max(0, round2(currentLiters + delivered - sold)),
      }
    })
    .sort((a, b) => a.tankNo - b.tankNo)
  const tankById = new Map(tanks.map((t) => [t.id, t]))

  // ---- nozzles -----------------------------------------------------------
  const salesByNozzle = groupBy(raw.fuelSales, (s) => s.nozzleId)
  const nozzles: Nozzle[] = raw.nozzles
    .map((n) => {
      const fuelType: FuelType = tankById.get(n.tankId)?.fuelType ?? n.fuelType
      const latest = latestBy(salesByNozzle.get(n.id) ?? [])
      return {
        ...n,
        fuelType,
        ratePerLiter: rates[fuelType] ?? 0,
        openingMeter: latest ? latest.openingMeter : n.initialMeter,
        closingMeter: latest ? latest.closingMeter : n.initialMeter,
      }
    })
    .sort((a, b) => a.dispenserNo - b.dispenserNo || a.nozzleNo - b.nozzleNo)

  // ---- customers ---------------------------------------------------------
  const slipsByCustomer = groupBy(raw.creditSlips, (s) => s.customerId)
  const recoveriesByCustomer = groupBy(raw.recoveries, (r) => r.customerId)
  const adjustmentsByCustomer = groupBy(raw.customerAdjustments, (a) => a.customerId)
  const customers: Customer[] = raw.customers
    .map((c) => {
      const slips = sumBy(slipsByCustomer.get(c.id) ?? [], (s) => s.totalAmount)
      const paid = sumBy(recoveriesByCustomer.get(c.id) ?? [], (r) => r.amount)
      const adj = adjustmentsByCustomer.get(c.id) ?? []
      const debits = sumBy(adj.filter((a) => a.kind === 'Debit'), (a) => a.amount)
      const credits = sumBy(adj.filter((a) => a.kind === 'Credit'), (a) => a.amount)
      return { ...c, currentBalance: round2(c.openingBalance + slips + debits - paid - credits) }
    })
    .sort((a, b) => a.businessName.localeCompare(b.businessName))

  // ---- daybook (safe cash) -----------------------------------------------
  const daybookSorted = [...raw.daybook].sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
  let safe = 0
  const daybook: DaybookEntry[] = daybookSorted.map((e) => {
    safe = round2(safe + e.cashIn - e.cashOut)
    return { ...e, balanceAfter: safe }
  })

  // ---- banking -----------------------------------------------------------
  const txByBank = groupBy(raw.bankTransactions, (t) => t.bankId)
  const signed = (t: BankTransaction) => (BANK_CREDIT_TYPES.includes(t.type) ? t.amount : -t.amount)
  const bankTransactions: BankTransaction[] = []
  const bankAccounts: BankAccount[] = raw.bankAccounts.map((b) => {
    let running = b.openingBalance
    const txs = [...(txByBank.get(b.id) ?? [])].sort(oldestFirst)
    for (const t of txs) {
      running = round2(running + signed(t))
      bankTransactions.push({ ...t, balanceAfter: running })
    }
    return { ...b, currentBalance: running }
  })
  // transactions of an account that no longer exists are still listed (balance unknown)
  const knownBanks = new Set(raw.bankAccounts.map((b) => b.id))
  for (const t of raw.bankTransactions) if (!knownBanks.has(t.bankId)) bankTransactions.push(t)
  bankTransactions.sort(newestFirst)

  // ---- OMC invoices ------------------------------------------------------
  const paymentsByInvoice = groupBy(raw.omcPayments, (p) => p.invoiceNo)
  const omcInvoices: OmcInvoice[] = raw.omcInvoices
    .map((i) => {
      const paidAmount = round2(i.openingPaidAmount + sumBy(paymentsByInvoice.get(i.invoiceNo) ?? [], (p) => p.amount))
      const paymentStatus: OmcInvoice['paymentStatus'] =
        paidAmount + EPS >= i.totalAmount ? 'Paid' : paidAmount > EPS ? 'Partial' : 'Pending'
      return { ...i, paidAmount, paymentStatus }
    })
    .sort(newestFirst)

  // ---- staff -------------------------------------------------------------
  const advancesByStaff = groupBy(raw.staffAdvances.filter((a) => a.status === 'Outstanding'), (a) => a.staffId)
  const staff: StaffMember[] = raw.staff
    .map((s) => ({ ...s, currentAdvances: round2(sumBy(advancesByStaff.get(s.id) ?? [], (a) => a.amount)) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // ---- lubricants --------------------------------------------------------
  const movesByProduct = groupBy(raw.lubricantMovements, (m) => m.productId)
  const lubricants: LubricantProduct[] = raw.lubricants
    .map((p) => {
      let stock = p.openingStock
      for (const m of movesByProduct.get(p.id) ?? []) {
        stock += m.type === 'Restock' || m.type === 'Adjustment In' ? m.quantity : -m.quantity
      }
      return { ...p, stockCans: stock }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // ---- suppliers ---------------------------------------------------------
  const txBySupplier = groupBy(raw.supplierTransactions, (t) => t.supplierId)
  const suppliers: Supplier[] = raw.suppliers
    .map((s) => {
      const txs = txBySupplier.get(s.id) ?? []
      const bills = sumBy(txs.filter((t) => t.type === 'Bill'), (t) => t.amount)
      const paid = sumBy(txs.filter((t) => t.type === 'Payment'), (t) => t.amount)
      return { ...s, balanceDue: round2(s.openingBalance + bills - paid) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    siteInfo: { ...raw.info, tanksCount: tanks.length, nozzlesCount: nozzles.length },
    settings: raw.settings,
    tanks,
    nozzles,
    fuelSales: [...raw.fuelSales].sort(newestFirst),
    shifts: [...raw.shifts].sort(newestFirst as (a: { date: string }, b: { date: string }) => number),
    tankDips: [...raw.tankDips].sort(newestFirst),
    omcInvoices,
    omcPayments: [...raw.omcPayments].sort((a, b) => b.date.localeCompare(a.date)),
    daybook,
    customers,
    creditSlips: [...raw.creditSlips].sort(newestFirst),
    recoveries: [...raw.recoveries].sort(newestFirst),
    customerAdjustments: [...raw.customerAdjustments].sort(newestFirst),
    bankAccounts,
    bankTransactions,
    expenses: [...raw.expenses].sort((a, b) => b.date.localeCompare(a.date)),
    staff,
    staffAdvances: [...raw.staffAdvances].sort(newestFirst),
    salaryPayments: [...raw.salaryPayments].sort((a, b) => b.date.localeCompare(a.date)),
    lubricants,
    lubricantMovements: [...raw.lubricantMovements].sort(newestFirst),
    suppliers,
    supplierTransactions: [...raw.supplierTransactions].sort(newestFirst),
    tariffHistory: [...raw.tariffHistory].sort((a, b) => b.date.localeCompare(a.date)),
    ownerTransfers: [...raw.ownerTransfers].sort((a, b) => b.date.localeCompare(a.date)),
  }
}

/**
 * Liters delivered into / sold out of a tank since its last dip (or since it was registered) —
 * used to pre-fill the dip form so the inspector only has to enter what he measured.
 */
export function movementsSinceLastDip(d: StationData, tankId: string): { decanted: number; dispensed: number } {
  const tank = d.tanks.find((t) => t.id === tankId)
  if (!tank) return { decanted: 0, dispensed: 0 }
  const latest = latestBy(d.tankDips.filter((x) => x.tankId === tankId))
  const base = latest
    ? { date: latest.date, createdAt: latest.createdAt, byDate: true }
    : { date: '', createdAt: tank.createdAt, byDate: false }
  const nozzleIds = new Set(d.nozzles.filter((n) => n.tankId === tankId).map((n) => n.id))
  return {
    decanted: sumBy(d.omcInvoices.filter((i) => i.tankId === tankId && isAfter(i, base)), (i) => i.decantedVolumeLiters),
    dispensed: round2(sumBy(d.fuelSales.filter((s) => nozzleIds.has(s.nozzleId) && isAfter(s, base)), (s) => s.netLiters)),
  }
}

/** Below the minimum reserve, or below the station's low-stock alert percentage of capacity. */
export const isLowTank = (t: Tank, lowStockAlertPct: number): boolean =>
  t.currentLiters <= t.minReserveLiters || (t.capacityLiters > 0 && (t.currentLiters / t.capacityLiters) * 100 < lowStockAlertPct)

/** Cash currently in the safe. */
export const safeCash = (d: StationData): number => (d.daybook.length ? d.daybook[d.daybook.length - 1].balanceAfter : 0)
