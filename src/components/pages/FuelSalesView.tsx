import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { FuelSaleRecord, Nozzle, ShiftName } from '../../types'
import { SHIFT_NAMES } from '../../types'
import { currentShift, formatDate, todayISO } from '../../lib/dates'
import { rs, rs2 } from '../../lib/money'
import { rateOnDate } from '../../data/derive'
import { GasPumpIcon, PlusIcon, PrinterIcon, CheckCircleIcon, WhatsAppIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, FilterBar, Grid3, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard } from '../common/kit'

// ===========================================================================
// Meter reading dialog
// ===========================================================================
const ReadingModal: React.FC<{ nozzleId: string; onClose: () => void; onSaved: (sale: FuelSaleRecord, print: boolean) => void }> = ({ nozzleId, onClose, onSaved }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const { nozzles } = activeSiteData
  const isCashier = currentUser?.role === 'cashier'
  const usable = nozzles.filter((n) => n.isActive)
  const first = usable.find((n) => n.id === nozzleId) ?? usable[0]

  const [id, setId] = useState(first?.id ?? '')
  const nozzle = usable.find((n) => n.id === id) ?? first
  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState<ShiftName>(currentShift())
  const [opening, setOpening] = useState(String(first?.closingMeter ?? ''))
  const [closing, setClosing] = useState('')
  const [testing, setTesting] = useState(String(first?.testingLiters ?? 0))
  const [attendant, setAttendant] = useState(first?.assignedStaff || currentUser?.name || '')
  const { busy, error, setError, run } = useSubmit()

  const pick = (n: Nozzle) => {
    setId(n.id)
    setOpening(String(n.closingMeter))
    setClosing('')
    setTesting(String(n.testingLiters))
    setAttendant(n.assignedStaff || currentUser?.name || '')
    setError(null)
  }

  const o = Number(opening)
  const c = Number(closing)
  const t = Number(testing) || 0
  const gross = Number.isFinite(o) && Number.isFinite(c) && closing !== '' ? Math.max(0, c - o) : 0
  const net = Math.max(0, gross - t)
  const rate = nozzle ? rateOnDate(activeSiteData.tariffHistory, activeSiteData.settings.rates, nozzle.fuelType, date) : 0

  const submit = (print: boolean) => {
    if (!nozzle) return
    void run(
      (ack) => act.recordFuelSale({ nozzleId: nozzle.id, date, shiftName: shift, openingMeter: o, closingMeter: c, testingLiters: t, cashierName: attendant, acknowledge: ack }),
      (sale) => onSaved(sale, print),
    )
  }

  if (!nozzle) {
    return (
      <Modal title="Enter Nozzle Meter Reading" onClose={onClose}>
        <div className="modal-form-compact">
          <FormError message="There are no active nozzles. Add a nozzle first." />
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Enter Nozzle Meter Reading" subtitle={`Dispenser #${nozzle.dispenserNo} • Nozzle #${nozzle.nozzleNo} (${nozzle.fuelType})`} onClose={onClose} busy={busy} width={760}>
      <form className="modal-form-compact" onSubmit={(e) => { e.preventDefault(); submit(false) }}>
        <Field label="Dispenser & nozzle">
          <select className="form-input" value={id} onChange={(e) => { const n = usable.find((x) => x.id === e.target.value); if (n) pick(n) }}>
            {usable.map((n) => (
              <option key={n.id} value={n.id}>Dispenser {n.dispenserNo} — Nozzle {n.nozzleNo} ({n.fuelType}) — Rs {n.ratePerLiter}</option>
            ))}
          </select>
        </Field>

        <Grid3>
          <Field label="Date" hint={isCashier ? 'Today only' : undefined}>
            <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={isCashier} required />
          </Field>
          <Field label="Shift">
            <select className="form-input" value={shift} onChange={(e) => setShift(e.target.value as ShiftName)}>
              {SHIFT_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Attendant / cashier">
            <input type="text" className="form-input" value={attendant} onChange={(e) => setAttendant(e.target.value)} required />
          </Field>
        </Grid3>

        <Grid3>
          <Field label="Opening meter" hint={`Last reading: ${nozzle.closingMeter.toLocaleString()}`}>
            <input type="number" step="any" className="form-input" value={opening} onChange={(e) => setOpening(e.target.value)} required />
          </Field>
          <Field label="Closing meter (now)" strong hint="Number on the display">
            <input type="number" step="any" className="form-input" value={closing} onChange={(e) => setClosing(e.target.value)} autoFocus required />
          </Field>
          <Field label="Testing (liters)" hint="Poured back, not sold">
            <input type="number" step="any" min={0} className="form-input" value={testing} onChange={(e) => setTesting(e.target.value)} required />
          </Field>
        </Grid3>

        <CalcStrip items={[
          { label: 'Gross liters', value: `${gross.toLocaleString()} L` },
          { label: 'Testing', value: `- ${t} L`, tone: 'red' },
          { label: 'Net sold', value: `${net.toLocaleString()} L`, tone: 'green' },
          { label: 'Rate / L', value: rs2(rate) },
          { label: 'Sales amount', value: rs(net * rate), tone: 'gold' },
        ]} />

        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-outline" onClick={() => submit(true)} disabled={busy}>
            <PrinterIcon size={16} /><span>Save &amp; print slip</span>
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save reading'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Add / edit nozzle dialog
// ===========================================================================
const NozzleModal: React.FC<{ nozzle?: Nozzle; onClose: () => void }> = ({ nozzle, onClose }) => {
  const [version] = useState(nozzle?.updatedAt) // the record's version when this window was opened
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const { tanks, nozzles } = activeSiteData
  const staffNames = activeSiteData.staff.filter((s) => s.isActive).map((s) => s.name)
  const nextDispenser = nozzles.length ? Math.max(...nozzles.map((n) => n.dispenserNo)) : 1

  const [dispenser, setDispenser] = useState(String(nozzle?.dispenserNo ?? nextDispenser))
  const [number, setNumber] = useState(String(nozzle?.nozzleNo ?? (nozzles.filter((n) => n.dispenserNo === nextDispenser).length + 1)))
  const [tankId, setTankId] = useState(nozzle?.tankId ?? tanks[0]?.id ?? '')
  const [meter, setMeter] = useState(nozzle ? String(nozzle.closingMeter) : '')
  const [testing, setTesting] = useState(String(nozzle?.testingLiters ?? 10))
  const [staff, setStaff] = useState(nozzle?.assignedStaff ?? '')
  const [active, setActive] = useState(nozzle?.isActive ?? true)
  const { busy, error, run } = useSubmit()
  const tank = tanks.find((t) => t.id === tankId)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nozzle) {
      void run(
        () => act.updateNozzle(nozzle.id, { dispenserNo: Number(dispenser), nozzleNo: Number(number), tankId, testingLiters: Number(testing), assignedStaff: staff, isActive: active, version }),
        () => { toast.success('Nozzle updated.'); onClose() },
      )
    } else {
      void run(
        () => act.addNozzle({ dispenserNo: Number(dispenser), nozzleNo: Number(number), tankId, initialMeter: Number(meter), testingLiters: Number(testing), assignedStaff: staff }),
        (n) => { toast.success(`Added Dispenser ${n.dispenserNo} • Nozzle ${n.nozzleNo}.`); onClose() },
      )
    }
  }

  return (
    <Modal title={nozzle ? 'Edit Nozzle' : 'Add New Nozzle'} subtitle={nozzle ? `Dispenser ${nozzle.dispenserNo} • Nozzle ${nozzle.nozzleNo}` : 'Register a nozzle and connect it to its tank'} onClose={onClose} busy={busy} width={740}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="Dispenser number">
            <input type="number" min={1} step={1} className="form-input" value={dispenser} onChange={(e) => setDispenser(e.target.value)} required />
          </Field>
          <Field label="Nozzle number">
            <input type="number" min={1} step={1} className="form-input" value={number} onChange={(e) => setNumber(e.target.value)} required />
          </Field>
          <Field label="Tank it draws from" hint={tank ? `Sells ${tank.fuelType}` : 'Add a tank first'}>
            <select className="form-input" value={tankId} onChange={(e) => setTankId(e.target.value)} required>
              {tanks.map((t) => <option key={t.id} value={t.id}>Tank #{t.tankNo} — {t.fuelType}</option>)}
            </select>
          </Field>
        </Grid3>
        <Grid3>
          {nozzle ? (
            <Field label="Current meter" hint="Changes with each reading">
              <div className="read-only-box"><strong>{nozzle.closingMeter.toLocaleString()}</strong></div>
            </Field>
          ) : (
            <Field label="Meter reading now" hint="The number on the display">
              <input type="number" min={0} step="any" className="form-input" value={meter} onChange={(e) => setMeter(e.target.value)} required />
            </Field>
          )}
          <Field label="Usual testing (liters)">
            <input type="number" min={0} step="any" className="form-input" value={testing} onChange={(e) => setTesting(e.target.value)} required />
          </Field>
          <Field label="Attendant">
            <input type="text" className="form-input" list="nozzle-staff" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Pump attendant name" />
            <datalist id="nozzle-staff">{staffNames.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
        </Grid3>
        {nozzle && (
          <label className="ui-checkbox-row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Working — untick to take this nozzle out of service (history is kept)</span>
          </label>
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : nozzle ? 'Save changes' : 'Add nozzle'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Page
// ===========================================================================
export const FuelSalesView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const { nozzles, fuelSales, siteInfo, tanks } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const confirm = useConfirm()
  const toast = useToast()

  const [date, setDate] = useState(todayISO())
  const [showAll, setShowAll] = useState(false)
  const [readingFor, setReadingFor] = useState<string | null>(null)
  const [nozzleForm, setNozzleForm] = useState<{ nozzle?: Nozzle } | null>(null)
  const [printSheet, setPrintSheet] = useState(false)
  const [printSale, setPrintSale] = useState<FuelSaleRecord | null>(null)

  const rows = useMemo(() => (showAll ? fuelSales : fuelSales.filter((s) => s.date === date)), [fuelSales, date, showAll])
  const totalLiters = rows.reduce((a, s) => a + s.netLiters, 0)
  const totalAmount = rows.reduce((a, s) => a + s.totalAmount, 0)
  const activeCount = nozzles.filter((n) => n.isActive).length
  const periodLabel = showAll ? 'all recorded dates' : formatDate(date)

  const removeNozzle = async (n: Nozzle) => {
    const readings = fuelSales.filter((s) => s.nozzleId === n.id).length
    const yes = await confirm({
      title: `Delete Dispenser ${n.dispenserNo} • Nozzle ${n.nozzleNo}?`,
      message: (
        <>
          <p>This removes the nozzle from the station.</p>
          {readings > 0 ? (
            <p><strong>{readings} meter reading(s)</strong> already recorded for it stay in the sales history and reports, but tank stock estimates will no longer count them. If you only want to stop using it, edit the nozzle and untick <em>Active</em> instead.</p>
          ) : (
            <p>No readings were recorded for it, so nothing else is affected.</p>
          )}
        </>
      ),
      confirmLabel: 'Delete nozzle',
      tone: 'danger',
    })
    if (!yes) return
    const r = await act.removeNozzle(n.id)
    if (r.ok) toast.success(`Nozzle D${n.dispenserNo}-N${n.nozzleNo} deleted.`)
    else toast.error(r.error)
  }

  const removeReading = async (s: FuelSaleRecord) => {
    const yes = await confirm({
      title: 'Delete this meter reading?',
      message: `D${s.dispenserNo}-N${s.nozzleNo} on ${formatDate(s.date)}: ${s.netLiters.toLocaleString()} L, ${rs(s.totalAmount)}. The nozzle's meter goes back to the previous reading. This is recorded in the audit trail.`,
      confirmLabel: 'Delete reading',
      tone: 'danger',
    })
    if (!yes) return
    const r = await act.removeFuelSale(s.id)
    if (r.ok) toast.success('Reading deleted.')
    else toast.error(r.error)
  }

  const handleSendWhatsAppSummary = () => {
    const isParco = siteInfo.brand === 'TOTAL PARCO'
    const head = isParco ? `🔴 *TOTAL PARCO - FORECOURT DISPENSER SALES* 🔴` : `🟢 *PAKISTAN STATE OIL (PSO) - FORECOURT SALES* 🟢`
    const tag = isParco ? 'TP' : 'PSO'
    const foot = isParco ? `✅ *Total Parco Pakistan • Energy for a Brighter Tomorrow*` : `✅ *Pakistan State Oil (PSO) • Fueling the Nation's Journey*`
    const message = [
      head,
      `⛽ *DAILY SALES & NOZZLE METER SUMMARY*`,
      `══════════════════════════`,
      `🏢 *Station:* ${siteInfo.name}`,
      `📍 *Location:* ${siteInfo.location}`,
      `📅 *Date:* ${periodLabel}`,
      `══════════════════════════`,
      `⛽ *DISPENSER NOZZLE BREAKDOWN*`,
      ...rows.map((s) => `🔹 D${s.dispenserNo}-N${s.nozzleNo} (${s.fuelType}, ${s.shiftName}): ${s.netLiters.toLocaleString()} L • Rs. ${Math.round(s.totalAmount).toLocaleString()}`),
      `══════════════════════════`,
      `📊 *TOTALS*`,
      `🔹 *Total Fuel Dispensed:* ${totalLiters.toLocaleString()} Liters`,
      `💰 *GROSS FUEL REVENUE:* Rs. ${Math.round(totalAmount).toLocaleString()} PKR`,
      `══════════════════════════`,
      `✍️ *Recorded By:* ${currentUser?.name ?? siteInfo.managerName}`,
      `🔐 *System Verification:* ${tag}-NOZZLE-${showAll ? 'ALL' : date}-VERIFIED`,
      foot,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Sell fuel"
        title="Sell fuel"
        subtitle="Type the meter number shown on a pump. The system works out the litres sold and the money."
        actions={
          <>
            {isManager && (
              <button type="button" className="btn btn-outline" onClick={() => setNozzleForm({})}>
                <PlusIcon size={16} /><span>Add nozzle</span>
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setReadingFor('')} disabled={activeCount === 0}>
              <PlusIcon size={16} /><span>Enter meter reading</span>
            </button>
          </>
        }
      />

      <FilterBar>
        <div className="form-group">
          <label className="form-label">Show readings for</label>
          <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => { setDate(e.target.value); setShowAll(false) }} />
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDate(todayISO()); setShowAll(false) }}>Today</button>
        <label className="ui-checkbox-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Show every date</span>
        </label>
      </FilterBar>

      <KpiStrip>
        <Kpi label={`Fuel sold — ${periodLabel}`} value={`${totalLiters.toLocaleString()} L`} sub={`${rows.length} ${rows.length === 1 ? 'reading' : 'readings'}`} />
        <Kpi label="Money from fuel" value={rs(totalAmount)} sub="Each sale uses the price of its day" />
        <Kpi label="Nozzles working" value={`${activeCount} of ${nozzles.length}`} sub={`Connected to ${tanks.length} ${tanks.length === 1 ? 'tank' : 'tanks'}`} />
      </KpiStrip>

      <div className="section-surface">
        <div className="section-surface-header">
          <div>
            <h3 className="section-title">Your nozzles</h3>
            <p className="section-subtitle">Press "Enter reading" on a nozzle when you read its meter.{isManager ? ' Use "More" to change or remove a nozzle.' : ''}</p>
          </div>
        </div>

        {nozzles.length === 0 ? (
          <div className="ui-empty">No nozzles have been added yet.{isManager ? ' Press "Add nozzle" to add the first one.' : ' Ask a manager to add them.'}</div>
        ) : (
          <div className="nozzles-compact-grid">
            {nozzles.map((n) => {
              const tank = tanks.find((t) => t.id === n.tankId)
              return (
                <div key={n.id} className="nozzle-status-item" data-fuel={n.fuelType} style={n.isActive ? undefined : { opacity: 0.6 }}>
                  <div className="nozzle-badge-header">
                    <div className="nozzle-name-tag">
                      <GasPumpIcon size={18} color="currentColor" />
                      <strong>Dispenser {n.dispenserNo} • Nozzle {n.nozzleNo}</strong>
                    </div>
                    <span className="fuel-chip" data-fuel={n.fuelType}>{n.fuelType}</span>
                  </div>

                  <div className="nozzle-reading-details">
                    <div className="reading-row"><span className="r-label">Meter now</span><strong className="r-val highlight">{n.closingMeter.toLocaleString()}</strong></div>
                    <div className="reading-row"><span className="r-label">Price per litre</span><span className="r-val">Rs {n.ratePerLiter}</span></div>
                    <div className="reading-row"><span className="r-label">Tank</span><span className="r-val text-muted">{tank ? `#${tank.tankNo}` : '—'}</span></div>
                    <div className="reading-row"><span className="r-label">Attendant</span><span className="r-val text-muted">{n.assignedStaff || '—'}</span></div>
                  </div>

                  {!n.isActive && <span className="badge badge-neutral" style={{ marginTop: 8 }}>Out of service</span>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} disabled={!n.isActive} onClick={() => setReadingFor(n.id)}>Enter reading</button>
                    {isManager && (
                      <RowActions>
                        <IconButton label="Edit nozzle" onClick={() => setNozzleForm({ nozzle: n })}><EditIcon size={14} /></IconButton>
                        <IconButton label="Delete nozzle" tone="danger" onClick={() => void removeNozzle(n)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SectionCard
        title={`Sales recorded — ${periodLabel}`}
        subtitle="Litres are worked out from the meter numbers, after taking off the testing litres."
        actions={
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleSendWhatsAppSummary} title="Send this summary on WhatsApp"><WhatsAppIcon size={15} /><span>Send on WhatsApp</span></button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPrintSheet(true)}><PrinterIcon size={15} /><span>Print sheet</span></button>
          </>
        }
      >
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date & shift</th><th>Nozzle</th><th>Fuel</th><th>Meter start</th><th>Meter end</th><th>Testing</th><th>Litres sold</th><th>Price</th>
                <th className="text-right">Amount</th><th>Attendant</th>{isManager && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={isManager ? 11 : 10}>No sales have been recorded for {periodLabel}.</EmptyRow>
              ) : rows.map((s) => (
                <tr key={s.id}>
                  <td className="ui-nowrap"><strong>{formatDate(s.date)}</strong><div className="text-muted text-xs">{s.shiftName}</div></td>
                  <td><strong>D{s.dispenserNo}-N{s.nozzleNo}</strong></td>
                  <td><span className="fuel-chip" data-fuel={s.fuelType}>{s.fuelType}</span></td>
                  <td>{s.openingMeter.toLocaleString()}</td>
                  <td>{s.closingMeter.toLocaleString()}</td>
                  <td>{s.testingLiters} L</td>
                  <td><strong>{s.netLiters.toLocaleString()} L</strong></td>
                  <td>Rs {s.ratePerLiter}</td>
                  <td className="text-right"><strong>{rs(s.totalAmount)}</strong></td>
                  <td>{s.cashierName}</td>
                  {isManager && (
                    <td>
                      <RowActions>
                        <IconButton label="Print slip" onClick={() => setPrintSale(s)}><PrinterIcon size={14} /></IconButton>
                        <IconButton label="Delete reading" tone="danger" onClick={() => void removeReading(s)}><TrashIcon size={14} /></IconButton>
                      </RowActions>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {readingFor !== null && (
        <ReadingModal
          nozzleId={readingFor}
          onClose={() => setReadingFor(null)}
          onSaved={(sale, print) => {
            setReadingFor(null)
            toast.success(`Saved D${sale.dispenserNo}-N${sale.nozzleNo}: ${sale.netLiters.toLocaleString()} L = ${rs(sale.totalAmount)}`)
            if (sale.date !== date && !showAll) setDate(sale.date)
            if (print) setPrintSale(sale)
          }}
        />
      )}
      {nozzleForm && <NozzleModal nozzle={nozzleForm.nozzle} onClose={() => setNozzleForm(null)} />}

      <PrintReceiptModal isOpen={printSheet} onClose={() => setPrintSheet(false)} title="Nozzle Meter Reading Sheet" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid"><div><strong>Period:</strong> {periodLabel}</div><div><strong>Prepared by:</strong> {currentUser?.name}</div></div>
        <table className="slip-table">
          <thead><tr><th>Nozzle</th><th>Shift</th><th>Fuel</th><th>Opening</th><th>Closing</th><th>Testing</th><th>Net (L)</th><th>Amount (PKR)</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}><td>D{s.dispenserNo}-N{s.nozzleNo}</td><td>{s.shiftName}</td><td>{s.fuelType}</td><td>{s.openingMeter}</td><td>{s.closingMeter}</td><td>{s.testingLiters}L</td><td>{s.netLiters}L</td><td>{rs(s.totalAmount)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total net liters:</span><strong>{totalLiters.toLocaleString()} L</strong></div>
        <div className="slip-row highlight"><span>Total fuel revenue:</span><strong>{rs(totalAmount)}</strong></div>
      </PrintReceiptModal>

      <PrintReceiptModal isOpen={printSale !== null} onClose={() => setPrintSale(null)} title="Nozzle Meter Reading Slip" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone} defaultMode="thermal">
        {printSale && (
          <div className="slip-summary-list">
            <div className="slip-row"><span>Date / shift:</span><strong>{formatDate(printSale.date)} • {printSale.shiftName}</strong></div>
            <div className="slip-row"><span>Nozzle:</span><strong>D{printSale.dispenserNo}-N{printSale.nozzleNo} ({printSale.fuelType})</strong></div>
            <div className="slip-row"><span>Opening meter:</span><span>{printSale.openingMeter.toLocaleString()}</span></div>
            <div className="slip-row"><span>Closing meter:</span><span>{printSale.closingMeter.toLocaleString()}</span></div>
            <div className="slip-row"><span>Testing:</span><span>{printSale.testingLiters} L</span></div>
            <div className="slip-row"><span>Net liters:</span><strong>{printSale.netLiters.toLocaleString()} L</strong></div>
            <div className="slip-row"><span>Rate / liter:</span><span>{rs2(printSale.ratePerLiter)}</span></div>
            <div className="receipt-divider" />
            <div className="slip-row highlight"><span>Sales amount:</span><strong>{rs(printSale.totalAmount)}</strong></div>
            <div className="slip-row"><span>Attendant:</span><span>{printSale.cashierName}</span></div>
          </div>
        )}
      </PrintReceiptModal>

      <ModuleGuide
        title="Forecourt Nozzle Meter Readings Guide"
        urduTitle="نوزل میٹر ریڈنگ اور پیمائش کی رہنمائی"
        role="cashier"
        roleLabel="Forecourt Cashier"
        purpose="Record the meter reading of each dispenser nozzle, deduct calibration testing liters, and compute net fuel sales. Managers can add, edit or delete nozzles."
        steps={[
          { step: 1, title: 'Select Nozzle (نوزل کا انتخاب)', detail: 'Choose the dispenser and nozzle. The opening meter is filled with that nozzle\'s last recorded reading.', urdu: 'ڈسپنسر اور نوزل منتخب کریں، پچھلی ریڈنگ خودکار آ جائے گی۔' },
          { step: 2, title: 'Enter the Closing Meter (موجودہ میٹر)', detail: 'Type the exact number shown on the physical dispenser display.', urdu: 'ڈسپنسر میٹر پر نظر آنے والی موجودہ ریڈنگ درج کریں۔' },
          { step: 3, title: 'Deduct Testing Liters (پیمائش کین کی کٹوتی)', detail: 'Deduct any 5L or 10L calibration testing poured back into the tank.', urdu: 'ٹینک میں واپس ڈالا گیا ٹیسٹنگ تیل منہا کریں۔' },
          { step: 4, title: 'Add / Delete Nozzles (نوزل شامل یا حذف کریں)', detail: 'Managers: use "Add Nozzle" for a new dispenser nozzle, or the edit / delete buttons on a nozzle card.', urdu: 'مینیجر نیا نوزل شامل کر سکتا ہے یا کارڈ پر موجود بٹن سے تبدیل / حذف کر سکتا ہے۔' },
        ]}
        criticalChecks={[
          'The closing meter must always be greater than the opening meter, and the opening must match the last reading.',
          'Always log testing liters so the cashier is not held responsible for missing cash.',
          'For commercial fleet vehicles buying on credit, record a Credit Slip in the Customers module.',
        ]}
      />
    </div>
  )
}
