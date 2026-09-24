import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBackup, exportBackupJson, legacyToRaw } from '../../src/data/backup'
import { deriveStation, safeCash } from '../../src/data/derive'
import { failed, freshBackend, must, openStation, type BackendKind } from './harness'
import { BACKUP_DIR } from '../sql/harness'

const S1 = 'SITE-01'
const snapshots = existsSync(join(BACKUP_DIR, 'stations.json'))
  ? (JSON.parse(readFileSync(join(BACKUP_DIR, 'stations.json'), 'utf8')) as { site_id: string; data: Record<string, unknown> }[])
  : []

describe.skipIf(snapshots.length === 0)('old-format (v1) data from the real cloud snapshot', () => {
  it('converts to facts and derives exactly the balances the old software showed', () => {
    const s1 = snapshots.find((s) => s.site_id === 'SITE-01')!
    const d = deriveStation(legacyToRaw(s1.data as Record<string, unknown>, 'SITE-01'))
    expect(d.customers.find((c) => c.id === 'CUST-01')!.currentBalance).toBe(480000)
    expect(d.bankAccounts[0].currentBalance).toBe(4_280_500)
    expect(safeCash(d)).toBe(500000)
    expect(d.tanks.map((t) => t.currentLiters)).toEqual([31200, 16450, 6500])
    expect(d.omcInvoices.find((i) => i.invoiceNo === 'TP-PK-98124')!.paidAmount).toBe(6_640_500)
    expect(d.omcInvoices.find((i) => i.invoiceNo === 'INV-PK-12421')!.paymentStatus).toBe('Pending')
    expect(d.nozzles.find((n) => n.id === 'N1-S1')!.closingMeter).toBe(414210)

    const s2 = snapshots.find((s) => s.site_id === 'SITE-02')!
    const d2 = deriveStation(legacyToRaw(s2.data as Record<string, unknown>, 'SITE-02'))
    expect(d2.customers).toHaveLength(11)
    expect(d2.customers.find((c) => c.id === 'CUST-S2-01')!.currentBalance).toBe(980000)
    expect(d2.bankAccounts[0].currentBalance).toBe(5_910_000)
  })

  it('accepts the wrapped file the old "Generate Station Backup" button produced', () => {
    const s1 = snapshots.find((s) => s.site_id === 'SITE-01')!
    const file = JSON.stringify({ exportedAt: '2026-09-23T10:00:00Z', siteId: 'SITE-01', siteName: 'x', data: s1.data })
    const check = checkBackup(file)
    expect(check.valid).toBe(true)
    expect(check.kind).toBe('legacy')
    expect(check.siteId).toBe('SITE-01')
    expect(check.counts!.tanks).toBe(3)
  })
})

describe('backup validation', () => {
  it('rejects damaged or foreign files with a clear message', () => {
    expect(checkBackup('not json').valid).toBe(false)
    expect(checkBackup('{"hello":1}').error).toMatch(/not a Mashaal station backup/)
    expect(checkBackup('{"format":"mashaal-backup","version":2,"raw":{}}').valid).toBe(false)
  })
})

describe.each<BackendKind>(['memory', 'pglite'])('%s backend: backup and restore', (kind) => {
  it('export -> change everything -> restore brings back the exact station', async () => {
    const st = await openStation(S1, 'owner', await freshBackend(kind))
    const before = st.data
    const file = exportBackupJson(st.raw)

    // wreck the data
    must(await st.act.createCustomer({ businessName: 'Temp Co', name: 't', phone: '1', vehicleNumbers: [], creditLimit: 1, openingBalance: 0, status: 'Active' }))
    must(await st.act.removeSlip('CS-801'))
    must(await st.act.recordRecovery({ customerId: 'CUST-01', amount: 1000, method: 'Cash', referenceNo: '' }))
    expect(st.data.customers).toHaveLength(4)

    const check = checkBackup(file)
    expect(check.valid).toBe(true)
    expect(check.kind).toBe('v2')
    must(await st.act.restoreBackup(check.raw!))
    await st.reload()
    const after = st.data
    expect(after.customers.map((c) => [c.id, c.currentBalance])).toEqual(before.customers.map((c) => [c.id, c.currentBalance]))
    expect(safeCash(after)).toBe(safeCash(before))
    expect(after.bankAccounts[0].currentBalance).toBe(before.bankAccounts[0].currentBalance)
    expect(after.daybook.map((d) => d.id)).toEqual(before.daybook.map((d) => d.id))
    expect(after.nozzles.map((n) => n.closingMeter)).toEqual(before.nozzles.map((n) => n.closingMeter))
    expect(after.settings.rates).toEqual(before.settings.rates)
  })

  it("refuses another station's backup and a non-owner", async () => {
    const owner = await openStation(S1, 'owner', await freshBackend(kind))
    const other = await openStation('SITE-02', 'owner', owner.be)
    const s2backup = checkBackup(exportBackupJson(other.raw)).raw!
    expect(failed(await owner.act.restoreBackup(s2backup)).error).toMatch(/not to the station/)
    const mgr = await openStation(S1, 'naveed.akhtar', owner.be)
    expect(failed(await mgr.act.restoreBackup(owner.raw)).code).toBe('FORBIDDEN')
  })

  it('merging adds only what is missing and never changes existing records', async () => {
    const st = await openStation(S1, 'naveed.akhtar', await freshBackend(kind))
    const snapshot = checkBackup(exportBackupJson(st.raw)).raw!
    must(await st.act.removeSlip('CS-801')) // now missing in the database
    must(await st.act.updateCustomer('CUST-02', { businessName: 'Khanpur Sugar Mills (renamed)', name: 'x', phone: '1', vehicleNumbers: [], creditLimit: 5, openingBalance: 0, status: 'Active' }))
    must(await st.act.mergeBackup(snapshot))
    await st.reload()
    expect(st.data.creditSlips.some((s) => s.id === 'CS-801')).toBe(true) // brought back
    expect(st.data.customers.find((c) => c.id === 'CUST-02')!.businessName).toBe('Khanpur Sugar Mills (renamed)') // untouched
  })
})
