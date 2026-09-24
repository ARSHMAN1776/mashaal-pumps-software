import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { newDb, loadLegacyCloud, setupSql, asUser } from './harness'

let db: PGlite
const summary: Record<string, number> = {}

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0]
const num = async (sql: string, params: unknown[] = []) => Number((await one<{ v: string }>(sql, params)).v)
const userId = async (username: string) =>
  (await one<{ user_id: string }>('select user_id from public.profiles where username = $1', [username])).user_id

beforeAll(async () => {
  db = await newDb()
  await loadLegacyCloud(db)
  const results = await db.exec(setupSql())
  const last = results[results.length - 1]
  for (const row of last.rows as { station: string; item: string; value: string }[]) {
    summary[`${row.station}|${row.item}`] = Number(row.value)
  }
}, 120_000)

describe('migration of the real cloud data', () => {
  it('keeps every legacy table as an archive (nothing dropped)', async () => {
    for (const t of ['legacy_stations', 'legacy_fuel_sales', 'legacy_daybook_vouchers', 'legacy_credit_fuel_slips']) {
      expect(await num(`select count(*) as v from public.${t}`)).toBeGreaterThan(0)
    }
  })

  it('SITE-01 customer balance = old 480,000 + recovered slip 27,645', async () => {
    expect(summary['SITE-01|customer receivable (Rs)']).toBe(507_645)
    const r = await one<{ opening_balance: string }>(`select opening_balance from public.s01_customers where id = 'CUST-01'`)
    expect(Number(r.opening_balance)).toBe(505_597.5)
  })

  it('SITE-01 safe cash = 500,000 opening - 2,000 advance - 3,000 expense recovered from side table', async () => {
    expect(summary['SITE-01|safe cash (Rs)']).toBe(495_000)
    expect(summary['SITE-01|daybook entries']).toBe(3)
  })

  it('rebuilds the expense and the staff advance behind the recovered vouchers', async () => {
    const e = await one<{ amount: string; category: string; voucher_no: string }>(`select * from public.s01_expenses where id = 'EXP-R-VOU-3523'`)
    expect(Number(e.amount)).toBe(3000)
    expect(e.category).toBe('Dispenser Spares & Repairs')
    const a = await one<{ amount: string; staff_id: string; status: string }>(`select * from public.s01_staff_advances where id = 'ADV-R-ADV-1790195859612'`)
    expect(Number(a.amount)).toBe(2000)
    expect(a.staff_id).toBe('STF-01')
    expect(a.status).toBe('Outstanding')
    expect(summary['SITE-01|staff advances outstanding (Rs)']).toBe(2000)
    const link = await one<{ source_type: string }>(`select source_type from public.s01_daybook_entries where id = 'DB-1790196031603'`)
    expect(link.source_type).toBe('expense')
  })

  it('SITE-02 keeps all 11 customers and its balances', async () => {
    expect(summary['SITE-02|customers']).toBe(11)
    expect(summary['SITE-02|customer receivable (Rs)']).toBe(980_000)
    expect(summary['SITE-02|safe cash (Rs)']).toBe(620_000)
    expect(summary['SITE-02|tanks']).toBe(3)
    expect(summary['SITE-02|nozzles']).toBe(6)
  })

  it('bank balances are preserved through opening balance + transactions', async () => {
    const b1 = await num(`select (b.opening_balance + coalesce(sum(case when t.type in ('Deposit','Credit Received') then t.amount else -t.amount end),0)) as v
                            from public.s01_bank_accounts b left join public.s01_bank_transactions t on t.bank_id = b.id
                           where b.id = 'BANK-01' group by b.opening_balance`)
    expect(b1).toBe(4_280_500)
    const b2 = await num(`select (b.opening_balance + coalesce(sum(case when t.type in ('Deposit','Credit Received') then t.amount else -t.amount end),0)) as v
                            from public.s02_bank_accounts b left join public.s02_bank_transactions t on t.bank_id = b.id
                           where b.id = 'BANK-S2-01' group by b.opening_balance`)
    expect(b2).toBe(5_910_000)
  })

  it('OMC invoices keep their paid amounts', async () => {
    const r = await one<{ paid: string; total: string }>(
      `select i.opening_paid_amount + coalesce((select sum(amount) from public.s01_omc_payments p where p.invoice_no = i.invoice_no),0) as paid, i.total_amount as total
         from public.s01_omc_invoices i where i.invoice_no = 'TP-PK-98124'`)
    expect(Number(r.paid)).toBe(6_640_500)
    expect(Number(r.total)).toBe(6_640_500)
    expect(await num(`select count(*) as v from public.s01_omc_invoices`)).toBe(2)
  })

  it('document counters continue after the highest existing number', async () => {
    const r = await one<{ last_value: string }>(`select last_value from public.s01_doc_counters where kind = 'slip'`)
    expect(Number(r.last_value)).toBe(9905)
  })

  it('is safe to run twice (no duplicates)', async () => {
    const before = await num(`select count(*) as v from public.s01_daybook_entries`)
    await db.exec(setupSql())
    expect(await num(`select count(*) as v from public.s01_daybook_entries`)).toBe(before)
    expect(await num(`select count(*) as v from public.profiles`)).toBe(9)
    expect(await num(`select count(*) as v from public.s02_customers`)).toBe(11)
  })
})

describe('the two stations are physically separate', () => {
  it('SITE-01 and SITE-02 records live in different tables', async () => {
    const ids1 = (await db.query<{ id: string }>('select id from public.s01_customers')).rows.map((r) => r.id)
    const ids2 = (await db.query<{ id: string }>('select id from public.s02_customers')).rows.map((r) => r.id)
    expect(ids1).toEqual(['CUST-01'])
    expect(ids2).toContain('CUST-S2-01')
    expect(ids1.filter((i) => ids2.includes(i))).toEqual([])
    const tables = (await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename like 's0_\\_%' order by 1`)).rows
    expect(tables.some((t) => t.tablename === 's01_customers')).toBe(true)
    expect(tables.some((t) => t.tablename === 's02_customers')).toBe(true)
  })
})

describe('access rules (RLS)', () => {
  it('anonymous users can read only the station list', async () => {
    await asUser(db, null, async () => {
      const st = await db.query('select site_id from public.stations')
      expect(st.rows.length).toBe(2)
      await expect(db.query('select * from public.s01_customers')).rejects.toThrow(/permission denied/i)
      await expect(db.query('select * from public.legacy_stations')).rejects.toThrow(/permission denied/i)
    })
  })

  it('a SITE-01 manager sees SITE-01 data but nothing of SITE-02', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      expect((await db.query('select id from public.s01_customers')).rows.length).toBe(1)
      expect((await db.query('select id from public.s02_customers')).rows.length).toBe(0)
      await expect(db.query(`select public.apply_ops('SITE-02', '[{"t":"customers","a":"insert","row":{"id":"X","name":"x","business_name":"x"}}]'::jsonb)`))
        .rejects.toThrow(/row-level security/i)
    })
  })

  it('a cashier can insert a daybook entry but cannot edit/delete or see banking', async () => {
    const uid = await userId('tariq.cashier')
    await asUser(db, uid, async () => {
      await db.query(`select public.apply_ops('SITE-01', '[{"t":"daybook_entries","a":"insert","row":{"id":"T-1","date":"2026-09-24","particulars":"t","category":"Lube Sale","cash_in":10}}]'::jsonb)`)
      await expect(db.query(`select public.apply_ops('SITE-01', '[{"t":"customers","a":"insert","row":{"id":"C-9","name":"n","business_name":"b"}}]'::jsonb)`))
        .rejects.toThrow(/row-level security/i)
      await expect(db.query(`select public.apply_ops('SITE-01', '[{"t":"daybook_entries","a":"update","row":{"id":"T-1","cash_in":99999}}]'::jsonb)`))
        .rejects.toThrow(/not found|permission/i)
      expect((await db.query('select * from public.s01_bank_transactions')).rows.length).toBe(0)
      expect((await db.query('select * from public.s01_staff_members')).rows.length).toBe(0)
      expect((await db.query('select * from public.s01_customers')).rows.length).toBe(1)
    })
    await db.query(`delete from public.s01_daybook_entries where id = 'T-1'`)
  })

  it('a SITE-01 cashier cannot use SITE-02 at all', async () => {
    const uid = await userId('tariq.cashier')
    await asUser(db, uid, async () => {
      expect((await db.query('select * from public.s02_customers')).rows.length).toBe(0)
      await expect(db.query(`select public.next_doc_no('SITE-02', 'slip')`)).rejects.toThrow(/access/i)
    })
  })
})

describe('apply_ops (atomic multi-table write)', () => {
  it('rolls everything back when one op fails', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      const ops = [
        { t: 'customers', a: 'insert', row: { id: 'C-ATOM', name: 'A', business_name: 'A', credit_limit: 1000 } },
        { t: 'credit_slips', a: 'insert', row: { id: 'S-BAD', slip_no: 'SLIP-1', date: '2026-09-24', customer_id: 'NO-SUCH', fuel_type: 'HSD Diesel', liters: 1, rate: 1, total_amount: 1 } },
      ]
      await expect(db.query('select public.apply_ops($1, $2::jsonb)', ['SITE-01', JSON.stringify(ops)])).rejects.toThrow(/foreign key/i)
    })
    expect(await num(`select count(*) as v from public.s01_customers where id = 'C-ATOM'`)).toBe(0)
  })

  it('insert / update / delete round trip returns server-assigned columns', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      const ins = await db.query<{ apply_ops: { t: string; row: Record<string, unknown> }[] }>(
        'select public.apply_ops($1, $2::jsonb) as apply_ops',
        ['SITE-01', JSON.stringify([{ t: 'customers', a: 'insert', row: { id: 'C-RT', name: 'Rt', business_name: 'Round Trip', credit_limit: 5000, vehicle_numbers: ['AB-1', 'CD-2'] } }])])
      expect(ins.rows[0].apply_ops[0].row.created_at).toBeTruthy()
      await db.query('select public.apply_ops($1, $2::jsonb)', ['SITE-01', JSON.stringify([{ t: 'customers', a: 'update', row: { id: 'C-RT', credit_limit: 9000, status: 'Hold' } }])])
      const c = await one<{ credit_limit: string; status: string; vehicle_numbers: string[] }>(`select * from public.s01_customers where id = 'C-RT'`)
      expect(Number(c.credit_limit)).toBe(9000)
      expect(c.status).toBe('Hold')
      expect(c.vehicle_numbers).toEqual(['AB-1', 'CD-2'])
      await db.query('select public.apply_ops($1, $2::jsonb)', ['SITE-01', JSON.stringify([{ t: 'customers', a: 'delete', row: { id: 'C-RT' } }])])
    })
    expect(await num(`select count(*) as v from public.s01_customers where id = 'C-RT'`)).toBe(0)
  })

  it('refuses to delete a customer that has ledger history (foreign key)', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      await expect(db.query('select public.apply_ops($1, $2::jsonb)', ['SITE-01', JSON.stringify([{ t: 'customers', a: 'delete', row: { id: 'CUST-01' } }])]))
        .rejects.toThrow(/foreign key/i)
    })
  })

  it('daybook entries get an increasing seq and next_doc_no never repeats', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      const a = (await db.query<{ v: string }>(`select public.next_doc_no('SITE-01', 'receipt') as v`)).rows[0].v
      const b = (await db.query<{ v: string }>(`select public.next_doc_no('SITE-01', 'receipt') as v`)).rows[0].v
      expect(Number(b)).toBe(Number(a) + 1)
      expect(Number(a)).toBeGreaterThan(1201)
    })
  })

  it('rejects tables that are not writable', async () => {
    const uid = await userId('naveed.akhtar')
    await asUser(db, uid, async () => {
      await expect(db.query(`select public.apply_ops('SITE-01', '[{"t":"profiles","a":"delete","row":{"id":"x"}}]'::jsonb)`)).rejects.toThrow(/not writable/i)
    })
  })
})

describe('user administration', () => {
  it('only an owner can list or create users, and sites are limited to the ones they own', async () => {
    const mgr = await userId('naveed.akhtar')
    await asUser(db, mgr, async () => {
      await expect(db.query('select * from public.admin_list_users()')).rejects.toThrow(/owner/i)
    })
    const parco = await userId('owner.parco')
    await asUser(db, parco, async () => {
      const list = await db.query<{ username: string }>('select username from public.admin_list_users()')
      const names = list.rows.map((r) => r.username)
      expect(names).toContain('naveed.akhtar')
      expect(names).not.toContain('kamran.cashier')
      await expect(db.query(`select public.admin_upsert_user('new.user', 'longpassword1', 'New User', 'cashier', '', array['SITE-02'])`))
        .rejects.toThrow(/not an owner of station/i)
      await db.query(`select public.admin_upsert_user('new.user', 'longpassword1', 'New User', 'cashier', '0300', array['SITE-01'])`)
    })
    const p = await one<{ must_change_password: boolean; role: string }>(`select * from public.profiles where username = 'new.user'`)
    expect(p.must_change_password).toBe(true)
    expect(p.role).toBe('cashier')
    expect(await num(`select count(*) as v from auth.users where email = 'new.user@mashaal.internal'`)).toBe(1)
  })

  it('deactivating a user removes all access', async () => {
    const owner = await userId('owner.parco')
    await asUser(db, owner, async () => {
      await db.query(`select public.admin_upsert_user('new.user', null, 'New User', 'cashier', '0300', array['SITE-01'], false)`)
    })
    const uid = await userId('new.user')
    await asUser(db, uid, async () => {
      expect((await db.query('select * from public.s01_customers')).rows.length).toBe(0)
    })
  })
})
