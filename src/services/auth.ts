/**
 * auth.ts — Mashaal Software Authentication Service
 *
 * Provides credential validation and session persistence (the "Keep me signed
 * in" feature). Credentials are seeded from the known staff roster.
 *
 * Each entry maps a site + username + password → User object.
 * Passwords are stored as plain strings here because:
 *  a) There is no server — everything runs client-side.
 *  b) localStorage is already readable by anyone with physical device access.
 *  c) Hashing client-side without a server provides no meaningful security gain.
 */

import type { User, UserRole } from '../types'
import { storageGet, storageSet, storageRemove } from './storage'

// ---------------------------------------------------------------------------
// Credential registry
// ---------------------------------------------------------------------------

interface Credential {
  username: string
  password: string
  user: User
}

const CREDENTIALS: Credential[] = [
  // ── SITE-01: TOTAL PARCO ────────────────────────────────────────────────
  {
    username: 'owner',
    password: 'mashaal@owner',
    user: {
      id: 'USR-OWNER-01',
      name: 'Total PARCO Station Owner',
      username: 'owner',
      role: 'owner' as UserRole,
      phone: '0300-0000000',
      stationAccess: ['SITE-01'],
    },
  },
  {
    username: 'owner.parco',
    password: 'parco@owner',
    user: {
      id: 'USR-OWNER-PARCO',
      name: 'Total PARCO Station Owner',
      username: 'owner.parco',
      role: 'owner' as UserRole,
      phone: '0300-1111111',
      stationAccess: ['SITE-01'],
    },
  },
  {
    username: 'naveed.akhtar',
    password: 'manager123',
    user: {
      id: 'USR-MGR-01',
      name: 'Naveed Akhtar',
      username: 'naveed.akhtar',
      role: 'manager' as UserRole,
      phone: '0300-6729104',
      stationAccess: ['SITE-01'],
    },
  },
  {
    username: 'tariq.cashier',
    password: 'cashier123',
    user: {
      id: 'USR-CSH-01',
      name: 'Tariq Mehmood',
      username: 'tariq.cashier',
      role: 'cashier' as UserRole,
      phone: '0301-5582910',
      stationAccess: ['SITE-01'],
    },
  },
  // ── SITE-02: PAKISTAN STATE OIL (PSO) ───────────────────────────────────
  {
    username: 'owner',
    password: 'mashaal@owner',
    user: {
      id: 'USR-OWNER-02',
      name: 'PSO Station Owner',
      username: 'owner',
      role: 'owner' as UserRole,
      phone: '0321-2222222',
      stationAccess: ['SITE-02'],
    },
  },
  {
    username: 'owner.pso',
    password: 'pso@owner',
    user: {
      id: 'USR-OWNER-PSO',
      name: 'PSO Station Owner',
      username: 'owner.pso',
      role: 'owner' as UserRole,
      phone: '0321-2222222',
      stationAccess: ['SITE-02'],
    },
  },
  {
    username: 'tariq.manager',
    password: 'manager123',
    user: {
      id: 'USR-MGR-02',
      name: 'Chaudhry Tariq Mehmood',
      username: 'tariq.manager',
      role: 'manager' as UserRole,
      phone: '0321-4455667',
      stationAccess: ['SITE-02'],
    },
  },
  {
    username: 'kamran.cashier',
    password: 'cashier123',
    user: {
      id: 'USR-CSH-02',
      name: 'Kamran Ali',
      username: 'kamran.cashier',
      role: 'cashier' as UserRole,
      phone: '0300-9876543',
      stationAccess: ['SITE-02'],
    },
  },
  // ── Cross-station Demo Accounts (Staff/Manager only) ────────────────────
  {
    username: 'station.manager',
    password: 'manager123',
    user: {
      id: 'USR-DEMO-MGR',
      name: 'Station Manager',
      username: 'station.manager',
      role: 'manager' as UserRole,
      phone: '0300-0000001',
      stationAccess: ['SITE-01', 'SITE-02'],
    },
  },
  {
    username: 'station.cashier',
    password: 'cashier123',
    user: {
      id: 'USR-DEMO-CSH',
      name: 'Station Cashier',
      username: 'station.cashier',
      role: 'cashier' as UserRole,
      phone: '0300-0000002',
      stationAccess: ['SITE-01', 'SITE-02'],
    },
  },
]

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Validate credentials against the credential registry.
 * The `siteId` parameter is strictly checked against the user's stationAccess.
 * The authenticated session is tightly locked to `[siteId]` to prevent any
 * cross-company or cross-station data leakage.
 *
 * @returns A strictly station-scoped `User` object on success, `null` on failure.
 */
export function authenticate(
  siteId: 'SITE-01' | 'SITE-02',
  username: string,
  password: string
): User | null {
  const trimmedUser = username.trim().toLowerCase()
  const trimmedPass = password.trim()

  // Match credentials
  const match = CREDENTIALS.find(
    (c) =>
      c.username.toLowerCase() === trimmedUser &&
      c.password === trimmedPass &&
      c.user.stationAccess.includes(siteId)
  )

  if (!match) return null

  // Security enforcement: Active session user is strictly locked ONLY to the authenticated siteId
  return {
    ...match.user,
    stationAccess: [siteId],
  }
}

// ---------------------------------------------------------------------------
// Session persistence ("Keep me signed in")
// ---------------------------------------------------------------------------

const SESSION_KEY = (siteId: string) => `mashaal.session.${siteId}`

export function saveSession(siteId: string, user: User): void {
  storageSet(SESSION_KEY(siteId), user)
}

export function getSession(siteId: string): User | null {
  return storageGet<User | null>(SESSION_KEY(siteId), null)
}

export function clearSession(siteId: string): void {
  storageRemove(SESSION_KEY(siteId))
}
