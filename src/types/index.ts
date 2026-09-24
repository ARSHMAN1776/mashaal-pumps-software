// =========================================================================
// Domain types
//
// Every entity has two kinds of fields:
//   * STORED   — facts saved in the database (opening balances, transactions ...)
//   * DERIVED  — totals the app calculates from those facts (see data/derive.ts).
//                They are marked "derived" below and are never written to the database.
// =========================================================================

export type SiteId = string
export type UserRole = 'owner' | 'manager' | 'cashier'
export type Brand = 'TOTAL PARCO' | 'PSO'
export type FuelType = 'PMG Super' | 'HSD Diesel' | 'Hi-Octane'
export const FUEL_TYPES: FuelType[] = ['PMG Super', 'HSD Diesel', 'Hi-Octane']
export type ShiftName = 'Morning' | 'Evening' | 'Night'
export const SHIFT_NAMES: ShiftName[] = ['Morning', 'Evening', 'Night']

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  phone: string
  stationAccess: SiteId[]
  mustChangePassword: boolean
}

export interface SiteInfo {
  code: string
  id: SiteId
  name: string
  location: string
  brand: Brand
  brandColor: string
  phone: string
  managerName: string
  ntn: string
  tanksCount: number // derived
  nozzlesCount: number // derived
}

export interface Tank {
  id: string
  siteId: SiteId
  tankNo: number
  fuelType: FuelType
  capacityLiters: number
  minReserveLiters: number
  initialLiters: number
  initialDipMm: number
  currentLiters: number // derived: latest dip, else initialLiters
  currentDipMm: number // derived
  waterDipMm: number // derived: water reading of the latest dip
  lastUpdated: string // derived: date of latest dip
  estimatedBookLiters: number // derived: latest dip + deliveries - sales since that dip
  createdAt: string
}

export interface Nozzle {
  id: string
  siteId: SiteId
  tankId: string
  dispenserNo: number
  nozzleNo: number
  fuelType: FuelType // derived from its tank
  initialMeter: number
  openingMeter: number // derived: opening reading of the latest recorded period
  closingMeter: number // derived: latest meter reading (= opening of the next entry)
  testingLiters: number
  ratePerLiter: number // derived from current station rates
  assignedStaff: string
  isActive: boolean
}

export interface FuelSaleRecord {
  id: string
  date: string
  shiftId: string
  shiftName: ShiftName
  nozzleId: string
  dispenserNo: number
  nozzleNo: number
  fuelType: FuelType
  openingMeter: number
  closingMeter: number
  testingLiters: number
  netLiters: number
  ratePerLiter: number
  totalAmount: number
  cashierName: string
  createdAt: string
}

export interface ShiftRecord {
  id: string
  shiftName: ShiftName
  date: string
  incharge: string
  status: 'Open' | 'Closed'
  startTime: string
  endTime: string
  totalFuelSales: number
  totalLubeSales: number
  creditSales: number
  digitalPayments: number
  shiftExpenses: number
  creditRecoveries: number
  expectedCash: number
  actualCash: number
  shortageExcess: number // negative is shortage, positive is excess
  notes?: string
}

export interface TankDipRecord {
  id: string
  date: string
  tankId: string
  tankNo: number
  fuelType: FuelType
  morningDipMm: number
  morningLiters: number
  decantedLiters: number
  dispensedLiters: number
  bookStockLiters: number
  closingDipMm: number
  closingPhysicalLiters: number
  varianceLiters: number // positive = excess, negative = loss
  waterDipMm: number
  inspector: string
  createdAt: string
}

export interface OmcInvoice {
  id: string
  invoiceNo: string
  date: string
  brand: string
  tankLorryNo: string
  driverName: string
  fuelType: FuelType
  tankId: string // '' when the receiving tank was not recorded
  invoiceVolumeLiters: number
  decantedVolumeLiters: number
  ratePerLiter: number
  freightAmount: number
  totalAmount: number
  openingPaidAmount: number // paid before this software tracked payments
  paymentStatus: 'Paid' | 'Partial' | 'Pending' // derived
  paidAmount: number // derived: openingPaidAmount + payments
  createdAt: string
}

export type OmcPaymentMethod = 'Bank Transfer' | 'Pay Order' | 'Cheque' | 'Cash'
export interface OmcPayment {
  id: string
  date: string
  invoiceNo: string
  paymentMethod: OmcPaymentMethod
  bankName: string
  bankAccountId: string // '' when paid in cash
  referenceNo: string
  amount: number
  recordedBy: string
}

export type DaybookCategory =
  | 'Shift Fuel'
  | 'Customer Recovery'
  | 'Lube Sale'
  | 'Bank Deposit'
  | 'Bank Withdrawal'
  | 'Expense'
  | 'OMC Payment'
  | 'Staff Advance'
  | 'Salary Payment'
  | 'Vendor Payment'
  | 'Owner Withdrawal'
  | 'Other'
export const DAYBOOK_CATEGORIES: DaybookCategory[] = [
  'Shift Fuel', 'Customer Recovery', 'Lube Sale', 'Bank Deposit', 'Bank Withdrawal', 'Expense',
  'OMC Payment', 'Staff Advance', 'Salary Payment', 'Vendor Payment', 'Owner Withdrawal', 'Other',
]

/** Records that were created together with (and are removed together with) another record. */
export type SourceType =
  | 'recovery' | 'expense' | 'staff_advance' | 'salary' | 'lube_sale' | 'bank_deposit'
  | 'bank_withdrawal' | 'omc_payment' | 'supplier_payment' | 'owner_transfer' | 'owner_cash' | 'lube_restock'

export interface DaybookEntry {
  id: string
  seq: number
  date: string
  time: string
  particulars: string
  category: DaybookCategory
  cashIn: number
  cashOut: number
  balanceAfter: number // derived: running safe balance
  referenceNo?: string
  handledBy: string
  sourceType?: SourceType
  sourceId?: string
}

export type CustomerStatus = 'Active' | 'Hold' | 'Archived'
export interface Customer {
  id: string
  siteId: SiteId
  name: string
  businessName: string
  phone: string
  vehicleNumbers: string[]
  creditLimit: number
  openingBalance: number
  currentBalance: number // derived: opening + slips + debit notes - recoveries - credit notes
  status: CustomerStatus
}

export interface CreditSaleSlip {
  id: string
  slipNo: string
  date: string
  customerId: string
  customerName: string
  vehicleNo: string
  driverName: string
  fuelType: FuelType
  liters: number
  rate: number
  totalAmount: number
  authorizedBy: string
  createdAt: string
}

export type RecoveryMethod = 'Cash' | 'Cheque' | 'Online Transfer'
export interface CustomerRecovery {
  id: string
  receiptNo: string
  date: string
  customerId: string
  customerName: string
  paymentMethod: RecoveryMethod
  amount: number
  referenceNo: string
  receivedBy: string
  bankAccountId: string
  /** a cheque / online payment noted by a cashier that a manager still has to place in a bank account */
  bankPending: boolean
  createdAt: string
}

export interface CustomerAdjustment {
  id: string
  date: string
  customerId: string
  kind: 'Debit' | 'Credit'
  amount: number
  reason: string
  referenceNo: string
  recordedBy: string
  createdAt: string
}

export interface BankAccount {
  id: string
  bankName: string
  accountTitle: string
  accountNumber: string
  branch: string
  openingBalance: number
  currentBalance: number // derived: opening + credits - debits
  isActive: boolean
}

export type BankTxType =
  | 'Deposit' | 'Credit Received'
  | 'Withdrawal' | 'OMC Online Transfer' | 'Bank Fee' | 'Owner Transfer' | 'Vendor Payment' | 'Expense Payment'
export const BANK_CREDIT_TYPES: BankTxType[] = ['Deposit', 'Credit Received']

export interface BankTransaction {
  id: string
  bankId: string
  date: string
  type: BankTxType
  amount: number
  depositSlipNo?: string
  description: string
  sourceType?: SourceType
  sourceId?: string
  balanceAfter: number // derived: running balance of that account
  createdAt: string
}

export interface OwnerTransferRecord {
  id: string
  siteId: SiteId
  date: string
  amount: number
  bankId: string
  bankName: string
  accountTitle: string
  accountNumber: string
  referenceNo: string
  status: 'Completed' | 'Pending'
  notes?: string
  transferredBy: string
}

export type ExpenseCategory =
  | 'Generator Fuel' | 'Electricity (WAPDA)' | 'Staff Meals & Tea' | 'Dispenser Spares & Repairs'
  | 'Municipal & Legal' | 'Stationery & Cleaning' | 'Misc'
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Staff Meals & Tea', 'Generator Fuel', 'Electricity (WAPDA)', 'Dispenser Spares & Repairs',
  'Municipal & Legal', 'Stationery & Cleaning', 'Misc',
]
export interface ExpenseRecord {
  id: string
  voucherNo: string
  date: string
  category: ExpenseCategory
  description: string
  payee: string
  amount: number
  paymentMode: 'Cash' | 'Bank'
  bankAccountId: string
  approvedBy: string
}

export type StaffRole = 'Shift Manager' | 'Head Cashier' | 'Pump Attendant' | 'Security Guard' | 'Lube Technician'
export const STAFF_ROLES: StaffRole[] = ['Shift Manager', 'Head Cashier', 'Pump Attendant', 'Security Guard', 'Lube Technician']
export type StaffStatus = 'On Duty' | 'Off Duty' | 'On Leave'

export interface StaffMember {
  id: string
  siteId: SiteId
  name: string
  role: StaffRole
  phone: string
  monthlySalary: number
  dailyAdvanceLimit: number
  currentAdvances: number // derived: sum of outstanding advances
  joiningDate: string
  status: StaffStatus
  isActive: boolean
}

export interface StaffAdvance {
  id: string
  staffId: string
  date: string
  amount: number
  reason: string
  status: 'Outstanding' | 'Settled'
  settledOn: string
  settlementId: string
  recordedBy: string
  createdAt: string
}

export interface SalaryPayment {
  id: string
  staffId: string
  period: string // YYYY-MM
  date: string
  grossSalary: number
  /** absence and other deductions (the station does not pay these) */
  deduction: number
  absentDays: number
  deductionNote: string
  advancesDeducted: number
  netPaid: number
  paidBy: string
  notes: string
}

export interface LubricantProduct {
  id: string
  name: string
  brand: string
  grade: string
  packSize: string
  openingStock: number
  stockCans: number // derived: opening + restocks - sales +/- adjustments
  minStockAlert: number
  costPrice: number
  salePrice: number
  isActive: boolean
}

export type LubeMovementType = 'Sale' | 'Restock' | 'Adjustment In' | 'Adjustment Out'
export interface LubricantMovement {
  id: string
  productId: string
  date: string
  type: LubeMovementType
  quantity: number
  unitPrice: number
  totalAmount: number
  counterparty: string
  referenceNo: string
  recordedBy: string
  createdAt: string
}

export interface Supplier {
  id: string
  name: string
  company: string
  category: string
  phone: string
  openingBalance: number
  balanceDue: number // derived: opening + bills - payments
  isActive: boolean
}

export interface SupplierTransaction {
  id: string
  supplierId: string
  date: string
  type: 'Bill' | 'Payment'
  amount: number
  referenceNo: string
  note: string
  paymentSource: 'Cash' | 'Bank' | ''
  bankAccountId: string
  /** set when this bill was created by another record (a lubricant restock) */
  sourceType: SourceType | ''
  sourceId: string
  recordedBy: string
  createdAt: string
}

export type FuelRates = Record<FuelType, number>

export interface StationSettings {
  rates: FuelRates
  /** Dealer margin per litre (Rs) used for the estimated-profit figures. */
  margins: FuelRates
  stationPhone: string
  managerContact: string
  receiptHeader: string
  receiptFooter: string
  lowStockAlertPct: number
  cashDifferenceAlertLimit: number
}

export interface TariffRevisionLog {
  id: string
  date: string
  effectiveDate: string
  notificationNo: string
  oldRates: FuelRates
  newRates: FuelRates
  tankSnapshots: {
    tankNo: number
    fuelType: FuelType
    litersAtRevision: number
    oldRate: number
    newRate: number
    rateDiff: number
    gainLossAmount: number
  }[]
  netInventoryGainLoss: number
  revisedBy: string
  notes?: string
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  entityId: string
  summary: string
  details: Record<string, unknown>
}

/** Everything the screens need for one station (derived balances already applied). */
export interface StationData {
  siteInfo: SiteInfo
  settings: StationSettings
  tanks: Tank[]
  nozzles: Nozzle[]
  fuelSales: FuelSaleRecord[]
  shifts: ShiftRecord[]
  tankDips: TankDipRecord[]
  omcInvoices: OmcInvoice[]
  omcPayments: OmcPayment[]
  daybook: DaybookEntry[]
  customers: Customer[]
  creditSlips: CreditSaleSlip[]
  recoveries: CustomerRecovery[]
  customerAdjustments: CustomerAdjustment[]
  bankAccounts: BankAccount[]
  bankTransactions: BankTransaction[]
  expenses: ExpenseRecord[]
  staff: StaffMember[]
  staffAdvances: StaffAdvance[]
  salaryPayments: SalaryPayment[]
  lubricants: LubricantProduct[]
  lubricantMovements: LubricantMovement[]
  suppliers: Supplier[]
  supplierTransactions: SupplierTransaction[]
  tariffHistory: TariffRevisionLog[]
  ownerTransfers: OwnerTransferRecord[]
}

export interface StationSummary {
  id: SiteId
  code: string
  name: string
  location: string
  brand: Brand
  brandColor: string
}
