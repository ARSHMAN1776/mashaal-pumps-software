import type {
  BankAccount, BankTransaction, CreditSaleSlip, Customer, CustomerAdjustment, CustomerRecovery, DaybookEntry,
  ExpenseRecord, FuelSaleRecord, LubricantMovement, LubricantProduct, Nozzle, OmcInvoice, OmcPayment,
  OwnerTransferRecord, SalaryPayment, ShiftRecord, SiteInfo, StaffAdvance, StaffMember, StationSettings, Supplier,
  SupplierTransaction, Tank, TankDipRecord, TariffRevisionLog,
} from '../types'
import { TABLES, fromRow, settingsFromRow, type CollectionKey, type Row, type TableName } from './tables'

export interface CollectionModels {
  tanks: Tank
  nozzles: Nozzle
  fuelSales: FuelSaleRecord
  shifts: ShiftRecord
  tankDips: TankDipRecord
  omcInvoices: OmcInvoice
  omcPayments: OmcPayment
  bankAccounts: BankAccount
  bankTransactions: BankTransaction
  ownerTransfers: OwnerTransferRecord
  daybook: DaybookEntry
  customers: Customer
  creditSlips: CreditSaleSlip
  recoveries: CustomerRecovery
  customerAdjustments: CustomerAdjustment
  expenses: ExpenseRecord
  staff: StaffMember
  staffAdvances: StaffAdvance
  salaryPayments: SalaryPayment
  lubricants: LubricantProduct
  lubricantMovements: LubricantMovement
  suppliers: Supplier
  supplierTransactions: SupplierTransaction
  tariffHistory: TariffRevisionLog
}

export type StationInfoRaw = Omit<SiteInfo, 'tanksCount' | 'nozzlesCount'>

/** What is stored in the database for one station: facts only, no running totals. */
export type RawStation = {
  info: StationInfoRaw
  settings: StationSettings
} & { [K in CollectionKey]: CollectionModels[K][] }

export const COLLECTION_KEYS = (Object.values(TABLES) as { key: CollectionKey }[]).map((t) => t.key)

export function emptyRaw(info: StationInfoRaw, settings: StationSettings): RawStation {
  const raw = { info, settings } as Record<string, unknown>
  for (const k of COLLECTION_KEYS) raw[k] = []
  return raw as unknown as RawStation
}

export const EMPTY_SETTINGS: StationSettings = {
  rates: { 'PMG Super': 0, 'HSD Diesel': 0, 'Hi-Octane': 0 },
  margins: { 'PMG Super': 8.64, 'HSD Diesel': 8.64, 'Hi-Octane': 8.64 },
  stationPhone: '', managerContact: '', receiptHeader: '', receiptFooter: '',
  lowStockAlertPct: 20, cashDifferenceAlertLimit: 500,
}

/** One result returned by the database after a write, or one realtime change. */
export interface OpResult {
  t: string
  a: 'upsert' | 'delete' | 'purge'
  row?: Row
}

const tableByName = TABLES as Record<string, { key: CollectionKey } | undefined>

/** Merge database results into the raw station (immutably: only touched collections are copied). */
export function applyResults(raw: RawStation, results: OpResult[]): RawStation {
  let next = raw
  const copy = () => {
    if (next === raw) next = { ...raw }
  }
  for (const res of results) {
    if (res.t === 'station_settings') {
      if (res.a === 'upsert' && res.row) {
        copy()
        next.settings = settingsFromRow(res.row)
      }
      continue
    }
    const def = tableByName[res.t]
    if (!def) continue // audit_log and other tables that are not held in memory
    const key = def.key
    copy()
    const list = next[key] as { id: string }[]
    if (res.a === 'purge') {
      ;(next as Record<string, unknown>)[key] = []
    } else if (res.a === 'delete' && res.row) {
      const id = String(res.row.id)
      ;(next as Record<string, unknown>)[key] = list.filter((r) => r.id !== id)
    } else if (res.a === 'upsert' && res.row) {
      const model = fromRow<{ id: string }>(res.t as keyof typeof TABLES, res.row, raw.info.id)
      const i = list.findIndex((r) => r.id === model.id)
      const merged = i >= 0 ? list.map((r, j) => (j === i ? model : r)) : [...list, model]
      ;(next as Record<string, unknown>)[key] = merged
    }
  }
  return next
}

export type { TableName }
