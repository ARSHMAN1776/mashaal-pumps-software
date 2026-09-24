import type {
  BankTxType, DaybookCategory, SourceType, StationData, User, UserRole,
} from '../../types'
import { friendlyError, fail, STALE_MESSAGE, type Result } from '../../data/errors'
import { op, type Op } from '../../data/ops'
import type { OpResult, RawStation } from '../../data/raw'
import type { DocKind } from '../../data/backend'
import { timeLabel, todayISO, isValidISODate } from '../../lib/dates'
import { newId } from '../../lib/ids'

/** Everything an action needs. Built fresh for every call so it always sees the latest data. */
export interface ActionCtx {
  siteId: string
  user: User
  /** derived data (balances applied) */
  data: StationData
  /** stored facts */
  raw: RawStation
  /** send ops to the database as one transaction and merge the result into the screen state */
  commit: (ops: Op[]) => Promise<OpResult[]>
  nextNo: (kind: DocKind) => Promise<number>
}

export const EPS = 0.005

export const isManager = (c: ActionCtx) => c.user.role !== 'cashier'
export const isOwner = (c: ActionCtx) => c.user.role === 'owner'

const ROLE_LABEL: Record<UserRole, string> = { owner: 'the owner', manager: 'a manager', cashier: 'a cashier' }

/** Returns a failure when the signed-in user's role is not allowed to do `what`. */
export function needRole(c: ActionCtx, roles: UserRole[], what: string): Result<never> | null {
  if (roles.includes(c.user.role)) return null
  const who = roles.map((r) => ROLE_LABEL[r]).join(' or ')
  return fail(`Only ${who} can ${what}.`, 'FORBIDDEN')
}
export const needManager = (c: ActionCtx, what: string) => needRole(c, ['owner', 'manager'], what)

/**
 * A soft rule. When `cond` is true the action stops with `message` and a code. A manager or owner may
 * knowingly proceed by repeating the action with that code acknowledged; a cashier may not.
 */
export function guard(
  c: ActionCtx, ack: readonly string[] | undefined, code: string, cond: boolean, message: string,
): Result<never> | null {
  if (!cond) return null
  if (isManager(c) && ack?.includes(code)) return null
  return fail(isManager(c) ? message : `${message} Ask a manager to authorize this.`, code)
}

/** Runs an action body and converts any thrown database/network error into a failed Result. */
export async function run<T>(body: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await body()
  } catch (e) {
    return fail(friendlyError(e), (e as { code?: string })?.code)
  }
}

export const money = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : NaN
}
export const isPositive = (n: number) => Number.isFinite(n) && n > 0
export const isNonNegative = (n: number) => Number.isFinite(n) && n >= 0
export const clean = (s: unknown) => String(s ?? '').trim()

/**
 * An edit made on a screen that was opened before someone else saved the same record is refused, so one person
 * can never silently overwrite another's change. The database repeats this check when it saves (see apply_ops).
 */
export function checkVersion(current: { updatedAt?: string } | undefined, version?: string): Result<never> | null {
  if (!version || !current?.updatedAt) return null
  return sameVersion(current.updatedAt, version) ? null : fail(STALE_MESSAGE, 'CONFLICT')
}

/** Two timestamps written differently ("Z" vs "+00:00", trailing zeros) still count as the same version. */
export function sameVersion(a: string, b: string): boolean {
  if (a === b) return true
  const norm = (s: string) => {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(s.trim())
    if (!m) return s.trim()
    const off = m[4] === 'Z' ? '+00:00' : m[4].length === 3 ? `${m[4]}:00` : m[4].includes(':') ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`
    return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0')}${off}`
  }
  return norm(a) === norm(b)
}

/** Nobody can post a record dated in the future; cashiers may only post records dated today. */
export function checkDate(c: ActionCtx, date: string): Result<never> | null {
  if (!isValidISODate(date)) return fail('Enter a valid date.')
  if (date > todayISO()) return fail('The date cannot be in the future.')
  if (!isManager(c) && date !== todayISO()) return fail('Cashiers can only record entries dated today.', 'FORBIDDEN')
  return null
}

export const safeCash = (c: ActionCtx) => (c.data.daybook.length ? c.data.daybook[c.data.daybook.length - 1].balanceAfter : 0)

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------
export const auditOp = (c: ActionCtx, action: string, entity: string, entityId: string, summary: string, details: Record<string, unknown> = {}) =>
  op.audit(c.user.name, action, entity, entityId, summary, details)

// ---------------------------------------------------------------------------
// linked records: cash-book lines and bank lines that belong to another record
// ---------------------------------------------------------------------------
export interface DaybookInput {
  date: string
  particulars: string
  category: DaybookCategory
  cashIn?: number
  cashOut?: number
  referenceNo?: string
  handledBy?: string
  sourceType?: SourceType
  sourceId?: string
}

export function daybookInsertOp(c: ActionCtx, i: DaybookInput): Op {
  return op.insert('daybook_entries', {
    id: newId('DB'),
    date: i.date,
    time: timeLabel(),
    particulars: i.particulars,
    category: i.category,
    cashIn: i.cashIn ?? 0,
    cashOut: i.cashOut ?? 0,
    referenceNo: i.referenceNo ?? '',
    handledBy: i.handledBy || c.user.name,
    sourceType: i.sourceType ?? '',
    sourceId: i.sourceId ?? '',
  })
}

/** Create / update / remove the cash-book line that belongs to (sourceType, sourceId). */
export function syncLinkedDaybook(c: ActionCtx, sourceType: SourceType, sourceId: string, desired: DaybookInput | null): Op[] {
  const existing = c.raw.daybook.find((e) => e.sourceType === sourceType && e.sourceId === sourceId)
  if (!desired) return existing ? [op.remove('daybook_entries', existing.id)] : []
  if (existing) {
    return [op.update('daybook_entries', {
      ...existing,
      date: desired.date,
      particulars: desired.particulars,
      category: desired.category,
      cashIn: desired.cashIn ?? 0,
      cashOut: desired.cashOut ?? 0,
      referenceNo: desired.referenceNo ?? '',
    })]
  }
  return [daybookInsertOp(c, { ...desired, sourceType, sourceId })]
}

export interface BankTxInput {
  bankId: string
  date: string
  type: BankTxType
  amount: number
  depositSlipNo?: string
  description: string
  sourceType?: SourceType
  sourceId?: string
}

export function bankTxInsertOp(i: BankTxInput): Op {
  return op.insert('bank_transactions', {
    id: newId('BTX'),
    bankId: i.bankId,
    date: i.date,
    type: i.type,
    amount: i.amount,
    depositSlipNo: i.depositSlipNo ?? '',
    description: i.description,
    sourceType: i.sourceType ?? '',
    sourceId: i.sourceId ?? '',
  })
}

export function syncLinkedBankTx(c: ActionCtx, sourceType: SourceType, sourceId: string, desired: BankTxInput | null): Op[] {
  const existing = c.raw.bankTransactions.find((t) => t.sourceType === sourceType && t.sourceId === sourceId)
  if (!desired) return existing ? [op.remove('bank_transactions', existing.id)] : []
  if (existing) {
    return [op.update('bank_transactions', {
      ...existing,
      bankId: desired.bankId,
      date: desired.date,
      type: desired.type,
      amount: desired.amount,
      depositSlipNo: desired.depositSlipNo ?? '',
      description: desired.description,
    })]
  }
  return [bankTxInsertOp({ ...desired, sourceType, sourceId })]
}

export const bankBalance = (c: ActionCtx, bankId: string) =>
  c.data.bankAccounts.find((b) => b.id === bankId)?.currentBalance ?? 0

export const fmt = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`
