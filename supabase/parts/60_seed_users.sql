-- =========================================================================
-- LOGIN ACCOUNTS
-- -------------------------------------------------------------------------
-- The previous software kept these usernames/passwords inside the public
-- JavaScript file. They are recreated here as real Supabase Auth accounts with
-- the SAME usernames and passwords, so everyone can still sign in today.
-- Change every default password after the first sign-in (key button in the top bar).
-- Add / disable / re-assign users later from Settings > Users (owner only).
--
-- SAFE TO RE-RUN: the default accounts are created ONLY while there are no accounts at all
-- (a brand-new project). On a system that is in use this block does nothing, so an account
-- you deleted or a station you removed from someone is never brought back.
-- =========================================================================
do $seed$
declare
  u     record;
  v_uid uuid;
begin
  if exists (select 1 from public.profiles) then
    return;
  end if;
  for u in
    select * from (values
      ('owner',           'mashaal@owner', 'Station Owner',             'owner',   '0300-0000000', array['SITE-01', 'SITE-02']),
      ('owner.parco',     'parco@owner',   'Total PARCO Station Owner', 'owner',   '0300-1111111', array['SITE-01']),
      ('owner.pso',       'pso@owner',     'PSO Station Owner',         'owner',   '0321-2222222', array['SITE-02']),
      ('naveed.akhtar',   'manager123',    'Naveed Akhtar',             'manager', '0300-6729104', array['SITE-01']),
      ('tariq.cashier',   'cashier123',    'Tariq Mehmood',             'cashier', '0301-5582910', array['SITE-01']),
      ('tariq.manager',   'manager123',    'Chaudhry Tariq Mehmood',    'manager', '0321-4455667', array['SITE-02']),
      ('kamran.cashier',  'cashier123',    'Kamran Ali',                'cashier', '0300-9876543', array['SITE-02']),
      ('station.manager', 'manager123',    'Station Manager',           'manager', '0300-0000001', array['SITE-01', 'SITE-02']),
      ('station.cashier', 'cashier123',    'Station Cashier',           'cashier', '0300-0000002', array['SITE-01', 'SITE-02'])
    ) as t(username, password, full_name, role, phone, sites)
  loop
    select p.user_id into v_uid from public.profiles p where p.username = u.username;
    if v_uid is null then
      select au.id into v_uid from auth.users au where au.email = u.username || '@mashaal.internal';
      if v_uid is null then
        v_uid := public._create_auth_user(u.username, u.password);
      end if;
      insert into public.profiles (user_id, username, full_name, role, phone, is_active, must_change_password)
      values (v_uid, u.username, u.full_name, u.role, u.phone, true, true);
    end if;
    insert into public.profile_stations (user_id, site_id)
    select v_uid, s from unnest(u.sites) as s
    on conflict do nothing;
  end loop;
end $seed$;
