/**
 * storage.ts — Mashaal Software Persistence Layer
 *
 * Provides typed localStorage helpers with namespaced keys per station site.
 * All data is JSON-serialised. Corrupted or missing data falls back to the
 * supplied default value so the app never crashes on a bad read.
 */

import type { StationData } from '../data/mockData'
import { site1Data, site2Data } from '../data/mockData'

// ---------------------------------------------------------------------------
// Security & Obfuscation layer
// Prevents secret financial records (bank balances, profits, owner drawings)
// from resting in plaintext inside browser localStorage.
// ---------------------------------------------------------------------------

const SECURE_PREFIX = 'MSHL_SEC_v1::'

function secureEncode(text: string): string {
  try {
    const key = 0x5a
    const bytes = new TextEncoder().encode(text)
    const xorBytes = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      xorBytes[i] = bytes[i] ^ key
    }
    let binary = ''
    for (let i = 0; i < xorBytes.length; i++) {
      binary += String.fromCharCode(xorBytes[i])
    }
    return SECURE_PREFIX + btoa(binary)
  } catch {
    return text
  }
}

function secureDecode(payload: string): string {
  if (!payload.startsWith(SECURE_PREFIX)) {
    // Backward compatibility for existing plaintext localStorage
    return payload
  }
  try {
    const raw = payload.slice(SECURE_PREFIX.length)
    const binary = atob(raw)
    const xorBytes = new Uint8Array(binary.length)
    const key = 0x5a
    for (let i = 0; i < binary.length; i++) {
      xorBytes[i] = binary.charCodeAt(i) ^ key
    }
    return new TextDecoder().decode(xorBytes)
  } catch {
    return payload
  }
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function storageGet<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    const decoded = secureDecode(raw)
    return JSON.parse(decoded) as T
  } catch {
    return defaultValue
  }
}

export function storageSet<T>(key: string, value: T): void {
  try {
    const jsonStr = JSON.stringify(value)
    const encoded = secureEncode(jsonStr)
    localStorage.setItem(key, encoded)
  } catch {
    // Storage quota exceeded or private-mode restriction — silently ignore
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Completely purges cached local station records, forcing fresh retrieval
 * from authoritative database (Supabase).
 */
export function purgeLocalStationCache(siteId?: string): void {
  try {
    if (siteId) {
      localStorage.removeItem(`mashaal.station.${siteId}`)
      localStorage.removeItem(`mashaal.session.${siteId}`)
    } else {
      localStorage.removeItem('mashaal.station.SITE-01')
      localStorage.removeItem('mashaal.station.SITE-02')
      localStorage.removeItem('mashaal.session.SITE-01')
      localStorage.removeItem('mashaal.session.SITE-02')
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Station-level helpers
// ---------------------------------------------------------------------------

const STATION_KEY = (siteId: string) => `mashaal.station.${siteId}`

/**
 * Load a full StationData snapshot from localStorage.
 * Falls back to the bundled mock data on first run or after a clear.
 */
export function loadStationData(siteId: 'SITE-01' | 'SITE-02'): StationData {
  const fallback = siteId === 'SITE-01' ? site1Data : site2Data
  const data = storageGet<StationData>(STATION_KEY(siteId), fallback)
  return {
    ...fallback,
    ...data,
    siteInfo: data.siteInfo || fallback.siteInfo,
    settings: data.settings || fallback.settings,
    tanks: data.tanks || fallback.tanks,
    nozzles: data.nozzles || fallback.nozzles,
    fuelSales: data.fuelSales || fallback.fuelSales,
    shifts: data.shifts || fallback.shifts,
    tankDips: data.tankDips || fallback.tankDips,
    omcInvoices: data.omcInvoices || fallback.omcInvoices,
    omcPayments: data.omcPayments || fallback.omcPayments,
    daybook: data.daybook || fallback.daybook,
    customers: data.customers || fallback.customers,
    creditSlips: data.creditSlips || fallback.creditSlips,
    recoveries: data.recoveries || fallback.recoveries,
    bankAccounts: data.bankAccounts || fallback.bankAccounts,
    bankTransactions: data.bankTransactions || fallback.bankTransactions,
    expenses: data.expenses || fallback.expenses,
    staff: data.staff || fallback.staff,
    lubricants: data.lubricants || fallback.lubricants,
    suppliers: data.suppliers || fallback.suppliers,
    tariffHistory: data.tariffHistory || fallback.tariffHistory,
    ownerTransfers: data.ownerTransfers || fallback.ownerTransfers || [],
  }
}

/**
 * Persist the full StationData snapshot to localStorage.
 */
export function saveStationData(siteId: 'SITE-01' | 'SITE-02', data: StationData): void {
  storageSet(STATION_KEY(siteId), data)
}

export interface BackupValidationResult {
  valid: boolean
  siteId?: 'SITE-01' | 'SITE-02'
  siteName?: string
  exportedAt?: string
  data?: StationData
  error?: string
}

/**
 * Validate an imported JSON backup string before restoring.
 */
export function validateStationBackup(rawJson: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(rawJson)
    // Check if it's the wrapped backup format
    let targetData: StationData
    let detectedSiteId: 'SITE-01' | 'SITE-02' | undefined = undefined
    let siteName = 'Station Archive'
    let exportedAt = new Date().toISOString()

    if (parsed && typeof parsed === 'object') {
      if (parsed.data && parsed.data.siteInfo && parsed.data.tanks) {
        targetData = parsed.data
        detectedSiteId = parsed.siteId || parsed.data.siteInfo.code || parsed.data.siteInfo.id
        siteName = parsed.siteName || parsed.data.siteInfo.name
        exportedAt = parsed.exportedAt || exportedAt
      } else if (parsed.siteInfo && parsed.tanks && parsed.nozzles) {
        // Direct StationData snapshot
        targetData = parsed
        detectedSiteId = parsed.siteInfo.code || parsed.siteInfo.id
        siteName = parsed.siteInfo.name
      } else {
        return { valid: false, error: 'Invalid file format: Missing station schema or tanks/nozzles records.' }
      }

      // Normalize siteId
      if (detectedSiteId !== 'SITE-01' && detectedSiteId !== 'SITE-02') {
        // Fallback check on siteInfo
        if (targetData.siteInfo?.brand === 'TOTAL PARCO') {
          detectedSiteId = 'SITE-01'
        } else {
          detectedSiteId = 'SITE-02'
        }
      }

      return {
        valid: true,
        siteId: detectedSiteId,
        siteName,
        exportedAt,
        data: targetData,
      }
    }
    return { valid: false, error: 'Uploaded file is not a valid JSON object.' }
  } catch (err: any) {
    return { valid: false, error: `JSON Parse error: ${err?.message || 'Corrupted file'}` }
  }
}

/**
 * Safely restore station data from validated backup into localStorage.
 */
export function restoreStationBackup(siteId: 'SITE-01' | 'SITE-02', data: StationData): void {
  saveStationData(siteId, data)
}
