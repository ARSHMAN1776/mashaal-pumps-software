import type { AuditEntry, SiteId, StationSummary, User, UserRole } from '../types'
import type { Op } from './ops'
import type { OpResult, RawStation } from './raw'

export interface ManagedUser {
  userId: string
  username: string
  fullName: string
  role: UserRole
  phone: string
  isActive: boolean
  mustChangePassword: boolean
  sites: SiteId[]
}

export interface SaveUserInput {
  username: string
  /** required for a new user; when set for an existing user it resets their password */
  password?: string
  fullName: string
  role: UserRole
  phone: string
  sites: SiteId[]
  isActive: boolean
}

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

export interface StationProfilePatch {
  name?: string
  location?: string
  phone?: string
  managerName?: string
  ntn?: string
}

export type DocKind = 'slip' | 'receipt' | 'voucher'

/**
 * Everything the app needs from the server. Implemented by the Supabase backend (production)
 * and by an in-memory backend (automated tests and the offline UI preview only).
 */
export interface Backend {
  readonly kind: 'supabase' | 'memory'

  // ---- accounts ----
  restoreSession(): Promise<User | null>
  signIn(username: string, password: string, keepSignedIn: boolean): Promise<User>
  signOut(): Promise<void>
  changePassword(newPassword: string): Promise<void>
  markPasswordChanged(): Promise<void>
  /** Called when the session ends elsewhere (expired, signed out in another tab). Returns an unsubscribe function. */
  onSignedOut(callback: () => void): () => void

  // ---- stations ----
  listStations(): Promise<StationSummary[]>
  loadStation(siteId: SiteId, role: UserRole): Promise<RawStation>
  /** Runs all ops as ONE transaction and returns the resulting rows. Throws AppError. */
  applyOps(siteId: SiteId, ops: Op[]): Promise<OpResult[]>
  nextDocNo(siteId: SiteId, kind: DocKind): Promise<number>
  /** Live changes made by other devices. Returns an unsubscribe function. */
  subscribe(
    siteId: SiteId,
    handlers: {
      onChange: (results: OpResult[]) => void
      onStatus: (status: RealtimeStatus) => void
      /** called after a dropped connection is re-established: reload everything */
      onResync: () => void
    },
  ): () => void
  updateStationProfile(siteId: SiteId, patch: StationProfilePatch): Promise<void>
  loadAudit(siteId: SiteId, limit: number): Promise<AuditEntry[]>

  // ---- user administration (owner only) ----
  listUsers(): Promise<ManagedUser[]>
  saveUser(input: SaveUserInput): Promise<void>
  deleteUser(userId: string): Promise<void>
}
