import type { ShiftName } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD. (toISOString() is UTC and gives yesterday's date after midnight in Pakistan.) */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function monthISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Clock time such as "01:37 AM". */
export function timeLabel(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d)
}

/** Default shift for the current clock time (06-14 Morning, 14-22 Evening, otherwise Night). */
export function currentShift(d: Date = new Date()): ShiftName {
  const h = d.getHours()
  if (h >= 6 && h < 14) return 'Morning'
  if (h >= 14 && h < 22) return 'Evening'
  return 'Night'
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return todayISO(dt)
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** "2026-09-24" -> "24 Sep 2026" */
export function formatDate(iso: string): string {
  if (!isValidISODate(iso)) return iso || '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}
