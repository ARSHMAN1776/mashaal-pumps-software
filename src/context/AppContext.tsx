import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode,
} from 'react'
import type { AuditEntry, StationData, StationSummary, User, UserRole } from '../types'
import { checkBackup, exportBackupJson, legacyToRaw, type BackupCheck } from '../data/backup'
import type { Backend, ManagedUser, RealtimeStatus, SaveUserInput, StationProfilePatch } from '../data/backend'
import { deriveStation } from '../data/derive'
import { AppError, fail, friendlyError, ok, type Result } from '../data/errors'
import type { Op } from '../data/ops'
import { COLLECTION_KEYS, EMPTY_SETTINGS, applyResults, emptyRaw, type RawStation } from '../data/raw'
import { createSupabaseBackend } from '../data/supabaseBackend'
import { todayISO } from '../lib/dates'
import { clearLegacySessions, clearLegacyStation, hasLegacyStation, readLegacyStation } from '../services/legacyLocal'
import { isSupabaseConfigured } from '../services/supabase'
import { bindActions, type ActionCtx, type Actions } from './actions'

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Records found in an old browser copy that are not in the database yet. */
export interface LegacyCopy {
  missing: number
  raw: RawStation
}

interface AppContextType {
  booting: boolean
  bootError: string | null
  backendKind: 'supabase' | 'memory'

  stations: StationSummary[]
  currentUser: User | null
  activeSiteId: string | null
  /** signed in AND allowed to use the selected station */
  isSiteLoggedIn: boolean
  activeModule: string
  setActiveModule: (module: string) => void

  /** the selected station's data with balances applied (empty until dataStatus is 'ready') */
  activeSiteData: StationData
  dataStatus: DataStatus
  dataError: string | null
  reloadData: () => Promise<void>
  realtime: RealtimeStatus
  online: boolean

  loginError: string | null
  loggingIn: boolean
  login: (username: string, password: string, keepSignedIn: boolean, expectedRole?: UserRole) => Promise<boolean>
  logout: () => Promise<void>
  selectSite: (siteId: string) => Promise<void>
  exitSite: () => void
  changePassword: (newPassword: string) => Promise<Result<void>>

  /** every business operation (see context/actions) */
  act: Actions

  updateStationProfile: (patch: StationProfilePatch) => Promise<Result<void>>
  loadAudit: (limit?: number) => Promise<Result<AuditEntry[]>>
  listUsers: () => Promise<Result<ManagedUser[]>>
  saveUser: (input: SaveUserInput) => Promise<Result<void>>
  deleteUser: (userId: string) => Promise<Result<void>>

  exportBackup: () => void
  checkBackupFile: (text: string) => BackupCheck

  /** records the previous software left in this browser that never reached the database */
  legacyCopy: LegacyCopy | null
  importLegacyCopy: () => Promise<Result<void>>
  discardLegacyCopy: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const EMPTY_INFO = {
  id: '', code: '', name: '', location: '', brand: 'TOTAL PARCO' as const, brandColor: '#967938', phone: '', managerName: '', ntn: '',
}
export const EMPTY_STATION_DATA: StationData = deriveStation(emptyRaw(EMPTY_INFO, EMPTY_SETTINGS))

async function createBackend(): Promise<Backend> {
  if (__PREVIEW__) {
    const [{ createMemoryBackend }, { buildFixtures }] = await Promise.all([import('../data/memoryBackend'), import('../dev/fixtures')])
    return createMemoryBackend(buildFixtures())
  }
  if (!isSupabaseConfigured) {
    throw new AppError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the .env file and restart the app.')
  }
  return createSupabaseBackend()
}

const homeModule = (user: User) => (user.role === 'owner' ? 'owner-portal' : 'dashboard')
const missingRecords = (mine: RawStation, other: RawStation): number => {
  let n = 0
  for (const key of COLLECTION_KEYS) {
    const have = new Set((mine[key] as { id: string }[]).map((r) => r.id))
    for (const r of other[key] as { id: string }[]) if (!have.has(r.id)) n += 1
  }
  return n
}

export const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const backendRef = useRef<Backend | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [backendKind, setBackendKind] = useState<'supabase' | 'memory'>('supabase')

  const [stations, setStations] = useState<StationSummary[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState('dashboard')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const [raw, setRaw] = useState<RawStation | null>(null)
  const rawRef = useRef<RawStation | null>(null)
  const [dataStatus, setDataStatus] = useState<DataStatus>('idle')
  const [dataError, setDataError] = useState<string | null>(null)
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting')
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [legacyCopy, setLegacyCopy] = useState<LegacyCopy | null>(null)
  const legacyChecked = useRef<string | null>(null)
  const lastLoadedAt = useRef(0)

  const userRef = useRef<User | null>(null)
  const siteRef = useRef<string | null>(null)
  userRef.current = currentUser
  siteRef.current = activeSiteId

  const isSiteLoggedIn = Boolean(currentUser && activeSiteId && currentUser.stationAccess.includes(activeSiteId))

  // ---- derived data (memoised by the identity of the stored facts) ------------
  const activeSiteData = useMemo(() => (raw ? deriveStation(raw) : EMPTY_STATION_DATA), [raw])
  const cache = useRef<{ raw: RawStation | null; data: StationData }>({ raw: null, data: EMPTY_STATION_DATA })

  const setRawBoth = useCallback((next: RawStation | null) => {
    rawRef.current = next
    setRaw(next)
  }, [])

  // ---- boot: create the backend, restore the session, list stations ------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const be = await createBackend()
        if (cancelled) return
        backendRef.current = be
        setBackendKind(be.kind)
        clearLegacySessions()
        const [user, list] = await Promise.all([be.restoreSession(), be.listStations()])
        if (cancelled) return
        setStations(list)
        setCurrentUser(user)
      } catch (e) {
        if (!cancelled) setBootError(friendlyError(e))
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const resetSession = useCallback(() => {
    setCurrentUser(null)
    setActiveSiteId(null)
    setActiveModule('dashboard')
    setLoginError(null)
    setRawBoth(null)
    setDataStatus('idle')
    setLegacyCopy(null)
    legacyChecked.current = null
  }, [setRawBoth])

  // signed out elsewhere (expired token, another tab)
  useEffect(() => {
    const be = backendRef.current
    if (booting || !be) return
    // only when someone is actually signed in: a refused login also signs out, and must keep showing its error
    return be.onSignedOut(() => {
      if (userRef.current) resetSession()
    })
  }, [booting, resetSession])

  // ---- load the selected station + live updates --------------------------------
  const loadStation = useCallback(async (silent: boolean) => {
    const be = backendRef.current
    const user = userRef.current
    const siteId = siteRef.current
    if (!be || !user || !siteId) return
    if (!silent) {
      setDataStatus('loading')
      setDataError(null)
    }
    try {
      const loaded = await be.loadStation(siteId, user.role)
      if (siteRef.current !== siteId) return
      lastLoadedAt.current = Date.now()
      setRawBoth(loaded)
      setDataStatus('ready')
      setDataError(null)
    } catch (e) {
      if (siteRef.current !== siteId) return
      if (!silent) {
        setDataError(friendlyError(e))
        setDataStatus('error')
      }
    }
  }, [setRawBoth])

  useEffect(() => {
    const be = backendRef.current
    if (!be || !isSiteLoggedIn || !activeSiteId || !currentUser) {
      setRawBoth(null)
      setDataStatus('idle')
      return
    }
    setRealtime('connecting')
    void loadStation(false)
    const unsubscribe = be.subscribe(activeSiteId, {
      onChange: (results) => {
        if (rawRef.current) setRawBoth(applyResults(rawRef.current, results))
      },
      onStatus: setRealtime,
      onResync: () => void loadStation(true),
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSiteLoggedIn, activeSiteId, currentUser?.id, currentUser?.role, loadStation, setRawBoth])

  // refresh when the tab wakes up or the connection returns
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && rawRef.current && Date.now() - lastLoadedAt.current > 60_000) void loadStation(true)
    }
    const onOnline = () => {
      setOnline(true)
      if (rawRef.current) void loadStation(true)
    }
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [loadStation])

  // ---- business actions ---------------------------------------------------------
  const getCtx = useCallback((): ActionCtx => {
    const be = backendRef.current
    const user = userRef.current
    const siteId = siteRef.current
    const current = rawRef.current
    if (!be || !user || !siteId || !current) throw new AppError('You are not signed in to a station.')
    if (cache.current.raw !== current) cache.current = { raw: current, data: deriveStation(current) }
    return {
      siteId,
      user,
      raw: current,
      data: cache.current.data,
      commit: async (ops: Op[]) => {
        const results = await be.applyOps(siteId, ops)
        if (rawRef.current && siteRef.current === siteId) setRawBoth(applyResults(rawRef.current, results))
        return results
      },
      nextNo: (kind) => be.nextDocNo(siteId, kind),
    }
  }, [setRawBoth])

  const act = useMemo(() => bindActions(getCtx), [getCtx])

  // ---- sign in / out ---------------------------------------------------------------
  const login = useCallback(async (username: string, password: string, keepSignedIn: boolean, expectedRole?: UserRole) => {
    const be = backendRef.current
    if (!be || !siteRef.current) return false
    setLoggingIn(true)
    setLoginError(null)
    try {
      const user = await be.signIn(username, password, keepSignedIn)
      const station = stations.find((s) => s.id === siteRef.current)
      if (!user.stationAccess.includes(siteRef.current)) {
        await be.signOut()
        setLoginError(`This account does not have access to ${station?.name ?? siteRef.current}.`)
        return false
      }
      if (expectedRole && user.role !== expectedRole) {
        await be.signOut()
        const label = { owner: 'an Owner', manager: 'a Station Manager', cashier: 'a Cashier' }
        setLoginError(`This is ${label[user.role]} account, but "${expectedRole}" is selected. Choose the matching role and try again.`)
        return false
      }
      setCurrentUser(user)
      setActiveModule(homeModule(user))
      return true
    } catch (e) {
      setLoginError(friendlyError(e))
      return false
    } finally {
      setLoggingIn(false)
    }
  }, [stations])

  const logout = useCallback(async () => {
    try {
      await backendRef.current?.signOut()
    } finally {
      resetSession()
    }
  }, [resetSession])

  const selectSite = useCallback(async (siteId: string) => {
    setLoginError(null)
    const user = userRef.current
    if (user && !user.stationAccess.includes(siteId)) {
      // a different account is signed in: it must sign out before another station can be opened
      try {
        await backendRef.current?.signOut()
      } catch { /* the token is dropped below either way */ }
      setCurrentUser(null)
    } else if (user) {
      setActiveModule(homeModule(user))
    }
    setActiveSiteId(siteId)
  }, [])

  const exitSite = useCallback(() => {
    setActiveSiteId(null)
    setLoginError(null)
  }, [])

  const changePassword = useCallback(async (newPassword: string): Promise<Result<void>> => {
    const be = backendRef.current
    if (!be) return fail('Not connected.')
    if (newPassword.length < 8) return fail('The password must be at least 8 characters.')
    try {
      await be.changePassword(newPassword)
      if (userRef.current?.mustChangePassword) {
        await be.markPasswordChanged()
        setCurrentUser((u) => (u ? { ...u, mustChangePassword: false } : u))
      }
      return ok(undefined)
    } catch (e) {
      return fail(friendlyError(e))
    }
  }, [])

  // ---- station profile, audit trail, users -------------------------------------------
  const updateStationProfile = useCallback(async (patch: StationProfilePatch): Promise<Result<void>> => {
    const be = backendRef.current
    const siteId = siteRef.current
    if (!be || !siteId) return fail('Not connected.')
    try {
      await be.updateStationProfile(siteId, patch)
      if (rawRef.current) {
        const info = { ...rawRef.current.info, ...patch }
        setRawBoth({ ...rawRef.current, info })
      }
      setStations((list) => list.map((s) => (s.id === siteId ? { ...s, ...(patch.name !== undefined && { name: patch.name }), ...(patch.location !== undefined && { location: patch.location }) } : s)))
      return ok(undefined)
    } catch (e) {
      return fail(friendlyError(e))
    }
  }, [setRawBoth])

  const loadAudit = useCallback(async (limit = 100): Promise<Result<AuditEntry[]>> => {
    const be = backendRef.current
    const siteId = siteRef.current
    if (!be || !siteId) return fail('Not connected.')
    try {
      return ok(await be.loadAudit(siteId, limit))
    } catch (e) {
      return fail(friendlyError(e))
    }
  }, [])

  const wrap = useCallback(async <T,>(fn: (be: Backend) => Promise<T>): Promise<Result<T>> => {
    const be = backendRef.current
    if (!be) return fail('Not connected.')
    try {
      return ok(await fn(be))
    } catch (e) {
      return fail(friendlyError(e))
    }
  }, [])
  const listUsers = useCallback(() => wrap((be) => be.listUsers()), [wrap])
  const saveUser = useCallback((input: SaveUserInput) => wrap((be) => be.saveUser(input)), [wrap])
  const deleteUser = useCallback((userId: string) => wrap((be) => be.deleteUser(userId)), [wrap])

  // ---- backup ------------------------------------------------------------------------
  const exportBackup = useCallback(() => {
    const current = rawRef.current
    if (!current) return
    const blob = new Blob([exportBackupJson(current)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mashaal-backup-${current.info.id}-${todayISO()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // ---- rescue records the old software kept only in this browser ------------------------
  useEffect(() => {
    if (dataStatus !== 'ready' || !activeSiteId || !currentUser || !rawRef.current) return
    if (currentUser.role === 'cashier') return
    const key = `${activeSiteId}:${currentUser.id}`
    if (legacyChecked.current === key) return
    legacyChecked.current = key
    if (!hasLegacyStation(activeSiteId)) return
    const old = readLegacyStation(activeSiteId)
    if (!old) {
      clearLegacyStation(activeSiteId)
      return
    }
    try {
      const legacyRaw = legacyToRaw(old, activeSiteId)
      const missing = missingRecords(rawRef.current, legacyRaw)
      if (missing === 0) clearLegacyStation(activeSiteId)
      else setLegacyCopy({ missing, raw: legacyRaw })
    } catch {
      // unreadable copy: keep it untouched rather than guess
    }
  }, [dataStatus, activeSiteId, currentUser])

  const importLegacyCopy = useCallback(async (): Promise<Result<void>> => {
    if (!legacyCopy || !siteRef.current) return fail('Nothing to import.')
    const r = await act.mergeBackup(legacyCopy.raw)
    if (r.ok) {
      clearLegacyStation(siteRef.current)
      setLegacyCopy(null)
    }
    return r
  }, [act, legacyCopy])

  const discardLegacyCopy = useCallback(() => {
    if (siteRef.current) clearLegacyStation(siteRef.current)
    setLegacyCopy(null)
  }, [])

  const value: AppContextType = {
    booting, bootError, backendKind,
    stations, currentUser, activeSiteId, isSiteLoggedIn, activeModule, setActiveModule,
    activeSiteData, dataStatus, dataError, reloadData: () => loadStation(false), realtime, online,
    loginError, loggingIn, login, logout, selectSite, exitSite, changePassword,
    act,
    updateStationProfile, loadAudit, listUsers, saveUser, deleteUser,
    exportBackup, checkBackupFile: checkBackup,
    legacyCopy, importLegacyCopy, discardLegacyCopy,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within an AppProvider')
  return context
}
