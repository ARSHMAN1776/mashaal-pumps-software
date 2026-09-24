/** Error raised by the data layer with a message that is safe to show to the user. */
export class AppError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface PgLikeError {
  message?: string
  code?: string
  details?: string
  hint?: string
}

/** Turns a database / network error into a plain-language message. */
export function friendlyError(e: unknown): string {
  if (e instanceof AppError) return e.message
  const err = (e ?? {}) as PgLikeError
  const raw = String(err.message ?? (typeof e === 'string' ? e : '') ?? '')
  const msg = raw.replace(/^apply_ops:\s*/i, '')

  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(raw)) {
    return 'Cannot reach the database (no internet?). Nothing was saved — please try again when the connection is back.'
  }
  if (err.code === '42501' || /row-level security|permission denied/i.test(raw)) {
    return 'Your account does not have permission for this action.'
  }
  if (err.code === '23503' || /foreign key/i.test(raw)) {
    if (/still referenced|update or delete/i.test(raw)) {
      return 'This record cannot be removed because other records (transactions) depend on it.'
    }
    return 'A record this entry depends on no longer exists. Refresh the page and try again.'
  }
  if (err.code === '23505' || /duplicate key|unique constraint/i.test(raw)) {
    return 'A record with the same number/name already exists.'
  }
  if (err.code === '23514' || /violates check constraint/i.test(raw)) {
    return 'One of the values is outside the allowed range.'
  }
  if (err.code === '23502' || /null value in column/i.test(raw)) {
    return 'A required field is missing.'
  }
  if (/jwt|not authenticated|invalid token|session/i.test(raw) && /expired|invalid|missing/i.test(raw)) {
    return 'Your session has expired. Please sign in again.'
  }
  return msg || 'Something went wrong. Please try again.'
}

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string; code?: string }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const okVoid = (): Result<void> => ({ ok: true, value: undefined })
export const fail = (error: string, code?: string): Result<never> => ({ ok: false, error, code })

/** Shown when an edit is refused because someone else saved the same record while the window was open. */
export const STALE_MESSAGE =
  'This record was changed by someone else while you had it open. Nothing was saved. Close this window, open the record again to see their change, then redo yours.'
