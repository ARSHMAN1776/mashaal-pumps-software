-- =========================================================================
-- PART 1 — ARCHIVE THE OLD (PRE-MIGRATION) TABLES
-- -------------------------------------------------------------------------
-- The previous version of the software stored each station as ONE json
-- snapshot in public.stations and mirrored a few records into side tables
-- (fuel_sales, daybook_vouchers, ...) whose column layout differs from the
-- new schema. Nothing is dropped: every old table is RENAMED to legacy_<name>
-- so its data stays available as an archive and as the migration source.
--
-- The old tables had "allow everything to everybody" policies. Those are
-- removed here, so the public anon key can no longer read the archive.
-- =========================================================================

do $$
declare
  t text;
  legacy_tables text[] := array[
    'stations', 'fuel_sales', 'tank_dips', 'daybook_vouchers', 'credit_fuel_slips',
    'customer_recoveries', 'omc_invoices', 'tariff_revisions', 'owner_transfers'
  ];
begin
  -- Only treat public.stations as legacy when it still has the old "data" column.
  if exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'stations' and column_name = 'data'
     )
     and to_regclass('public.legacy_stations') is null
  then
    foreach t in array legacy_tables loop
      if to_regclass('public.' || t) is not null and to_regclass('public.legacy_' || t) is null then
        execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
        -- primary-key index names are schema-wide; free them for the new tables
        if to_regclass('public.' || t || '_pkey') is not null then
          execute format('alter index public.%I rename to %I', t || '_pkey', 'legacy_' || t || '_pkey');
        end if;
      end if;
    end loop;
  end if;

  -- Lock every archive table: RLS on, and no policy = no access for anon/authenticated.
  foreach t in array legacy_tables loop
    if to_regclass('public.legacy_' || t) is not null then
      execute format('alter table public.%I enable row level security', 'legacy_' || t);
      declare pol record;
      begin
        for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'legacy_' || t loop
          execute format('drop policy %I on public.%I', pol.policyname, 'legacy_' || t);
        end loop;
      end;
    end if;
  end loop;
end $$;
