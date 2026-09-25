import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { FuelType, Tank, TankDipRecord } from '../../types'
import { FUEL_TYPES } from '../../types'
import { isLowTank, movementsSinceLastDip } from '../../data/derive'
import { formatDate, todayISO } from '../../lib/dates'
import { round2 } from '../../lib/money'
import { PlusIcon, PrinterIcon, CheckCircleIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, Grid3, Grid4, IconButton, PageHeader, RowActions, SectionCard } from '../common/kit'

const num = (n: number) => Math.round(n).toLocaleString('en-US')

// ===========================================================================
// Dip dialog
// ===========================================================================
const DipModal: React.FC<{ tankId: string; onClose: () => void }> = ({ tankId, onClose }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const { tanks } = activeSiteData
  const isCashier = currentUser?.role === 'cashier'
  const first = tanks.find((t) => t.id === tankId) ?? tanks[0]

  const init = (t: Tank | undefined) => {
    const m = t ? movementsSinceLastDip(activeSiteData, t.id) : { decanted: 0, dispensed: 0 }
    return { morningMm: String(t?.currentDipMm ?? 0), morningL: String(t?.currentLiters ?? 0), decanted: String(m.decanted), dispensed: String(m.dispensed) }
  }
  const start = init(first)
  const [id, setId] = useState(first?.id ?? '')
  const tank = tanks.find((t) => t.id === id) ?? first
  const [date, setDate] = useState(todayISO())
  const [morningMm, setMorningMm] = useState(start.morningMm)
  const [morningL, setMorningL] = useState(start.morningL)
  const [decanted, setDecanted] = useState(start.decanted)
  const [dispensed, setDispensed] = useState(start.dispensed)
  const [closingMm, setClosingMm] = useState('')
  const [closingL, setClosingL] = useState('')
  const [water, setWater] = useState('0')
  const [inspector, setInspector] = useState(currentUser?.name ?? '')
  const { busy, error, setError, run } = useSubmit()

  const pick = (t: Tank) => {
    setId(t.id)
    const s = init(t)
    setMorningMm(s.morningMm); setMorningL(s.morningL); setDecanted(s.decanted); setDispensed(s.dispensed)
    setClosingMm(''); setClosingL(''); setError(null)
  }

  const book = round2(Number(morningL) + Number(decanted) - Number(dispensed))
  const physical = Number(closingL)
  const variance = closingL === '' ? 0 : round2(physical - book)
  const tolerance = tank ? tank.capacityLiters * 0.005 : 0
  const waterAlarm = Number(water) > 0

  if (!tank) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      (ack) => act.recordDip({
        tankId: tank.id, date, morningDipMm: Number(morningMm), morningLiters: Number(morningL), decantedLiters: Number(decanted),
        dispensedLiters: Number(dispensed), closingDipMm: Number(closingMm), closingPhysicalLiters: physical, waterDipMm: Number(water),
        inspector, acknowledge: ack,
      }),
      (dip) => { toast.success(`Dip saved for Tank #${dip.tankNo}: physical ${num(dip.closingPhysicalLiters)} L, variance ${dip.varianceLiters > 0 ? '+' : ''}${dip.varianceLiters} L`); onClose() },
    )
  }

  return (
    <Modal title="Record Tank Physical Dip" subtitle="Morning reading, deliveries, sales and the measured closing stock" onClose={onClose} busy={busy} width={780}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="Underground tank">
            <select className="form-input" value={id} onChange={(e) => { const t = tanks.find((x) => x.id === e.target.value); if (t) pick(t) }}>
              {tanks.map((t) => <option key={t.id} value={t.id}>Tank #{t.tankNo} — {t.fuelType}</option>)}
            </select>
          </Field>
          <Field label="Date" hint={isCashier ? 'Today only' : undefined}><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={isCashier} required /></Field>
          <Field label="Inspecting officer"><input className="form-input" value={inspector} onChange={(e) => setInspector(e.target.value)} required /></Field>
        </Grid3>
        <Grid4>
          <Field label="Morning dip (mm)"><input type="number" min={0} step="any" className="form-input" value={morningMm} onChange={(e) => setMorningMm(e.target.value)} required /></Field>
          <Field label="Morning stock (L)"><input type="number" min={0} step="any" className="form-input" value={morningL} onChange={(e) => setMorningL(e.target.value)} required /></Field>
          <Field label="Delivered (+ L)" hint="From tanker deliveries"><input type="number" min={0} step="any" className="form-input" value={decanted} onChange={(e) => setDecanted(e.target.value)} /></Field>
          <Field label="Sold (− L)" hint="From meter readings"><input type="number" min={0} step="any" className="form-input" value={dispensed} onChange={(e) => setDispensed(e.target.value)} required /></Field>
        </Grid4>
        <Grid3>
          <Field label="Closing dip (mm)" strong><input type="number" min={0} step="any" className="form-input" value={closingMm} onChange={(e) => setClosingMm(e.target.value)} required autoFocus /></Field>
          <Field label="Measured stock (L)" strong><input type="number" min={0} step="any" className="form-input" value={closingL} onChange={(e) => setClosingL(e.target.value)} required /></Field>
          <Field label="Water (mm)" hint="0 = clear"><input type="number" min={0} step="any" className="form-input" value={water} onChange={(e) => setWater(e.target.value)} /></Field>
        </Grid3>
        <CalcStrip items={[
          { label: 'Expected stock', value: `${num(book)} L` },
          { label: 'Measured', value: closingL === '' ? '—' : `${num(physical)} L`, tone: 'gold' },
          { label: 'Difference', value: closingL === '' ? '—' : variance === 0 ? '0 L (balanced)' : `${variance > 0 ? 'Gain +' : 'Loss '}${Math.abs(variance)} L`, tone: variance < 0 ? 'red' : variance > 0 ? 'green' : undefined },
          { label: 'Tolerance ±0.5%', value: `±${num(tolerance)} L` },
        ]} />
        {closingL !== '' && Math.abs(variance) > tolerance && <div className="ui-notice ui-notice-warning">The variance is outside the normal ±0.5% tolerance. Re-check the dip before saving.</div>}
        {waterAlarm && <div className="ui-notice ui-notice-danger"><strong>Water detected!</strong> STOP dispensing from this tank immediately and inform the manager.</div>}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save dip audit'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Add / edit tank dialog
// ===========================================================================
const TankModal: React.FC<{ tank?: Tank; onClose: () => void }> = ({ tank, onClose }) => {
  const [version] = useState(tank?.updatedAt) // the record's version when this window was opened
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const nextNo = activeSiteData.tanks.length ? Math.max(...activeSiteData.tanks.map((t) => t.tankNo)) + 1 : 1
  const [tankNo, setTankNo] = useState(String(tank?.tankNo ?? nextNo))
  const [fuel, setFuel] = useState<FuelType>(tank?.fuelType ?? 'HSD Diesel')
  const [capacity, setCapacity] = useState(String(tank?.capacityLiters ?? ''))
  const [reserve, setReserve] = useState(String(tank?.minReserveLiters ?? ''))
  const [initialL, setInitialL] = useState(String(tank?.initialLiters ?? 0))
  const [initialMm, setInitialMm] = useState(String(tank?.initialDipMm ?? 0))
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { tankNo: Number(tankNo), fuelType: fuel, capacityLiters: Number(capacity), minReserveLiters: Number(reserve), initialLiters: Number(initialL), initialDipMm: Number(initialMm) }
    if (tank) void run(() => act.updateTank(tank.id, { ...input, version }), () => { toast.success('Tank updated.'); onClose() })
    else void run(() => act.addTank(input), (t) => { toast.success(`Added Tank #${t.tankNo}.`); onClose() })
  }

  return (
    <Modal title={tank ? `Edit Tank #${tank.tankNo}` : 'Add Underground Tank'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Tank number"><input type="number" min={1} step={1} className="form-input" value={tankNo} onChange={(e) => setTankNo(e.target.value)} required /></Field>
          <Field label="Fuel product">
            <select className="form-input" value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)}>{FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Capacity (liters)"><input type="number" min={1} step="any" className="form-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></Field>
          <Field label="Minimum reserve (liters)" hint="Below this the low-stock alert shows"><input type="number" min={0} step="any" className="form-input" value={reserve} onChange={(e) => setReserve(e.target.value)} required /></Field>
        </Grid2>
        <Grid2>
          <Field label="Opening stock (liters)" hint={tank ? 'Used until the first dip is recorded' : 'Fuel in the tank today'}><input type="number" min={0} step="any" className="form-input" value={initialL} onChange={(e) => setInitialL(e.target.value)} required /></Field>
          <Field label="Opening dip (mm)"><input type="number" min={0} step="any" className="form-input" value={initialMm} onChange={(e) => setInitialMm(e.target.value)} required /></Field>
        </Grid2>
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : tank ? 'Save changes' : 'Add tank'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Page
// ===========================================================================
export const TankDipView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const { tanks, tankDips, siteInfo, nozzles, settings } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const confirm = useConfirm()
  const toast = useToast()
  const [dipFor, setDipFor] = useState<string | null>(null)
  const [tankForm, setTankForm] = useState<{ tank?: Tank } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  const removeTank = async (t: Tank) => {
    const yes = await confirm({ title: `Delete Tank #${t.tankNo}?`, message: `${t.fuelType} tank of ${num(t.capacityLiters)} L. It can only be deleted while no nozzle, dip record or delivery uses it.`, confirmLabel: 'Delete tank', tone: 'danger' })
    if (!yes) return
    const r = await act.removeTank(t.id)
    if (r.ok) toast.success(`Tank #${t.tankNo} deleted.`)
    else toast.error(r.error)
  }
  const removeDip = async (d: TankDipRecord) => {
    const yes = await confirm({ title: 'Delete this dip record?', message: `Tank #${d.tankNo}, ${formatDate(d.date)} — physical ${num(d.closingPhysicalLiters)} L. The tank level goes back to its previous dip. This is recorded in the audit trail.`, confirmLabel: 'Delete dip', tone: 'danger' })
    if (!yes) return
    const r = await act.removeDip(d.id)
    if (r.ok) toast.success('Dip record deleted.')
    else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="Fuel tanks"
        title="Fuel tanks"
        subtitle="See how much fuel is in each tank, and check it against what should be there."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print</span></button>
            {isManager && <button type="button" className="btn btn-outline" onClick={() => setTankForm({})}><PlusIcon size={16} /><span>Add tank</span></button>}
            <button type="button" className="btn btn-primary" onClick={() => setDipFor('')} disabled={tanks.length === 0}><PlusIcon size={16} /><span>Measure a tank</span></button>
          </>
        }
      />

      {tanks.length === 0 ? (
        <div className="ui-empty">No tanks have been added yet.{isManager ? ' Click "Add Tank" to register the first underground tank.' : ''}</div>
      ) : (
        <div className="tanks-meter-row">
          {tanks.map((tank) => {
            const fillPct = Math.round((tank.currentLiters / tank.capacityLiters) * 100)
            const isLow = isLowTank(tank, settings.lowStockAlertPct)
            const attached = nozzles.filter((n) => n.tankId === tank.id).length
            return (
              <div key={tank.id} className={`tank-gauge-card ${isLow ? 'low-stock-glow' : ''}`}>
                <div className="tank-card-top">
                  <div>
                    <span className="tank-number-tag">Underground Tank #{tank.tankNo}</span>
                    <h4 className="tank-fuel-title">{tank.fuelType}</h4>
                  </div>
                  <RowActions>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setDipFor(tank.id)}>Log Dip</button>
                    {isManager && <IconButton label="Edit tank" onClick={() => setTankForm({ tank })}><EditIcon size={14} /></IconButton>}
                    {isManager && <IconButton label="Delete tank" tone="danger" onClick={() => void removeTank(tank)}><TrashIcon size={14} /></IconButton>}
                  </RowActions>
                </div>
                <div className="tank-progress-track"><div className={`tank-progress-fill ${isLow ? 'fill-low' : 'fill-good'}`} style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }} /></div>
                <div className="tank-stats-row">
                  <div className="tank-stat-item"><span className="stat-label">Measured stock</span><strong className="stat-val">{num(tank.currentLiters)} L</strong></div>
                  <div className="tank-stat-item"><span className="stat-label">Estimated now</span><strong className="stat-val">{num(tank.estimatedBookLiters)} L</strong></div>
                  <div className="tank-stat-item"><span className="stat-label">Physical dip</span><strong className="stat-val">{tank.currentDipMm} mm</strong></div>
                  <div className="tank-stat-item"><span className="stat-label">Capacity</span><strong className="stat-val">{num(tank.capacityLiters)} L</strong></div>
                  <div className="tank-stat-item"><span className="stat-label">Water dip</span><strong className={`stat-val ${tank.waterDipMm > 0 ? 'text-red' : 'text-green'}`}>{tank.waterDipMm > 0 ? `${tank.waterDipMm} mm — WATER!` : '0 mm (clear)'}</strong></div>
                  <div className="tank-stat-item"><span className="stat-label">Nozzles</span><strong className="stat-val">{attached} • last dip {tank.lastUpdated || 'never'}</strong></div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SectionCard title="Past tank measurements" subtitle="What the system expected in each tank, against what was really measured. Newest first.">
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr><th>Date & tank</th><th>Fuel</th><th>Morning dip</th><th>Fuel received</th><th>Fuel sold</th><th>Expected stock</th><th>Closing dip</th><th>Difference</th><th>Water</th><th>Checked by</th>{isManager && <th />}</tr>
            </thead>
            <tbody>
              {tankDips.length === 0 ? <EmptyRow colSpan={isManager ? 11 : 10}>No tank measurements yet.</EmptyRow> : tankDips.map((d) => (
                <tr key={d.id}>
                  <td><strong>Tank #{d.tankNo}</strong><div className="text-muted text-xs">{formatDate(d.date)}</div></td>
                  <td><span className="fuel-pill">{d.fuelType}</span></td>
                  <td><strong>{d.morningDipMm} mm</strong><div className="text-muted text-xs">{num(d.morningLiters)} L</div></td>
                  <td>{d.decantedLiters > 0 ? `+${num(d.decantedLiters)} L` : '—'}</td>
                  <td>-{num(d.dispensedLiters)} L</td>
                  <td>{num(d.bookStockLiters)} L</td>
                  <td><strong>{d.closingDipMm} mm</strong><div className="text-muted text-xs">{num(d.closingPhysicalLiters)} L</div></td>
                  <td>
                    {d.varianceLiters < 0 ? <span className="badge badge-danger">Loss: {Math.abs(d.varianceLiters)} L</span>
                      : d.varianceLiters > 0 ? <span className="badge badge-success">Gain: +{d.varianceLiters} L</span>
                      : <span className="badge badge-neutral">0 L (exact)</span>}
                  </td>
                  <td><span className={d.waterDipMm > 0 ? 'text-red font-bold' : 'text-green font-bold'}>{d.waterDipMm} mm</span></td>
                  <td>{d.inspector}</td>
                  {isManager && <td><RowActions><IconButton label="Delete dip record" tone="danger" onClick={() => void removeDip(d)}><TrashIcon size={14} /></IconButton></RowActions></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {dipFor !== null && <DipModal tankId={dipFor} onClose={() => setDipFor(null)} />}
      {tankForm && <TankModal tank={tankForm.tank} onClose={() => setTankForm(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Daily Tank Dip & Stock Calibration Audit" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Date</th><th>Tank</th><th>Fuel</th><th>Morning (mm)</th><th>Fuel received</th><th>Fuel sold</th><th>Expected</th><th>Closing (mm)</th><th>Measured</th><th>Difference</th></tr></thead>
          <tbody>
            {tankDips.map((d) => (
              <tr key={d.id}><td>{formatDate(d.date)}</td><td>#{d.tankNo}</td><td>{d.fuelType}</td><td>{d.morningDipMm}</td><td>{d.decantedLiters}L</td><td>{d.dispensedLiters}L</td><td>{d.bookStockLiters}L</td><td>{d.closingDipMm}</td><td>{d.closingPhysicalLiters}L</td><td>{d.varianceLiters}L</td></tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-signatures"><div><div className="sig-line" /><span>Dip inspector</span></div><div><div className="sig-line" /><span>Station manager</span></div></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Underground Tank Dip & Stock Calibration"
        urduTitle="زیر زمین ٹینک پیمائش (ڈپ) اور اسٹاک آڈٹ"
        role="manager"
        roleLabel="Station Manager"
        purpose="Measure underground fuel levels with the brass dip rod, detect bottom water with water-finding paste, and compare book stock with the physical reading."
        steps={[
          { step: 1, title: 'Take the dip (پیمائش)', detail: 'Insert the clean brass rod into the sounding pipe; note the millimeter level and the volume it equals.', urdu: 'ڈپ راڈ ڈال کر ملی میٹر اور لیٹر ریڈنگ نوٹ کریں۔' },
          { step: 2, title: 'Deliveries and sales are pre-filled (خودکار)', detail: 'Tanker deliveries recorded in the OMC module and nozzle sales since the last dip are filled in for you.', urdu: 'ٹینکر کی سپلائی اور نوزل کی فروخت خودکار بھر جاتی ہے۔' },
          { step: 3, title: 'Water paste test (پانی کی جانچ)', detail: 'Apply water paste to the bottom 100 mm of the rod. 0 mm means clear.', urdu: 'واٹر پیسٹ سے ٹینک میں پانی کی جانچ کریں۔' },
          { step: 4, title: 'Compare variance (نقصان یا بچت)', detail: 'Physical stock is compared with book stock; anything beyond ±0.5% needs an explanation.', urdu: 'بُک اسٹاک اور فزیکل اسٹاک کا موازنہ کریں۔' },
        ]}
        criticalChecks={[
          'Water paste turning dark pink / red means water contamination — STOP dispensing immediately!',
          'Normal temperature & evaporation variance is within ±0.5% of tank volume.',
          'Let tanker fuel settle for 15 minutes before taking the post-delivery dip.',
        ]}
      />
    </div>
  )
}
