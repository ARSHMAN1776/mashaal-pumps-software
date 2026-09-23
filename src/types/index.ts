export type UserRole = 'owner' | 'manager' | 'cashier'

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  phone: string
  stationAccess: string[]
}

export interface SiteInfo {
  code: string
  id: string
  name: string
  location: string
  brand: 'TOTAL PARCO' | 'PSO'
  brandColor: string
  phone: string
  managerName: string
  ntn: string
  tanksCount: number
  nozzlesCount: number
}

export type FuelType = 'PMG Super' | 'HSD Diesel' | 'Hi-Octane'

export interface Tank {
  id: string
  siteId: string
  tankNo: number
  fuelType: FuelType
  capacityLiters: number
  currentLiters: number
  currentDipMm: number
  minReserveLiters: number
  lastUpdated: string
}

export interface Nozzle {
  id: string
  siteId: string
  tankId: string
  dispenserNo: number
  nozzleNo: number
  fuelType: FuelType
  openingMeter: number
  closingMeter: number
  testingLiters: number
  ratePerLiter: number
  assignedStaff: string
}

export interface FuelSaleRecord {
  id: string
  date: string
  shiftId: string
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
}

export interface ShiftRecord {
  id: string
  shiftName: 'Morning' | 'Evening' | 'Night'
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
}

export interface OmcInvoice {
  id: string
  invoiceNo: string
  date: string
  brand: 'TOTAL PARCO' | 'PSO'
  tankLorryNo: string
  driverName: string
  fuelType: FuelType
  invoiceVolumeLiters: number
  decantedVolumeLiters: number
  ratePerLiter: number
  freightAmount: number
  totalAmount: number
  paymentStatus: 'Paid' | 'Partial' | 'Pending'
  paidAmount: number
}

export interface OmcPayment {
  id: string
  date: string
  invoiceNo: string
  paymentMethod: 'Bank Transfer' | 'Pay Order' | 'Cheque' | 'Cash'
  bankName: string
  referenceNo: string
  amount: number
  recordedBy: string
}

export interface DaybookEntry {
  id: string
  date: string
  time: string
  particulars: string
  category: 'Shift Fuel' | 'Customer Recovery' | 'Lube Sale' | 'Bank Deposit' | 'Expense' | 'OMC Payment' | 'Staff Advance'
  cashIn: number
  cashOut: number
  balanceAfter: number
  referenceNo?: string
  handledBy: string
}

export interface Customer {
  id: string
  siteId: string
  name: string
  businessName: string
  phone: string
  vehicleNumbers: string[]
  creditLimit: number
  currentBalance: number
  status: 'Active' | 'Hold'
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
}

export interface CustomerRecovery {
  id: string
  receiptNo: string
  date: string
  customerId: string
  customerName: string
  paymentMethod: 'Cash' | 'Cheque' | 'Online Transfer'
  amount: number
  referenceNo: string
  receivedBy: string
}

export interface BankAccount {
  id: string
  bankName: string
  accountTitle: string
  accountNumber: string
  branch: string
  currentBalance: number
}

export interface BankTransaction {
  id: string
  bankId: string
  date: string
  type: 'Deposit' | 'Withdrawal' | 'OMC Online Transfer' | 'Bank Fee' | 'Owner Transfer'
  amount: number
  depositSlipNo?: string
  description: string
  balanceAfter: number
}

export interface OwnerTransferRecord {
  id: string
  siteId: string
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

export interface ExpenseRecord {
  id: string
  voucherNo: string
  date: string
  category: 'Generator Fuel' | 'Electricity (WAPDA)' | 'Staff Meals & Tea' | 'Dispenser Spares & Repairs' | 'Municipal & Legal' | 'Stationery & Cleaning' | 'Misc'
  description: string
  payee: string
  amount: number
  paymentMode: 'Cash' | 'Bank'
  approvedBy: string
}

export interface StaffMember {
  id: string
  siteId: string
  name: string
  role: 'Shift Manager' | 'Head Cashier' | 'Pump Attendant' | 'Security Guard' | 'Lube Technician'
  phone: string
  monthlySalary: number
  dailyAdvanceLimit: number
  currentAdvances: number
  joiningDate: string
  status: 'On Duty' | 'Off Duty' | 'On Leave'
}

export interface LubricantProduct {
  id: string
  name: string
  brand: string
  grade: string
  packSize: string
  stockCans: number
  minStockAlert: number
  costPrice: number
  salePrice: number
}

export interface Supplier {
  id: string
  name: string
  company: string
  category: string
  phone: string
  balanceDue: number
}

export interface StationSettings {
  rates: {
    'PMG Super': number
    'HSD Diesel': number
    'Hi-Octane': number
  }
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
  oldRates: {
    'PMG Super': number
    'HSD Diesel': number
    'Hi-Octane': number
  }
  newRates: {
    'PMG Super': number
    'HSD Diesel': number
    'Hi-Octane': number
  }
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

