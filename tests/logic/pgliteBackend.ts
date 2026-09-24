/**
 * A Backend that talks to a real Postgres (PGlite) running the generated setup.sql — i.e. the real
 * tables, the real apply_ops() function and the real row-level-security policies — so the same test
 * suite that runs against the in-memory backend also proves the SQL and the app agree.
 */
import type { PGlite } from '@electric-sql/pglite'
import { AppError, friendlyError } from '../../src/data/errors'
import type { Backend, ManagedUser, SaveUserInput } from '../../src/data/backend'
import { COLLECTION_KEYS, EMPTY_SETTINGS, emptyRaw, type OpResult } from '../../src/data/raw'
import { LOADED_TABLES, MANAGER_ONLY_TABLES, TABLES, fromRow, settingsFromRow, type Row } from '../../src/data/tables'
import type { AuditEntry, User, UserRole } from '../../src/types'
import { newDb, setupSql } from '../sql/harness'
import { buildFixtures } from '../../src/dev/fixtures'

let shared: Promise<PGlite> | null = null
const PREFIX: Record<string, string> = { 'SITE-01': 's01', 'SITE-02': 's02' }

/** default passwords created by setup.sql */
export const DEFAULT_PASSWORDS: Record<string, string> = {
  owner: 'mashaal@owner', 'naveed.akhtar': 'manager123', 'tariq.cashier': 'cashier123', 'tariq.manager': 'manager123', 'kamran.cashier': 'cashier123',
}

function getDb(): Promise<PGlite> {
  shared ??= (async () => {
    const db = await newDb()
    await db.exec(setupSql())
    return db
  })()
  return shared
}

/** empty every station table and load the fixture data (as the database owner, so RLS is bypassed) */
async function reseed(db: PGlite) {
  const tables = (await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename ~ '^s0[12]_' and tablename <> 's01_station_settings' and tablename <> 's02_station_settings'`)).rows
  await db.exec(`truncate ${tables.map((t) => `public.${t.tablename}`).join(', ')} restart identity cascade`)
  const seed = buildFixtures()
  for (const st of seed.stations) {
    const ops: unknown[] = [{ t: 'station_settings', a: 'update', row: seed.settings[st.id] }]
    for (const t of LOADED_TABLES) for (const row of seed.data[st.id]?.[t] ?? []) ops.push({ t, a: 'insert', row })
    await db.query(`select public.apply_ops($1, $2::jsonb)`, [st.id, JSON.stringify(ops)])
  }
}

export async function createPgliteBackend(): Promise<Backend> {
  const db = await getDb()
  await reseed(db)
  let uid: string | null = null

  const asUser = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
    try {
      return await fn()
    } catch (e) {
      const err = e as { message?: string; code?: string }
      throw new AppError(friendlyError({ message: err.message, code: err.code }), err.code)
    } finally {
      await db.exec('reset role')
    }
  }

  const profile = async (id: string): Promise<User | null> => {
    const p = (await db.query<Row>(`select * from public.profiles where user_id = $1`, [id])).rows[0]
    if (!p) return null
    const sites = (await db.query<{ site_id: string }>(`select site_id from public.profile_stations where user_id = $1`, [id])).rows
    return {
      id, name: String(p.full_name), username: String(p.username), role: p.role as UserRole, phone: String(p.phone),
      stationAccess: sites.map((s) => s.site_id), mustChangePassword: Boolean(p.must_change_password),
    }
  }

  const backend: Backend = {
    kind: 'memory',
    async restoreSession() {
      return uid ? profile(uid) : null
    },
    async signIn(username, password) {
      const r = await db.query<{ id: string }>(
        `select u.id from auth.users u where u.email = $1 and u.encrypted_password = crypt($2, u.encrypted_password)`,
        [`${username.trim().toLowerCase()}@mashaal.internal`, password])
      if (!r.rows[0]) throw new AppError('Invalid username or password. Please try again.')
      uid = r.rows[0].id
      const user = await profile(uid)
      if (!user) throw new AppError('This account has no station access yet.')
      return user
    },
    async signOut() { uid = null },
    onSignedOut() { return () => {} },
    async changePassword(pw) {
      await db.query(`update auth.users set encrypted_password = crypt($1, gen_salt('bf')) where id = $2`, [pw, uid])
    },
    async markPasswordChanged() {
      await asUser(async () => { await db.query('select public.mark_password_changed()') })
    },
    async listStations() {
      return asUser(async () => (await db.query<Row>('select * from public.stations order by site_id')).rows.map((r) => ({
        id: String(r.site_id), code: String(r.code), name: String(r.name), location: String(r.location),
        brand: (r.brand === 'PSO' ? 'PSO' : 'TOTAL PARCO') as 'PSO' | 'TOTAL PARCO', brandColor: String(r.brand_color),
      })))
    },
    async loadStation(siteId, role) {
      const prefix = PREFIX[siteId]
      return asUser(async () => {
        const st = (await db.query<Row>(`select * from public.stations where site_id = $1`, [siteId])).rows[0]
        const settings = (await db.query<{ j: Row }>(`select to_jsonb(x) as j from public.${prefix}_station_settings x`)).rows[0]?.j
        const raw = emptyRaw({
          id: siteId, code: String(st.code), name: String(st.name), location: String(st.location), brand: st.brand === 'PSO' ? 'PSO' : 'TOTAL PARCO',
          brandColor: String(st.brand_color), phone: String(st.phone), managerName: String(st.manager_name), ntn: String(st.ntn),
        }, settings ? settingsFromRow(settings) : EMPTY_SETTINGS)
        const bag = raw as unknown as Record<string, unknown[]>
        for (const t of LOADED_TABLES) {
          if (role === 'cashier' && MANAGER_ONLY_TABLES.includes(t)) continue
          // read rows as JSON, exactly like the real API does (ISO timestamps, numbers as numbers)
          const rows = (await db.query<{ j: Row }>(`select to_jsonb(x) as j from public.${prefix}_${t} x order by id`)).rows
          bag[TABLES[t].key] = rows.map((r) => fromRow(t, r.j, siteId))
        }
        for (const k of COLLECTION_KEYS) if (!bag[k]) bag[k] = []
        return raw
      })
    },
    async applyOps(siteId, ops) {
      return asUser(async () => {
        const r = await db.query<{ apply_ops: OpResult[] }>(`select public.apply_ops($1, $2::jsonb) as apply_ops`, [siteId, JSON.stringify(ops)])
        return r.rows[0].apply_ops
      })
    },
    async nextDocNo(siteId, kind) {
      return asUser(async () => Number((await db.query<{ v: string }>(`select public.next_doc_no($1, $2) as v`, [siteId, kind])).rows[0].v))
    },
    subscribe(_s, { onStatus }) { onStatus('live'); return () => {} },
    async updateStationProfile(siteId, patch) {
      await asUser(async () => {
        const r = await db.query(`update public.stations set name = coalesce($2, name), location = coalesce($3, location), phone = coalesce($4, phone),
          manager_name = coalesce($5, manager_name), ntn = coalesce($6, ntn) where site_id = $1 returning site_id`,
        [siteId, patch.name ?? null, patch.location ?? null, patch.phone ?? null, patch.managerName ?? null, patch.ntn ?? null])
        if (!r.rows.length) throw new AppError('Your account does not have permission to edit the station profile.')
      })
    },
    async loadAudit(siteId, limit) {
      return asUser(async () => (await db.query<{ j: Row }>(`select to_jsonb(x) as j from public.${PREFIX[siteId]}_audit_log x order by at desc, id desc limit $1`, [limit])).rows.map((w): AuditEntry => { const r = w.j; return {
        id: String(r.id), at: String(r.at), actor: String(r.actor), action: String(r.action), entity: String(r.entity), entityId: String(r.entity_id),
        summary: String(r.summary), details: (r.details ?? {}) as Record<string, unknown>,
      } }))
    },
    async listUsers() {
      return asUser(async () => (await db.query<Row>('select * from public.admin_list_users()')).rows.map((r): ManagedUser => ({
        userId: String(r.user_id), username: String(r.username), fullName: String(r.full_name), role: r.role as UserRole, phone: String(r.phone),
        isActive: Boolean(r.is_active), mustChangePassword: Boolean(r.must_change_password), sites: r.sites as string[],
      })))
    },
    async saveUser(i: SaveUserInput) {
      await asUser(async () => {
        await db.query(`select public.admin_upsert_user($1,$2,$3,$4,$5,$6::text[],$7)`, [i.username, i.password ?? null, i.fullName, i.role, i.phone, i.sites, i.isActive])
      })
    },
    async deleteUser(id) {
      await asUser(async () => { await db.query('select public.admin_delete_user($1::uuid)', [id]) })
    },
  }
  return Object.assign(backend, { passwords: DEFAULT_PASSWORDS })
}
