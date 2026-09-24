import type { AuditEntry } from '../types'
import { TABLES, settingsToRow, toRow, type Row, type TableName } from './tables'
import type { StationSettings } from '../types'

export type OpAction = 'insert' | 'insert_ignore' | 'upsert' | 'update' | 'delete' | 'purge'

/** One database write. A list of ops is sent to apply_ops() and runs as a single transaction. */
export interface Op {
  t: TableName
  a: OpAction
  row?: Row
}

type Model = Record<string, unknown>
type StoredTable = keyof typeof TABLES

export const op = {
  insert: (t: StoredTable, model: object): Op => ({ t, a: 'insert', row: toRow(t, model as Model) }),
  insertIgnore: (t: StoredTable, model: object): Op => ({ t, a: 'insert_ignore', row: toRow(t, model as Model) }),
  update: (t: StoredTable, model: object): Op => ({ t, a: 'update', row: toRow(t, model as Model) }),
  upsert: (t: StoredTable, model: object): Op => ({ t, a: 'upsert', row: toRow(t, model as Model) }),
  remove: (t: StoredTable, id: string): Op => ({ t, a: 'delete', row: { id } }),
  purge: (t: StoredTable): Op => ({ t, a: 'purge' }),
  settings: (s: StationSettings): Op => ({ t: 'station_settings', a: 'update', row: settingsToRow(s) }),
  audit: (actor: string, action: string, entity: string, entityId: string, summary: string, details: Record<string, unknown> = {}): Op => ({
    t: 'audit_log',
    a: 'insert',
    row: { actor, action, entity, entity_id: entityId, summary, details },
  }),
}

export type AuditRow = Omit<AuditEntry, 'id' | 'at'>
