import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildSetupSql } from '../../scripts/build-sql.mjs'

export const root = join(import.meta.dirname, '..', '..')
export const BACKUP_DIR = join(root, 'backups', 'cloud-2026-09-24')

/** Minimal stand-ins for what Supabase provides (auth schema, roles, auth.uid()). */
const SUPABASE_STUBS = `
create schema if not exists auth;
create schema if not exists extensions;
create publication supabase_realtime;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text, email_change_token_current text, phone_change text,
  phone_change_token text, reauthentication_token text, banned_until timestamptz
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
`

export async function newDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STUBS)
  return db
}

/** Recreates the OLD cloud layout (supabase_schema.sql) and loads the real backup rows into it. */
export async function loadLegacyCloud(db: PGlite): Promise<void> {
  await db.exec(readFileSync(join(root, 'supabase_schema.sql'), 'utf8'))
  const tables = [
    'stations', 'fuel_sales', 'tank_dips', 'daybook_vouchers', 'credit_fuel_slips',
    'customer_recoveries', 'omc_invoices', 'tariff_revisions',
  ]
  for (const t of tables) {
    const file = join(BACKUP_DIR, `${t}.json`)
    if (!existsSync(file)) throw new Error(`missing backup file ${file}`)
    const rows = JSON.parse(readFileSync(file, 'utf8'))
    for (const r of rows) {
      await db.query(
        `insert into public.${t} select * from jsonb_populate_record(null::public.${t}, $1::jsonb)`,
        [JSON.stringify(r)],
      )
    }
  }
}

export const setupSql = () => buildSetupSql()

export async function asUser(db: PGlite, userId: string | null, fn: () => Promise<void>) {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  try {
    await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
