import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The ONLY things kept in the browser are the sign-in session token (so "Keep me signed in"
 * works) — never any business data. Ticking "Keep me signed in" stores the token in
 * localStorage; otherwise it lives in sessionStorage and disappears when the tab is closed.
 */
let persistSession = true
export const setPersistSession = (persist: boolean) => {
  persistSession = persist
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// last-resort copy in memory: keeps the session working for this tab even when the browser blocks storage
const memory = new Map<string, string>()

const authStorage = {
  getItem: (key: string): string | null =>
    safe(() => window.localStorage.getItem(key), null) ??
    safe(() => window.sessionStorage.getItem(key), null) ??
    memory.get(key) ??
    null,
  setItem: (key: string, value: string): void => {
    memory.set(key, value)
    const inLocal = safe(() => window.localStorage.getItem(key) !== null, false)
    const inSession = safe(() => window.sessionStorage.getItem(key) !== null, false)
    const useLocal = inLocal || (!inSession && persistSession)
    safe(() => {
      if (useLocal) {
        window.localStorage.setItem(key, value)
        window.sessionStorage.removeItem(key)
      } else {
        window.sessionStorage.setItem(key, value)
        window.localStorage.removeItem(key)
      }
    }, undefined)
  },
  removeItem: (key: string): void => {
    memory.delete(key)
    safe(() => window.localStorage.removeItem(key), undefined)
    safe(() => window.sessionStorage.removeItem(key), undefined)
  },
}

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(URL && KEY)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!URL || !KEY) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the .env file and restart.',
    )
  }
  if (!client) {
    client = createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: authStorage,
      },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  }
  return client
}
