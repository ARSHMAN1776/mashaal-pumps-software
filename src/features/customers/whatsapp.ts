import type { BankAccount, CreditSaleSlip, Customer, SiteInfo } from '../../types'
import type { Statement } from '../../data/statements'

/** 0300-8671234 / +92 300 8671234 / 3008671234  ->  923008671234 */
export function normalizePakistaniPhone(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '')
  if (cleaned.startsWith('0092')) cleaned = cleaned.substring(2)
  else if (cleaned.startsWith('03')) cleaned = '92' + cleaned.substring(1)
  else if (cleaned.startsWith('3') && cleaned.length === 10) cleaned = '92' + cleaned
  return cleaned
}

const isParco = (brand: string) => brand === 'TOTAL PARCO'
const bar = '══════════════════════════'
const rsn = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-US')}`

const brandHeader = (brand: string) =>
  isParco(brand) ? `🔴 *TOTAL PARCO - MASHAAL PETROLEUM* 🔴` : `🟢 *PAKISTAN STATE OIL (PSO) - MASHAAL* 🟢`
const brandFooter = (brand: string) =>
  isParco(brand) ? `✅ *Total Parco Pakistan • Energy for a Brighter Tomorrow*` : `✅ *Pakistan State Oil (PSO) • Fueling the Nation's Journey*`
const hashPrefix = (brand: string) => (isParco(brand) ? 'TP' : 'PSO')

export function slipMessage(slip: CreditSaleSlip, site: Pick<SiteInfo, 'name' | 'location' | 'brand'>): string {
  return [
    brandHeader(site.brand),
    `⛽ *OFFICIAL FORECOURT CREDIT VOUCHER*`,
    bar,
    `🏢 *Station:* ${site.name}`,
    `📍 *Location:* ${site.location}`,
    `📄 *Voucher Slip #:* ${slip.slipNo}`,
    `📅 *Date:* ${slip.date}`,
    bar,
    `🚛 *COMMERCIAL FLEET ACCOUNT*`,
    `👤 *Transporter:* ${slip.customerName}`,
    `🚚 *Vehicle Reg #:* ${slip.vehicleNo}`,
    `👨‍✈️ *Authorized Driver:* ${slip.driverName}`,
    bar,
    `⛽ *DISPENSER TRANSACTION DETAILS*`,
    `🔹 *Product:* ${slip.fuelType}`,
    `🔹 *Volume Dispensed:* ${slip.liters.toLocaleString()} Liters`,
    `🔹 *Rate per litre:* Rs. ${slip.rate.toFixed(2)} / L`,
    `💰 *NET AMOUNT DUE:* ${rsn(slip.totalAmount)} PKR`,
    bar,
    `✍️ *Authorized Incharge:* ${slip.authorizedBy}`,
    `🔐 *Voucher Hash:* ${hashPrefix(site.brand)}-${slip.slipNo.replace(/[^0-9]/g, '') || slip.id}-VERIFIED`,
    brandFooter(site.brand),
  ].join('\n')
}

export function statementMessage(
  customer: Customer,
  site: Pick<SiteInfo, 'name' | 'location' | 'brand' | 'phone' | 'managerName'>,
  bank: Pick<BankAccount, 'bankName' | 'accountTitle' | 'accountNumber' | 'branch'> | undefined,
  statement: Statement,
  today: string,
): string {
  const recent = statement.rows.filter((r) => r.kind !== 'opening').slice(-4)
  return [
    brandHeader(site.brand),
    `📑 *COMMERCIAL FLEET RUNNING STATEMENT*`,
    bar,
    `🏢 *Station:* ${site.name}`,
    `📍 *Location:* ${site.location}`,
    `👤 *Account:* ${customer.businessName}`,
    `📞 *Contact:* ${customer.phone}`,
    `📅 *Statement Date:* ${today}`,
    bar,
    `🚛 *REGISTERED VEHICLES:*`,
    customer.vehicleNumbers.length ? customer.vehicleNumbers.map((v) => `• ${v}`).join('  |  ') : '• Any vehicle',
    bar,
    `🧾 *RECENT ENTRIES:*`,
    ...(recent.length === 0
      ? ['• No entries yet.']
      : recent.map((r) => `• ${r.date} | ${r.refNo} | ${r.debit > 0 ? `Dr ${rsn(r.debit)}` : `Cr ${rsn(r.credit)}`}`)),
    bar,
    `📊 *LEDGER SUMMARY:*`,
    `🔹 *Total Billed (Debit):* ${rsn(statement.totalDebit)} PKR`,
    `🔹 *Total Received (Credit):* ${rsn(statement.totalCredit)} PKR`,
    `💰 *NET OUTSTANDING BALANCE:* ${rsn(customer.currentBalance)} PKR`,
    `💳 *Approved Credit Limit:* ${rsn(customer.creditLimit)} PKR`,
    ...(bank ? [
      bar,
      `🏦 *OFFICIAL BANK REMITTANCE ACCOUNT:*`,
      `🏛️ *Bank:* ${bank.bankName}`,
      `🏷️ *Title:* ${bank.accountTitle}`,
      `🔢 *Account #:* ${bank.accountNumber}`,
      `🏢 *Branch:* ${bank.branch}`,
    ] : []),
    bar,
    `✍️ *Station Manager:* ${site.managerName} (${site.phone})`,
    `🔐 *Voucher Hash:* ${hashPrefix(site.brand)}-STMT-${customer.id}-${today}-VERIFIED`,
    brandFooter(site.brand),
  ].join('\n')
}

export function openWhatsApp(phone: string, message: string) {
  const to = normalizePakistaniPhone(phone)
  const url = to ? `https://wa.me/${to}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}
