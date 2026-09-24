import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { getSupabase, setPersistSession } from '../services/supabase'
import type { AuditEntry, Brand, SiteId, StationSummary, User, UserRole } from '../types'
import type { Backend, DocKind, ManagedUser, SaveUserInput, StationProfilePatch } from './backend'
import { AppError, friendlyError } from './errors'
import type { Op } from './ops'
import { EMPTY_SETTINGS, COLLECTION_KEYS, emptyRaw, type OpResult } from './raw'
import { LOADED_TABLES, MANAGER_ONLY_TABLES, TABLES, fromRow, settingsFromRow, type Row } from './tables'

/** People sign in with a short username; the account e-mail is derived from it (nothing is ever sent to it). */
export const AUTH_EMAIL_DOMAIN = 'mashaal.internal'
const emailFor = (username: string) => `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`

const PAGE = 1000

interface StationRow {
  site_id: string
  table_prefix: string
  code: string
  name: string
  location: string
  brand: string
  brand_color: string
  phone: string
  manager_name: string
  ntn: string
}

const toSummary = (r: StationRow): StationSummary => ({
  id: r.site_id,
  code: r.code,
  name: r.name,
  location: r.location,
  brand: (r.brand === 'PSO' ? 'PSO' : 'TOTAL PARCO') as Brand,
  brandColor: r.brand_color,
})

export function createSupabaseBackend(): Backend {
  const sb = () => getSupabase()
  const prefixes = new Map<SiteId, string>()

  const prefixOf = async (siteId: SiteId): Promise<string> => {
    const cached = prefixes.get(siteId)
    if (cached) return cached
    const { data, error } = await sb().from('stations').select('site_id, table_prefix')
    if (error) throw new AppError(friendlyError(error))
    for (const r of data ?? []) prefixes.set(r.site_id as string, r.table_prefix as string)
    const p = prefixes.get(siteId)
    if (!p) throw new AppError(`Unknown station ${siteId}`)
    return p
  }

  const fetchAll = async (table: string): Promise<Row[]> => {
    const out: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb().from(table).select('*').order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (error) throw new AppError(friendlyError(error))
      const rows = (data ?? []) as Row[]
      out.push(...rows)
      if (rows.length < PAGE) break
    }
    return out
  }

  const loadProfile = async (userId: string): Promise<User | null> => {
    const [{ data: p, error: pe }, { data: ps, error: se }] = await Promise.all([
      sb().from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      sb().from('profile_stations').select('site_id').eq('user_id', userId),
    ])
    if (pe) throw new AppError(friendlyError(pe))
    if (se) throw new AppError(friendlyError(se))
    if (!p) return null
    if (!p.is_active) throw new AppError('This account has been disabled. Contact the station owner.')
    return {
      id: p.user_id as string,
      name: p.full_name as string,
      username: p.username as string,
      role: p.role as UserRole,
      phone: (p.phone as string) ?? '',
      stationAccess: (ps ?? []).map((r) => r.site_id as string),
      mustChangePassword: Boolean(p.must_change_password),
    }
  }

  return {
    kind: 'supabase',

    // ------------------------------------------------------------------ accounts
    async restoreSession() {
      const { data } = await sb().auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return null
      try {
        const user = await loadProfile(uid)
        if (!user) await sb().auth.signOut()
        return user
      } catch {
        await sb().auth.signOut()
        return null
      }
    },

    async signIn(username, password, keepSignedIn) {
      setPersistSession(keepSignedIn)
      const { data, error } = await sb().auth.signInWithPassword({ email: emailFor(username), password })
      if (error || !data.user) {
        if (error && /invalid login|invalid credentials/i.test(error.message)) {
          throw new AppError('Invalid username or password. Please try again.')
        }
        throw new AppError(error ? friendlyError(error) : 'Sign-in failed.')
      }
      try {
        const user = await loadProfile(data.user.id)
        if (!user) {
          await sb().auth.signOut()
          throw new AppError('This account has no station access yet. Contact the station owner.')
        }
        return user
      } catch (e) {
        await sb().auth.signOut()
        throw e
      }
    },

    async signOut() {
      await sb().auth.signOut()
    },

    async changePassword(newPassword) {
      const { error } = await sb().auth.updateUser({ password: newPassword })
      if (error) throw new AppError(friendlyError(error))
    },

    onSignedOut(callback) {
      const { data } = sb().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') callback()
      })
      return () => data.subscription.unsubscribe()
    },

    async markPasswordChanged() {
      const { error } = await sb().rpc('mark_password_changed')
      if (error) throw new AppError(friendlyError(error))
    },

    // ------------------------------------------------------------------ stations
    async listStations() {
      const { data, error } = await sb().from('stations').select('*').order('site_id')
      if (error) throw new AppError(friendlyError(error))
      const rows = (data ?? []) as StationRow[]
      for (const r of rows) prefixes.set(r.site_id, r.table_prefix)
      return rows.map(toSummary)
    },

    async loadStation(siteId, role) {
      const prefix = await prefixOf(siteId)
      const { data: st, error: stErr } = await sb().from('stations').select('*').eq('site_id', siteId).maybeSingle()
      if (stErr) throw new AppError(friendlyError(stErr))
      if (!st) throw new AppError(`Station ${siteId} was not found.`)
      const s = st as StationRow

      const tables = LOADED_TABLES.filter((t) => role !== 'cashier' || !MANAGER_ONLY_TABLES.includes(t))
      const [settingsRows, ...rowSets] = await Promise.all([
        fetchAll(`${prefix}_station_settings`),
        ...tables.map((t) => fetchAll(`${prefix}_${t}`)),
      ])

      const raw = emptyRaw(
        {
          id: s.site_id, code: s.code, name: s.name, location: s.location,
          brand: (s.brand === 'PSO' ? 'PSO' : 'TOTAL PARCO') as Brand, brandColor: s.brand_color,
          phone: s.phone, managerName: s.manager_name, ntn: s.ntn,
        },
        settingsRows[0] ? settingsFromRow(settingsRows[0]) : EMPTY_SETTINGS,
      )
      const bag = raw as unknown as Record<string, unknown[]>
      tables.forEach((t, i) => {
        bag[TABLES[t].key] = rowSets[i].map((r) => fromRow(t, r, siteId))
      })
      // every collection exists even when a role may not read it
      for (const k of COLLECTION_KEYS) if (!bag[k]) bag[k] = []
      return raw
    },

    async applyOps(siteId, ops: Op[]) {
      if (ops.length === 0) return []
      const { data, error } = await sb().rpc('apply_ops', { p_site: siteId, p_ops: ops })
      if (error) throw new AppError(friendlyError(error), error.code)
      return (data ?? []) as OpResult[]
    },

    async nextDocNo(siteId, kind: DocKind) {
      const { data, error } = await sb().rpc('next_doc_no', { p_site: siteId, p_kind: kind })
      if (error) throw new AppError(friendlyError(error), error.code)
      return Number(data)
    },

    subscribe(siteId, { onChange, onStatus, onResync }) {
      let closed = false
      let wasOffline = false
      let buffer: OpResult[] = []
      let timer: ReturnType<typeof setTimeout> | null = null
      let channel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null

      const flush = () => {
        timer = null
        if (buffer.length) {
          const batch = buffer
          buffer = []
          onChange(batch)
        }
      }
      const push = (r: OpResult) => {
        buffer.push(r)
        if (!timer) timer = setTimeout(flush, 120)
      }

      onStatus('connecting')
      void prefixOf(siteId).then((prefix) => {
        if (closed) return
        const ch = sb().channel(`station-${siteId}`)
        const watch = (physical: string, logical: string) => {
          ch.on('postgres_changes', { event: '*', schema: 'public', table: physical }, (p: RealtimePostgresChangesPayload<Row>) => {
            if (p.eventType === 'DELETE') {
              const id = (p.old as Row | undefined)?.id
              if (id !== undefined) push({ t: logical, a: 'delete', row: { id } })
            } else if (p.new) {
              push({ t: logical, a: 'upsert', row: p.new as Row })
            }
          })
        }
        watch(`${prefix}_station_settings`, 'station_settings')
        for (const t of LOADED_TABLES) watch(`${prefix}_${t}`, t)
        ch.subscribe((status) => {
          if (closed) return
          if (status === 'SUBSCRIBED') {
            onStatus('live')
            if (wasOffline) {
              wasOffline = false
              onResync()
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            wasOffline = true
            onStatus('offline')
          }
        })
        channel = ch
      }).catch(() => onStatus('offline'))

      return () => {
        closed = true
        if (timer) clearTimeout(timer)
        if (channel) void sb().removeChannel(channel)
      }
    },

    async updateStationProfile(siteId, patch: StationProfilePatch) {
      const row: Record<string, string> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.location !== undefined) row.location = patch.location
      if (patch.phone !== undefined) row.phone = patch.phone
      if (patch.managerName !== undefined) row.manager_name = patch.managerName
      if (patch.ntn !== undefined) row.ntn = patch.ntn
      const { data, error } = await sb().from('stations').update(row).eq('site_id', siteId).select('site_id')
      if (error) throw new AppError(friendlyError(error))
      if (!data || data.length === 0) throw new AppError('Your account does not have permission to edit the station profile.')
    },

    async loadAudit(siteId, limit) {
      const prefix = await prefixOf(siteId)
      const { data, error } = await sb().from(`${prefix}_audit_log`).select('*').order('at', { ascending: false }).limit(limit)
      if (error) throw new AppError(friendlyError(error))
      return ((data ?? []) as Row[]).map((r): AuditEntry => ({
        id: String(r.id),
        at: String(r.at),
        actor: String(r.actor ?? ''),
        action: String(r.action ?? ''),
        entity: String(r.entity ?? ''),
        entityId: String(r.entity_id ?? ''),
        summary: String(r.summary ?? ''),
        details: (r.details && typeof r.details === 'object' ? r.details : {}) as Record<string, unknown>,
      }))
    },

    // ------------------------------------------------------------------ user admin
    async listUsers() {
      const { data, error } = await sb().rpc('admin_list_users')
      if (error) throw new AppError(friendlyError(error))
      return ((data ?? []) as Row[]).map((r): ManagedUser => ({
        userId: String(r.user_id),
        username: String(r.username),
        fullName: String(r.full_name),
        role: r.role as UserRole,
        phone: String(r.phone ?? ''),
        isActive: Boolean(r.is_active),
        mustChangePassword: Boolean(r.must_change_password),
        sites: (Array.isArray(r.sites) ? r.sites : []) as string[],
      }))
    },

    async saveUser(input: SaveUserInput) {
      const { error } = await sb().rpc('admin_upsert_user', {
        p_username: input.username,
        p_password: input.password ?? null,
        p_full_name: input.fullName,
        p_role: input.role,
        p_phone: input.phone,
        p_sites: input.sites,
        p_is_active: input.isActive,
      })
      if (error) throw new AppError(friendlyError(error))
    },

    async deleteUser(userId) {
      const { error } = await sb().rpc('admin_delete_user', { p_user_id: userId })
      if (error) throw new AppError(friendlyError(error))
    },
  }
}
