import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { newDb, setupSql } from './harness'
import { buildUpdateSql } from '../../scripts/build-sql.mjs'

const NEW_COLUMNS: [string, string][] = [
  ['customer_recoveries', 'bank_pending'],
  ['staff_salary_payments', 'deduction'],
  ['staff_salary_payments', 'absent_days'],
  ['staff_salary_payments', 'deduction_note'],
  ['supplier_transactions', 'source_type'],
  ['supplier_transactions', 'source_id'],
]

let db: PGlite
const has = async (table: string, col: string) =>
  (await db.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, col],
  )).rows.length === 1

beforeAll(async () => {
  db = await newDb()
  await db.exec(setupSql())
}, 120_000)

describe('update.sql upgrades a database that was set up before these columns existed', () => {
  it('a fresh setup already has the new columns', async () => {
    for (const p of ['s01', 's02']) for (const [t, c] of NEW_COLUMNS) expect(await has(`${p}_${t}`, c)).toBe(true)
  })

  it('adds the columns to an old-shaped database without touching its rows, and can run twice', async () => {
    // put the database back into its old shape, with a row in each affected table
    await db.exec(`
      insert into public.s01_customers (id, name, business_name, phone, credit_limit, opening_balance, status)
        values ('C1', 'A', 'A Co', '0300', 1000, 0, 'Active');
      insert into public.s01_customer_recoveries (id, receipt_no, date, customer_id, payment_method, amount)
        values ('R1', 'RCP-1', '2026-01-01', 'C1', 'Cash', 500);
      insert into public.s01_staff_members (id, name, role, monthly_salary) values ('S1', 'Staff', 'Pump Attendant', 30000);
      insert into public.s01_staff_salary_payments (id, staff_id, period, date, gross_salary, net_paid)
        values ('P1', 'S1', '2026-01', '2026-01-31', 30000, 30000);
    `)
    for (const p of ['s01', 's02']) for (const [t, c] of NEW_COLUMNS) await db.exec(`alter table public.${p}_${t} drop column ${c}`)
    for (const p of ['s01', 's02']) for (const [t, c] of NEW_COLUMNS) expect(await has(`${p}_${t}`, c)).toBe(false)

    const update = buildUpdateSql()
    await db.exec(update)
    await db.exec(update) // running it again is harmless
    for (const p of ['s01', 's02']) for (const [t, c] of NEW_COLUMNS) expect(await has(`${p}_${t}`, c)).toBe(true)

    const rec = (await db.query<{ bank_pending: boolean; amount: string }>(`select bank_pending, amount from public.s01_customer_recoveries where id = 'R1'`)).rows[0]
    expect(rec.bank_pending).toBe(false) // existing receipts are not "waiting"
    expect(Number(rec.amount)).toBe(500)
    const sal = (await db.query<{ deduction: string; absent_days: string; net_paid: string }>(`select deduction, absent_days, net_paid from public.s01_staff_salary_payments where id = 'P1'`)).rows[0]
    expect(Number(sal.deduction)).toBe(0)
    expect(Number(sal.absent_days)).toBe(0)
    expect(Number(sal.net_paid)).toBe(30000)
  })
})
