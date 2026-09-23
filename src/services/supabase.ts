import { createClient } from '@supabase/supabase-js'
import type { StationData } from '../data/mockData'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://fjrvayncixrkbeepedre.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnZheW5jaXhya2JlZXBlZHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjQ4MTEsImV4cCI6MjEwNTMwMDgxMX0.m6oX8-7_Von5pr_KJf07Wi8OfUF0Moaxb7WrijWKGTk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export interface CloudStatus {
  connected: boolean
  tableExists: boolean
  lastSyncedAt: string | null
  error?: string
}

/**
 * Checks connectivity and verifies if the `stations` table exists in Supabase.
 */
export const checkCloudConnection = async (): Promise<CloudStatus> => {
  try {
    const { error } = await supabase.from('stations').select('site_id').limit(1)
    if (error) {
      // 42P01 or PGRST205 is code for missing table
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message.includes('relation "public.stations" does not exist') ||
        error.message.includes("Could not find the table 'public.stations'")
      ) {
        return { connected: true, tableExists: false, lastSyncedAt: null, error: 'Table public.stations not found' }
      }
      return { connected: false, tableExists: false, lastSyncedAt: null, error: error.message }
    }
    return { connected: true, tableExists: true, lastSyncedAt: new Date().toISOString() }
  } catch (err: any) {
    return { connected: false, tableExists: false, lastSyncedAt: null, error: err?.message || 'Network error' }
  }
}

/**
 * Fetches the latest cloud snapshot for a specific station.
 */
export const fetchStationFromCloud = async (
  siteId: 'SITE-01' | 'SITE-02'
): Promise<StationData | null> => {
  try {
    const { data, error } = await supabase
      .from('stations')
      .select('data')
      .eq('site_id', siteId)
      .maybeSingle()

    if (error || !data || !data.data) {
      return null
    }

    return data.data as StationData
  } catch (err) {
    console.warn(`[Supabase] Could not fetch ${siteId} from cloud:`, err)
    return null
  }
}

/**
 * Saves/upserts a station data snapshot to Supabase.
 */
export const saveStationToCloud = async (
  siteId: 'SITE-01' | 'SITE-02',
  stationData: StationData
): Promise<boolean> => {
  try {
    const { error } = await supabase.from('stations').upsert(
      {
        site_id: siteId,
        site_name: stationData.siteInfo.name,
        data: stationData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'site_id' }
    )

    if (error) {
      console.warn(`[Supabase] Save failed for ${siteId}:`, error.message)
      return false
    }

    return true
  } catch (err) {
    console.warn(`[Supabase] Network exception saving ${siteId}:`, err)
    return false
  }
}

/**
 * Subscribes to real-time changes on the stations table for live multi-device syncing.
 */
export const subscribeToStationChanges = (
  siteId: 'SITE-01' | 'SITE-02',
  onUpdate: (data: StationData) => void
) => {
  const channel = supabase
    .channel(`realtime_stations_${siteId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stations',
        filter: `site_id=eq.${siteId}`,
      },
      (payload) => {
        if (payload.new && (payload.new as any).data) {
          onUpdate((payload.new as any).data as StationData)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Inserts or updates an individual relational record (e.g. fuel_sales, daybook_vouchers)
 * into dedicated SQL tables if they exist.
 */
export const syncRelationalRecord = async (
  tableName: string,
  record: Record<string, any>
): Promise<void> => {
  try {
    const { error } = await supabase.from(tableName).upsert(record)
    if (error) {
      // Gracefully ignore if the optional individual relational table has not been created yet
      console.debug(`[Supabase Relational Sync] ${tableName} notice:`, error.message)
    }
  } catch (err) {
    console.debug(`[Supabase Relational Sync] ${tableName} exception:`, err)
  }
}

/**
 * The 1-click SQL script needed to initialize the Supabase database.
 */
export const SUPABASE_SETUP_SQL = `-- Run this in your Supabase SQL Editor (1-click setup)
create table if not exists public.stations (
  site_id text primary key,
  site_name text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.stations enable row level security;

-- Policy: Allow read & write access for station app
create policy "Allow full access for station operations" on public.stations
  for all using (true) with check (true);

-- Enable realtime live synchronization
alter publication supabase_realtime add table public.stations;
`
