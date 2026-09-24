/** Collision-safe record id, e.g. CUST-7F3A9C1B. Generated on the device so the id is known before saving. */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${prefix}-${hex}`
}
