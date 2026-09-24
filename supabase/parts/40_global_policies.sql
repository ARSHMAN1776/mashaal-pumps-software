-- =========================================================================
-- PART 4 — POLICIES FOR THE SHARED TABLES
-- (per-station tables get their own policies from the station template)
-- =========================================================================

alter table public.stations         enable row level security;
alter table public.profiles         enable row level security;
alter table public.profile_stations enable row level security;
alter table public.migration_log    enable row level security;

do $$
declare pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and tablename in ('stations', 'profiles', 'profile_stations', 'migration_log')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- public station list (name / brand / location) — needed on the "choose a station" screen
create policy p_select_public on public.stations for select to anon, authenticated using (true);
-- managers may edit the profile of their own station
create policy p_update on public.stations for update to authenticated
  using (public.is_site_manager(site_id)) with check (public.is_site_manager(site_id));

-- a user reads only their own profile and station assignments (admin_* functions do the rest)
create policy p_select_own on public.profiles         for select to authenticated using (user_id = auth.uid());
create policy p_select_own on public.profile_stations for select to authenticated using (user_id = auth.uid());
-- migration_log: RLS on, no policy => invisible to the app

revoke all on public.stations, public.profiles, public.profile_stations, public.migration_log from anon, authenticated;
grant select on public.stations to anon;
grant select, update on public.stations to authenticated;
grant select on public.profiles, public.profile_stations to authenticated;

-- the old (archived) tables must never be readable through the public API
do $$
declare t text;
begin
  foreach t in array array[
    'legacy_stations', 'legacy_fuel_sales', 'legacy_tank_dips', 'legacy_daybook_vouchers',
    'legacy_credit_fuel_slips', 'legacy_customer_recoveries', 'legacy_omc_invoices',
    'legacy_tariff_revisions', 'legacy_owner_transfers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
