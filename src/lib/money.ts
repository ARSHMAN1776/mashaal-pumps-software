export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** "Rs 1,234,567" (no decimals) */
export const rs = (n: number): string => `Rs ${Math.round(num(n)).toLocaleString('en-US')}`
export const rs2 = (n: number): string =>
  `Rs ${num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
