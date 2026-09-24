import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { newDb, setupSql } from './harness'

let db: PGlite
const num = async (sql: string) => Number((await db.query<{ v: string }>(sql)).rows[0].v)

beforeAll(async () => {
  db = await newDb()
  await db.exec(setupSql())
}, 180_000)

describe('running setup.sql again on a system that is in use', () => {
  it('keeps every record, and does not bring back an account that was deleted', async () => {
    await db.exec(`insert into public.s01_customers (id, name, business_name, phone, credit_limit, opening_balance, status)
                   values ('C1', 'A', 'Keep Me Co', '0300', 1000, 250, 'Active')`)
    await db.exec(`delete from public.profile_stations where user_id = (select user_id from public.profiles where username = 'station.manager')`)
    await db.exec(`delete from public.profiles where username = 'station.manager'`)
    const users = await num('select count(*) as v from public.profiles')
    expect(users).toBe(8)

    await db.exec(setupSql()) // an accidental second run

    expect(await num(`select count(*) as v from public.profiles where username = 'station.manager'`)).toBe(0)
    expect(await num('select count(*) as v from public.profiles')).toBe(users)
    expect(await num(`select opening_balance as v from public.s01_customers where id = 'C1'`)).toBe(250)
  })

  it('a station taken away from someone stays taken away', async () => {
    await db.exec(`delete from public.profile_stations where user_id = (select user_id from public.profiles where username = 'tariq.cashier') and site_id = 'SITE-01'`)
    await db.exec(setupSql())
    expect(await num(`select count(*) as v from public.profile_stations ps join public.profiles p on p.user_id = ps.user_id where p.username = 'tariq.cashier'`)).toBe(0)
  })
})
