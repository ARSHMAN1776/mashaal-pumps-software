/**
 * Table registry — the single place that knows how an app model maps to a database row.
 *
 * Logical table names (e.g. "customers") are what the app and the apply_ops() database
 * function use; the database routes them to the station's own physical table
 * (s01_customers for SITE-01, s02_customers for SITE-02, ...).
 */
import type { SiteId } from '../types'

export type FieldKind =
  | 's' // text, never null
  | 'sn' // nullable text: '' in the model <-> NULL in the database
  | 'n' // number
  | 'b' // boolean
  | 'sa' // text[]
  | 'd' // date (YYYY-MM-DD)
  | 'dn' // nullable date: '' <-> NULL
  | 'ni' // nullable number: undefined <-> NULL

export interface FieldSpec {
  /** property name on the model */
  m: string
  /** column name in the database */
  c: string
  k: FieldKind
  /** read from the database but never written (server generated) */
  ro?: boolean
}

export interface TableDef {
  table: string
  /** property of RawStation that holds this table's rows */
  key: CollectionKey
  fields: FieldSpec[]
  /** model properties that are derived by the app (given neutral values when a row is read) */
  derived?: Record<string, unknown>
  /** model has a siteId property that is not stored in the row */
  siteScoped?: boolean
}

export type CollectionKey =
  | 'tanks' | 'nozzles' | 'fuelSales' | 'shifts' | 'tankDips' | 'omcInvoices' | 'omcPayments'
  | 'bankAccounts' | 'bankTransactions' | 'ownerTransfers' | 'daybook' | 'customers' | 'creditSlips'
  | 'recoveries' | 'customerAdjustments' | 'expenses' | 'staff' | 'staffAdvances' | 'salaryPayments'
  | 'lubricants' | 'lubricantMovements' | 'suppliers' | 'supplierTransactions' | 'tariffHistory'

const f = (m: string, c: string, k: FieldKind, ro = false): FieldSpec => ({ m, c, k, ro })
const id = f('id', 'id', 's')
const createdAt = f('createdAt', 'created_at', 's', true)

export const TABLES = {
  tanks: {
    table: 'tanks', key: 'tanks', siteScoped: true,
    fields: [
      id, f('tankNo', 'tank_no', 'n'), f('fuelType', 'fuel_type', 's'), f('capacityLiters', 'capacity_liters', 'n'),
      f('minReserveLiters', 'min_reserve_liters', 'n'), f('initialLiters', 'initial_liters', 'n'),
      f('initialDipMm', 'initial_dip_mm', 'n'), createdAt,
    ],
    derived: { currentLiters: 0, currentDipMm: 0, waterDipMm: 0, lastUpdated: '', estimatedBookLiters: 0 },
  },
  nozzles: {
    table: 'nozzles', key: 'nozzles', siteScoped: true,
    fields: [
      id, f('tankId', 'tank_id', 's'), f('dispenserNo', 'dispenser_no', 'n'), f('nozzleNo', 'nozzle_no', 'n'),
      f('initialMeter', 'initial_meter', 'n'), f('testingLiters', 'testing_liters', 'n'),
      f('assignedStaff', 'assigned_staff', 's'), f('isActive', 'is_active', 'b'),
    ],
    derived: { fuelType: 'PMG Super', openingMeter: 0, closingMeter: 0, ratePerLiter: 0 },
  },
  fuel_sales: {
    table: 'fuel_sales', key: 'fuelSales',
    fields: [
      id, f('date', 'date', 'd'), f('shiftName', 'shift_name', 's'), f('shiftId', 'shift_id', 'sn'),
      f('nozzleId', 'nozzle_id', 's'), f('dispenserNo', 'dispenser_no', 'n'), f('nozzleNo', 'nozzle_no', 'n'),
      f('fuelType', 'fuel_type', 's'), f('openingMeter', 'opening_meter', 'n'), f('closingMeter', 'closing_meter', 'n'),
      f('testingLiters', 'testing_liters', 'n'), f('netLiters', 'net_liters', 'n'),
      f('ratePerLiter', 'rate_per_liter', 'n'), f('totalAmount', 'total_amount', 'n'),
      f('cashierName', 'cashier_name', 's'), createdAt,
    ],
  },
  shifts: {
    table: 'shifts', key: 'shifts',
    fields: [
      id, f('shiftName', 'shift_name', 's'), f('date', 'date', 'd'), f('incharge', 'incharge', 's'),
      f('status', 'status', 's'), f('startTime', 'start_time', 's'), f('endTime', 'end_time', 's'),
      f('totalFuelSales', 'total_fuel_sales', 'n'), f('totalLubeSales', 'total_lube_sales', 'n'),
      f('creditSales', 'credit_sales', 'n'), f('digitalPayments', 'digital_payments', 'n'),
      f('shiftExpenses', 'shift_expenses', 'n'), f('creditRecoveries', 'credit_recoveries', 'n'),
      f('expectedCash', 'expected_cash', 'n'), f('actualCash', 'actual_cash', 'n'),
      f('shortageExcess', 'shortage_excess', 'n'), f('notes', 'notes', 'sn'),
    ],
  },
  tank_dips: {
    table: 'tank_dips', key: 'tankDips',
    fields: [
      id, f('date', 'date', 'd'), f('tankId', 'tank_id', 's'), f('tankNo', 'tank_no', 'n'), f('fuelType', 'fuel_type', 's'),
      f('morningDipMm', 'morning_dip_mm', 'n'), f('morningLiters', 'morning_liters', 'n'),
      f('decantedLiters', 'decanted_liters', 'n'), f('dispensedLiters', 'dispensed_liters', 'n'),
      f('bookStockLiters', 'book_stock_liters', 'n'), f('closingDipMm', 'closing_dip_mm', 'n'),
      f('closingPhysicalLiters', 'closing_physical_liters', 'n'), f('varianceLiters', 'variance_liters', 'n'),
      f('waterDipMm', 'water_dip_mm', 'n'), f('inspector', 'inspector', 's'), createdAt,
    ],
  },
  omc_invoices: {
    table: 'omc_invoices', key: 'omcInvoices',
    fields: [
      id, f('invoiceNo', 'invoice_no', 's'), f('date', 'date', 'd'), f('brand', 'brand', 's'),
      f('tankLorryNo', 'tank_lorry_no', 's'), f('driverName', 'driver_name', 's'), f('fuelType', 'fuel_type', 's'),
      f('tankId', 'tank_id', 'sn'), f('invoiceVolumeLiters', 'invoice_volume_liters', 'n'),
      f('decantedVolumeLiters', 'decanted_volume_liters', 'n'), f('ratePerLiter', 'rate_per_liter', 'n'),
      f('freightAmount', 'freight_amount', 'n'), f('totalAmount', 'total_amount', 'n'),
      f('openingPaidAmount', 'opening_paid_amount', 'n'), createdAt,
    ],
    derived: { paymentStatus: 'Pending', paidAmount: 0 },
  },
  omc_payments: {
    table: 'omc_payments', key: 'omcPayments',
    fields: [
      id, f('date', 'date', 'd'), f('invoiceNo', 'invoice_no', 's'), f('paymentMethod', 'payment_method', 's'),
      f('bankName', 'bank_name', 's'), f('bankAccountId', 'bank_account_id', 'sn'), f('referenceNo', 'reference_no', 's'),
      f('amount', 'amount', 'n'), f('recordedBy', 'recorded_by', 's'),
    ],
  },
  bank_accounts: {
    table: 'bank_accounts', key: 'bankAccounts',
    fields: [
      id, f('bankName', 'bank_name', 's'), f('accountTitle', 'account_title', 's'), f('accountNumber', 'account_number', 's'),
      f('branch', 'branch', 's'), f('openingBalance', 'opening_balance', 'n'), f('isActive', 'is_active', 'b'),
    ],
    derived: { currentBalance: 0 },
  },
  bank_transactions: {
    table: 'bank_transactions', key: 'bankTransactions',
    fields: [
      id, f('bankId', 'bank_id', 's'), f('date', 'date', 'd'), f('type', 'type', 's'), f('amount', 'amount', 'n'),
      f('depositSlipNo', 'deposit_slip_no', 'sn'), f('description', 'description', 's'),
      f('sourceType', 'source_type', 'sn'), f('sourceId', 'source_id', 'sn'), createdAt,
    ],
    derived: { balanceAfter: 0 },
  },
  owner_transfers: {
    table: 'owner_transfers', key: 'ownerTransfers', siteScoped: true,
    fields: [
      id, f('date', 'date', 'd'), f('amount', 'amount', 'n'), f('bankId', 'bank_id', 's'), f('bankName', 'bank_name', 's'),
      f('accountTitle', 'account_title', 's'), f('accountNumber', 'account_number', 's'), f('referenceNo', 'reference_no', 's'),
      f('status', 'status', 's'), f('notes', 'notes', 'sn'), f('transferredBy', 'transferred_by', 's'),
    ],
  },
  daybook_entries: {
    table: 'daybook_entries', key: 'daybook',
    fields: [
      id, f('seq', 'seq', 'n', true), f('date', 'date', 'd'), f('time', 'time', 's'), f('particulars', 'particulars', 's'),
      f('category', 'category', 's'), f('cashIn', 'cash_in', 'n'), f('cashOut', 'cash_out', 'n'),
      f('referenceNo', 'reference_no', 'sn'), f('handledBy', 'handled_by', 's'),
      f('sourceType', 'source_type', 'sn'), f('sourceId', 'source_id', 'sn'),
    ],
    derived: { balanceAfter: 0 },
  },
  customers: {
    table: 'customers', key: 'customers', siteScoped: true,
    fields: [
      id, f('name', 'name', 's'), f('businessName', 'business_name', 's'), f('phone', 'phone', 's'),
      f('vehicleNumbers', 'vehicle_numbers', 'sa'), f('creditLimit', 'credit_limit', 'n'),
      f('openingBalance', 'opening_balance', 'n'), f('status', 'status', 's'),
    ],
    derived: { currentBalance: 0 },
  },
  credit_slips: {
    table: 'credit_slips', key: 'creditSlips',
    fields: [
      id, f('slipNo', 'slip_no', 's'), f('date', 'date', 'd'), f('customerId', 'customer_id', 's'),
      f('customerName', 'customer_name', 's'), f('vehicleNo', 'vehicle_no', 's'), f('driverName', 'driver_name', 's'),
      f('fuelType', 'fuel_type', 's'), f('liters', 'liters', 'n'), f('rate', 'rate', 'n'),
      f('totalAmount', 'total_amount', 'n'), f('authorizedBy', 'authorized_by', 's'), createdAt,
    ],
  },
  customer_recoveries: {
    table: 'customer_recoveries', key: 'recoveries',
    fields: [
      id, f('receiptNo', 'receipt_no', 's'), f('date', 'date', 'd'), f('customerId', 'customer_id', 's'),
      f('customerName', 'customer_name', 's'), f('paymentMethod', 'payment_method', 's'), f('amount', 'amount', 'n'),
      f('referenceNo', 'reference_no', 's'), f('receivedBy', 'received_by', 's'),
      f('bankAccountId', 'bank_account_id', 'sn'), createdAt,
    ],
  },
  customer_adjustments: {
    table: 'customer_adjustments', key: 'customerAdjustments',
    fields: [
      id, f('date', 'date', 'd'), f('customerId', 'customer_id', 's'), f('kind', 'kind', 's'), f('amount', 'amount', 'n'),
      f('reason', 'reason', 's'), f('referenceNo', 'reference_no', 's'), f('recordedBy', 'recorded_by', 's'), createdAt,
    ],
  },
  expenses: {
    table: 'expenses', key: 'expenses',
    fields: [
      id, f('voucherNo', 'voucher_no', 's'), f('date', 'date', 'd'), f('category', 'category', 's'),
      f('description', 'description', 's'), f('payee', 'payee', 's'), f('amount', 'amount', 'n'),
      f('paymentMode', 'payment_mode', 's'), f('approvedBy', 'approved_by', 's'), f('bankAccountId', 'bank_account_id', 'sn'),
    ],
  },
  staff_members: {
    table: 'staff_members', key: 'staff', siteScoped: true,
    fields: [
      id, f('name', 'name', 's'), f('role', 'role', 's'), f('phone', 'phone', 's'),
      f('monthlySalary', 'monthly_salary', 'n'), f('dailyAdvanceLimit', 'daily_advance_limit', 'n'),
      f('joiningDate', 'joining_date', 'dn'), f('status', 'status', 's'), f('isActive', 'is_active', 'b'),
    ],
    derived: { currentAdvances: 0 },
  },
  staff_advances: {
    table: 'staff_advances', key: 'staffAdvances',
    fields: [
      id, f('staffId', 'staff_id', 's'), f('date', 'date', 'd'), f('amount', 'amount', 'n'), f('reason', 'reason', 's'),
      f('status', 'status', 's'), f('settledOn', 'settled_on', 'dn'), f('settlementId', 'settlement_id', 'sn'),
      f('recordedBy', 'recorded_by', 's'), createdAt,
    ],
  },
  staff_salary_payments: {
    table: 'staff_salary_payments', key: 'salaryPayments',
    fields: [
      id, f('staffId', 'staff_id', 's'), f('period', 'period', 's'), f('date', 'date', 'd'),
      f('grossSalary', 'gross_salary', 'n'), f('advancesDeducted', 'advances_deducted', 'n'), f('netPaid', 'net_paid', 'n'),
      f('paidBy', 'paid_by', 's'), f('notes', 'notes', 'sn'),
    ],
  },
  lubricant_products: {
    table: 'lubricant_products', key: 'lubricants',
    fields: [
      id, f('name', 'name', 's'), f('brand', 'brand', 's'), f('grade', 'grade', 's'), f('packSize', 'pack_size', 's'),
      f('openingStock', 'opening_stock', 'n'), f('minStockAlert', 'min_stock_alert', 'n'),
      f('costPrice', 'cost_price', 'n'), f('salePrice', 'sale_price', 'n'), f('isActive', 'is_active', 'b'),
    ],
    derived: { stockCans: 0 },
  },
  lubricant_movements: {
    table: 'lubricant_movements', key: 'lubricantMovements',
    fields: [
      id, f('productId', 'product_id', 's'), f('date', 'date', 'd'), f('type', 'type', 's'), f('quantity', 'quantity', 'n'),
      f('unitPrice', 'unit_price', 'n'), f('totalAmount', 'total_amount', 'n'), f('counterparty', 'counterparty', 's'),
      f('referenceNo', 'reference_no', 's'), f('recordedBy', 'recorded_by', 's'), createdAt,
    ],
  },
  suppliers: {
    table: 'suppliers', key: 'suppliers',
    fields: [
      id, f('name', 'name', 's'), f('company', 'company', 's'), f('category', 'category', 's'), f('phone', 'phone', 's'),
      f('openingBalance', 'opening_balance', 'n'), f('isActive', 'is_active', 'b'),
    ],
    derived: { balanceDue: 0 },
  },
  supplier_transactions: {
    table: 'supplier_transactions', key: 'supplierTransactions',
    fields: [
      id, f('supplierId', 'supplier_id', 's'), f('date', 'date', 'd'), f('type', 'type', 's'), f('amount', 'amount', 'n'),
      f('referenceNo', 'reference_no', 's'), f('note', 'note', 's'), f('paymentSource', 'payment_source', 'sn'),
      f('bankAccountId', 'bank_account_id', 'sn'), f('recordedBy', 'recorded_by', 's'), createdAt,
    ],
  },
  tariff_revisions: {
    table: 'tariff_revisions', key: 'tariffHistory',
    fields: [], // custom mapping (JSON columns) — see tariffToRow / tariffFromRow below
  },
} as const satisfies Record<string, TableDef>

export type TableName = keyof typeof TABLES | 'station_settings' | 'audit_log'
export type Row = Record<string, unknown>

// ---------------------------------------------------------------------------
// generic model <-> row conversion
// ---------------------------------------------------------------------------

const toNumber = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Model -> database row (only stored columns; server-generated columns are never sent). */
export function toRow(table: keyof typeof TABLES, model: Record<string, unknown>): Row {
  if (table === 'tariff_revisions') return tariffToRow(model)
  const def = TABLES[table] as TableDef
  const row: Row = {}
  for (const fs of def.fields) {
    if (fs.ro) {
      // server-assigned; only echoed back when restoring/importing existing records so their original time survives
      if (fs.m === 'createdAt' && typeof model.createdAt === 'string' && model.createdAt) row[fs.c] = model.createdAt
      continue
    }
    const v = model[fs.m]
    switch (fs.k) {
      case 's': row[fs.c] = v === undefined || v === null ? '' : String(v); break
      case 'sn': case 'dn': row[fs.c] = v === undefined || v === null || v === '' ? null : String(v); break
      case 'n': row[fs.c] = toNumber(v); break
      case 'ni': row[fs.c] = v === undefined || v === null || v === '' ? null : toNumber(v); break
      case 'b': row[fs.c] = v === undefined ? true : Boolean(v); break
      case 'sa': row[fs.c] = Array.isArray(v) ? v.map(String) : []; break
      case 'd': row[fs.c] = String(v ?? ''); break
    }
  }
  return row
}

/** Database row -> model (derived properties get neutral values; derive() fills them in). */
export function fromRow<T>(table: keyof typeof TABLES, row: Row, siteId: SiteId): T {
  if (table === 'tariff_revisions') return tariffFromRow(row) as T
  const def = TABLES[table] as TableDef
  const m: Record<string, unknown> = {}
  for (const fs of def.fields) {
    const v = row[fs.c]
    switch (fs.k) {
      case 's': m[fs.m] = v === null || v === undefined ? '' : String(v); break
      case 'sn': case 'dn': m[fs.m] = v === null || v === undefined ? '' : String(v); break
      case 'n': m[fs.m] = toNumber(v); break
      case 'ni': m[fs.m] = v === null || v === undefined ? undefined : toNumber(v); break
      case 'b': m[fs.m] = v === null || v === undefined ? true : Boolean(v); break
      case 'sa': m[fs.m] = Array.isArray(v) ? v.map(String) : []; break
      case 'd': m[fs.m] = v === null || v === undefined ? '' : String(v).slice(0, 10); break
    }
  }
  if (def.siteScoped) m.siteId = siteId
  return { ...(def.derived ?? {}), ...m } as T
}

// tariff revisions store their rate maps / tank snapshots as JSON columns
type TariffModel = import('../types').TariffRevisionLog
function tariffToRow(m: Record<string, unknown>): Row {
  const t = m as unknown as TariffModel
  return {
    id: t.id,
    date: t.date,
    effective_date: t.effectiveDate ?? '',
    notification_no: t.notificationNo ?? '',
    old_rates: t.oldRates ?? {},
    new_rates: t.newRates ?? {},
    tank_snapshots: t.tankSnapshots ?? [],
    net_inventory_gain_loss: toNumber(t.netInventoryGainLoss),
    revised_by: t.revisedBy ?? '',
    notes: t.notes ?? null,
  }
}
function tariffFromRow(r: Row): TariffModel {
  const rates = (v: unknown) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    return { 'PMG Super': toNumber(o['PMG Super']), 'HSD Diesel': toNumber(o['HSD Diesel']), 'Hi-Octane': toNumber(o['Hi-Octane']) }
  }
  return {
    id: String(r.id),
    date: String(r.date ?? '').slice(0, 10),
    effectiveDate: String(r.effective_date ?? ''),
    notificationNo: String(r.notification_no ?? ''),
    oldRates: rates(r.old_rates),
    newRates: rates(r.new_rates),
    tankSnapshots: (Array.isArray(r.tank_snapshots) ? r.tank_snapshots : []) as TariffModel['tankSnapshots'],
    netInventoryGainLoss: toNumber(r.net_inventory_gain_loss),
    revisedBy: String(r.revised_by ?? ''),
    notes: r.notes === null || r.notes === undefined ? undefined : String(r.notes),
  } as unknown as TariffModel
}

/** Every logical table name that has rows to load, in a stable order. */
export const LOADED_TABLES = Object.keys(TABLES) as (keyof typeof TABLES)[]

/** Tables a cashier is not allowed to read (the database returns nothing for them). */
export const MANAGER_ONLY_TABLES: (keyof typeof TABLES)[] = [
  'omc_invoices', 'omc_payments', 'bank_transactions', 'owner_transfers', 'staff_members', 'staff_advances',
  'staff_salary_payments', 'suppliers', 'supplier_transactions', 'tariff_revisions',
]

// ---------------------------------------------------------------------------
// station_settings (single row 'main')
// ---------------------------------------------------------------------------
import type { StationSettings } from '../types'

export function settingsToRow(s: StationSettings): Row {
  return {
    id: 'main',
    rate_pmg: s.rates['PMG Super'],
    rate_hsd: s.rates['HSD Diesel'],
    rate_octane: s.rates['Hi-Octane'],
    margin_pmg: s.margins['PMG Super'],
    margin_hsd: s.margins['HSD Diesel'],
    margin_octane: s.margins['Hi-Octane'],
    station_phone: s.stationPhone,
    manager_contact: s.managerContact,
    receipt_header: s.receiptHeader,
    receipt_footer: s.receiptFooter,
    low_stock_alert_pct: s.lowStockAlertPct,
    cash_difference_alert_limit: s.cashDifferenceAlertLimit,
  }
}

export function settingsFromRow(r: Row): StationSettings {
  return {
    rates: { 'PMG Super': toNumber(r.rate_pmg), 'HSD Diesel': toNumber(r.rate_hsd), 'Hi-Octane': toNumber(r.rate_octane) },
    margins: { 'PMG Super': toNumber(r.margin_pmg), 'HSD Diesel': toNumber(r.margin_hsd), 'Hi-Octane': toNumber(r.margin_octane) },
    stationPhone: String(r.station_phone ?? ''),
    managerContact: String(r.manager_contact ?? ''),
    receiptHeader: String(r.receipt_header ?? ''),
    receiptFooter: String(r.receipt_footer ?? ''),
    lowStockAlertPct: toNumber(r.low_stock_alert_pct),
    cashDifferenceAlertLimit: toNumber(r.cash_difference_alert_limit),
  }
}
