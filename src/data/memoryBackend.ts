/**
 * In-memory Backend — used ONLY by automated tests and by the offline UI preview
 * (`npm run dev:preview`). It mirrors what the real database enforces (unique keys, foreign keys with
 * ON DELETE RESTRICT, role permissions, all-or-nothing writes) so business rules can be tested without a
 * server. It is never part of the production build.
 */
import type { AuditEntry, SiteId, StationSummary, User, UserRole } from '../types'
import type { Backend, DocKind, ManagedUser, SaveUserInput, StationProfilePatch } from './backend'
import { AppError } from './errors'
import type { Op } from './ops'
import { COLLECTION_KEYS, EMPTY_SETTINGS, emptyRaw, type OpResult, type RawStation } from './raw'
import { LOADED_TABLES, MANAGER_ONLY_TABLES, TABLES, fromRow, settingsFromRow, type Row } from './tables'

export interface MemoryStation extends StationSummary {
  phone: string
  managerName: string
  ntn: string
}
export interface MemoryAccount {
  username: string
  password: string
  fullName: string
  role: UserRole
  phone: string
  sites: SiteId[]
  isActive?: boolean
  mustChangePassword?: boolean
}
export interface MemorySeed {
  stations: MemoryStation[]
  accounts: MemoryAccount[]
  /** logical table -> rows (database shape), per station */
  data: Record<SiteId, Record<string, Row[]>>
  settings: Record<SiteId, Row>
}

type Tables = Record<string, Row[]>

const OPS_TABLES = ['fuel_sales', 'tank_dips', 'daybook_entries', 'credit_slips', 'customer_recoveries', 'expenses', 'lubricant_movements', 'audit_log']
const REF_TABLES = ['station_settings', 'tanks', 'nozzles', 'customers', 'customer_adjustments', 'lubricant_products', 'bank_accounts', 'shifts']

/** child table -> [foreign key column, parent table] (ON DELETE RESTRICT) */
const FKS: Record<string, [string, string][]> = {
  nozzles: [['tank_id', 'tanks']],
  tank_dips: [['tank_id', 'tanks']],
  bank_transactions: [['bank_id', 'bank_accounts']],
  credit_slips: [['customer_id', 'customers']],
  customer_recoveries: [['customer_id', 'customers']],
  customer_adjustments: [['customer_id', 'customers']],
  staff_advances: [['staff_id', 'staff_members']],
  staff_salary_payments: [['staff_id', 'staff_members']],
  lubricant_movements: [['product_id', 'lubricant_products']],
  supplier_transactions: [['supplier_id', 'suppliers']],
}

const UNIQUE: Record<string, string[][]> = {
  tanks: [['tank_no']],
  nozzles: [['dispenser_no', 'nozzle_no']],
  omc_invoices: [['invoice_no']],
}

const clone = <T>(v: T): T => structuredClone(v)

export function createMemoryBackend(seed: MemorySeed): Backend {
  const stations = clone(seed.stations)
  const accounts = clone(seed.accounts).map((a) => ({ ...a, isActive: a.isActive ?? true, mustChangePassword: a.mustChangePassword ?? false }))
  const db: Record<SiteId, Tables> = {}
  const settings: Record<SiteId, Row> = clone(seed.settings)
  const counters: Record<SiteId, Record<string, number>> = {}
  const audit: Record<SiteId, Row[]> = {}
  let seq = 1000
  let tick = 0
  let session: MemoryAccount | null = null

  for (const st of stations) {
    db[st.id] = {}
    counters[st.id] = {}
    audit[st.id] = []
    for (const t of LOADED_TABLES) db[st.id][t] = []
    for (const [t, rows] of Object.entries(seed.data[st.id] ?? {})) {
      db[st.id][t] = clone(rows).map((r) => stamp(t, r))
    }
  }

  function stamp(table: string, row: Row): Row {
    const out: Row = { ...row }
    if (out.created_at === undefined) {
      tick += 1
      out.created_at = new Date(Date.UTC(2026, 0, 1) + tick * 1000).toISOString().replace('Z', '+00:00')
    }
    if (table === 'daybook_entries' && out.seq === undefined) out.seq = ++seq
    return out
  }

  const toUser = (a: MemoryAccount): User => ({
    id: `mem-${a.username}`, name: a.fullName, username: a.username, role: a.role, phone: a.phone, stationAccess: [...a.sites],
    mustChangePassword: Boolean(a.mustChangePassword),
  })

  const currentRole = (siteId: SiteId): UserRole | null => (session && session.isActive && session.sites.includes(siteId) ? session.role : null)

  function assertAllowed(role: UserRole | null, table: string, action: string) {
    if (!role) throw new AppError('Your account does not have permission for this action.', '42501')
    if (role !== 'cashier') return
    const managerOnly = MANAGER_ONLY_TABLES as string[]
    if (managerOnly.includes(table) || REF_TABLES.includes(table) || !OPS_TABLES.includes(table)) {
      throw new AppError('Your account does not have permission for this action.', '42501')
    }
    if (action !== 'insert' && action !== 'insert_ignore') throw new AppError('Your account does not have permission for this action.', '42501')
  }

  function checkUnique(tables: Tables, table: string, row: Row) {
    for (const cols of UNIQUE[table] ?? []) {
      const dup = tables[table].find((r) => r.id !== row.id && cols.every((c) => r[c] === row[c]))
      if (dup) throw new AppError('A record with the same number/name already exists.', '23505')
    }
  }
  function checkFks(tables: Tables, table: string, row: Row) {
    for (const [col, parent] of FKS[table] ?? []) {
      if (!tables[parent].some((p) => p.id === row[col])) {
        throw new AppError('A record this entry depends on no longer exists. Refresh the page and try again.', '23503')
      }
    }
  }
  function checkNotReferenced(tables: Tables, table: string, id: string) {
    for (const [child, fks] of Object.entries(FKS)) {
      for (const [col, parent] of fks) {
        if (parent === table && tables[child].some((r) => r[col] === id)) {
          throw new AppError('This record cannot be removed because other records (transactions) depend on it.', '23503')
        }
      }
    }
  }

  const backend: Backend = {
    kind: 'memory',

    async restoreSession() {
      return session ? toUser(session) : null
    },
    async signIn(username, password) {
      const a = accounts.find((x) => x.username === username.trim().toLowerCase())
      if (!a || a.password !== password) throw new AppError('Invalid username or password. Please try again.')
      if (!a.isActive) throw new AppError('This account has been disabled. Contact the station owner.')
      session = a
      return toUser(a)
    },
    async signOut() {
      session = null
    },
    async changePassword(pw) {
      if (!session) throw new AppError('Please sign in first.')
      if (pw.length < 8) throw new AppError('Password must be at least 8 characters.')
      session.password = pw
    },
    onSignedOut() {
      return () => {}
    },
    async markPasswordChanged() {
      if (session) session.mustChangePassword = false
    },

    async listStations() {
      return stations.map(({ id, code, name, location, brand, brandColor }) => ({ id, code, name, location, brand, brandColor }))
    },

    async loadStation(siteId, role) {
      const st = stations.find((s) => s.id === siteId)
      if (!st) throw new AppError(`Station ${siteId} was not found.`)
      if (!currentRole(siteId)) throw new AppError('Your account does not have permission for this action.', '42501')
      const raw: RawStation = emptyRaw(
        { id: st.id, code: st.code, name: st.name, location: st.location, brand: st.brand, brandColor: st.brandColor, phone: st.phone, managerName: st.managerName, ntn: st.ntn },
        settings[siteId] ? settingsFromRow(settings[siteId]) : EMPTY_SETTINGS,
      )
      const bag = raw as unknown as Record<string, unknown[]>
      for (const t of LOADED_TABLES) {
        if (role === 'cashier' && MANAGER_ONLY_TABLES.includes(t)) continue
        bag[TABLES[t].key] = clone(db[siteId][t]).map((r) => fromRow(t, r, siteId))
      }
      for (const k of COLLECTION_KEYS) if (!bag[k]) bag[k] = []
      return raw
    },

    async applyOps(siteId, ops: Op[]) {
      const role = currentRole(siteId)
      const draft = clone(db[siteId])
      const draftSettings = clone(settings[siteId] ?? { id: 'main' })
      const draftAudit = clone(audit[siteId])
      const out: OpResult[] = []
      const savedSeq = seq
      const savedTick = tick
      try {
        for (const o of ops) {
          const table = o.t as string
          assertAllowed(role, table, o.a)
          const row = o.row ? ({ ...o.row } as Row) : {}
          delete row.site_id
          if (table === 'station_settings') {
            Object.assign(draftSettings, row)
            out.push({ t: table, a: 'upsert', row: { ...draftSettings } })
            continue
          }
          if (table === 'audit_log') {
            const r = stamp(table, { at: new Date().toISOString(), id: `AUD-${++tick}`, ...row })
            draftAudit.push(r)
            continue
          }
          const list = draft[table]
          if (!list) throw new AppError(`apply_ops: table "${table}" is not writable`)
          const id = row.id === undefined ? undefined : String(row.id)
          const i = id === undefined ? -1 : list.findIndex((r) => r.id === id)
          switch (o.a) {
            case 'insert':
            case 'insert_ignore': {
              if (i >= 0) {
                if (o.a === 'insert_ignore') break
                throw new AppError('A record with the same number/name already exists.', '23505')
              }
              const r = stamp(table, row)
              checkUnique(draft, table, r)
              checkFks(draft, table, r)
              list.push(r)
              out.push({ t: table, a: 'upsert', row: clone(r) })
              break
            }
            case 'upsert': {
              const r = i >= 0 ? { ...list[i], ...row } : stamp(table, row)
              checkUnique(draft, table, r)
              checkFks(draft, table, r)
              if (i >= 0) list[i] = r
              else list.push(r)
              out.push({ t: table, a: 'upsert', row: clone(r) })
              break
            }
            case 'update': {
              if (i < 0) throw new AppError(`apply_ops: ${table} "${id}" was not found (or you do not have permission to change it)`)
              const r = { ...list[i], ...row }
              checkUnique(draft, table, r)
              checkFks(draft, table, r)
              list[i] = r
              out.push({ t: table, a: 'upsert', row: clone(r) })
              break
            }
            case 'delete': {
              if (i >= 0) {
                checkNotReferenced(draft, table, String(id))
                list.splice(i, 1)
              }
              out.push({ t: table, a: 'delete', row: { id } })
              break
            }
            case 'purge': {
              for (const r of list) checkNotReferenced(draft, table, String(r.id))
              draft[table] = []
              out.push({ t: table, a: 'purge' })
              break
            }
          }
        }
      } catch (e) {
        seq = savedSeq
        tick = savedTick
        throw e
      }
      db[siteId] = draft
      settings[siteId] = draftSettings
      audit[siteId] = draftAudit
      return out
    },

    async nextDocNo(siteId, kind: DocKind) {
      if (!currentRole(siteId)) throw new AppError('You do not have access to this station')
      const c = counters[siteId]
      c[kind] = (c[kind] ?? 1000) + 1
      return c[kind]
    },

    subscribe(_siteId, { onStatus }) {
      onStatus('live')
      return () => {}
    },

    async updateStationProfile(siteId, patch: StationProfilePatch) {
      const st = stations.find((s) => s.id === siteId)
      if (!st) throw new AppError('Station not found.')
      if (currentRole(siteId) === 'cashier') throw new AppError('Your account does not have permission to edit the station profile.')
      Object.assign(st, {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.location !== undefined && { location: patch.location }),
        ...(patch.phone !== undefined && { phone: patch.phone }),
        ...(patch.managerName !== undefined && { managerName: patch.managerName }),
        ...(patch.ntn !== undefined && { ntn: patch.ntn }),
      })
    },

    async loadAudit(siteId, limit) {
      return [...audit[siteId]].reverse().slice(0, limit).map((r): AuditEntry => ({
        id: String(r.id), at: String(r.at), actor: String(r.actor ?? ''), action: String(r.action ?? ''), entity: String(r.entity ?? ''),
        entityId: String(r.entity_id ?? ''), summary: String(r.summary ?? ''), details: (r.details as Record<string, unknown>) ?? {},
      }))
    },

    async listUsers(): Promise<ManagedUser[]> {
      if (session?.role !== 'owner') throw new AppError('Only an owner can manage users')
      const mine = new Set(session.sites)
      return accounts.filter((a) => a.sites.some((s) => mine.has(s))).map((a) => ({
        userId: `mem-${a.username}`, username: a.username, fullName: a.fullName, role: a.role, phone: a.phone,
        isActive: Boolean(a.isActive), mustChangePassword: Boolean(a.mustChangePassword), sites: [...a.sites],
      }))
    },
    async saveUser(input: SaveUserInput) {
      if (session?.role !== 'owner') throw new AppError('Only an owner can manage users')
      const username = input.username.trim().toLowerCase()
      const existing = accounts.find((a) => a.username === username)
      if (!existing) {
        if (!input.password || input.password.length < 8) throw new AppError('Password must be at least 8 characters')
        accounts.push({ username, password: input.password, fullName: input.fullName, role: input.role, phone: input.phone, sites: [...input.sites], isActive: input.isActive, mustChangePassword: true })
      } else {
        if (existing === session && (input.role !== 'owner' || !input.isActive)) throw new AppError('You cannot demote or disable your own account')
        Object.assign(existing, { fullName: input.fullName, role: input.role, phone: input.phone, sites: [...input.sites], isActive: input.isActive })
        if (input.password) Object.assign(existing, { password: input.password, mustChangePassword: existing !== session })
      }
    },
    async deleteUser(userId) {
      if (session?.role !== 'owner') throw new AppError('Only an owner can manage users')
      const i = accounts.findIndex((a) => `mem-${a.username}` === userId)
      if (i < 0) return
      if (accounts[i] === session) throw new AppError('You cannot delete your own account')
      accounts.splice(i, 1)
    },
  }
  return backend
}
