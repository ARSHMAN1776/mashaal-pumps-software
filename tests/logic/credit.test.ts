import { describe, expect, it } from 'vitest'
import { failed, freshBackend, must, openStation } from './harness'
import { creditLeft } from '../../src/data/derive'

describe('credit left', () => {
  it('limit minus what the customer owes; an advance adds to it; over the limit is negative', () => {
    expect(creditLeft({ creditLimit: 10000, currentBalance: 0 })).toBe(10000)
    expect(creditLeft({ creditLimit: 10000, currentBalance: 10000 })).toBe(0)
    expect(creditLeft({ creditLimit: 10000, currentBalance: 5000 })).toBe(5000)
    expect(creditLeft({ creditLimit: 10000, currentBalance: -2000 })).toBe(12000)
    expect(creditLeft({ creditLimit: 10000, currentBalance: 12500 })).toBe(-2500)
  })

  it('limit 10,000: takes 10,000, pays 5,000 -> 5,000 owed and 5,000 still available; more than that needs a manager', async () => {
    const st = await openStation('SITE-01', 'naveed.akhtar', await freshBackend('memory'))
    const c = must(await st.act.createCustomer({ businessName: 'Test Transport', name: 'T', phone: '0300-1', vehicleNumbers: [], creditLimit: 10000, openingBalance: 0, status: 'Active' }))
    const left = () => creditLeft(st.data.customers.find((x) => x.id === c.id)!)
    expect(left()).toBe(10000)
    must(await st.act.addAdjustment({ customerId: c.id, kind: 'Debit', amount: 10000, reason: 'fuel taken' }))
    expect(left()).toBe(0)
    must(await st.act.recordRecovery({ customerId: c.id, amount: 5000, method: 'Cash', referenceNo: '' }))
    const now = st.data.customers.find((x) => x.id === c.id)!
    expect(now.currentBalance).toBe(5000)
    expect(left()).toBe(5000)
    // Rs 5,000 more fuel is inside the limit; a bigger slip is refused
    const rate = st.data.settings.rates['HSD Diesel']
    expect(failed(await st.act.issueSlip({ customerId: c.id, vehicleNo: 'ABC-1', driverName: 'D', fuelType: 'HSD Diesel', liters: Math.ceil(5000 / rate) + 5 })).code).toBe('LIMIT_EXCEEDED')
    must(await st.act.issueSlip({ customerId: c.id, vehicleNo: 'ABC-1', driverName: 'D', fuelType: 'HSD Diesel', liters: 10 }))
    expect(left()).toBeLessThan(5000)
  })
})
