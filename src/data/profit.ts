import type { FuelType, StationData } from '../types'
import { FUEL_TYPES } from '../types'
import { round2 } from '../lib/money'

export interface FuelLine {
  fuelType: FuelType
  liters: number
  revenue: number
  margin: number
}

export interface ProfitSummary {
  fuel: FuelLine[]
  liters: number
  fuelRevenue: number
  /** dealer commission = liters x the margin per liter set in Settings (an estimate, not an OMC statement) */
  dealerMargin: number
  lubeSales: number
  /** lubricant sales minus the cost of the cans sold (at the product's current cost price) */
  lubeMargin: number
  expenses: number
  /** salaries paid for the period after deductions (advances are part of them) */
  salaries: number
  netProfit: number
}

const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to)

/** Estimated station profit for a period — used by the reports and the owner screens so they always agree. */
export function computeProfit(d: StationData, from?: string, to?: string): ProfitSummary {
  const sales = d.fuelSales.filter((s) => inRange(s.date, from, to))
  const fuel = FUEL_TYPES.map((fuelType): FuelLine => {
    const rows = sales.filter((s) => s.fuelType === fuelType)
    const liters = rows.reduce((a, s) => a + s.netLiters, 0)
    return {
      fuelType, liters: round2(liters), revenue: round2(rows.reduce((a, s) => a + s.totalAmount, 0)),
      margin: round2(liters * (d.settings.margins[fuelType] ?? 0)),
    }
  })
  const lubeSold = d.lubricantMovements.filter((m) => m.type === 'Sale' && inRange(m.date, from, to))
  const cost = new Map(d.lubricants.map((p) => [p.id, p.costPrice]))
  const lubeSales = lubeSold.reduce((a, m) => a + m.totalAmount, 0)
  const lubeCost = lubeSold.reduce((a, m) => a + m.quantity * (cost.get(m.productId) ?? 0), 0)
  const expenses = d.expenses.filter((e) => inRange(e.date, from, to)).reduce((a, e) => a + e.amount, 0)
  // what the station really pays: the salary less absence / other deductions (advances are part of what is paid)
  const salaries = d.salaryPayments.filter((p) => inRange(p.date, from, to)).reduce((a, p) => a + p.grossSalary - (p.deduction ?? 0), 0)

  const dealerMargin = round2(fuel.reduce((a, f) => a + f.margin, 0))
  const lubeMargin = round2(lubeSales - lubeCost)
  return {
    fuel,
    liters: round2(fuel.reduce((a, f) => a + f.liters, 0)),
    fuelRevenue: round2(fuel.reduce((a, f) => a + f.revenue, 0)),
    dealerMargin,
    lubeSales: round2(lubeSales),
    lubeMargin,
    expenses: round2(expenses),
    salaries: round2(salaries),
    netProfit: round2(dealerMargin + lubeMargin - expenses - salaries),
  }
}
