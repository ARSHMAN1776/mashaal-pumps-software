-- =========================================================================
-- MASHAAL PETROLEUM - ENTERPRISE RELATIONAL DATABASE SCHEMA (SUPABASE)
-- Supporting Total PARCO (Site 01) & PSO (Site 02)
-- Safe to re-run multiple times (Idempotent)
-- =========================================================================

-- 1. Master Stations Table (Real-time snapshots & multi-device sync)
create table if not exists public.stations (
  site_id text primary key,
  site_name text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 2. Daily Fuel Sales (Forecourt Meter Readings)
create table if not exists public.fuel_sales (
  id text primary key,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  shift text not null,
  nozzle_id text not null,
  fuel_type text not null,
  start_meter numeric not null,
  end_meter numeric not null,
  liters_sold numeric not null,
  rate numeric not null,
  amount numeric not null,
  cash_amount numeric default 0,
  credit_amount numeric default 0,
  recorded_by text,
  created_at timestamptz default now()
);

-- 3. Underground Tank Dips & Physical Audits
create table if not exists public.tank_dips (
  id text primary key,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  shift text not null,
  tank_id text not null,
  tank_no int not null,
  fuel_type text not null,
  opening_dip_mm numeric,
  opening_liters numeric,
  closing_dip_mm numeric,
  closing_physical_liters numeric not null,
  sales_during_shift numeric,
  expected_liters numeric,
  variance_liters numeric,
  recorded_by text,
  created_at timestamptz default now()
);

-- 4. Station Daybook (Cash Movement Register)
create table if not exists public.daybook_vouchers (
  id text primary key,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  time text not null,
  particulars text not null,
  category text not null,
  cash_in numeric default 0,
  cash_out numeric default 0,
  balance_after numeric not null,
  reference_no text,
  handled_by text,
  created_at timestamptz default now()
);

-- 5. Commercial Fleet Credit Fuel Slips
create table if not exists public.credit_fuel_slips (
  id text primary key,
  slip_no text not null,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  customer_id text not null,
  customer_name text not null,
  vehicle_no text not null,
  driver_name text not null,
  fuel_type text not null,
  liters numeric not null,
  rate numeric not null,
  total_amount numeric not null,
  authorized_by text,
  created_at timestamptz default now()
);

-- 6. Customer Cash & Cheque Recoveries
create table if not exists public.customer_recoveries (
  id text primary key,
  receipt_no text not null,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  customer_id text not null,
  customer_name text not null,
  payment_method text not null,
  amount numeric not null,
  reference_no text,
  received_by text,
  created_at timestamptz default now()
);

-- 7. OMC Tanker Invoices & Supply Ledger (Total Parco / PSO)
create table if not exists public.omc_invoices (
  id text primary key,
  invoice_no text not null,
  site_id text not null references public.stations(site_id) on delete cascade,
  omc_name text not null,
  date date not null,
  fuel_type text not null,
  liters numeric not null,
  product_rate numeric not null,
  total_amount numeric not null,
  paid_amount numeric default 0,
  payment_status text not null,
  created_at timestamptz default now()
);

-- 8. Fortnightly OGRA Tariff Revisions & Stock Revaluations
create table if not exists public.tariff_revisions (
  id text primary key,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  effective_date text not null,
  notification_no text,
  net_inventory_gain_loss numeric not null,
  revised_by text,
  notes text,
  created_at timestamptz default now()
);

-- 9. Owner Bank Transfers & Capital Withdrawals
create table if not exists public.owner_transfers (
  id text primary key,
  site_id text not null references public.stations(site_id) on delete cascade,
  date date not null,
  amount numeric not null,
  bank_id text not null,
  bank_name text not null,
  account_title text not null,
  account_number text not null,
  reference_no text,
  status text not null default 'Completed',
  notes text,
  transferred_by text,
  created_at timestamptz default now()
);

-- =========================================================================
-- ROW LEVEL SECURITY (SAFE IDEMPOTENT POLICIES)
-- =========================================================================
alter table public.stations enable row level security;
alter table public.fuel_sales enable row level security;
alter table public.tank_dips enable row level security;
alter table public.daybook_vouchers enable row level security;
alter table public.credit_fuel_slips enable row level security;
alter table public.customer_recoveries enable row level security;
alter table public.omc_invoices enable row level security;
alter table public.tariff_revisions enable row level security;
alter table public.owner_transfers enable row level security;

-- Drop old policies if they already exist to avoid errors
drop policy if exists "Allow all access on stations" on public.stations;
drop policy if exists "Allow all operations for station app" on public.stations;
drop policy if exists "Allow all access on fuel_sales" on public.fuel_sales;
drop policy if exists "Allow all access on tank_dips" on public.tank_dips;
drop policy if exists "Allow all access on daybook_vouchers" on public.daybook_vouchers;
drop policy if exists "Allow all access on credit_fuel_slips" on public.credit_fuel_slips;
drop policy if exists "Allow all access on customer_recoveries" on public.customer_recoveries;
drop policy if exists "Allow all access on omc_invoices" on public.omc_invoices;
drop policy if exists "Allow all access on tariff_revisions" on public.tariff_revisions;
drop policy if exists "Allow all access on owner_transfers" on public.owner_transfers;

-- Create policies allowing station app read & write
create policy "Allow all access on stations" on public.stations for all using (true) with check (true);
create policy "Allow all access on fuel_sales" on public.fuel_sales for all using (true) with check (true);
create policy "Allow all access on tank_dips" on public.tank_dips for all using (true) with check (true);
create policy "Allow all access on daybook_vouchers" on public.daybook_vouchers for all using (true) with check (true);
create policy "Allow all access on credit_fuel_slips" on public.credit_fuel_slips for all using (true) with check (true);
create policy "Allow all access on customer_recoveries" on public.customer_recoveries for all using (true) with check (true);
create policy "Allow all access on omc_invoices" on public.omc_invoices for all using (true) with check (true);
create policy "Allow all access on tariff_revisions" on public.tariff_revisions for all using (true) with check (true);
create policy "Allow all access on owner_transfers" on public.owner_transfers for all using (true) with check (true);

-- Safe Realtime Registration (will NOT error if already added)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stations'
  ) then
    alter publication supabase_realtime add table public.stations;
  end if;
end $$;
