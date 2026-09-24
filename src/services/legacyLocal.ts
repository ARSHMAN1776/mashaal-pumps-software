/**
 * Reads (and removes) the copy of the station data that the PREVIOUS version of the software kept in this
 * browser's localStorage. The new version stores nothing but the sign-in token in the browser; this module
 * exists only so records that never reached the cloud can be rescued once, then the old copy is deleted.
 */
const PREFIX = 'MSHL_SEC_v1::'
const STATION_KEY = (siteId: string) => `mashaal.station.${siteId}`

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

function decode(payload: string): string {
  if (!payload.startsWith(PREFIX)) return payload
  const binary = atob(payload.slice(PREFIX.length))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) ^ 0x5a
  return new TextDecoder().decode(bytes)
}

/** The old station snapshot stored in this browser, or null. */
export function readLegacyStation(siteId: string): Record<string, unknown> | null {
  return safe(() => {
    const raw = window.localStorage.getItem(STATION_KEY(siteId))
    if (!raw) return null
    const parsed = JSON.parse(decode(raw))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  }, null)
}

export const hasLegacyStation = (siteId: string) => safe(() => window.localStorage.getItem(STATION_KEY(siteId)) !== null, false)

/** Delete this station's old browser copy. */
export function clearLegacyStation(siteId: string): void {
  safe(() => window.localStorage.removeItem(STATION_KEY(siteId)), undefined)
}

/** Old per-station login tokens carry no business data and are no longer used — always removed. */
export function clearLegacySessions(): void {
  safe(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mashaal.session.')) window.localStorage.removeItem(key)
    }
  }, undefined)
}
