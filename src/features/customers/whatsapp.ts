import type { BankAccount, CreditSaleSlip, Customer, SiteInfo } from '../../types'
import type { Statement } from '../../data/statements'
import { formatDate } from '../../lib/dates'

/** 0300-8671234 / +92 300 8671234 / 3008671234  ->  923008671234 */
export function normalizePakistaniPhone(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '')
  if (cleaned.startsWith('0092')) cleaned = cleaned.substring(2)
  else if (cleaned.startsWith('03')) cleaned = '92' + cleaned.substring(1)
  else if (cleaned.startsWith('3') && cleaned.length === 10) cleaned = '92' + cleaned
  return cleaned
}

/** A number WhatsApp can open: Pakistan (92) + a mobile number (3xx xxxxxxx). Landlines and short numbers cannot. */
export const isWhatsAppNumber = (digits: string) => /^923\d{9}$/.test(digits)

/**
 * A WhatsApp link carries the whole message, and every space, new line and emoji is longer inside a link. Very long
 * links can be cut off or refused, so a message is kept well under this many characters once it is inside the link.
 */
export const MAX_LINK_CHARS = 1800
export const linkLength = (message: string) => encodeURIComponent(message).length

const isParco = (brand: string) => brand === 'TOTAL PARCO'
const money = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`
const litres = (n: number) => `${Number(n.toFixed(2)).toLocaleString('en-US')} L`
const rateText = (r: number) => (Math.abs(r - Math.round(r)) < 0.005 ? String(Math.round(r)) : r.toFixed(2))
const brandLine = (site: Pick<SiteInfo, 'name' | 'brand'>) => `${isParco(site.brand) ? '🔴 *TOTAL PARCO*' : '🟢 *PSO*'} · ${site.name}`

/** What one credit slip says, for the customer: who, which vehicle, how much fuel, at what rate, what it costs. */
export function slipMessage(slip: CreditSaleSlip, site: Pick<SiteInfo, 'name' | 'location' | 'brand'>): string {
  return [
    brandLine(site),
    `Fuel slip *${slip.slipNo}* · ${formatDate(slip.date)}`,
    '',
    `Customer: ${slip.customerName}`,
    `Vehicle: ${slip.vehicleNo} · Driver: ${slip.driverName}`,
    '',
    `⛽ ${slip.fuelType}`,
    `${litres(slip.liters)} × Rs ${rateText(slip.rate)} = *${money(slip.totalAmount)}*`,
    '',
    'This amount was given on credit and is added to your account.',
    `Given by: ${slip.authorizedBy}`,
  ].join('\n')
}

/**
 * The account statement sent to a customer: what they took, what they paid, what they owe now, the latest entries and
 * where to pay. The list of latest entries is shortened, if needed, so the whole link stays a safe length.
 */
export function statementMessage(
  customer: Customer,
  site: Pick<SiteInfo, 'name' | 'location' | 'brand' | 'phone' | 'managerName'>,
  bank: Pick<BankAccount, 'bankName' | 'accountTitle' | 'accountNumber' | 'branch'> | undefined,
  statement: Statement,
  today: string,
  range: { from?: string; to?: string } = {},
): string {
  const rows = statement.rows
  const fuelRows = rows.filter((r) => r.kind === 'slip')
  const payRows = rows.filter((r) => r.kind === 'recovery')
  const totalLiters = fuelRows.reduce((s, r) => s + (r.liters ?? 0), 0)
  const fuelValue = fuelRows.reduce((s, r) => s + r.debit, 0)
  const paid = payRows.reduce((s, r) => s + r.credit, 0)
  const byFuel = Object.entries(fuelRows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.fuelType ?? 'Fuel']: (m[r.fuelType ?? 'Fuel'] ?? 0) + (r.liters ?? 0) }), {}))
  const opening = rows.find((r) => r.kind === 'opening')
  const adjustments = rows.filter((r) => r.kind === 'debit-note' || r.kind === 'credit-note').reduce((s, r) => s + r.debit - r.credit, 0)
  const owes = customer.currentBalance
  const left = customer.creditLimit - Math.max(0, owes)
  const period = range.from || range.to ? `${range.from ? formatDate(range.from) : 'the start'} to ${range.to ? formatDate(range.to) : formatDate(today)}` : ''

  const recentLine = (r: (typeof rows)[number]) => {
    const what = r.kind === 'slip' ? `Fuel · ${litres(r.liters ?? 0)} ${r.fuelType ?? ''}`.trim() + ` · ${money(r.debit)}`
      : r.kind === 'recovery' ? `Payment · ${money(r.credit)}`
        : r.kind === 'debit-note' ? `Charge · ${money(r.debit)}` : `Credit · ${money(r.credit)}`
    return `• ${formatDate(r.date)} · ${what}`
  }
  const entries = rows.filter((r) => r.kind !== 'opening')

  const build = (recent: number) => [
    brandLine(site),
    `*Account statement* · ${formatDate(today)}`,
    ...(period ? [`Period: ${period}`] : []),
    '',
    `*${customer.businessName}*`,
    '',
    `⛽ Fuel taken: *${litres(totalLiters)}*${byFuel.length > 1 ? ` (${byFuel.map(([f, q]) => `${f} ${litres(q)}`).join(', ')})` : byFuel.length === 1 ? ` (${byFuel[0][0]})` : ''}`,
    `    worth ${money(fuelValue)}`,
    `💵 Payments received: *${money(paid)}*`,
    ...(opening && Math.abs(opening.balance) > 0.5 ? [`Brought forward: ${opening.balance < 0 ? `advance ${money(-opening.balance)}` : money(opening.balance)}`] : []),
    ...(Math.abs(adjustments) > 0.5 ? [`Other charges / credits: ${adjustments > 0 ? '+' : '−'}${money(Math.abs(adjustments))}`] : []),
    '',
    owes < -0.5 ? `*You have paid in advance: ${money(-owes)}*` : owes < 0.5 ? '*You owe nothing. Thank you.*' : `*You owe now: ${money(owes)}*`,
    customer.creditLimit > 0 ? `Credit limit ${money(customer.creditLimit)} · left ${money(Math.max(0, left))}` : '',
    ...(recent > 0 && entries.length ? ['', 'Latest entries:', ...entries.slice(-recent).map(recentLine)] : []),
    ...(bank ? ['', 'Please pay to:', `${bank.bankName} · ${bank.accountTitle}`, `Account ${bank.accountNumber}${bank.branch ? ` · ${bank.branch}` : ''}`] : []),
    '',
    `${site.managerName}, station manager${site.phone ? ` · ${site.phone}` : ''}`,
  ].filter((line, i, all) => !(line === '' && (all[i - 1] === '' || i === 0))).join('\n')

  // as many latest entries as fit inside the safe link length (at most 6)
  for (let recent = Math.min(6, entries.length); recent > 0; recent--) {
    const message = build(recent)
    if (linkLength(message) <= MAX_LINK_CHARS) return message
  }
  return build(0)
}

/**
 * Opens WhatsApp with the message ready to send. Returns false when the phone number on file is not a mobile
 * number WhatsApp can open (a landline, or too short); then WhatsApp opens without a number so the person can
 * choose the contact, instead of showing an "invalid phone number" error.
 */
export function openWhatsApp(phone: string, message: string): boolean {
  const to = normalizePakistaniPhone(phone)
  const valid = isWhatsAppNumber(to)
  const url = valid ? `https://wa.me/${to}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
  return valid
}
