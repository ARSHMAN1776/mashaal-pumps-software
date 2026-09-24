import { describe, expect, it } from 'vitest'
import { buildStatement } from '../../src/data/statements'
import { deriveStation } from '../../src/data/derive'
import { failed, freshBackend, must, openStation } from './harness'

describe('customer statement', () => {
  it('running balance ends at the customer balance the rest of the app shows', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    must(await st.act.issueSlip({ customerId: 'CUST-01', vehicleNo: 'TKA-992', driverName: 'a', fuelType: 'HSD Diesel', liters: 100 }))
    must(await st.act.addAdjustment({ customerId: 'CUST-01', kind: 'Credit', amount: 1000, reason: 'discount' }))
    const d = deriveStation(st.raw)
    const c = d.customers.find((x) => x.id === 'CUST-01')!
    const s = buildStatement(st.raw.customers.find((x) => x.id === 'CUST-01')!, d.creditSlips.filter((x) => x.customerId === 'CUST-01'), d.recoveries.filter((x) => x.customerId === 'CUST-01'), d.customerAdjustments.filter((x) => x.customerId === 'CUST-01'))
    expect(s.closing).toBe(c.currentBalance)
    expect(s.rows[0].kind).toBe('opening')
    expect(s.rows[0].balance).toBe(505597.5)
    expect(s.totalDebit).toBeCloseTo(124402.5 + 27645, 2)
    expect(s.totalCredit).toBe(150000 + 1000)
  })

  it('a date range folds earlier entries into a brought-forward line', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const d = deriveStation(st.raw)
    const cust = st.raw.customers.find((x) => x.id === 'CUST-01')!
    const s = buildStatement(cust, d.creditSlips, d.recoveries, d.customerAdjustments, { from: '2026-09-19' })
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].balance).toBe(480000)
    expect(s.closing).toBe(480000)
  })

  it('failed() helper sanity', () => {
    expect(() => failed({ ok: true })).toThrow()
  })
})
