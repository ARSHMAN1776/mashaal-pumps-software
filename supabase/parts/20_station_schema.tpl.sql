-- =========================================================================
-- STATION TABLES for {site}  (table prefix "{p}_")
-- -------------------------------------------------------------------------
-- Generated from supabase/parts/20_station_schema.tpl.sql — one physically
-- separate set of tables per station. Nothing here is shared with any other
-- station.
--
-- Design rules
--   * Only FACTS are stored (opening balances + transactions). Running balances
--     (customer due, safe cash, bank balance, tank level, lube stock, supplier
--     due, staff advances, OMC paid amount) are derived by the app from those
--     facts, so editing/deleting a transaction can never leave a stale stored
--     total behind.
--   * Rows with history use ON DELETE RESTRICT foreign keys, so a customer,
--     bank account, supplier ... that has transactions cannot be hard-deleted.
-- =========================================================================

-- ---- settings (single row, id = 'main') ---------------------------------
create table if not exists public.{p}_station_settings (
  id                          text primary key default 'main',
  rate_pmg                    numeric not null default 0 check (rate_pmg >= 0),
  rate_hsd                    numeric not null default 0 check (rate_hsd >= 0),
  rate_octane                 numeric not null default 0 check (rate_octane >= 0),
  margin_pmg                  numeric not null default 8.64 check (margin_pmg >= 0),
  margin_hsd                  numeric not null default 8.64 check (margin_hsd >= 0),
  margin_octane               numeric not null default 8.64 check (margin_octane >= 0),
  station_phone               text not null default '',
  manager_contact             text not null default '',
  receipt_header              text not null default '',
  receipt_footer              text not null default '',
  low_stock_alert_pct         numeric not null default 20 check (low_stock_alert_pct between 0 and 100),
  cash_difference_alert_limit numeric not null default 500 check (cash_difference_alert_limit >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid default auth.uid()
);
insert into public.{p}_station_settings (id) values ('main') on conflict (id) do nothing;

-- ---- tanks & nozzles ----------------------------------------------------
create table if not exists public.{p}_tanks (
  id                 text primary key,
  tank_no            int  not null unique check (tank_no > 0),
  fuel_type          text not null check (fuel_type in ('PMG Super', 'HSD Diesel', 'Hi-Octane')),
  capacity_liters    numeric not null check (capacity_liters > 0),
  min_reserve_liters numeric not null default 0 check (min_reserve_liters >= 0),
  initial_liters     numeric not null default 0 check (initial_liters >= 0),
  initial_dip_mm     numeric not null default 0 check (initial_dip_mm >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid()
);

create table if not exists public.{p}_nozzles (
  id             text primary key,
  tank_id        text not null references public.{p}_tanks(id) on delete restrict,
  dispenser_no   int  not null check (dispenser_no > 0),
  nozzle_no      int  not null check (nozzle_no > 0),
  initial_meter  numeric not null default 0 check (initial_meter >= 0),
  testing_liters numeric not null default 0 check (testing_liters >= 0),
  assigned_staff text not null default '',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  unique (dispenser_no, nozzle_no)
);

-- ---- forecourt sales & shifts ------------------------------------------
create table if not exists public.{p}_fuel_sales (
  id             text primary key,
  date           date not null,
  shift_name     text not null default 'Morning',
  shift_id       text,
  nozzle_id      text not null,
  dispenser_no   int  not null default 0,
  nozzle_no      int  not null default 0,
  fuel_type      text not null,
  opening_meter  numeric not null,
  closing_meter  numeric not null,
  testing_liters numeric not null default 0,
  net_liters     numeric not null,
  rate_per_liter numeric not null,
  total_amount   numeric not null,
  cashier_name   text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  check (closing_meter >= opening_meter),
  check (net_liters >= 0)
);

create table if not exists public.{p}_shifts (
  id                text primary key,
  shift_name        text not null,
  date              date not null,
  incharge          text not null default '',
  status            text not null default 'Open',
  start_time        text not null default '',
  end_time          text not null default '',
  total_fuel_sales  numeric not null default 0,
  total_lube_sales  numeric not null default 0,
  credit_sales      numeric not null default 0,
  digital_payments  numeric not null default 0,
  shift_expenses    numeric not null default 0,
  credit_recoveries numeric not null default 0,
  expected_cash     numeric not null default 0,
  actual_cash       numeric not null default 0,
  shortage_excess   numeric not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid()
);

create table if not exists public.{p}_tank_dips (
  id                      text primary key,
  date                    date not null,
  tank_id                 text not null references public.{p}_tanks(id) on delete restrict,
  tank_no                 int  not null,
  fuel_type               text not null,
  morning_dip_mm          numeric not null default 0,
  morning_liters          numeric not null default 0,
  decanted_liters         numeric not null default 0,
  dispensed_liters        numeric not null default 0,
  book_stock_liters       numeric not null default 0,
  closing_dip_mm          numeric not null default 0,
  closing_physical_liters numeric not null check (closing_physical_liters >= 0),
  variance_liters         numeric not null default 0,
  water_dip_mm            numeric not null default 0,
  inspector               text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid default auth.uid()
);

-- ---- OMC (oil company) purchases ---------------------------------------
create table if not exists public.{p}_omc_invoices (
  id                     text primary key,
  invoice_no             text not null unique,
  date                   date not null,
  brand                  text not null default '',
  tank_lorry_no          text not null default '',
  driver_name            text not null default '',
  fuel_type              text not null,
  tank_id                text,
  invoice_volume_liters  numeric not null default 0,
  decanted_volume_liters numeric not null default 0,
  rate_per_liter         numeric not null default 0,
  freight_amount         numeric not null default 0,
  total_amount           numeric not null check (total_amount >= 0),
  opening_paid_amount    numeric not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid()
);

create table if not exists public.{p}_omc_payments (
  id              text primary key,
  date            date not null,
  invoice_no      text not null,
  payment_method  text not null check (payment_method in ('Bank Transfer', 'Pay Order', 'Cheque', 'Cash')),
  bank_name       text not null default '',
  bank_account_id text,
  reference_no    text not null default '',
  amount          numeric not null check (amount > 0),
  recorded_by     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

-- ---- banking ------------------------------------------------------------
create table if not exists public.{p}_bank_accounts (
  id              text primary key,
  bank_name       text not null,
  account_title   text not null default '',
  account_number  text not null default '',
  branch          text not null default '',
  opening_balance numeric not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

create table if not exists public.{p}_bank_transactions (
  id              text primary key,
  bank_id         text not null references public.{p}_bank_accounts(id) on delete restrict,
  date            date not null,
  type            text not null check (type in (
                    'Deposit', 'Credit Received',
                    'Withdrawal', 'OMC Online Transfer', 'Bank Fee', 'Owner Transfer',
                    'Vendor Payment', 'Expense Payment')),
  amount          numeric not null check (amount > 0),
  deposit_slip_no text,
  description     text not null default '',
  source_type     text,
  source_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

create table if not exists public.{p}_owner_transfers (
  id             text primary key,
  date           date not null,
  amount         numeric not null check (amount > 0),
  bank_id        text not null,
  bank_name      text not null default '',
  account_title  text not null default '',
  account_number text not null default '',
  reference_no   text not null default '',
  status         text not null default 'Completed' check (status in ('Completed', 'Pending')),
  notes          text,
  transferred_by text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);

-- ---- cash daybook -------------------------------------------------------
create table if not exists public.{p}_daybook_entries (
  id           text primary key,
  seq          bigint generated always as identity,
  date         date not null,
  time         text not null default '',
  particulars  text not null,
  category     text not null,
  cash_in      numeric not null default 0 check (cash_in >= 0),
  cash_out     numeric not null default 0 check (cash_out >= 0),
  reference_no text,
  handled_by   text not null default '',
  source_type  text,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

-- ---- customers (fleet credit accounts) ---------------------------------
create table if not exists public.{p}_customers (
  id              text primary key,
  name            text not null,
  business_name   text not null,
  phone           text not null default '',
  vehicle_numbers text[] not null default '{}',
  credit_limit    numeric not null default 0 check (credit_limit >= 0),
  opening_balance numeric not null default 0,
  status          text not null default 'Active' check (status in ('Active', 'Hold', 'Archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

create table if not exists public.{p}_credit_slips (
  id            text primary key,
  slip_no       text not null,
  date          date not null,
  customer_id   text not null references public.{p}_customers(id) on delete restrict,
  customer_name text not null default '',
  vehicle_no    text not null default '',
  driver_name   text not null default '',
  fuel_type     text not null,
  liters        numeric not null check (liters > 0),
  rate          numeric not null check (rate >= 0),
  total_amount  numeric not null check (total_amount >= 0),
  authorized_by text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create table if not exists public.{p}_customer_recoveries (
  id              text primary key,
  receipt_no      text not null,
  date            date not null,
  customer_id     text not null references public.{p}_customers(id) on delete restrict,
  customer_name   text not null default '',
  payment_method  text not null check (payment_method in ('Cash', 'Cheque', 'Online Transfer')),
  amount          numeric not null check (amount > 0),
  reference_no    text not null default '',
  received_by     text not null default '',
  bank_account_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

-- manual ledger corrections: Debit = customer owes more, Credit = customer owes less
create table if not exists public.{p}_customer_adjustments (
  id           text primary key,
  date         date not null,
  customer_id  text not null references public.{p}_customers(id) on delete restrict,
  kind         text not null check (kind in ('Debit', 'Credit')),
  amount       numeric not null check (amount > 0),
  reason       text not null default '',
  reference_no text not null default '',
  recorded_by  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

-- ---- expenses -----------------------------------------------------------
create table if not exists public.{p}_expenses (
  id              text primary key,
  voucher_no      text not null,
  date            date not null,
  category        text not null,
  description     text not null default '',
  payee           text not null default '',
  amount          numeric not null check (amount > 0),
  payment_mode    text not null default 'Cash' check (payment_mode in ('Cash', 'Bank')),
  approved_by     text not null default '',
  bank_account_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

-- ---- staff & payroll ----------------------------------------------------
create table if not exists public.{p}_staff_members (
  id                  text primary key,
  name                text not null,
  role                text not null,
  phone               text not null default '',
  monthly_salary      numeric not null default 0 check (monthly_salary >= 0),
  daily_advance_limit numeric not null default 0 check (daily_advance_limit >= 0),
  joining_date        date,
  status              text not null default 'On Duty' check (status in ('On Duty', 'Off Duty', 'On Leave')),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid()
);

create table if not exists public.{p}_staff_advances (
  id            text primary key,
  staff_id      text not null references public.{p}_staff_members(id) on delete restrict,
  date          date not null,
  amount        numeric not null check (amount > 0),
  reason        text not null default '',
  status        text not null default 'Outstanding' check (status in ('Outstanding', 'Settled')),
  settled_on    date,
  settlement_id text,
  recorded_by   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create table if not exists public.{p}_staff_salary_payments (
  id                text primary key,
  staff_id          text not null references public.{p}_staff_members(id) on delete restrict,
  period            text not null,
  date              date not null,
  gross_salary      numeric not null default 0,
  advances_deducted numeric not null default 0,
  net_paid          numeric not null default 0,
  paid_by           text not null default '',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid()
);

-- ---- lubricants ---------------------------------------------------------
create table if not exists public.{p}_lubricant_products (
  id              text primary key,
  name            text not null,
  brand           text not null default '',
  grade           text not null default '',
  pack_size       text not null default '',
  opening_stock   int not null default 0 check (opening_stock >= 0),
  min_stock_alert int not null default 0 check (min_stock_alert >= 0),
  cost_price      numeric not null default 0 check (cost_price >= 0),
  sale_price      numeric not null default 0 check (sale_price >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

create table if not exists public.{p}_lubricant_movements (
  id           text primary key,
  product_id   text not null references public.{p}_lubricant_products(id) on delete restrict,
  date         date not null,
  type         text not null check (type in ('Sale', 'Restock', 'Adjustment In', 'Adjustment Out')),
  quantity     int  not null check (quantity > 0),
  unit_price   numeric not null default 0,
  total_amount numeric not null default 0,
  counterparty text not null default '',
  reference_no text not null default '',
  recorded_by  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

-- ---- suppliers ----------------------------------------------------------
create table if not exists public.{p}_suppliers (
  id              text primary key,
  name            text not null,
  company         text not null default '',
  category        text not null default '',
  phone           text not null default '',
  opening_balance numeric not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

create table if not exists public.{p}_supplier_transactions (
  id              text primary key,
  supplier_id     text not null references public.{p}_suppliers(id) on delete restrict,
  date            date not null,
  type            text not null check (type in ('Bill', 'Payment')),
  amount          numeric not null check (amount > 0),
  reference_no    text not null default '',
  note            text not null default '',
  payment_source  text check (payment_source in ('Cash', 'Bank')),
  bank_account_id text,
  recorded_by     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

-- ---- OGRA tariff revisions ---------------------------------------------
create table if not exists public.{p}_tariff_revisions (
  id                      text primary key,
  date                    date not null,
  effective_date          text not null default '',
  notification_no         text not null default '',
  old_rates               jsonb not null default '{}'::jsonb,
  new_rates               jsonb not null default '{}'::jsonb,
  tank_snapshots          jsonb not null default '[]'::jsonb,
  net_inventory_gain_loss numeric not null default 0,
  revised_by              text not null default '',
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid default auth.uid()
);

-- ---- audit trail --------------------------------------------------------
create table if not exists public.{p}_audit_log (
  id         text primary key default gen_random_uuid()::text,
  at         timestamptz not null default now(),
  actor      text not null default '',
  action     text not null,
  entity     text not null default '',
  entity_id  text not null default '',
  summary    text not null default '',
  details    jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid()
);

-- ---- document number counters (race-free slip / receipt / voucher #) ----
create table if not exists public.{p}_doc_counters (
  kind       text primary key,
  last_value bigint not null default 0
);

-- ---- columns added after the first release (each line is safe to run again) --
-- UPGRADES-BEGIN
alter table public.{p}_customer_recoveries   add column if not exists bank_pending   boolean not null default false;
alter table public.{p}_staff_salary_payments add column if not exists deduction      numeric not null default 0;
alter table public.{p}_staff_salary_payments add column if not exists absent_days    numeric not null default 0;
alter table public.{p}_staff_salary_payments add column if not exists deduction_note text;
alter table public.{p}_supplier_transactions add column if not exists source_type    text;
alter table public.{p}_supplier_transactions add column if not exists source_id      text;
-- UPGRADES-END

-- ---- indexes ------------------------------------------------------------
create index if not exists {p}_fuel_sales_date_idx     on public.{p}_fuel_sales (date);
create index if not exists {p}_fuel_sales_nozzle_idx   on public.{p}_fuel_sales (nozzle_id);
create index if not exists {p}_tank_dips_tank_idx      on public.{p}_tank_dips (tank_id, date);
create index if not exists {p}_daybook_date_seq_idx    on public.{p}_daybook_entries (date, seq);
create index if not exists {p}_daybook_source_idx      on public.{p}_daybook_entries (source_type, source_id);
create index if not exists {p}_credit_slips_cust_idx   on public.{p}_credit_slips (customer_id, date);
create index if not exists {p}_recoveries_cust_idx     on public.{p}_customer_recoveries (customer_id, date);
create index if not exists {p}_adjustments_cust_idx    on public.{p}_customer_adjustments (customer_id, date);
create index if not exists {p}_bank_tx_bank_idx        on public.{p}_bank_transactions (bank_id, date);
create index if not exists {p}_bank_tx_source_idx      on public.{p}_bank_transactions (source_type, source_id);
create index if not exists {p}_expenses_date_idx       on public.{p}_expenses (date);
create index if not exists {p}_lube_mov_product_idx    on public.{p}_lubricant_movements (product_id, date);
create index if not exists {p}_supplier_tx_supp_idx    on public.{p}_supplier_transactions (supplier_id, date);
create index if not exists {p}_staff_adv_staff_idx     on public.{p}_staff_advances (staff_id);
create index if not exists {p}_omc_payments_inv_idx    on public.{p}_omc_payments (invoice_no);
create index if not exists {p}_audit_at_idx            on public.{p}_audit_log (at desc);

-- ---- updated_at triggers ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    '{p}_station_settings', '{p}_tanks', '{p}_nozzles', '{p}_fuel_sales', '{p}_shifts', '{p}_tank_dips',
    '{p}_omc_invoices', '{p}_omc_payments', '{p}_bank_accounts', '{p}_bank_transactions', '{p}_owner_transfers',
    '{p}_daybook_entries', '{p}_customers', '{p}_credit_slips', '{p}_customer_recoveries', '{p}_customer_adjustments',
    '{p}_expenses', '{p}_staff_members', '{p}_staff_advances', '{p}_staff_salary_payments',
    '{p}_lubricant_products', '{p}_lubricant_movements', '{p}_suppliers', '{p}_supplier_transactions',
    '{p}_tariff_revisions'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- =========================================================================
-- ROW LEVEL SECURITY for {site}
--   owner / manager : read + write everything of this station
--   cashier         : read forecourt reference data; INSERT operational records;
--                     cannot edit/delete, cannot see banking, payroll, suppliers, OMC
--   anonymous       : nothing
-- =========================================================================
do $$
declare
  t   text;
  pol record;
  ops_tables text[] := array[
    '{p}_fuel_sales', '{p}_tank_dips', '{p}_daybook_entries', '{p}_credit_slips',
    '{p}_customer_recoveries', '{p}_expenses', '{p}_lubricant_movements'
  ];
  ref_tables text[] := array[
    '{p}_station_settings', '{p}_tanks', '{p}_nozzles', '{p}_customers', '{p}_customer_adjustments',
    '{p}_lubricant_products', '{p}_bank_accounts', '{p}_shifts'
  ];
  mgr_tables text[] := array[
    '{p}_omc_invoices', '{p}_omc_payments', '{p}_bank_transactions', '{p}_owner_transfers',
    '{p}_staff_members', '{p}_staff_advances', '{p}_staff_salary_payments',
    '{p}_suppliers', '{p}_supplier_transactions', '{p}_tariff_revisions'
  ];
begin
  foreach t in array ops_tables || ref_tables || mgr_tables || array['{p}_audit_log', '{p}_doc_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;

  foreach t in array ops_tables loop
    execute format('create policy p_select on public.%I for select to authenticated using (public.has_site_access({site_q}))', t);
    execute format('create policy p_insert on public.%I for insert to authenticated with check (public.has_site_access({site_q}))', t);
    execute format('create policy p_update on public.%I for update to authenticated using (public.is_site_manager({site_q})) with check (public.is_site_manager({site_q}))', t);
    execute format('create policy p_delete on public.%I for delete to authenticated using (public.is_site_manager({site_q}))', t);
  end loop;

  foreach t in array ref_tables loop
    execute format('create policy p_select on public.%I for select to authenticated using (public.has_site_access({site_q}))', t);
    execute format('create policy p_insert on public.%I for insert to authenticated with check (public.is_site_manager({site_q}))', t);
    execute format('create policy p_update on public.%I for update to authenticated using (public.is_site_manager({site_q})) with check (public.is_site_manager({site_q}))', t);
    execute format('create policy p_delete on public.%I for delete to authenticated using (public.is_site_manager({site_q}))', t);
  end loop;

  foreach t in array mgr_tables loop
    execute format('create policy p_select on public.%I for select to authenticated using (public.is_site_manager({site_q}))', t);
    execute format('create policy p_insert on public.%I for insert to authenticated with check (public.is_site_manager({site_q}))', t);
    execute format('create policy p_update on public.%I for update to authenticated using (public.is_site_manager({site_q})) with check (public.is_site_manager({site_q}))', t);
    execute format('create policy p_delete on public.%I for delete to authenticated using (public.is_site_manager({site_q}))', t);
  end loop;

  -- audit log: anyone at the station appends, only managers read, nobody edits
  create policy p_insert on public.{p}_audit_log for insert to authenticated with check (public.has_site_access({site}));
  create policy p_select on public.{p}_audit_log for select to authenticated using (public.is_site_manager({site}));
  -- {p}_doc_counters: RLS on, no policy => reachable only through next_doc_no()
end $$;

-- ---- privileges ----------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like '{p}\_%' loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on public.{p}_doc_counters from authenticated;

-- ---- realtime (live multi-device sync) -----------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for t in
      select tablename from pg_tables
       where schemaname = 'public' and tablename like '{p}\_%'
         and tablename not in ('{p}_doc_counters', '{p}_audit_log')
    loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
