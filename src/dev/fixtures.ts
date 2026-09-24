/** Sample data for the automated tests and the offline UI preview. Never used in production. */
import type { MemorySeed } from '../data/memoryBackend'
import { toRow, settingsToRow, type Row, type TABLES } from '../data/tables'

export const PREVIEW_PASSWORD = 'Preview#123'

const rows = (table: keyof typeof TABLES, models: object[]): Row[] => models.map((m) => toRow(table, m as Record<string, unknown>))

const S1 = 'SITE-01'
const S2 = 'SITE-02'

export function buildFixtures(): MemorySeed {
  const settings1 = settingsToRow({
    rates: { 'PMG Super': 268.36, 'HSD Diesel': 276.45, 'Hi-Octane': 295.5 },
    margins: { 'PMG Super': 8.64, 'HSD Diesel': 8.64, 'Hi-Octane': 8.64 },
    stationPhone: '068-5874211', managerContact: '0300-6729104',
    receiptHeader: 'MASHAAL TOTAL PARCO FILLING STATION\nKhanpur Road, R.Y. Khan', receiptFooter: 'Thank you for fueling with Mashaal!',
    lowStockAlertPct: 20, cashDifferenceAlertLimit: 500,
  })
  const settings2 = settingsToRow({
    rates: { 'PMG Super': 268.36, 'HSD Diesel': 276.45, 'Hi-Octane': 295.5 },
    margins: { 'PMG Super': 8.64, 'HSD Diesel': 8.64, 'Hi-Octane': 8.64 },
    stationPhone: '042-35321900', managerContact: '0321-4455667',
    receiptHeader: 'MASHAAL PSO SERVICE STATION\nRaiwind Road, Lahore', receiptFooter: 'Proudly serving with PSO',
    lowStockAlertPct: 15, cashDifferenceAlertLimit: 500,
  })

  return {
    stations: [
      { id: S1, code: 'SITE 01', name: 'Mashaal Total PARCO Station', location: 'Khanpur Road, Rahim Yar Khan', brand: 'TOTAL PARCO', brandColor: '#9e1b1b', phone: '068-5874211', managerName: 'Naveed Akhtar', ntn: '4192084-7' },
      { id: S2, code: 'SITE 02', name: 'Mashaal PSO Station', location: 'Raiwind Road, Lahore', brand: 'PSO', brandColor: '#006a4e', phone: '042-35321900', managerName: 'Chaudhry Tariq Mehmood', ntn: '4192084-8' },
    ],
    accounts: [
      { username: 'owner', password: PREVIEW_PASSWORD, fullName: 'Station Owner', role: 'owner', phone: '0300-0000000', sites: [S1, S2] },
      { username: 'naveed.akhtar', password: PREVIEW_PASSWORD, fullName: 'Naveed Akhtar', role: 'manager', phone: '0300-6729104', sites: [S1] },
      { username: 'tariq.cashier', password: PREVIEW_PASSWORD, fullName: 'Tariq Mehmood', role: 'cashier', phone: '0301-5582910', sites: [S1] },
      { username: 'tariq.manager', password: PREVIEW_PASSWORD, fullName: 'Chaudhry Tariq Mehmood', role: 'manager', phone: '0321-4455667', sites: [S2] },
      { username: 'kamran.cashier', password: PREVIEW_PASSWORD, fullName: 'Kamran Ali', role: 'cashier', phone: '0300-9876543', sites: [S2] },
    ],
    settings: { [S1]: settings1, [S2]: settings2 },
    data: {
      [S1]: {
        tanks: rows('tanks', [
          { id: 'T1-S1', tankNo: 1, fuelType: 'HSD Diesel', capacityLiters: 50000, minReserveLiters: 7500, initialLiters: 31200, initialDipMm: 1840 },
          { id: 'T2-S1', tankNo: 2, fuelType: 'PMG Super', capacityLiters: 30000, minReserveLiters: 5000, initialLiters: 16450, initialDipMm: 1390 },
          { id: 'T3-S1', tankNo: 3, fuelType: 'Hi-Octane', capacityLiters: 15000, minReserveLiters: 3000, initialLiters: 6500, initialDipMm: 780 },
        ]),
        nozzles: rows('nozzles', [
          { id: 'N1-S1', tankId: 'T1-S1', dispenserNo: 1, nozzleNo: 1, initialMeter: 414210, testingLiters: 10, assignedStaff: 'Zahid Khan', isActive: true },
          { id: 'N2-S1', tankId: 'T1-S1', dispenserNo: 1, nozzleNo: 2, initialMeter: 390450, testingLiters: 10, assignedStaff: 'Zahid Khan', isActive: true },
          { id: 'N3-S1', tankId: 'T2-S1', dispenserNo: 2, nozzleNo: 1, initialMeter: 583720, testingLiters: 15, assignedStaff: 'Muhammad Bilal', isActive: true },
          { id: 'N4-S1', tankId: 'T2-S1', dispenserNo: 2, nozzleNo: 2, initialMeter: 612840, testingLiters: 10, assignedStaff: 'Muhammad Bilal', isActive: true },
        ]),
        customers: rows('customers', [
          { id: 'CUST-01', name: 'Haji Aslam Cheema', businessName: 'Al-Hafiz Goods Transport RYK', phone: '0300-8671234', vehicleNumbers: ['TKA-992', 'LWO-4481'], creditLimit: 1500000, openingBalance: 505597.5, status: 'Active' },
          { id: 'CUST-02', name: 'Khanpur Sugar', businessName: 'Khanpur Sugar Mills', phone: '0301-1112223', vehicleNumbers: [], creditLimit: 800000, openingBalance: 0, status: 'Active' },
          { id: 'CUST-03', name: 'New Client', businessName: 'Brand New Traders', phone: '0302-9998887', vehicleNumbers: ['ABC-123'], creditLimit: 100000, openingBalance: 0, status: 'Active' },
        ]),
        credit_slips: rows('credit_slips', [
          { id: 'CS-801', slipNo: 'SLIP-4011', date: '2026-09-18', customerId: 'CUST-01', customerName: 'Al-Hafiz Goods Transport RYK', vehicleNo: 'TKA-992', driverName: 'Sajjad Hussain', fuelType: 'HSD Diesel', liters: 450, rate: 276.45, totalAmount: 124402.5, authorizedBy: 'Naveed Akhtar' },
        ]),
        customer_recoveries: rows('customer_recoveries', [
          { id: 'REC-901', receiptNo: 'RCP-1201', date: '2026-09-18', customerId: 'CUST-01', customerName: 'Al-Hafiz Goods Transport RYK', paymentMethod: 'Cash', amount: 150000, referenceNo: 'CASH-REC', receivedBy: 'Naveed Akhtar', bankAccountId: '' },
        ]),
        daybook_entries: rows('daybook_entries', [
          { id: 'DB-01', date: '2026-09-18', time: '06:00 AM', particulars: 'Opening Safe Cash brought forward', category: 'Shift Fuel', cashIn: 500000, cashOut: 0, handledBy: 'Naveed Akhtar' },
          { id: 'DB-02', date: '2026-09-18', time: '09:00 AM', particulars: 'Recovery RCP-1201: Al-Hafiz Goods Transport RYK (Cash)', category: 'Customer Recovery', cashIn: 150000, cashOut: 0, referenceNo: 'RCP-1201', handledBy: 'Naveed Akhtar', sourceType: 'recovery', sourceId: 'REC-901' },
        ]),
        bank_accounts: rows('bank_accounts', [
          { id: 'BANK-01', bankName: 'Habib Bank Limited (HBL)', accountTitle: 'Mashaal Petroleum Services', accountNumber: '01847900192803', branch: 'Khanpur Road Branch RYK', openingBalance: 3780500, isActive: true },
        ]),
        bank_transactions: rows('bank_transactions', [
          { id: 'BT-01', bankId: 'BANK-01', date: '2026-09-18', type: 'Deposit', amount: 500000, depositSlipNo: 'DEP-449', description: 'Morning shift cash deposit' },
        ]),
        staff_members: rows('staff_members', [
          { id: 'STF-01', name: 'Naveed Akhtar', role: 'Shift Manager', phone: '0300-6729104', monthlySalary: 75000, dailyAdvanceLimit: 10000, joiningDate: '2022-04-10', status: 'On Duty', isActive: true },
          { id: 'STF-02', name: 'Zahid Khan', role: 'Pump Attendant', phone: '0300-1112233', monthlySalary: 40000, dailyAdvanceLimit: 5000, joiningDate: '2023-01-05', status: 'On Duty', isActive: true },
        ]),
        lubricant_products: rows('lubricant_products', [
          { id: 'LUB-01', name: 'Total Quartz 9000 Energy', brand: 'TOTAL', grade: '5W-40', packSize: '4 Liters', openingStock: 20, minStockAlert: 5, costPrice: 9200, salePrice: 11400, isActive: true },
        ]),
        suppliers: rows('suppliers', [
          { id: 'SUP-01', name: 'Total Parco Regional Depot', company: 'Total Parco Pakistan Ltd', category: 'Petroleum & Lubricants', phone: '061-6512390', openingBalance: 0, isActive: true },
        ]),
        omc_invoices: rows('omc_invoices', [
          { id: 'OMC-INV-881', invoiceNo: 'TP-PK-98124', date: '2026-09-18', brand: 'TOTAL PARCO', tankLorryNo: 'TL-8834', driverName: 'Ghulam Rasool', fuelType: 'HSD Diesel', tankId: '', invoiceVolumeLiters: 25000, decantedVolumeLiters: 25000, ratePerLiter: 264.1, freightAmount: 38000, totalAmount: 6640500, openingPaidAmount: 0 },
        ]),
        omc_payments: rows('omc_payments', [
          { id: 'PAY-11', date: '2026-09-18', invoiceNo: 'TP-PK-98124', paymentMethod: 'Bank Transfer', bankName: 'HBL', bankAccountId: '', referenceNo: 'FT-9932148', amount: 6640500, recordedBy: 'Naveed Akhtar' },
        ]),
      },
      [S2]: {
        tanks: rows('tanks', [
          { id: 'T1-S2', tankNo: 1, fuelType: 'PMG Super', capacityLiters: 30000, minReserveLiters: 4500, initialLiters: 27500, initialDipMm: 1720 },
        ]),
        nozzles: rows('nozzles', [
          { id: 'N1-S2', tankId: 'T1-S2', dispenserNo: 1, nozzleNo: 1, initialMeter: 713950, testingLiters: 10, assignedStaff: 'Kamran Ali', isActive: true },
        ]),
        customers: rows('customers', [
          { id: 'CUST-S2-01', name: 'Raiwind Logistics', businessName: 'Raiwind Logistics & Goods', phone: '0300-4445556', vehicleNumbers: ['LES-5561'], creditLimit: 2500000, openingBalance: 980000, status: 'Active' },
        ]),
        daybook_entries: rows('daybook_entries', [
          { id: 'DB-S2-01', date: '2026-09-18', time: '06:00 AM', particulars: 'Opening Safe Cash brought forward', category: 'Shift Fuel', cashIn: 620000, cashOut: 0, handledBy: 'Chaudhry Tariq Mehmood' },
        ]),
      },
    },
  }
}
