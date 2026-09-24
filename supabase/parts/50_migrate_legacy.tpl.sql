-- =========================================================================
-- DATA MIGRATION for {site} -> tables {p}_*
-- -------------------------------------------------------------------------
-- Source 1: the old JSON snapshot   (legacy_stations.data)         — authoritative
-- Source 2: the old side tables     (legacy_fuel_sales, ...)       — any record that is
--           NOT in the snapshot is recovered too (a stale browser could overwrite
--           the snapshot and silently drop records that had already reached these tables).
-- Nothing is deleted from the archive. Re-running is safe (guarded by migration_log,
-- and every insert is ON CONFLICT DO NOTHING).
--
-- Balances are converted to "opening balance + transactions" so that every
-- balance shown before the migration is identical after it:
--   customer opening  = old balance - snapshot slips + snapshot recoveries
--   bank opening      = old balance - signed snapshot bank transactions
--   supplier opening  = old balance due
--   lube opening      = old stock
--   OMC invoice       = old paid amount - snapshot payments
--   tank / nozzle     = old level / old meter reading
-- =========================================================================
do $mig$
declare
  v_site   constant text := {site};
  d        jsonb;
  leg      jsonb;
  v_rec    jsonb;
  v_log    jsonb := '{}'::jsonb;
  n        int;
begin
  if exists (select 1 from public.migration_log where name = 'legacy-import:' || v_site) then
    raise notice '[%] legacy import already done - skipping', v_site;
    return;
  end if;

  if to_regclass('public.legacy_stations') is not null then
    execute 'select ls.data from public.legacy_stations ls where ls.site_id = $1' into d using v_site;
  end if;
  if d is null then
    insert into public.migration_log (name, details) values ('legacy-import:' || v_site, '{"note":"no legacy snapshot found"}');
    return;
  end if;

  -- ---- station profile & settings ---------------------------------------
  update public.stations s set
    code         = coalesce(d->'siteInfo'->>'code', s.code),
    name         = coalesce(d->'siteInfo'->>'name', s.name),
    location     = coalesce(d->'siteInfo'->>'location', s.location),
    brand        = coalesce(d->'siteInfo'->>'brand', s.brand),
    brand_color  = coalesce(d->'siteInfo'->>'brandColor', s.brand_color),
    phone        = coalesce(d->'siteInfo'->>'phone', s.phone),
    manager_name = coalesce(d->'siteInfo'->>'managerName', s.manager_name),
    ntn          = coalesce(d->'siteInfo'->>'ntn', s.ntn)
  where s.site_id = v_site;

  update public.{p}_station_settings set
    rate_pmg            = coalesce((d->'settings'->'rates'->>'PMG Super')::numeric, rate_pmg),
    rate_hsd            = coalesce((d->'settings'->'rates'->>'HSD Diesel')::numeric, rate_hsd),
    rate_octane         = coalesce((d->'settings'->'rates'->>'Hi-Octane')::numeric, rate_octane),
    station_phone       = coalesce(d->'settings'->>'stationPhone', station_phone),
    manager_contact     = coalesce(d->'settings'->>'managerContact', manager_contact),
    receipt_header      = coalesce(d->'settings'->>'receiptHeader', receipt_header),
    receipt_footer      = coalesce(d->'settings'->>'receiptFooter', receipt_footer),
    low_stock_alert_pct = coalesce((d->'settings'->>'lowStockAlertPct')::numeric, low_stock_alert_pct),
    cash_difference_alert_limit = coalesce((d->'settings'->>'cashDifferenceAlertLimit')::numeric, cash_difference_alert_limit)
  where id = 'main';

  -- ---- tanks & nozzles ---------------------------------------------------
  insert into public.{p}_tanks (id, tank_no, fuel_type, capacity_liters, min_reserve_liters, initial_liters, initial_dip_mm)
  select t->>'id', (t->>'tankNo')::int, t->>'fuelType', (t->>'capacityLiters')::numeric,
         coalesce((t->>'minReserveLiters')::numeric, 0),
         coalesce((t->>'currentLiters')::numeric, 0), coalesce((t->>'currentDipMm')::numeric, 0)
    from jsonb_array_elements(coalesce(d->'tanks', '[]')) t
  on conflict do nothing;

  insert into public.{p}_nozzles (id, tank_id, dispenser_no, nozzle_no, initial_meter, testing_liters, assigned_staff, is_active)
  select z->>'id', z->>'tankId', (z->>'dispenserNo')::int, (z->>'nozzleNo')::int,
         greatest(coalesce((z->>'closingMeter')::numeric, 0), coalesce((z->>'openingMeter')::numeric, 0)),
         coalesce((z->>'testingLiters')::numeric, 0), coalesce(z->>'assignedStaff', ''), true
    from jsonb_array_elements(coalesce(d->'nozzles', '[]')) z
  on conflict do nothing;

  -- ---- shifts & fuel sales ------------------------------------------------
  insert into public.{p}_shifts (id, shift_name, date, incharge, status, start_time, end_time, total_fuel_sales,
      total_lube_sales, credit_sales, digital_payments, shift_expenses, credit_recoveries, expected_cash,
      actual_cash, shortage_excess, notes, created_at)
  select r->>'id', coalesce(r->>'shiftName', 'Morning'), coalesce(nullif(r->>'date','')::date, current_date),
         coalesce(r->>'incharge', ''), coalesce(r->>'status', 'Closed'), coalesce(r->>'startTime', ''), coalesce(r->>'endTime', ''),
         coalesce((r->>'totalFuelSales')::numeric, 0), coalesce((r->>'totalLubeSales')::numeric, 0),
         coalesce((r->>'creditSales')::numeric, 0), coalesce((r->>'digitalPayments')::numeric, 0),
         coalesce((r->>'shiftExpenses')::numeric, 0), coalesce((r->>'creditRecoveries')::numeric, 0),
         coalesce((r->>'expectedCash')::numeric, 0), coalesce((r->>'actualCash')::numeric, 0),
         coalesce((r->>'shortageExcess')::numeric, 0), r->>'notes',
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'shifts', '[]')) r
  on conflict do nothing;

  insert into public.{p}_fuel_sales (id, date, shift_name, shift_id, nozzle_id, dispenser_no, nozzle_no, fuel_type,
      opening_meter, closing_meter, testing_liters, net_liters, rate_per_liter, total_amount, cashier_name, created_at)
  select r->>'id', coalesce(nullif(r->>'date','')::date, current_date),
         coalesce((select sh->>'shiftName' from jsonb_array_elements(coalesce(d->'shifts','[]')) sh where sh->>'id' = r->>'shiftId' limit 1), 'Morning'),
         r->>'shiftId', r->>'nozzleId', coalesce((r->>'dispenserNo')::int, 0), coalesce((r->>'nozzleNo')::int, 0),
         r->>'fuelType', (r->>'openingMeter')::numeric, greatest((r->>'closingMeter')::numeric, (r->>'openingMeter')::numeric),
         coalesce((r->>'testingLiters')::numeric, 0), greatest(coalesce((r->>'netLiters')::numeric, 0), 0),
         (r->>'ratePerLiter')::numeric, (r->>'totalAmount')::numeric, coalesce(r->>'cashierName', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'fuelSales', '[]')) r
  on conflict do nothing;

  -- side-table sales that are not in the snapshot
  if to_regclass('public.legacy_fuel_sales') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_fuel_sales l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_fuel_sales (id, date, shift_name, nozzle_id, dispenser_no, nozzle_no, fuel_type,
        opening_meter, closing_meter, testing_liters, net_liters, rate_per_liter, total_amount, cashier_name, created_at)
    select r->>'id', (r->>'date')::date, coalesce(r->>'shift', 'Morning'), r->>'nozzle_id',
           coalesce((select nz.dispenser_no from public.{p}_nozzles nz where nz.id = r->>'nozzle_id'), 0),
           coalesce((select nz.nozzle_no from public.{p}_nozzles nz where nz.id = r->>'nozzle_id'), 0),
           r->>'fuel_type', (r->>'start_meter')::numeric, greatest((r->>'end_meter')::numeric, (r->>'start_meter')::numeric),
           0, (r->>'liters_sold')::numeric, (r->>'rate')::numeric, (r->>'amount')::numeric,
           coalesce(r->>'recorded_by', ''), coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_fuel_sales', n);
  end if;

  -- ---- tank dips ---------------------------------------------------------
  insert into public.{p}_tank_dips (id, date, tank_id, tank_no, fuel_type, morning_dip_mm, morning_liters, decanted_liters,
      dispensed_liters, book_stock_liters, closing_dip_mm, closing_physical_liters, variance_liters, water_dip_mm, inspector, created_at)
  select r->>'id', coalesce(nullif(r->>'date','')::date, current_date), r->>'tankId', (r->>'tankNo')::int, r->>'fuelType',
         coalesce((r->>'morningDipMm')::numeric, 0), coalesce((r->>'morningLiters')::numeric, 0),
         coalesce((r->>'decantedLiters')::numeric, 0), coalesce((r->>'dispensedLiters')::numeric, 0),
         coalesce((r->>'bookStockLiters')::numeric, 0), coalesce((r->>'closingDipMm')::numeric, 0),
         coalesce((r->>'closingPhysicalLiters')::numeric, 0), coalesce((r->>'varianceLiters')::numeric, 0),
         coalesce((r->>'waterDipMm')::numeric, 0), coalesce(r->>'inspector', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'tankDips', '[]')) r
   where exists (select 1 from public.{p}_tanks tk where tk.id = r->>'tankId')
  on conflict do nothing;

  if to_regclass('public.legacy_tank_dips') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_tank_dips l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_tank_dips (id, date, tank_id, tank_no, fuel_type, morning_dip_mm, morning_liters, decanted_liters,
        dispensed_liters, book_stock_liters, closing_dip_mm, closing_physical_liters, variance_liters, water_dip_mm, inspector, created_at)
    select r->>'id', (r->>'date')::date, r->>'tank_id', (r->>'tank_no')::int, r->>'fuel_type',
           coalesce((r->>'opening_dip_mm')::numeric, 0), coalesce((r->>'opening_liters')::numeric, 0), 0,
           coalesce((r->>'sales_during_shift')::numeric, 0), coalesce((r->>'expected_liters')::numeric, 0),
           coalesce((r->>'closing_dip_mm')::numeric, 0), (r->>'closing_physical_liters')::numeric,
           coalesce((r->>'variance_liters')::numeric, 0), 0, coalesce(r->>'recorded_by', ''),
           coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
     where exists (select 1 from public.{p}_tanks tk where tk.id = r->>'tank_id')
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_tank_dips', n);
  end if;

  -- ---- OMC invoices & payments -------------------------------------------
  insert into public.{p}_omc_invoices (id, invoice_no, date, brand, tank_lorry_no, driver_name, fuel_type,
      invoice_volume_liters, decanted_volume_liters, rate_per_liter, freight_amount, total_amount, opening_paid_amount, created_at)
  select r->>'id', r->>'invoiceNo', coalesce(nullif(r->>'date','')::date, current_date), coalesce(r->>'brand', ''),
         coalesce(r->>'tankLorryNo', ''), coalesce(r->>'driverName', ''), r->>'fuelType',
         coalesce((r->>'invoiceVolumeLiters')::numeric, 0), coalesce((r->>'decantedVolumeLiters')::numeric, 0),
         coalesce((r->>'ratePerLiter')::numeric, 0), coalesce((r->>'freightAmount')::numeric, 0),
         coalesce((r->>'totalAmount')::numeric, 0),
         coalesce((r->>'paidAmount')::numeric, 0)
           - coalesce((select sum((p->>'amount')::numeric) from jsonb_array_elements(coalesce(d->'omcPayments','[]')) p
                        where p->>'invoiceNo' = r->>'invoiceNo'), 0),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'omcInvoices', '[]')) r
  on conflict do nothing;

  insert into public.{p}_omc_payments (id, date, invoice_no, payment_method, bank_name, reference_no, amount, recorded_by, created_at)
  select r->>'id', coalesce(nullif(r->>'date','')::date, current_date), r->>'invoiceNo',
         coalesce(r->>'paymentMethod', 'Bank Transfer'), coalesce(r->>'bankName', ''), coalesce(r->>'referenceNo', ''),
         (r->>'amount')::numeric, coalesce(r->>'recordedBy', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'omcPayments', '[]')) r
   where (r->>'amount')::numeric > 0
  on conflict do nothing;

  if to_regclass('public.legacy_omc_invoices') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_omc_invoices l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_omc_invoices (id, invoice_no, date, brand, fuel_type, invoice_volume_liters, decanted_volume_liters,
        rate_per_liter, total_amount, opening_paid_amount, created_at)
    select r->>'id', r->>'invoice_no', (r->>'date')::date, coalesce(r->>'omc_name', ''), r->>'fuel_type',
           coalesce((r->>'liters')::numeric, 0), coalesce((r->>'liters')::numeric, 0), coalesce((r->>'product_rate')::numeric, 0),
           (r->>'total_amount')::numeric, coalesce((r->>'paid_amount')::numeric, 0),
           coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
     where not exists (select 1 from public.{p}_omc_invoices i where i.invoice_no = r->>'invoice_no')
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_omc_invoices', n);
  end if;

  -- ---- banking -------------------------------------------------------------
  insert into public.{p}_bank_accounts (id, bank_name, account_title, account_number, branch, opening_balance)
  select b->>'id', b->>'bankName', coalesce(b->>'accountTitle', ''), coalesce(b->>'accountNumber', ''), coalesce(b->>'branch', ''),
         coalesce((b->>'currentBalance')::numeric, 0)
           - coalesce((select sum(case when x->>'type' in ('Deposit') then (x->>'amount')::numeric else -(x->>'amount')::numeric end)
                         from jsonb_array_elements(coalesce(d->'bankTransactions','[]')) x where x->>'bankId' = b->>'id'), 0)
    from jsonb_array_elements(coalesce(d->'bankAccounts', '[]')) b
  on conflict do nothing;

  insert into public.{p}_bank_transactions (id, bank_id, date, type, amount, deposit_slip_no, description, created_at)
  select x->>'id', x->>'bankId', coalesce(nullif(x->>'date','')::date, current_date), x->>'type', (x->>'amount')::numeric,
         x->>'depositSlipNo', coalesce(x->>'description', ''),
         (coalesce(nullif(x->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'bankTransactions', '[]')) x
   where (x->>'amount')::numeric > 0
     and exists (select 1 from public.{p}_bank_accounts ba where ba.id = x->>'bankId')
  on conflict do nothing;

  insert into public.{p}_owner_transfers (id, date, amount, bank_id, bank_name, account_title, account_number, reference_no,
      status, notes, transferred_by, created_at)
  select r->>'id', coalesce(nullif(r->>'date','')::date, current_date), (r->>'amount')::numeric, coalesce(r->>'bankId', ''),
         coalesce(r->>'bankName', ''), coalesce(r->>'accountTitle', ''), coalesce(r->>'accountNumber', ''),
         coalesce(r->>'referenceNo', ''), coalesce(r->>'status', 'Completed'), r->>'notes', coalesce(r->>'transferredBy', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'ownerTransfers', '[]')) r
   where (r->>'amount')::numeric > 0
  on conflict do nothing;

  -- ---- customers, slips, recoveries --------------------------------------
  insert into public.{p}_customers (id, name, business_name, phone, vehicle_numbers, credit_limit, opening_balance, status)
  select c->>'id', coalesce(c->>'name', c->>'businessName'), coalesce(c->>'businessName', c->>'name'), coalesce(c->>'phone', ''),
         coalesce(array(select jsonb_array_elements_text(coalesce(c->'vehicleNumbers', '[]'))), '{}'),
         coalesce((c->>'creditLimit')::numeric, 0),
         coalesce((c->>'currentBalance')::numeric, 0)
           - coalesce((select sum((s->>'totalAmount')::numeric) from jsonb_array_elements(coalesce(d->'creditSlips','[]')) s where s->>'customerId' = c->>'id'), 0)
           + coalesce((select sum((r->>'amount')::numeric) from jsonb_array_elements(coalesce(d->'recoveries','[]')) r where r->>'customerId' = c->>'id'), 0),
         case when c->>'status' = 'Hold' then 'Hold' else 'Active' end
    from jsonb_array_elements(coalesce(d->'customers', '[]')) c
  on conflict do nothing;

  insert into public.{p}_credit_slips (id, slip_no, date, customer_id, customer_name, vehicle_no, driver_name, fuel_type,
      liters, rate, total_amount, authorized_by, created_at)
  select s->>'id', s->>'slipNo', coalesce(nullif(s->>'date','')::date, current_date), s->>'customerId', coalesce(s->>'customerName', ''),
         coalesce(s->>'vehicleNo', ''), coalesce(s->>'driverName', ''), s->>'fuelType',
         greatest((s->>'liters')::numeric, 0.001), coalesce((s->>'rate')::numeric, 0), coalesce((s->>'totalAmount')::numeric, 0),
         coalesce(s->>'authorizedBy', ''), (coalesce(nullif(s->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'creditSlips', '[]')) s
   where exists (select 1 from public.{p}_customers cu where cu.id = s->>'customerId')
  on conflict do nothing;

  insert into public.{p}_customer_recoveries (id, receipt_no, date, customer_id, customer_name, payment_method, amount,
      reference_no, received_by, created_at)
  select r->>'id', r->>'receiptNo', coalesce(nullif(r->>'date','')::date, current_date), r->>'customerId', coalesce(r->>'customerName', ''),
         coalesce(r->>'paymentMethod', 'Cash'), (r->>'amount')::numeric, coalesce(r->>'referenceNo', ''), coalesce(r->>'receivedBy', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'recoveries', '[]')) r
   where (r->>'amount')::numeric > 0
     and exists (select 1 from public.{p}_customers cu where cu.id = r->>'customerId')
  on conflict do nothing;

  -- side-table credit slips / recoveries that are not in the snapshot.
  -- (Their amounts are ADDED on top of the snapshot-based opening balance, i.e. they raise/lower the customer's due.)
  if to_regclass('public.legacy_credit_fuel_slips') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_credit_fuel_slips l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_credit_slips (id, slip_no, date, customer_id, customer_name, vehicle_no, driver_name, fuel_type,
        liters, rate, total_amount, authorized_by, created_at)
    select r->>'id', r->>'slip_no', (r->>'date')::date, r->>'customer_id', coalesce(r->>'customer_name', ''),
           coalesce(r->>'vehicle_no', ''), coalesce(r->>'driver_name', ''), r->>'fuel_type', (r->>'liters')::numeric,
           (r->>'rate')::numeric, (r->>'total_amount')::numeric, coalesce(r->>'authorized_by', ''),
           coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
     where exists (select 1 from public.{p}_customers cu where cu.id = r->>'customer_id')
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_credit_slips', n);
  end if;

  if to_regclass('public.legacy_customer_recoveries') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_customer_recoveries l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_customer_recoveries (id, receipt_no, date, customer_id, customer_name, payment_method, amount,
        reference_no, received_by, created_at)
    select r->>'id', r->>'receipt_no', (r->>'date')::date, r->>'customer_id', coalesce(r->>'customer_name', ''),
           coalesce(r->>'payment_method', 'Cash'), (r->>'amount')::numeric, coalesce(r->>'reference_no', ''),
           coalesce(r->>'received_by', ''), coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
     where exists (select 1 from public.{p}_customers cu where cu.id = r->>'customer_id')
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_recoveries', n);
  end if;

  -- ---- daybook (snapshot first, in its original order) --------------------
  insert into public.{p}_daybook_entries (id, date, time, particulars, category, cash_in, cash_out, reference_no, handled_by, created_at)
  select r.e->>'id', coalesce(nullif(r.e->>'date','')::date, current_date), coalesce(r.e->>'time', ''),
         coalesce(r.e->>'particulars', ''), coalesce(r.e->>'category', 'Shift Fuel'),
         coalesce((r.e->>'cashIn')::numeric, 0), coalesce((r.e->>'cashOut')::numeric, 0),
         r.e->>'referenceNo', coalesce(r.e->>'handledBy', ''),
         (coalesce(nullif(r.e->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'daybook', '[]')) with ordinality as r(e, ord)
   order by r.ord
  on conflict do nothing;

  -- ...then vouchers that only exist in the old side table, in the order they were written
  v_rec := '[]'::jsonb;
  if to_regclass('public.legacy_daybook_vouchers') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_daybook_vouchers l where l.site_id = $1'
      into leg using v_site;
    with ins as (
      insert into public.{p}_daybook_entries (id, date, time, particulars, category, cash_in, cash_out, reference_no, handled_by, created_at)
      select r.e->>'id', (r.e->>'date')::date, coalesce(r.e->>'time', ''), coalesce(r.e->>'particulars', ''),
             coalesce(r.e->>'category', 'Shift Fuel'), coalesce((r.e->>'cash_in')::numeric, 0),
             coalesce((r.e->>'cash_out')::numeric, 0), r.e->>'reference_no', coalesce(r.e->>'handled_by', ''),
             coalesce((r.e->>'created_at')::timestamptz, now())
        from jsonb_array_elements(leg) with ordinality as r(e, ord)
       order by r.ord
      on conflict do nothing
      returning id, date, particulars, category, cash_out, reference_no, handled_by
    )
    select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_rec from ins;
    v_log := v_log || jsonb_build_object('recovered_daybook_vouchers', jsonb_array_length(v_rec));
  end if;

  -- ---- expenses & staff (needed before rebuilding recovered vouchers) -----
  insert into public.{p}_expenses (id, voucher_no, date, category, description, payee, amount, payment_mode, approved_by, created_at)
  select r->>'id', coalesce(r->>'voucherNo', r->>'id'), coalesce(nullif(r->>'date','')::date, current_date), coalesce(r->>'category', 'Misc'),
         coalesce(r->>'description', ''), coalesce(r->>'payee', ''), (r->>'amount')::numeric,
         case when r->>'paymentMode' = 'Bank' then 'Bank' else 'Cash' end, coalesce(r->>'approvedBy', ''),
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'expenses', '[]')) r
   where (r->>'amount')::numeric > 0
  on conflict do nothing;

  insert into public.{p}_staff_members (id, name, role, phone, monthly_salary, daily_advance_limit, joining_date, status, is_active)
  select r->>'id', r->>'name', coalesce(r->>'role', 'Pump Attendant'), coalesce(r->>'phone', ''),
         coalesce((r->>'monthlySalary')::numeric, 0), coalesce((r->>'dailyAdvanceLimit')::numeric, 0),
         nullif(r->>'joiningDate', '')::date,
         case when r->>'status' in ('On Duty', 'Off Duty', 'On Leave') then r->>'status' else 'On Duty' end, true
    from jsonb_array_elements(coalesce(d->'staff', '[]')) r
  on conflict do nothing;

  -- advances carried in the old "currentAdvances" figure become one outstanding advance per employee
  insert into public.{p}_staff_advances (id, staff_id, date, amount, reason, status, recorded_by)
  select 'ADV-BF-' || (r->>'id'), r->>'id', current_date, (r->>'currentAdvances')::numeric,
         'Balance brought forward from previous software', 'Outstanding', 'Migration'
    from jsonb_array_elements(coalesce(d->'staff', '[]')) r
   where coalesce((r->>'currentAdvances')::numeric, 0) > 0
  on conflict do nothing;

  -- ---- rebuild the expense / advance behind recovered daybook vouchers ----
  -- (a recovered "Expense: <category> (<description>)" cash-out with a voucher number had its
  --  expense record lost together with the snapshot; recreate it so reports match the cash book)
  insert into public.{p}_expenses (id, voucher_no, date, category, description, payee, amount, payment_mode, approved_by, created_at)
  select 'EXP-R-' || (v->>'reference_no'), v->>'reference_no', (v->>'date')::date,
         coalesce(substring(v->>'particulars' from '^Expense: (.*) \(.*\)$'), 'Misc'),
         coalesce(substring(v->>'particulars' from '\((.*)\)$'), v->>'particulars') || ' [recovered from cash-book voucher ' || (v->>'id') || ']',
         'Not recorded (recovered)', (v->>'cash_out')::numeric, 'Cash', coalesce(v->>'handled_by', ''), now()
    from jsonb_array_elements(v_rec) v
   where v->>'particulars' like 'Expense: %' and coalesce(v->>'reference_no', '') <> '' and (v->>'cash_out')::numeric > 0
     and not exists (select 1 from public.{p}_expenses e where e.voucher_no = v->>'reference_no')
  on conflict do nothing;
  update public.{p}_daybook_entries db set source_type = 'expense', source_id = 'EXP-R-' || db.reference_no
   where db.id in (select v->>'id' from jsonb_array_elements(v_rec) v where v->>'particulars' like 'Expense: %')
     and exists (select 1 from public.{p}_expenses e where e.id = 'EXP-R-' || db.reference_no);

  insert into public.{p}_staff_advances (id, staff_id, date, amount, reason, status, recorded_by, created_at)
  select 'ADV-R-' || (v->>'reference_no'), st.id, (v->>'date')::date, (v->>'cash_out')::numeric,
         coalesce(substring(v->>'particulars' from ' — (.*)$'), 'Recovered advance') || ' [recovered from cash-book voucher ' || (v->>'id') || ']',
         'Outstanding', coalesce(v->>'handled_by', ''), now()
    from jsonb_array_elements(v_rec) v
    join public.{p}_staff_members st on lower(st.name) = lower(substring(v->>'particulars' from '^Staff Advance: (.*?) — '))
   where v->>'particulars' like 'Staff Advance: %' and coalesce(v->>'reference_no', '') <> '' and (v->>'cash_out')::numeric > 0
  on conflict do nothing;
  update public.{p}_daybook_entries db set source_type = 'staff_advance', source_id = 'ADV-R-' || db.reference_no
   where db.id in (select v->>'id' from jsonb_array_elements(v_rec) v where v->>'particulars' like 'Staff Advance: %')
     and exists (select 1 from public.{p}_staff_advances a where a.id = 'ADV-R-' || db.reference_no);

  -- ---- lubricants & suppliers ---------------------------------------------
  insert into public.{p}_lubricant_products (id, name, brand, grade, pack_size, opening_stock, min_stock_alert, cost_price, sale_price)
  select r->>'id', r->>'name', coalesce(r->>'brand', ''), coalesce(r->>'grade', ''), coalesce(r->>'packSize', ''),
         greatest(coalesce((r->>'stockCans')::int, 0), 0), greatest(coalesce((r->>'minStockAlert')::int, 0), 0),
         coalesce((r->>'costPrice')::numeric, 0), coalesce((r->>'salePrice')::numeric, 0)
    from jsonb_array_elements(coalesce(d->'lubricants', '[]')) r
  on conflict do nothing;

  insert into public.{p}_suppliers (id, name, company, category, phone, opening_balance)
  select r->>'id', r->>'name', coalesce(r->>'company', ''), coalesce(r->>'category', ''), coalesce(r->>'phone', ''),
         coalesce((r->>'balanceDue')::numeric, 0)
    from jsonb_array_elements(coalesce(d->'suppliers', '[]')) r
  on conflict do nothing;

  -- ---- tariff revisions ----------------------------------------------------
  insert into public.{p}_tariff_revisions (id, date, effective_date, notification_no, old_rates, new_rates, tank_snapshots,
      net_inventory_gain_loss, revised_by, notes, created_at)
  select r->>'id', coalesce(nullif(r->>'date','')::date, current_date), coalesce(r->>'effectiveDate', ''),
         coalesce(r->>'notificationNo', ''), coalesce(r->'oldRates', '{}'), coalesce(r->'newRates', '{}'),
         coalesce(r->'tankSnapshots', '[]'), coalesce((r->>'netInventoryGainLoss')::numeric, 0), coalesce(r->>'revisedBy', ''), r->>'notes',
         (coalesce(nullif(r->>'date','')::date, current_date) + time '12:00')::timestamptz
    from jsonb_array_elements(coalesce(d->'tariffHistory', '[]')) r
  on conflict do nothing;

  if to_regclass('public.legacy_tariff_revisions') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), ''[]''::jsonb) from public.legacy_tariff_revisions l where l.site_id = $1'
      into leg using v_site;
    insert into public.{p}_tariff_revisions (id, date, effective_date, notification_no, net_inventory_gain_loss, revised_by, notes, created_at)
    select r->>'id', (r->>'date')::date, coalesce(r->>'effective_date', ''), coalesce(r->>'notification_no', ''),
           coalesce((r->>'net_inventory_gain_loss')::numeric, 0), coalesce(r->>'revised_by', ''), r->>'notes',
           coalesce((r->>'created_at')::timestamptz, now())
      from jsonb_array_elements(leg) r
    on conflict do nothing;
    get diagnostics n = row_count;
    v_log := v_log || jsonb_build_object('recovered_tariff_revisions', n);
  end if;

  -- ---- continue document numbering after the highest existing number -------
  insert into public.{p}_doc_counters (kind, last_value)
  select 'slip', max(coalesce(substring(slip_no from '(\d+)$'), '0')::bigint) from public.{p}_credit_slips
  having max(coalesce(substring(slip_no from '(\d+)$'), '0')::bigint) is not null
  on conflict (kind) do update set last_value = greatest({p}_doc_counters.last_value, excluded.last_value);
  insert into public.{p}_doc_counters (kind, last_value)
  select 'receipt', max(coalesce(substring(receipt_no from '(\d+)$'), '0')::bigint) from public.{p}_customer_recoveries
  having max(coalesce(substring(receipt_no from '(\d+)$'), '0')::bigint) is not null
  on conflict (kind) do update set last_value = greatest({p}_doc_counters.last_value, excluded.last_value);
  insert into public.{p}_doc_counters (kind, last_value)
  select 'voucher', max(coalesce(substring(voucher_no from '(\d+)$'), '0')::bigint) from public.{p}_expenses
  having max(coalesce(substring(voucher_no from '(\d+)$'), '0')::bigint) is not null
  on conflict (kind) do update set last_value = greatest({p}_doc_counters.last_value, excluded.last_value);

  insert into public.migration_log (name, details) values ('legacy-import:' || v_site, v_log);
  raise notice '[%] legacy import finished: %', v_site, v_log;
end $mig$;
