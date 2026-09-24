/** Tanks, nozzles, meter readings (fuel sales) and tank dips. */
import { FUEL_TYPES, SHIFT_NAMES } from '../../types'
import type { FuelSaleRecord, FuelType, Nozzle, ShiftName, Tank, TankDipRecord } from '../../types'
import { fail, ok, type Result } from '../../data/errors'
import { rateOnDate } from '../../data/derive'
import { op } from '../../data/ops'
import { newId } from '../../lib/ids'
import { round2 } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import {
  EPS, auditOp, checkDate, clean, fmt, guard, isNonNegative, isPositive, money, needManager, run, type ActionCtx,
} from './core'

// ===========================================================================
// Tanks
// ===========================================================================
export interface TankInput {
  tankNo: number
  fuelType: FuelType
  capacityLiters: number
  minReserveLiters: number
  initialLiters: number
  initialDipMm: number
}

function validateTank(c: ActionCtx, i: TankInput, selfId?: string): Result<never> | null {
  if (!Number.isInteger(i.tankNo) || i.tankNo < 1) return fail('Tank number must be a whole number, 1 or more.')
  if (c.raw.tanks.some((t) => t.tankNo === i.tankNo && t.id !== selfId)) return fail(`Tank #${i.tankNo} already exists.`)
  if (!FUEL_TYPES.includes(i.fuelType)) return fail('Choose a fuel type.')
  if (!isPositive(i.capacityLiters)) return fail('Capacity must be more than 0 liters.')
  if (!isNonNegative(i.minReserveLiters) || i.minReserveLiters > i.capacityLiters) {
    return fail('Minimum reserve must be between 0 and the tank capacity.')
  }
  if (!isNonNegative(i.initialLiters) || i.initialLiters > i.capacityLiters) {
    return fail('Opening stock must be between 0 and the tank capacity.')
  }
  if (!isNonNegative(i.initialDipMm)) return fail('Dip reading cannot be negative.')
  return null
}

export function addTank(c: ActionCtx, i: TankInput): Promise<Result<Tank>> {
  return run(async () => {
    const denied = needManager(c, 'add tanks')
    if (denied) return denied
    const bad = validateTank(c, i)
    if (bad) return bad
    const tank: Tank = {
      id: newId('TK'), siteId: c.siteId, ...i, currentLiters: i.initialLiters, currentDipMm: i.initialDipMm,
      waterDipMm: 0, lastUpdated: '', estimatedBookLiters: i.initialLiters, createdAt: '',
    }
    await c.commit([
      op.insert('tanks', tank),
      auditOp(c, 'tank.add', 'tank', tank.id, `Added Tank #${i.tankNo} (${i.fuelType}, ${i.capacityLiters} L)`),
    ])
    return ok(tank)
  })
}

export function updateTank(c: ActionCtx, id: string, i: TankInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit tanks')
    if (denied) return denied
    const tank = c.raw.tanks.find((t) => t.id === id)
    if (!tank) return fail('Tank not found.')
    const bad = validateTank(c, i, id)
    if (bad) return bad
    if (i.fuelType !== tank.fuelType) {
      if (c.raw.nozzles.some((n) => n.tankId === id) || c.raw.tankDips.some((d) => d.tankId === id)) {
        return fail('The fuel type cannot be changed once nozzles or dip records use this tank.')
      }
    }
    const current = c.data.tanks.find((t) => t.id === id)?.currentLiters ?? 0
    if (i.capacityLiters < current) return fail(`Capacity cannot be lower than the current stock (${Math.round(current).toLocaleString()} L).`)
    await c.commit([
      op.update('tanks', { ...tank, ...i }),
      auditOp(c, 'tank.edit', 'tank', id, `Edited Tank #${i.tankNo}`, { before: pickTank(tank), after: i }),
    ])
    return ok(undefined)
  })
}

const pickTank = (t: Tank) => ({
  tankNo: t.tankNo, fuelType: t.fuelType, capacityLiters: t.capacityLiters, minReserveLiters: t.minReserveLiters,
  initialLiters: t.initialLiters, initialDipMm: t.initialDipMm,
})

export function removeTank(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete tanks')
    if (denied) return denied
    const tank = c.raw.tanks.find((t) => t.id === id)
    if (!tank) return fail('Tank not found.')
    const nozzles = c.raw.nozzles.filter((n) => n.tankId === id)
    if (nozzles.length) return fail(`Tank #${tank.tankNo} still has ${nozzles.length} nozzle(s) connected. Delete or move those nozzles first.`)
    if (c.raw.tankDips.some((d) => d.tankId === id)) return fail(`Tank #${tank.tankNo} has dip records and cannot be deleted.`)
    if (c.raw.omcInvoices.some((i) => i.tankId === id)) return fail(`Tank #${tank.tankNo} has OMC deliveries recorded against it and cannot be deleted.`)
    await c.commit([op.remove('tanks', id), auditOp(c, 'tank.delete', 'tank', id, `Deleted Tank #${tank.tankNo} (${tank.fuelType})`)])
    return ok(undefined)
  })
}

// ===========================================================================
// Nozzles
// ===========================================================================
export interface NozzleInput {
  dispenserNo: number
  nozzleNo: number
  tankId: string
  initialMeter: number
  testingLiters: number
  assignedStaff: string
}

function validateNozzle(c: ActionCtx, i: NozzleInput, selfId?: string): Result<never> | null {
  if (!Number.isInteger(i.dispenserNo) || i.dispenserNo < 1) return fail('Dispenser number must be a whole number, 1 or more.')
  if (!Number.isInteger(i.nozzleNo) || i.nozzleNo < 1) return fail('Nozzle number must be a whole number, 1 or more.')
  if (c.raw.nozzles.some((n) => n.id !== selfId && n.dispenserNo === i.dispenserNo && n.nozzleNo === i.nozzleNo)) {
    return fail(`Dispenser ${i.dispenserNo} • Nozzle ${i.nozzleNo} already exists.`)
  }
  if (!c.raw.tanks.some((t) => t.id === i.tankId)) return fail('Choose the underground tank this nozzle draws from.')
  if (!isNonNegative(i.initialMeter)) return fail('The meter reading cannot be negative.')
  if (!isNonNegative(i.testingLiters)) return fail('Testing liters cannot be negative.')
  return null
}

export function addNozzle(c: ActionCtx, i: NozzleInput): Promise<Result<Nozzle>> {
  return run(async () => {
    const denied = needManager(c, 'add nozzles')
    if (denied) return denied
    const bad = validateNozzle(c, i)
    if (bad) return bad
    const tank = c.data.tanks.find((t) => t.id === i.tankId)!
    const nozzle: Nozzle = {
      id: newId('NZ'), siteId: c.siteId, tankId: i.tankId, dispenserNo: i.dispenserNo, nozzleNo: i.nozzleNo,
      fuelType: tank.fuelType, initialMeter: i.initialMeter, openingMeter: i.initialMeter, closingMeter: i.initialMeter,
      testingLiters: i.testingLiters, ratePerLiter: c.data.settings.rates[tank.fuelType] ?? 0,
      assignedStaff: clean(i.assignedStaff), isActive: true,
    }
    await c.commit([
      op.insert('nozzles', nozzle),
      auditOp(c, 'nozzle.add', 'nozzle', nozzle.id, `Added Dispenser ${i.dispenserNo} • Nozzle ${i.nozzleNo} (${tank.fuelType})`),
    ])
    return ok(nozzle)
  })
}

export function updateNozzle(c: ActionCtx, id: string, i: Omit<NozzleInput, 'initialMeter'> & { isActive: boolean }): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit nozzles')
    if (denied) return denied
    const nozzle = c.raw.nozzles.find((n) => n.id === id)
    if (!nozzle) return fail('Nozzle not found.')
    const bad = validateNozzle(c, { ...i, initialMeter: nozzle.initialMeter }, id)
    if (bad) return bad
    if (i.tankId !== nozzle.tankId && c.raw.fuelSales.some((s) => s.nozzleId === id)) {
      const from = c.data.tanks.find((t) => t.id === nozzle.tankId)
      const to = c.data.tanks.find((t) => t.id === i.tankId)
      if (from && to && from.fuelType !== to.fuelType) {
        return fail('This nozzle already has meter readings, so it can only be moved to a tank with the same fuel.')
      }
    }
    await c.commit([
      op.update('nozzles', { ...nozzle, ...i, assignedStaff: clean(i.assignedStaff) }),
      auditOp(c, 'nozzle.edit', 'nozzle', id, `Edited Dispenser ${i.dispenserNo} • Nozzle ${i.nozzleNo}`),
    ])
    return ok(undefined)
  })
}

export function removeNozzle(c: ActionCtx, id: string): Promise<Result<{ historyKept: number }>> {
  return run(async () => {
    const denied = needManager(c, 'delete nozzles')
    if (denied) return denied
    const nozzle = c.raw.nozzles.find((n) => n.id === id)
    if (!nozzle) return fail('Nozzle not found.')
    const history = c.raw.fuelSales.filter((s) => s.nozzleId === id).length
    await c.commit([
      op.remove('nozzles', id),
      auditOp(c, 'nozzle.delete', 'nozzle', id, `Deleted Dispenser ${nozzle.dispenserNo} • Nozzle ${nozzle.nozzleNo}`, { readingsKept: history }),
    ])
    return ok({ historyKept: history })
  })
}

// ===========================================================================
// Meter readings (fuel sales)
// ===========================================================================
export interface FuelSaleInput {
  nozzleId: string
  date?: string
  shiftName: ShiftName
  openingMeter: number
  closingMeter: number
  testingLiters: number
  cashierName: string
  /** soft-rule codes a manager has knowingly accepted (METER_OVERLAP, METER_GAP) */
  acknowledge?: string[]
}

export function recordFuelSale(c: ActionCtx, i: FuelSaleInput): Promise<Result<FuelSaleRecord>> {
  return run(async () => {
    const date = i.date || todayISO()
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const nozzle = c.data.nozzles.find((n) => n.id === i.nozzleId)
    if (!nozzle) return fail('Choose a nozzle.')
    if (!nozzle.isActive) return fail('This nozzle is deactivated. Re-activate it before recording readings.')
    if (!SHIFT_NAMES.includes(i.shiftName)) return fail('Choose the shift.')
    const opening = money(i.openingMeter)
    const closing = money(i.closingMeter)
    const testing = money(i.testingLiters)
    if (!isNonNegative(opening) || !isNonNegative(closing)) return fail('Enter both meter readings.')
    if (closing <= opening) return fail('The closing meter must be greater than the opening meter.')
    if (!isNonNegative(testing)) return fail('Testing liters cannot be negative.')
    const gross = round2(closing - opening)
    if (testing >= gross) return fail('Testing liters must be less than the liters dispensed.')
    // the price in force on the reading's date, so a late entry for a day before a price change keeps the old rate
    const rate = rateOnDate(c.data.tariffHistory, c.data.settings.rates, nozzle.fuelType, date)
    if (!isPositive(rate)) return fail(`Set the ${nozzle.fuelType} rate in Settings before recording sales.`)
    if (!clean(i.cashierName)) return fail('Enter the attendant / cashier name.')

    const last = nozzle.closingMeter
    const overlap = guard(c, i.acknowledge, 'METER_OVERLAP', opening < last - EPS,
      `The opening meter (${opening.toLocaleString()}) is lower than this nozzle's last reading (${last.toLocaleString()}). Some liters would be counted twice.`)
    if (overlap) return overlap
    const gap = guard(c, i.acknowledge, 'METER_GAP', opening > last + EPS,
      `The opening meter (${opening.toLocaleString()}) is higher than this nozzle's last reading (${last.toLocaleString()}). ${round2(opening - last).toLocaleString()} L would be missing from the records.`)
    if (gap) return gap

    const net = round2(gross - testing)
    const sale: FuelSaleRecord = {
      id: newId('FS'), date, shiftId: '', shiftName: i.shiftName, nozzleId: nozzle.id,
      dispenserNo: nozzle.dispenserNo, nozzleNo: nozzle.nozzleNo, fuelType: nozzle.fuelType,
      openingMeter: opening, closingMeter: closing, testingLiters: testing, netLiters: net,
      ratePerLiter: rate, totalAmount: round2(net * rate), cashierName: clean(i.cashierName), createdAt: '',
    }
    const results = await c.commit([op.insert('fuel_sales', sale)])
    const saved = results.find((r) => r.t === 'fuel_sales')?.row
    return ok({ ...sale, id: sale.id, createdAt: String(saved?.created_at ?? '') })
  })
}

export function removeFuelSale(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete meter readings')
    if (denied) return denied
    const sale = c.raw.fuelSales.find((s) => s.id === id)
    if (!sale) return fail('Reading not found.')
    await c.commit([
      op.remove('fuel_sales', id),
      auditOp(c, 'fuel_sale.delete', 'fuel_sale', id,
        `Deleted reading D${sale.dispenserNo}-N${sale.nozzleNo} ${sale.date} (${sale.netLiters} L, ${fmt(sale.totalAmount)})`, { sale }),
    ])
    return ok(undefined)
  })
}

// ===========================================================================
// Tank dips
// ===========================================================================
export interface DipInput {
  tankId: string
  date?: string
  morningDipMm: number
  morningLiters: number
  decantedLiters: number
  dispensedLiters: number
  closingDipMm: number
  closingPhysicalLiters: number
  waterDipMm: number
  inspector: string
  acknowledge?: string[]
}

export function recordDip(c: ActionCtx, i: DipInput): Promise<Result<TankDipRecord>> {
  return run(async () => {
    const date = i.date || todayISO()
    const badDate = checkDate(c, date)
    if (badDate) return badDate
    const tank = c.data.tanks.find((t) => t.id === i.tankId)
    if (!tank) return fail('Choose a tank.')
    const nums = [i.morningDipMm, i.morningLiters, i.decantedLiters, i.dispensedLiters, i.closingDipMm, i.closingPhysicalLiters, i.waterDipMm].map(money)
    if (nums.some((n) => !isNonNegative(n))) return fail('Enter all readings as numbers (0 or more).')
    if (!clean(i.inspector)) return fail('Enter the inspecting officer.')
    const over = guard(c, i.acknowledge, 'OVER_CAPACITY', i.closingPhysicalLiters > tank.capacityLiters + EPS,
      `The physical volume (${i.closingPhysicalLiters.toLocaleString()} L) is more than the tank capacity (${tank.capacityLiters.toLocaleString()} L).`)
    if (over) return over
    const book = round2(i.morningLiters + i.decantedLiters - i.dispensedLiters)
    const dip: TankDipRecord = {
      id: newId('DIP'), date, tankId: tank.id, tankNo: tank.tankNo, fuelType: tank.fuelType,
      morningDipMm: i.morningDipMm, morningLiters: i.morningLiters, decantedLiters: i.decantedLiters,
      dispensedLiters: i.dispensedLiters, bookStockLiters: book, closingDipMm: i.closingDipMm,
      closingPhysicalLiters: i.closingPhysicalLiters, varianceLiters: round2(i.closingPhysicalLiters - book),
      waterDipMm: i.waterDipMm, inspector: clean(i.inspector), createdAt: '',
    }
    await c.commit([op.insert('tank_dips', dip)])
    return ok(dip)
  })
}

export function removeDip(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete dip records')
    if (denied) return denied
    const dip = c.raw.tankDips.find((d) => d.id === id)
    if (!dip) return fail('Dip record not found.')
    await c.commit([
      op.remove('tank_dips', id),
      auditOp(c, 'dip.delete', 'tank_dip', id, `Deleted dip record Tank #${dip.tankNo} ${dip.date}`, { dip }),
    ])
    return ok(undefined)
  })
}
