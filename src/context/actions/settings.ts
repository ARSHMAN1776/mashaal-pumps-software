/** Station settings, OGRA tariff revisions, and backup restore / import. */
import { FUEL_TYPES } from '../../types'
import type { FuelRates, StationSettings, TariffRevisionLog } from '../../types'
import { buildMergeOps, buildReplaceOps } from '../../data/backup'
import { fail, ok, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import type { RawStation } from '../../data/raw'
import { newId } from '../../lib/ids'
import { todayISO } from '../../lib/dates'
import { auditOp, clean, fmt, isNonNegative, isPositive, money, needManager, needRole, run, type ActionCtx } from './core'

export function saveSettings(c: ActionCtx, s: StationSettings): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'change station settings')
    if (denied) return denied
    for (const f of FUEL_TYPES) {
      if (!isPositive(money(s.rates[f]))) return fail(`Enter a selling price for ${f}.`)
      if (!isNonNegative(money(s.margins[f]))) return fail(`The dealer margin for ${f} cannot be negative.`)
    }
    if (!Number.isFinite(s.lowStockAlertPct) || s.lowStockAlertPct < 0 || s.lowStockAlertPct > 100) return fail('The low-stock alert must be between 0 and 100 %.')
    if (!isNonNegative(money(s.cashDifferenceAlertLimit))) return fail('The cash-difference alert limit cannot be negative.')
    const old = c.raw.settings
    const changedRates = FUEL_TYPES.filter((f) => Math.abs(old.rates[f] - s.rates[f]) > 0.0001)
    await c.commit([
      op.settings({ ...s, stationPhone: clean(s.stationPhone), managerContact: clean(s.managerContact) }),
      auditOp(c, 'settings.save', 'settings', 'main', changedRates.length ? `Changed rates: ${changedRates.map((f) => `${f} ${old.rates[f]} → ${s.rates[f]}`).join(', ')}` : 'Saved station settings', { before: old, after: s }),
    ])
    return ok(undefined)
  })
}

export interface OgraInput {
  newRates: FuelRates
  effectiveDate: string
  notificationNo?: string
  notes?: string
}

/** Applies a fortnightly OGRA price revision and records the stock revaluation gain / loss of every tank. */
export function applyOgraPriceChange(c: ActionCtx, i: OgraInput): Promise<Result<TariffRevisionLog>> {
  return run(async () => {
    const denied = needManager(c, 'apply OGRA price revisions')
    if (denied) return denied
    for (const f of FUEL_TYPES) if (!isPositive(money(i.newRates[f]))) return fail(`Enter the new ${f} rate.`)
    if (!clean(i.effectiveDate)) return fail('Enter the effective date.')
    const oldRates = { ...c.data.settings.rates }
    const tankSnapshots = c.data.tanks.map((t) => {
      const oldRate = oldRates[t.fuelType] || 0
      const newRate = i.newRates[t.fuelType] || oldRate
      const diff = Math.round((newRate - oldRate) * 100) / 100
      return {
        tankNo: t.tankNo, fuelType: t.fuelType, litersAtRevision: t.currentLiters, oldRate, newRate, rateDiff: diff,
        gainLossAmount: Math.round(t.currentLiters * diff),
      }
    })
    const net = tankSnapshots.reduce((a, t) => a + t.gainLossAmount, 0)
    const log: TariffRevisionLog = {
      id: newId('REV'), date: todayISO(), effectiveDate: clean(i.effectiveDate),
      notificationNo: clean(i.notificationNo) || `OGRA/NOTIF/${todayISO()}`, oldRates, newRates: { ...i.newRates }, tankSnapshots,
      netInventoryGainLoss: net, revisedBy: c.user.name, notes: clean(i.notes) || 'Fortnightly OGRA price revision applied.',
    }
    await c.commit([
      op.settings({ ...c.raw.settings, rates: { ...i.newRates } }),
      op.insert('tariff_revisions', log),
      auditOp(c, 'ogra.apply', 'tariff', log.id, `OGRA revision ${log.notificationNo}: stock ${net >= 0 ? 'gain' : 'loss'} ${fmt(Math.abs(net))}`, { oldRates, newRates: i.newRates }),
    ])
    return ok(log)
  })
}

/** Replace every record of this station with the contents of a backup (owner only). */
export function restoreBackup(c: ActionCtx, raw: RawStation): Promise<Result<{ records: number }>> {
  return run(async () => {
    const denied = needRole(c, ['owner'], 'restore a backup')
    if (denied) return denied
    if (raw.info.id !== c.siteId) return fail(`This backup belongs to ${raw.info.name} (${raw.info.id}), not to the station you are signed in to (${c.siteId}).`)
    const ops: Op[] = [...buildReplaceOps(raw), auditOp(c, 'backup.restore', 'station', c.siteId, 'Restored station data from a backup file')]
    await c.commit(ops)
    return ok({ records: ops.length })
  })
}

/** Add the records of an old browser copy / backup that are missing in the database. Nothing existing is changed. */
export function mergeBackup(c: ActionCtx, raw: RawStation): Promise<Result<void>> {
  return run(async () => {
    const denied = needManager(c, 'import old records')
    if (denied) return denied
    if (raw.info.id !== c.siteId) return fail(`These records belong to ${raw.info.name} (${raw.info.id}), not to ${c.siteId}.`)
    await c.commit([...buildMergeOps(raw), auditOp(c, 'backup.merge', 'station', c.siteId, 'Imported missing records from an old copy')])
    return ok(undefined)
  })
}
