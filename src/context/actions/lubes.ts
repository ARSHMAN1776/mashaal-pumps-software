/**
 * Lubricants: products, counter sales, restocks and stock adjustments.
 * Stock is never stored — it is opening stock + restocks - sales +/- adjustments.
 * A counter sale automatically posts its cash to the daybook.
 */
import type { LubricantMovement, LubricantProduct, SupplierTransaction } from '../../types'
import { fail, ok, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import { newId } from '../../lib/ids'
import { round2 } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import {
  EPS, auditOp, checkDate, clean, fmt, isManager, isNonNegative, money, needManager, run, syncLinkedDaybook,
  type ActionCtx,
} from './core'

const lc = (s: string) => s.trim().toLowerCase()
const isWhole = (n: number) => Number.isInteger(n)

export interface ProductInput {
  name: string
  brand: string
  grade: string
  packSize: string
  openingStock: number
  minStockAlert: number
  costPrice: number
  salePrice: number
}

function validateProduct(c: ActionCtx, i: ProductInput, selfId?: string): Result<never> | null {
  if (!clean(i.name)) return fail('Enter the product name.')
  if (c.raw.lubricants.some((p) => p.id !== selfId && p.isActive && lc(p.name) === lc(i.name) && lc(p.packSize) === lc(i.packSize))) {
    return fail('This product (same name and pack size) already exists.')
  }
  if (!isWhole(money(i.openingStock)) || money(i.openingStock) < 0) return fail('Opening stock must be a whole number of cans (0 or more).')
  if (!isWhole(money(i.minStockAlert)) || money(i.minStockAlert) < 0) return fail('The low-stock alert level must be a whole number (0 or more).')
  if (!isNonNegative(money(i.costPrice)) || !isNonNegative(money(i.salePrice))) return fail('Prices cannot be negative.')
  return null
}

export function addProduct(c: ActionCtx, i: ProductInput): Promise<Result<LubricantProduct>> {
  return run(async () => {
    const denied = needManager(c, 'add lubricant products')
    if (denied) return denied
    const bad = validateProduct(c, i)
    if (bad) return bad
    const p: LubricantProduct = {
      id: newId('LUB'), name: clean(i.name), brand: clean(i.brand), grade: clean(i.grade), packSize: clean(i.packSize),
      openingStock: money(i.openingStock), stockCans: money(i.openingStock), minStockAlert: money(i.minStockAlert),
      costPrice: money(i.costPrice), salePrice: money(i.salePrice), isActive: true,
    }
    await c.commit([op.insert('lubricant_products', p), auditOp(c, 'lube.product.add', 'lubricant', p.id, `Added product ${p.name} (${p.packSize})`)])
    return ok(p)
  })
}

export function updateProduct(c: ActionCtx, id: string, i: Omit<ProductInput, 'openingStock'> & { isActive: boolean }): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'edit lubricant products')
    if (denied) return denied
    const p = c.raw.lubricants.find((x) => x.id === id)
    if (!p) return fail('Product not found.')
    const bad = validateProduct(c, { ...i, openingStock: p.openingStock }, id)
    if (bad) return bad
    await c.commit([
      op.update('lubricant_products', { ...p, name: clean(i.name), brand: clean(i.brand), grade: clean(i.grade), packSize: clean(i.packSize), minStockAlert: money(i.minStockAlert), costPrice: money(i.costPrice), salePrice: money(i.salePrice), isActive: i.isActive }),
      auditOp(c, 'lube.product.edit', 'lubricant', id, `Edited product ${i.name}`, { before: { sale: p.salePrice, cost: p.costPrice }, after: { sale: i.salePrice, cost: i.costPrice } }),
    ])
    return ok(undefined)
  })
}

export function removeProduct(c: ActionCtx, id: string): Promise<Result<{ mode: 'deleted' | 'deactivated' }>> {
  return run<{ mode: 'deleted' | 'deactivated' }>(async () => {
    const denied = needManager(c, 'delete lubricant products')
    if (denied) return denied
    const p = c.data.lubricants.find((x) => x.id === id)
    if (!p) return fail('Product not found.')
    if (p.stockCans > 0) return fail(`${p.name} still has ${p.stockCans} can(s) in stock. Sell or write them off (stock adjustment) first.`, 'BALANCE_DUE')
    if (!c.raw.lubricantMovements.some((m) => m.productId === id)) {
      await c.commit([op.remove('lubricant_products', id), auditOp(c, 'lube.product.delete', 'lubricant', id, `Deleted product ${p.name}`)])
      return ok({ mode: 'deleted' as const })
    }
    await c.commit([
      op.update('lubricant_products', { ...c.raw.lubricants.find((x) => x.id === id)!, isActive: false }),
      auditOp(c, 'lube.product.deactivate', 'lubricant', id, `Deactivated product ${p.name} (sales history kept)`),
    ])
    return ok({ mode: 'deactivated' as const })
  })
}

// ---- sale -------------------------------------------------------------------
export interface LubeSaleInput {
  productId: string
  quantity: number
  counterparty: string
  /** manager only; cashiers always sell at the list price */
  unitPrice?: number
  date?: string
}

export function sellLube(c: ActionCtx, i: LubeSaleInput): Promise<Result<LubricantMovement>> {
  return run(async () => {
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const p = c.data.lubricants.find((x) => x.id === i.productId)
    if (!p) return fail('Choose a product.')
    if (!p.isActive) return fail(`${p.name} is deactivated.`)
    const qty = money(i.quantity)
    if (!isWhole(qty) || qty < 1) return fail('Enter the number of cans as a whole number (1 or more).')
    if (qty > p.stockCans) return fail(`Only ${p.stockCans} can(s) of ${p.name} are in stock.`)
    let unit = p.salePrice
    if (i.unitPrice !== undefined && Math.abs(money(i.unitPrice) - p.salePrice) > EPS) {
      if (!isManager(c)) return fail('Only a manager can change the selling price.', 'FORBIDDEN')
      if (!isNonNegative(money(i.unitPrice))) return fail('The price cannot be negative.')
      unit = money(i.unitPrice)
    }
    const total = round2(qty * unit)
    const m: LubricantMovement = {
      id: newId('LMV'), productId: p.id, date, type: 'Sale', quantity: qty, unitPrice: unit, totalAmount: total,
      counterparty: clean(i.counterparty) || 'Counter Walk-in', referenceNo: '', recordedBy: c.user.name, createdAt: '',
    }
    m.referenceNo = `LUB-${m.id.slice(-6)}`
    await c.commit([
      op.insert('lubricant_movements', m),
      ...syncLinkedDaybook(c, 'lube_sale', m.id, {
        date, particulars: `Lube Counter Sale: ${qty}x ${p.name} (${m.counterparty})`, category: 'Lube Sale', cashIn: total, referenceNo: m.referenceNo,
      }),
    ])
    return ok(m)
  })
}

// ---- restock / adjustment -----------------------------------------------------
export interface LubeRestockInput {
  productId: string
  quantity: number
  unitCost: number
  /** a supplier from the Suppliers page: the purchase is then added to their account as an unpaid bill */
  supplierId?: string
  supplierName: string
  referenceNo: string
  date?: string
}

export function restockLube(c: ActionCtx, i: LubeRestockInput): Promise<Result<LubricantMovement>> {
  return run(async () => {
    const denied = needManager(c, 'restock lubricants')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const p = c.raw.lubricants.find((x) => x.id === i.productId)
    if (!p) return fail('Choose a product.')
    const qty = money(i.quantity)
    if (!isWhole(qty) || qty < 1) return fail('Enter the number of cans received as a whole number (1 or more).')
    if (!isNonNegative(money(i.unitCost))) return fail('The cost cannot be negative.')
    const supplier = i.supplierId ? c.raw.suppliers.find((s) => s.id === i.supplierId) : undefined
    if (i.supplierId && !supplier) return fail('Choose the supplier from the list.')
    if (supplier && !supplier.isActive) return fail(`${supplier.name} is deactivated.`)
    const m: LubricantMovement = {
      id: newId('LMV'), productId: p.id, date, type: 'Restock', quantity: qty, unitPrice: money(i.unitCost),
      totalAmount: round2(qty * money(i.unitCost)), counterparty: supplier ? supplier.name : clean(i.supplierName), referenceNo: clean(i.referenceNo), recordedBy: c.user.name, createdAt: '',
    }
    const ops: Op[] = [op.insert('lubricant_movements', m)]
    // bought from a listed supplier: the amount is added to their account, linked to this stock entry
    if (supplier && m.totalAmount > EPS) {
      const bill: SupplierTransaction = {
        id: newId('SUPTX'), supplierId: supplier.id, date, type: 'Bill', amount: m.totalAmount, referenceNo: m.referenceNo,
        note: `Lubricants: ${qty} x ${p.name}`, paymentSource: '', bankAccountId: '', sourceType: 'lube_restock', sourceId: m.id,
        recordedBy: c.user.name, createdAt: '',
      }
      ops.push(op.insert('supplier_transactions', bill))
    }
    if (money(i.unitCost) > 0 && Math.abs(money(i.unitCost) - p.costPrice) > EPS) ops.push(op.update('lubricant_products', { ...p, costPrice: money(i.unitCost) }))
    ops.push(auditOp(c, 'lube.restock', 'lubricant', p.id, `Received ${qty} x ${p.name}`))
    await c.commit(ops)
    return ok(m)
  })
}

export interface LubeAdjustInput {
  productId: string
  quantity: number
  direction: 'in' | 'out'
  reason: string
  date?: string
}

export function adjustLubeStock(c: ActionCtx, i: LubeAdjustInput): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'adjust lubricant stock')
    if (denied) return denied
    const date = i.date || todayISO()
    const bad = checkDate(c, date)
    if (bad) return bad
    const p = c.data.lubricants.find((x) => x.id === i.productId)
    if (!p) return fail('Choose a product.')
    const qty = money(i.quantity)
    if (!isWhole(qty) || qty < 1) return fail('Enter a whole number of cans (1 or more).')
    if (!clean(i.reason)) return fail('Enter the reason (damage, count correction ...).')
    if (i.direction === 'out' && qty > p.stockCans) return fail(`Only ${p.stockCans} can(s) are in stock.`)
    const m: LubricantMovement = {
      id: newId('LMV'), productId: p.id, date, type: i.direction === 'in' ? 'Adjustment In' : 'Adjustment Out', quantity: qty, unitPrice: 0, totalAmount: 0,
      counterparty: clean(i.reason), referenceNo: '', recordedBy: c.user.name, createdAt: '',
    }
    await c.commit([op.insert('lubricant_movements', m), auditOp(c, 'lube.adjust', 'lubricant', p.id, `Stock adjustment ${i.direction === 'in' ? '+' : '-'}${qty} x ${p.name}: ${m.counterparty}`)])
    return ok(undefined)
  })
}

export function removeLubeMovement(c: ActionCtx, id: string): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'delete lubricant records')
    if (denied) return denied
    const m = c.raw.lubricantMovements.find((x) => x.id === id)
    if (!m) return fail('Record not found.')
    const p = c.data.lubricants.find((x) => x.id === m.productId)
    if ((m.type === 'Restock' || m.type === 'Adjustment In') && p && p.stockCans - m.quantity < 0) {
      return fail(`Deleting this would leave ${p.name} with negative stock (${p.stockCans} in stock, ${m.quantity} received).`)
    }
    // a supplier bill created by this restock goes with it
    const bills = c.raw.supplierTransactions.filter((t) => t.sourceType === 'lube_restock' && t.sourceId === id)
    await c.commit([
      op.remove('lubricant_movements', id),
      ...bills.map((b) => op.remove('supplier_transactions', b.id)),
      ...syncLinkedDaybook(c, 'lube_sale', id, null),
      auditOp(c, 'lube.movement.delete', 'lubricant_movement', id, `Deleted ${m.type} of ${m.quantity} can(s) (${fmt(m.totalAmount)})`, { movement: m }),
    ])
    return ok(undefined)
  })
}
