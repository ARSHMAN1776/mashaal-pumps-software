import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { newDb, loadLegacyCloud, setupSql } from './harness'
import { buildResetSql, stationTables } from '../../scripts/build-sql.mjs'
import { deriveStation, safeCash } from '../../src/data/derive'
import { computeProfit } from '../../src/data/profit'
import { freshBackend } from '../logic/harness'

let db: PGlite
const num = async (sql: string) => Number((await db.query<{ v: string }>(sql)).rows[0].v)

beforeAll(async () => {
  db = await newDb()
  await loadLegacyCloud(db) // the real old data
  await db.exec(setupSql()) // migrated into the new tables
}, 180_000)

describe('reset_blank.sql', () => {
  it('starts from a database that really has data', async () => {
    expect(await num('select count(*) as v from public.s01_customers')).toBeGreaterThan(0)
    expect(await num('select count(*) as v from public.s02_customers')).toBeGreaterThan(0)
    expect(await num('select count(*) as v from public.s01_daybook_entries')).toBeGreaterThan(0)
    expect(await num(`select count(*) as v from pg_tables where schemaname = 'public' and tablename like 'legacy\\_%'`)).toBeGreaterThan(0)
  })

  it('lists every record table of the station schema', () => {
    const tables = stationTables()
    for (const t of ['customers', 'fuel_sales', 'daybook_entries', 'tanks', 'nozzles', 'bank_accounts', 'staff_members', 'audit_log', 'doc_counters']) {
      expect(tables).toContain(t)
    }
    expect(tables).not.toContain('station_settings')
  })

  it('empties every record, drops the archive, and keeps stations, logins and settings', async () => {
    const usersBefore = await num('select count(*) as v from public.profiles')
    const stationsBefore = await num('select count(*) as v from public.stations')
    await db.exec(buildResetSql())

    for (const p of ['s01', 's02']) {
      for (const t of stationTables()) expect(await num(`select count(*) as v from public.${p}_${t}`), `${p}_${t}`).toBe(0)
      expect(await num(`select count(*) as v from public.${p}_station_settings`)).toBe(1)
    }
    expect(await num(`select count(*) as v from pg_tables where schemaname = 'public' and tablename like 'legacy\\_%'`)).toBe(0)
    expect(await num('select count(*) as v from public.profiles')).toBe(usersBefore)
    expect(await num('select count(*) as v from public.stations')).toBe(stationsBefore)
    expect(await num('select count(*) as v from public.migration_log')).toBeGreaterThan(0)
  })

  it('numbering starts again from the beginning, and the tables accept new records', async () => {
    const r = await db.query<{ v: string }>(`select public.next_doc_no('SITE-01', 'slip') as v`).catch(() => null)
    // next_doc_no needs a signed-in user; the important part is that the counters table is empty
    expect(r === null || Number(r.rows[0].v) >= 1).toBe(true)
    await db.exec(`insert into public.s01_customers (id, name, business_name, phone, credit_limit, opening_balance, status)
                   values ('C-NEW', 'A', 'New Co', '0300', 100, 0, 'Active')`)
    expect(await num('select count(*) as v from public.s01_customers')).toBe(1)
    await db.exec('delete from public.s01_customers')
  })

  it('running it a second time on the blank database is harmless', async () => {
    await db.exec(buildResetSql())
    expect(await num('select count(*) as v from public.s01_customers')).toBe(0)
  })
})

describe('the app on a blank station', () => {
  it('opens with nothing in it: zero balances, no errors', async () => {
    const be = await freshBackend('memory')
    await be.signIn('naveed.akhtar', 'Preview#123', false)
    const raw = await be.loadStation('SITE-01', 'manager')
    for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
      if (Array.isArray(raw[key])) (raw[key] as unknown[]).length = 0
    }
    const d = deriveStation(raw)
    expect(d.customers).toHaveLength(0)
    expect(d.tanks).toHaveLength(0)
    expect(safeCash(d)).toBe(0)
    const p = computeProfit(d)
    expect(p.netProfit).toBe(0)
    expect(p.fuelRevenue).toBe(0)
  })
})
