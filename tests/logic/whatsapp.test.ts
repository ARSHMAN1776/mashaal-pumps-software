import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStatement } from '../../src/data/statements'
import { deriveStation } from '../../src/data/derive'
import { MAX_LINK_CHARS, isWhatsAppNumber, linkLength, normalizePakistaniPhone, openWhatsApp, slipMessage, statementMessage } from '../../src/features/customers/whatsapp'
import type { Customer } from '../../src/types'
import { freshBackend, must, openStation } from './harness'

const bank = { bankName: 'Habib Bank Limited (HBL)', accountTitle: 'Mashaal Petroleum', accountNumber: '01847900192803', branch: 'Khanpur Road' }

const statementFor = (st: Awaited<ReturnType<typeof openStation>>, id: string, range: { from?: string; to?: string } = {}) => {
  const d = deriveStation(st.raw)
  const raw = st.raw.customers.find((x) => x.id === id)!
  const customer = d.customers.find((x) => x.id === id)!
  const statement = buildStatement(raw, d.creditSlips.filter((x) => x.customerId === id), d.recoveries.filter((x) => x.customerId === id), d.customerAdjustments.filter((x) => x.customerId === id), range)
  return { d, customer, statement }
}

describe('WhatsApp messages', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('the slip says what the customer needs, in plain words, and stays short', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const slip = must(await st.act.issueSlip({ customerId: 'CUST-02', vehicleNo: 'X-1', driverName: 'Ali', fuelType: 'HSD Diesel', liters: 100, rate: 300 }))
    const m = slipMessage(slip, st.data.siteInfo)
    for (const part of [slip.slipNo, slip.customerName, 'X-1', 'Ali', 'HSD Diesel', '100 L × Rs 300 = *Rs 30,000*', 'Given by: Naveed Akhtar']) expect(m).toContain(part)
    expect(m).not.toMatch(/VERIFIED|Hash|═/) // no made-up "verified" stamps
    expect(linkLength(m)).toBeLessThan(MAX_LINK_CHARS)
    expect(m.split('\n').length).toBeLessThan(14)
    // a rate with paise keeps them; a whole rate does not show ".00"
    expect(slipMessage({ ...slip, rate: 276.45 }, st.data.siteInfo)).toContain('× Rs 276.45 =')
  })

  it('the statement reports litres, payments and what is owed, for both stations', async () => {
    for (const [site, user, cust, expected] of [['SITE-01', 'naveed.akhtar', 'CUST-01', 480000], ['SITE-02', 'tariq.manager', 'CUST-S2-01', 980000]] as const) {
      const st = await openStation(site, user, await freshBackend('memory'))
      const { customer, statement } = statementFor(st, cust)
      const m = statementMessage(customer, st.data.siteInfo, bank, statement, '2026-09-26')
      expect(m).toContain(customer.businessName)
      expect(m).toContain(`*You owe now: Rs ${expected.toLocaleString('en-US')}*`)
      expect(m).toContain('Please pay to:')
      expect(m).toContain('Account 01847900192803')
      expect(m).not.toMatch(/VERIFIED|Hash|═|Rs -|−Rs|-Rs/) // and no negative money
      expect(linkLength(m)).toBeLessThanOrEqual(MAX_LINK_CHARS)
      expect(m).toContain(site === 'SITE-01' ? '🔴 *TOTAL PARCO*' : '🟢 *PSO*')
    }
    // SITE-01's customer took 450 L of diesel and paid Rs 150,000 in the seeded data
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const { customer, statement } = statementFor(st, 'CUST-01')
    const m = statementMessage(customer, st.data.siteInfo, bank, statement, '2026-09-26')
    expect(m).toContain('Fuel taken: *450 L* (HSD Diesel)')
    expect(m).toContain('Payments received: *Rs 150,000*')
    expect(m).toContain('Brought forward: Rs 505,598')
    expect(m).toContain('Credit limit Rs 1,500,000 · left Rs 1,020,000')
  })

  it('the numbers in the statement add up: brought forward + fuel − payments = what is owed', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    must(await st.act.issueSlip({ customerId: 'CUST-01', vehicleNo: 'TKA-992', driverName: 'a', fuelType: 'PMG Super', liters: 200 }))
    must(await st.act.addAdjustment({ customerId: 'CUST-01', kind: 'Credit', amount: 1000, reason: 'discount' }))
    const { customer, statement } = statementFor(st, 'CUST-01')
    const m = statementMessage(customer, st.data.siteInfo, undefined, statement, '2026-09-26')
    const fuelValue = statement.rows.filter((r) => r.kind === 'slip').reduce((s, r) => s + r.debit, 0)
    const opening = statement.rows[0].balance
    expect(Math.round(opening + fuelValue - 150000 - 1000)).toBe(Math.round(customer.currentBalance))
    expect(m).toContain('Other charges / credits: −Rs 1,000')
    expect(m).toMatch(/Fuel taken: \*650 L\* \(HSD Diesel 450 L, PMG Super 200 L\)/)
  })

  it('a customer who paid in advance is told so, never shown a minus number', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const { customer, statement } = statementFor(st, 'CUST-01')
    const advance = { ...customer, currentBalance: -50000 } as Customer
    expect(statementMessage(advance, st.data.siteInfo, bank, statement, '2026-09-26')).toContain('*You have paid in advance: Rs 50,000*')
    expect(statementMessage({ ...customer, currentBalance: 0 } as Customer, st.data.siteInfo, bank, statement, '2026-09-26')).toContain('*You owe nothing. Thank you.*')
  })

  it('a very long history is shortened so the link stays a safe length, and the bank details are kept', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const { customer } = statementFor(st, 'CUST-01')
    const rows = Array.from({ length: 60 }, (_, i) => ({ key: 'k' + i, id: 'i' + i, kind: (i % 3 ? 'slip' : 'recovery') as 'slip' | 'recovery', date: '2026-09-' + String(10 + (i % 15)), refNo: 'R' + i, description: '', debit: i % 3 ? 124403 : 0, credit: i % 3 ? 0 : 150000, balance: 0, liters: 450, fuelType: 'HSD Diesel' }))
    const long = { rows, totalDebit: 1, totalCredit: 1, closing: 0 }
    const withVeryLongNames = { ...customer, businessName: 'Al-Hafiz Goods Transport & General Order Suppliers (Private) Limited RYK' } as Customer
    const m = statementMessage(withVeryLongNames, st.data.siteInfo, bank, long, '2026-09-26', { from: '2026-01-01', to: '2026-09-26' })
    expect(linkLength(m)).toBeLessThanOrEqual(MAX_LINK_CHARS)
    expect(m).toContain('Please pay to:')
    expect(m).toContain('Period: 01 Jan 2026 to 26 Sept 2026')
    expect((m.match(/^• /gm) ?? []).length).toBeGreaterThan(0) // some latest entries still shown
  })

  it('only mobile numbers WhatsApp can open are used; anything else lets the person choose the contact', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    expect(openWhatsApp('0300-8671234', 'hi')).toBe(true)
    expect(open).toHaveBeenLastCalledWith('https://wa.me/923008671234?text=hi', '_blank')
    for (const bad of ['042-35321900', '12345', '', '0300-12']) {
      expect(openWhatsApp(bad, 'hi')).toBe(false)
      expect(open).toHaveBeenLastCalledWith('https://wa.me/?text=hi', '_blank')
    }
    for (const good of ['+92 300 8671234', '0092 300 8671234', '3008671234', '923008671234']) expect(isWhatsAppNumber(normalizePakistaniPhone(good))).toBe(true)
  })
})
