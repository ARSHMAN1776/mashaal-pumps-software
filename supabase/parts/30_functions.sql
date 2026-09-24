-- =========================================================================
-- PART 3 — FUNCTIONS
-- =========================================================================

-- ---- access helpers (SECURITY DEFINER so RLS on profiles cannot recurse) --
create or replace function public.has_site_access(p_site text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profile_stations ps
      join public.profiles p on p.user_id = ps.user_id
     where ps.user_id = auth.uid() and ps.site_id = p_site and p.is_active
  )
$$;

create or replace function public.is_site_manager(p_site text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profile_stations ps
      join public.profiles p on p.user_id = ps.user_id
     where ps.user_id = auth.uid() and ps.site_id = p_site and p.is_active
       and p.role in ('owner', 'manager')
  )
$$;

create or replace function public.is_owner_of(p_site text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profile_stations ps
      join public.profiles p on p.user_id = ps.user_id
     where ps.user_id = auth.uid() and ps.site_id = p_site and p.is_active
       and p.role = 'owner'
  )
$$;

-- ---- apply_ops: run several writes as ONE transaction --------------------
-- Ops: [{ "t": "<logical table>", "a": "insert|insert_ignore|upsert|update|delete|purge", "row": {...}, "v": "<updated_at the editor saw (update only)>" }]
--   * The logical table name (e.g. "customers") is routed to THIS station's own
--     table (e.g. s01_customers for SITE-01). A call for one station can never
--     touch another station's tables.
--   * Only the tables in v_allowed can be written, and Row Level Security is
--     still enforced because the function is SECURITY INVOKER.
--   * Returns the resulting rows (with server-assigned seq / timestamps).
-- APPLY_OPS-BEGIN
create or replace function public.apply_ops(p_site text, p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'station_settings', 'tanks', 'nozzles', 'fuel_sales', 'shifts', 'tank_dips',
    'omc_invoices', 'omc_payments', 'bank_accounts', 'bank_transactions', 'owner_transfers',
    'daybook_entries', 'customers', 'credit_slips', 'customer_recoveries', 'customer_adjustments',
    'expenses', 'staff_members', 'staff_advances', 'staff_salary_payments',
    'lubricant_products', 'lubricant_movements', 'suppliers', 'supplier_transactions',
    'tariff_revisions', 'audit_log'
  ];
  v_prefix text;
  v_op     jsonb;
  v_t      text;
  v_full   text;
  v_a      text;
  v_row    jsonb;
  v_id     text;
  v_cols   text;
  v_set    text;
  v_res    jsonb;
  v_ver    text;
  v_exists boolean;
  v_out    jsonb := '[]'::jsonb;
begin
  if p_site is null or p_site = '' then
    raise exception 'apply_ops: station is required';
  end if;
  select s.table_prefix into v_prefix from public.stations s where s.site_id = p_site;
  if v_prefix is null then
    raise exception 'apply_ops: unknown station "%"', p_site;
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'apply_ops: ops must be a JSON array';
  end if;
  if jsonb_array_length(p_ops) > 20000 then
    raise exception 'apply_ops: too many operations in one call';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_t := v_op ->> 't';
    v_a := v_op ->> 'a';
    if v_t is null or not (v_t = any (v_allowed)) then
      raise exception 'apply_ops: table "%" is not writable', coalesce(v_t, '(null)');
    end if;
    v_full := v_prefix || '_' || v_t;

    v_row := coalesce(v_op -> 'row', '{}'::jsonb) - 'site_id';
    v_id  := v_row ->> 'id';
    v_res := null;

    if v_a in ('insert', 'insert_ignore', 'upsert') then
      select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_row) as k;
      select string_agg(quote_ident(k), ', ') into v_set
        from jsonb_object_keys(v_row) as k where k <> 'id';
      if v_cols is null then
        raise exception 'apply_ops: % needs a row', v_a;
      end if;

      if v_a = 'insert' then
        execute format(
          'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(t.*)',
          v_full, v_cols) into v_res using v_row;
      elsif v_a = 'insert_ignore' or v_set is null then
        execute format(
          'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do nothing returning to_jsonb(t.*)',
          v_full, v_cols) into v_res using v_row;
      else
        execute format(
          'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
          'on conflict (id) do update set (%3$s) = (select %3$s from jsonb_populate_record(null::public.%1$I, $1)) '
          'returning to_jsonb(t.*)',
          v_full, v_cols, v_set) into v_res using v_row;
      end if;

      if v_res is not null then
        v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_t, 'a', 'upsert', 'row', v_res));
      end if;

    elsif v_a = 'update' then
      if v_id is null then
        raise exception 'apply_ops: update on "%" needs an id', v_t;
      end if;
      select string_agg(quote_ident(k), ', ') into v_set
        from jsonb_object_keys(v_row) as k where k <> 'id';
      if v_set is null then
        continue;
      end if;
      -- optional edit check: "v" is the version (updated_at) of the record as the person saw it when they opened it
      v_ver := nullif(v_op ->> 'v', '');
      if v_ver is null then
        execute format(
          'update public.%1$I as t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) '
          'where t.id = $2 returning to_jsonb(t.*)',
          v_full, v_set) into v_res using v_row, v_id;
      else
        execute format(
          'update public.%1$I as t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) '
          'where t.id = $2 and t.updated_at = $3::timestamptz returning to_jsonb(t.*)',
          v_full, v_set) into v_res using v_row, v_id, v_ver;
      end if;
      if v_res is null then
        if v_ver is not null then
          execute format('select exists (select 1 from public.%I where id = $1)', v_full) into v_exists using v_id;
          if v_exists then
            raise exception using errcode = 'P0409',
              message = 'This record was changed by someone else while you had it open. Nothing was saved. Close this window, open the record again to see their change, then redo yours.';
          end if;
        end if;
        raise exception 'apply_ops: % "%" was not found (or you do not have permission to change it)', v_t, v_id;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_t, 'a', 'upsert', 'row', v_res));

    elsif v_a = 'delete' then
      if v_id is null then
        raise exception 'apply_ops: delete on "%" needs an id', v_t;
      end if;
      execute format('delete from public.%I where id = $1', v_full) using v_id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_t, 'a', 'delete', 'row', jsonb_build_object('id', v_id)));

    elsif v_a = 'purge' then
      execute format('delete from public.%I', v_full);
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_t, 'a', 'purge'));

    else
      raise exception 'apply_ops: unknown action "%"', coalesce(v_a, '(null)');
    end if;
  end loop;

  return v_out;
end $$;
-- APPLY_OPS-END

-- ---- next_doc_no: race-free running numbers (per station) ----------------
create or replace function public.next_doc_no(p_site text, p_kind text, p_start bigint default 1000)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v        bigint;
begin
  if not public.has_site_access(p_site) then
    raise exception 'You do not have access to this station';
  end if;
  select s.table_prefix into v_prefix from public.stations s where s.site_id = p_site;
  if v_prefix is null then
    raise exception 'Unknown station "%"', p_site;
  end if;
  execute format(
    'insert into public.%1$I as c (kind, last_value) values ($1, $2 + 1) '
    'on conflict (kind) do update set last_value = c.last_value + 1 returning c.last_value',
    v_prefix || '_doc_counters') into v using p_kind, p_start;
  return v;
end $$;

-- ---- first-login password change ----------------------------------------
create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where user_id = auth.uid();
$$;

-- ---- user administration (owner only) -----------------------------------
-- Every login is a real Supabase Auth account whose e-mail is <username>@mashaal.internal
-- (nothing is ever sent to it; it only lets people sign in with a short username).

create or replace function public._create_auth_user(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_email text := lower(btrim(p_username)) || '@mashaal.internal';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
  return v_uid;
end $$;
revoke all on function public._create_auth_user(text, text) from public, anon, authenticated;

create or replace function public.admin_list_users()
returns table (
  user_id uuid, username text, full_name text, role text, phone text,
  is_active boolean, must_change_password boolean, sites text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles pr where pr.user_id = auth.uid() and pr.role = 'owner' and pr.is_active) then
    raise exception 'Only an owner can manage users';
  end if;
  return query
    select p.user_id, p.username, p.full_name, p.role, p.phone, p.is_active, p.must_change_password,
           array(select ps2.site_id from public.profile_stations ps2 where ps2.user_id = p.user_id order by ps2.site_id)
      from public.profiles p
     where exists (
             select 1 from public.profile_stations ps
              where ps.user_id = p.user_id and public.is_owner_of(ps.site_id))
     order by p.username;
end $$;

create or replace function public.admin_upsert_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      text,
  p_phone     text,
  p_sites     text[],
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_uid      uuid;
  v_site     text;
  v_caller   uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles pr where pr.user_id = v_caller and pr.role = 'owner' and pr.is_active) then
    raise exception 'Only an owner can manage users';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    raise exception 'Username must be 3-40 characters: letters, digits, dot, dash or underscore';
  end if;
  if p_role is null or p_role not in ('owner', 'manager', 'cashier') then
    raise exception 'Role must be owner, manager or cashier';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'Full name is required';
  end if;
  if p_sites is null or cardinality(p_sites) = 0 then
    raise exception 'Select at least one station';
  end if;
  foreach v_site in array p_sites loop
    if not public.is_owner_of(v_site) then
      raise exception 'You are not an owner of station %', v_site;
    end if;
  end loop;

  select pr.user_id into v_uid from public.profiles pr where pr.username = v_username;

  if v_uid is null then
    if p_password is null or length(p_password) < 8 then
      raise exception 'Password must be at least 8 characters';
    end if;
    v_uid := public._create_auth_user(v_username, p_password);
    insert into public.profiles (user_id, username, full_name, role, phone, is_active, must_change_password)
    values (v_uid, v_username, btrim(p_full_name), p_role, coalesce(p_phone, ''), coalesce(p_is_active, true), true);
  else
    if not exists (
         select 1 from public.profile_stations ps
          where ps.user_id = v_uid and public.is_owner_of(ps.site_id)) then
      raise exception 'You are not allowed to modify this user';
    end if;
    if v_uid = v_caller and (p_role <> 'owner' or coalesce(p_is_active, true) = false) then
      raise exception 'You cannot demote or disable your own account';
    end if;
    update public.profiles
       set full_name = btrim(p_full_name), role = p_role, phone = coalesce(p_phone, ''),
           is_active = coalesce(p_is_active, true)
     where user_id = v_uid;
    if p_password is not null and p_password <> '' then
      if length(p_password) < 8 then
        raise exception 'Password must be at least 8 characters';
      end if;
      update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_uid;
      update public.profiles set must_change_password = (v_uid <> v_caller) where user_id = v_uid;
    end if;
    update auth.users
       set banned_until = case when coalesce(p_is_active, true) then null else 'infinity'::timestamptz end
     where id = v_uid;
  end if;

  -- replace station access, but only for stations the caller owns
  delete from public.profile_stations
   where user_id = v_uid and public.is_owner_of(site_id) and not (site_id = any (p_sites));
  insert into public.profile_stations (user_id, site_id)
  select v_uid, s from unnest(p_sites) as s
  on conflict do nothing;

  return v_uid;
end $$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles pr where pr.user_id = auth.uid() and pr.role = 'owner' and pr.is_active) then
    raise exception 'Only an owner can manage users';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  if not exists (
       select 1 from public.profile_stations ps
        where ps.user_id = p_user_id and public.is_owner_of(ps.site_id)) then
    raise exception 'You are not allowed to delete this user';
  end if;
  delete from auth.users where id = p_user_id;   -- profile + station access cascade
end $$;

-- ---- function privileges -------------------------------------------------
revoke all on function public.apply_ops(text, jsonb)                            from public, anon;
revoke all on function public.next_doc_no(text, text, bigint)                   from public, anon;
revoke all on function public.mark_password_changed()                           from public, anon;
revoke all on function public.admin_list_users()                                from public, anon;
revoke all on function public.admin_upsert_user(text, text, text, text, text, text[], boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid)                           from public, anon;
grant execute on function public.apply_ops(text, jsonb)                         to authenticated;
grant execute on function public.next_doc_no(text, text, bigint)                to authenticated;
grant execute on function public.mark_password_changed()                        to authenticated;
grant execute on function public.admin_list_users()                             to authenticated;
grant execute on function public.admin_upsert_user(text, text, text, text, text, text[], boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid)                        to authenticated;
