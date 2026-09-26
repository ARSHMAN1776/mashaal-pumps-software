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

    // the save function is refreshed too: it refuses an edit made on an out-of-date screen
    const src = (await db.query<{ prosrc: string }>(`select prosrc from pg_proc where proname = 'apply_ops'`)).rows[0].prosrc
    expect(src).toContain('P0409')

    const rec =(await db.query<{ bank_pending: boolean; amount: string }>(`select bank_pending, amount from public.s01_customer_recoveries where id = 'R1'`)).rows[0]
    expect(rec.bank_pending).toBe(false) // existing receipts are not "waiting"
    expect(Number(rec.amount)).toBe(500)
    const sal = (await db.query<{ deduction: string; absent_days: string; net_paid: string }>(`select deduction, absent_days, net_paid from public.s01_staff_salary_payments where id = 'P1'`)).rows[0]
    expect(Number(sal.deduction)).toBe(0)
    expect(Number(sal.absent_days)).toBe(0)
    expect(Number(sal.net_paid)).toBe(30000)
  })
})

describe('update.sql lets a bank line be an "Online Transfer"', () => {
  const OLD_LIST = "'Deposit', 'Credit Received', 'Withdrawal', 'OMC Online Transfer', 'Bank Fee', 'Owner Transfer', 'Vendor Payment', 'Expense Payment'"
  const typeRules = async (table: string) =>
    (await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%Credit Received%'`, [`public.${table}`])).rows
  const tryInsert = async (p: string, id: string, type: string) => {
    try {
      await db.exec(`insert into public.${p}_bank_transactions (id, bank_id, date, type, amount, description) values ('${id}', 'B1', '2026-09-01', '${type}', 250, 't')`)
      return true
    } catch { return false }
  }

  it('a fresh setup already accepts it', async () => {
    await db.exec(`insert into public.s01_bank_accounts (id, bank_name, account_number) values ('B1', 'HBL', '1') on conflict do nothing;
                   insert into public.s02_bank_accounts (id, bank_name, account_number) values ('B1', 'PSO Bank', '2') on conflict do nothing;`)
    for (const p of ['s01', 's02']) expect(await tryInsert(p, `${p}-fresh`, 'Online Transfer')).toBe(true)
    await db.exec("delete from public.s01_bank_transactions where id = 's01-fresh'; delete from public.s02_bank_transactions where id = 's02-fresh'")
  })

  it('an old database refuses it, and after update.sql it is accepted; rows are untouched and it can run twice', async () => {
    // put both stations back to the old rule (s02 with an odd constraint name, to prove the update finds it by what it says)
    await db.exec(`
      alter table public.s01_bank_transactions drop constraint s01_bank_transactions_type_check;
      alter table public.s01_bank_transactions add constraint s01_bank_transactions_type_check check (type in (${OLD_LIST}));
      alter table public.s02_bank_transactions drop constraint s02_bank_transactions_type_check;
      alter table public.s02_bank_transactions add constraint some_older_name check (type in (${OLD_LIST}));
      insert into public.s01_bank_transactions (id, bank_id, date, type, amount, description) values ('OLD1', 'B1', '2026-09-01', 'Deposit', 500000, 'old deposit'), ('OLD2', 'B1', '2026-09-02', 'Credit Received', 1200, 'old cheque');
      insert into public.s02_bank_transactions (id, bank_id, date, type, amount, description) values ('OLD3', 'B1', '2026-09-03', 'Withdrawal', 750, 'old withdrawal');
    `)
    for (const p of ['s01', 's02']) expect(await tryInsert(p, `${p}-x`, 'Online Transfer')).toBe(false)

    const update = buildUpdateSql()
    await db.exec(update)
    await db.exec(update) // running it again is harmless

    for (const p of ['s01', 's02']) {
      expect(await tryInsert(p, `${p}-new`, 'Online Transfer')).toBe(true)
      expect(await tryInsert(p, `${p}-bad`, 'Made Up Type')).toBe(false) // the rule still protects the table
      expect(await tryInsert(p, `${p}-old`, 'Credit Received')).toBe(true) // and every old type still works
      const rules = await typeRules(`${p}_bank_transactions`)
      expect(rules).toHaveLength(1) // exactly one type rule, not two
      expect(rules[0].def).toContain('Online Transfer')
    }
    // the old rows are exactly as they were
    const rows = (await db.query<{ id: string; type: string; amount: string; description: string }>(`select id, type, amount, description from public.s01_bank_transactions where id in ('OLD1', 'OLD2') order by id`)).rows
    expect(rows.map((r) => [r.id, r.type, Number(r.amount), r.description])).toEqual([['OLD1', 'Deposit', 500000, 'old deposit'], ['OLD2', 'Credit Received', 1200, 'old cheque']])
    const old3 = (await db.query<{ type: string; amount: string }>(`select type, amount from public.s02_bank_transactions where id = 'OLD3'`)).rows[0]
    expect([old3.type, Number(old3.amount)]).toEqual(['Withdrawal', 750])
  })
})
