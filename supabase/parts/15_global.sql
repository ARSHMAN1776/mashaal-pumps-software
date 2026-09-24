-- =========================================================================
-- PART 2 — SHARED (NON-BUSINESS) TABLES
-- -------------------------------------------------------------------------
-- Each station keeps ALL of its business records in its OWN set of tables
-- (s01_* for SITE-01, s02_* for SITE-02, ...). Nothing is shared between
-- stations. Only three small tables are global: the station list, the login
-- profiles, and migration bookkeeping.
-- =========================================================================

create extension if not exists pgcrypto;

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---- station list: one row per station; table_prefix names its tables ----
create table if not exists public.stations (
  site_id      text primary key,
  table_prefix text not null unique check (table_prefix ~ '^[a-z][a-z0-9]{1,11}$'),
  code         text not null,
  name         text not null,
  location     text not null default '',
  brand        text not null,
  brand_color  text not null default '#967938',
  phone        text not null default '',
  manager_name text not null default '',
  ntn          text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.stations;
create trigger set_updated_at before update on public.stations
  for each row execute function public.tg_set_updated_at();

-- the two stations of this business (re-runnable; real values are refreshed
-- from the old data during the migration step)
insert into public.stations (site_id, table_prefix, code, name, location, brand, brand_color, phone, manager_name, ntn)
values
  ('SITE-01', 's01', 'SITE 01', 'Mashaal Total PARCO Station', 'Khanpur Road, Rahim Yar Khan',
   'TOTAL PARCO', '#9e1b1b', '068-5874211', 'Naveed Akhtar', '4192084-7'),
  ('SITE-02', 's02', 'SITE 02', 'Mashaal PSO Station', 'Raiwind Road, Lahore',
   'PSO', '#006a4e', '042-35321900', 'Chaudhry Tariq Mehmood', '4192084-8')
on conflict (site_id) do nothing;

-- ---- users: profile of each Supabase Auth account ----------------------
create table if not exists public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  username             text not null unique check (username = lower(username)),
  full_name            text not null,
  role                 text not null check (role in ('owner', 'manager', 'cashier')),
  phone                text not null default '',
  is_active            boolean not null default true,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create table if not exists public.profile_stations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  site_id text not null references public.stations(site_id) on delete cascade,
  primary key (user_id, site_id)
);
create index if not exists profile_stations_site_idx on public.profile_stations (site_id);

-- ---- migration bookkeeping ---------------------------------------------
create table if not exists public.migration_log (
  name    text primary key,
  at      timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
