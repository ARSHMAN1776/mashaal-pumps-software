import type { CreditSaleSlip, Customer, CustomerAdjustment, CustomerRecovery } from '../types'
import { round2 } from '../lib/money'

export type StatementKind = 'opening' | 'slip' | 'recovery' | 'debit-note' | 'credit-note'

export interface StatementRow {
  key: string
  /** id of the underlying record (empty for the opening row) */
  id: string
  kind: StatementKind
  date: string
  refNo: string
  description: string
  /** customer owes more */
  debit: number
  /** customer owes less */
  credit: number
  balance: number
  /** fuel slips only: what was taken */
  liters?: number
  fuelType?: string
  rate?: number
}

export interface Statement {
  rows: StatementRow[]
  totalDebit: number
  totalCredit: number
  /** balance at the end of the period */
  closing: number
}

const byTime = (a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)

/**
 * Debit / credit running statement of one customer.
 *   DEBIT  = fuel taken on credit (slips) and debit notes   -> balance goes up
 *   CREDIT = money received (recoveries) and credit notes   -> balance goes down
 * With a `from` date, everything before it is folded into a "brought forward" line.
 */
export function buildStatement(
  customer: Pick<Customer, 'openingBalance'>,
  slips: CreditSaleSlip[],
  recoveries: CustomerRecovery[],
  adjustments: CustomerAdjustment[],
  range: { from?: string; to?: string } = {},
): Statement {
  type Entry = { date: string; createdAt: string; row: Omit<StatementRow, 'balance'> }
  const entries: Entry[] = [
    ...slips.map((s): Entry => ({
      date: s.date, createdAt: s.createdAt,
      row: {
        key: `s-${s.id}`, id: s.id, kind: 'slip', date: s.date, refNo: s.slipNo,
        description: `Fuel supplied: ${s.liters.toLocaleString()} L ${s.fuelType} @ ${s.rate} (Vehicle ${s.vehicleNo}, Driver ${s.driverName})`,
        debit: s.totalAmount, credit: 0, liters: s.liters, fuelType: s.fuelType, rate: s.rate,
      },
    })),
    ...adjustments.map((a): Entry => ({
      date: a.date, createdAt: a.createdAt,
      row: {
        key: `a-${a.id}`, id: a.id, kind: a.kind === 'Debit' ? 'debit-note' : 'credit-note', date: a.date, refNo: a.referenceNo || (a.kind === 'Debit' ? 'DN' : 'CN'),
        description: `${a.kind === 'Debit' ? 'Debit note' : 'Credit note'}: ${a.reason}`,
        debit: a.kind === 'Debit' ? a.amount : 0, credit: a.kind === 'Credit' ? a.amount : 0,
      },
    })),
    ...recoveries.map((r): Entry => ({
      date: r.date, createdAt: r.createdAt,
      row: {
        key: `r-${r.id}`, id: r.id, kind: 'recovery', date: r.date, refNo: r.receiptNo,
        description: `Payment received via ${r.paymentMethod}${r.referenceNo ? ` (${r.referenceNo})` : ''} — received by ${r.receivedBy}`,
        debit: 0, credit: r.amount,
      },
    })),
  ].sort(byTime)

  let running = customer.openingBalance
  const rows: StatementRow[] = []
  const before = range.from ? entries.filter((e) => e.date < range.from!) : []
  const inRange = entries.filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))

  for (const e of before) running += e.row.debit - e.row.credit
  if (range.from ? true : Math.abs(customer.openingBalance) > 0.005) {
    if (range.from || Math.abs(running) > 0.005) {
      rows.push({
        key: 'opening', id: '', kind: 'opening', date: range.from ?? '', refNo: 'B/F',
        description: range.from ? `Balance brought forward to ${range.from}` : 'Opening balance brought forward',
        debit: running > 0 ? running : 0, credit: running < 0 ? -running : 0, balance: round2(running),
      })
    }
  }

  let totalDebit = 0
  let totalCredit = 0
  for (const e of inRange) {
    running = round2(running + e.row.debit - e.row.credit)
    totalDebit += e.row.debit
    totalCredit += e.row.credit
    rows.push({ ...e.row, balance: running })
  }
  return { rows, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit), closing: round2(running) }
}
