import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { CreditSaleSlip, Customer, CustomerAdjustment, CustomerRecovery, FuelType, RecoveryMethod } from '../../types'
import { FUEL_TYPES } from '../../types'
import { todayISO } from '../../lib/dates'
import { rateOnDate } from '../../data/derive'
import { round2 } from '../../lib/money'
import { CheckCircleIcon, WhatsAppIcon } from '../../components/common/Icons'
import { Modal, FormError } from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import { useSubmit } from '../../components/common/useSubmit'
import { CalcStrip, Field, Grid2, Grid3 } from '../../components/common/kit'
import { ANY_VEHICLE, acceptsAnyVehicle, parseVehicles } from '../../context/actions'
import { openWhatsApp, slipMessage } from './whatsapp'

const rsn = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`

// ===========================================================================
// Register / edit customer
// ===========================================================================
export const CustomerFormModal: React.FC<{ customer?: Customer; onClose: () => void; onSaved?: (c: Customer | null) => void }> = ({ customer, onClose, onSaved }) => {
  const { act } = useApp()
  const toast = useToast()
  const { busy, error, run } = useSubmit()
  const [business, setBusiness] = useState(customer?.businessName ?? '')
  const [owner, setOwner] = useState(customer && customer.name !== customer.businessName ? customer.name : '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [limit, setLimit] = useState(String(customer?.creditLimit ?? 500000))
  const [vehicles, setVehicles] = useState((customer?.vehicleNumbers ?? []).filter((v) => v !== ANY_VEHICLE).join(', '))
  const [opening, setOpening] = useState(String(customer?.openingBalance ?? 0))
  const [status, setStatus] = useState<'Active' | 'Hold'>(customer?.status === 'Hold' ? 'Hold' : 'Active')
  const archived = customer?.status === 'Archived'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = {
      businessName: business, name: owner, phone, vehicleNumbers: parseVehicles(vehicles),
      creditLimit: Number(limit), openingBalance: Number(opening), status,
    }
    if (customer) {
      void run(() => act.updateCustomer(customer.id, input), () => { toast.success('Customer updated.'); onSaved?.(null); onClose() })
    } else {
      void run(() => act.createCustomer(input), (c) => { toast.success(`Registered ${c.businessName}.`); onSaved?.(c); onClose() })
    }
  }

  return (
    <Modal title={customer ? 'Edit Customer' : 'Register New Fleet Customer'} subtitle={customer ? customer.businessName : 'Create an authorized credit account with an approved limit and vehicles'} onClose={onClose} busy={busy} width={640}>
      <form className="modal-form-compact" onSubmit={submit}>
        {archived && <div className="ui-notice ui-notice-warning">This customer is archived. Save with status Active to bring it back.</div>}
        <Grid2>
          <Field label="Business / transporter name"><input className="form-input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Al-Madina Goods Transport" required autoFocus /></Field>
          <Field label="Proprietor / contact person"><input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Haji Munir Ahmed" /></Field>
        </Grid2>
        <Grid2>
          <Field label="Phone (for WhatsApp slips & statements)"><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" required /></Field>
          <Field label="Approved credit limit (PKR)"><input type="number" min={0} step="1000" className="form-input" value={limit} onChange={(e) => setLimit(e.target.value)} required /></Field>
        </Grid2>
        <Grid2>
          <Field label="Authorized vehicle numbers" hint="Separate with commas. Leave empty to accept any vehicle. Cashiers can only issue slips to these plates.">
            <textarea className="form-input" rows={2} style={{ height: 'auto' }} value={vehicles} onChange={(e) => setVehicles(e.target.value)} placeholder="TKA-992, LWO-4481, RYK-1290" />
          </Field>
          <Field label="Opening balance due (PKR)" hint={customer ? 'Old credit carried in from before the software. Changing it changes the customer\'s balance.' : 'Existing credit carried over, if any.'}>
            <input type="number" step="any" className="form-input" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
        </Grid2>
        <Field label="Account status" hint="Hold blocks new credit slips until you set it back to Active.">
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as 'Active' | 'Hold')}>
            <option value="Active">Active — can take fuel on credit</option>
            <option value="Hold">Hold — no new credit slips</option>
          </select>
        </Field>
        {customer && <CalcStrip items={[{ label: 'Current balance due', value: rsn(customer.currentBalance), tone: 'gold' }, { label: 'Limit', value: rsn(Number(limit) || 0) }]} />}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : customer ? 'Save changes' : 'Register customer'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Credit fuel slip (DEBIT) — issue or edit
// ===========================================================================
export const SlipModal: React.FC<{ customerId?: string; slip?: CreditSaleSlip; onClose: () => void; onSaved?: (s: CreditSaleSlip) => void }> = ({ customerId, slip, onClose, onSaved }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const { busy, error, run } = useSubmit()
  const isManager = currentUser?.role !== 'cashier'
  const rates = activeSiteData.settings.rates
  const usable = activeSiteData.customers.filter((c) => c.status === 'Active')
  const initial = activeSiteData.customers.find((c) => c.id === (slip?.customerId ?? customerId)) ?? usable[0]

  const [custId, setCustId] = useState(initial?.id ?? '')
  const customer = activeSiteData.customers.find((c) => c.id === custId)
  const [vehicle, setVehicle] = useState(slip?.vehicleNo ?? (initial && !acceptsAnyVehicle(initial) ? initial.vehicleNumbers[0] ?? '' : ''))
  const [driver, setDriver] = useState(slip?.driverName ?? '')
  const [fuel, setFuel] = useState<FuelType>(slip?.fuelType ?? 'HSD Diesel')
  const [liters, setLiters] = useState(slip ? String(slip.liters) : '')
  const [rateText, setRateText] = useState(slip ? String(slip.rate) : '')
  const [date, setDate] = useState(slip?.date ?? todayISO())
  const [phone, setPhone] = useState(initial?.phone ?? '')

  const rate = slip && rateText !== '' ? Number(rateText) : rateOnDate(activeSiteData.tariffHistory, rates, fuel, date)
  const l = Number(liters)
  const total = Number.isFinite(l) && l > 0 ? round2(l * (Number.isFinite(rate) ? rate : 0)) : 0
  const before = customer ? customer.currentBalance - (slip ? slip.totalAmount : 0) : 0
  const after = before + total
  const over = customer ? after > customer.creditLimit + 0.005 : false

  const changeCustomer = (id: string) => {
    setCustId(id)
    const c = activeSiteData.customers.find((x) => x.id === id)
    if (c) {
      setPhone(c.phone)
      setVehicle(!acceptsAnyVehicle(c) ? c.vehicleNumbers[0] ?? '' : '')
    }
  }

  const submit = (sendWhatsApp: boolean) => {
    if (slip) {
      void run(
        () => act.updateSlip(slip.id, { vehicleNo: vehicle, driverName: driver, fuelType: fuel, liters: l, date, rate: Number(rateText) }),
        () => { toast.success(`Slip ${slip.slipNo} updated.`); onClose() },
      )
      return
    }
    void run(
      (ack) => act.issueSlip({ customerId: custId, vehicleNo: vehicle, driverName: driver, fuelType: fuel, liters: l, date, acknowledge: ack }),
      (saved) => {
        toast.success(`Issued ${saved.slipNo} — ${rsn(saved.totalAmount)}`)
        onSaved?.(saved)
        if (sendWhatsApp) openWhatsApp(phone, slipMessage(saved, activeSiteData.siteInfo))
        onClose()
      },
    )
  }

  return (
    <Modal title={slip ? `Edit Credit Slip ${slip.slipNo}` : 'Issue Credit Fuel Slip'} subtitle={slip ? 'Correct a slip — the customer balance is recalculated' : 'Fuel taken on a transporter\'s credit account (debit)'} onClose={onClose} busy={busy} width={680}>
      <form className="modal-form-compact" onSubmit={(e) => { e.preventDefault(); submit(false) }}>
        <Grid2>
          <Field label="Customer / fleet account">
            {slip ? (
              <div className="read-only-box"><strong>{slip.customerName}</strong></div>
            ) : (
              <select className="form-input" value={custId} onChange={(e) => changeCustomer(e.target.value)} required>
                {usable.map((c) => <option key={c.id} value={c.id}>{c.businessName} (Due: {rsn(c.currentBalance)})</option>)}
              </select>
            )}
          </Field>
          <Field label="Vehicle registration #" hint={customer && !acceptsAnyVehicle(customer) ? `Registered: ${customer.vehicleNumbers.join(', ')}` : 'This customer accepts any vehicle'}>
            <input className="form-input" list="slip-plates" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. TKA-992" required autoCapitalize="characters" />
            <datalist id="slip-plates">{(customer?.vehicleNumbers ?? []).filter((v) => v !== ANY_VEHICLE).map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
        </Grid2>
        <Grid3>
          <Field label="Driver name"><input className="form-input" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Driver who took fuel" required /></Field>
          <Field label="Fuel product">
            <select className="form-input" value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)}>
              {FUEL_TYPES.map((f) => <option key={f} value={f}>{f} (Rs {rates[f]})</option>)}
            </select>
          </Field>
          <Field label="Liters dispensed" strong><input type="number" min={0.001} step="any" className="form-input" value={liters} onChange={(e) => setLiters(e.target.value)} required autoFocus={!slip} /></Field>
        </Grid3>
        <Grid2>
          <Field label="Date" hint={!isManager ? 'Cashiers record today only' : undefined}><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={!isManager} required /></Field>
          {slip ? (
            <Field label="Rate per liter (PKR)"><input type="number" step="any" min={0} className="form-input" value={rateText} onChange={(e) => setRateText(e.target.value)} required /></Field>
          ) : (
            <Field label={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><WhatsAppIcon size={14} color="#15803d" />Transporter WhatsApp number</span>}>
              <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-8671234" />
            </Field>
          )}
        </Grid2>

        <CalcStrip items={[
          { label: 'Rate / L', value: `Rs ${Number.isFinite(rate) ? rate : 0}` },
          { label: 'Slip value', value: rsn(total), tone: 'red' },
          { label: 'Balance before', value: rsn(before) },
          { label: 'Balance after', value: rsn(after), tone: over ? 'red' : 'gold' },
          { label: 'Credit limit', value: customer ? rsn(customer.creditLimit) : '—' },
        ]} />
        {over && <div className="ui-notice ui-notice-warning">This slip takes the customer above the approved credit limit.{isManager ? ' You will be asked to authorize it.' : ' A manager must authorize it.'}</div>}

        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {slip ? (
            <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save changes'}</span></button>
          ) : (
            <>
              <button type="submit" className="btn btn-secondary" disabled={busy}><CheckCircleIcon size={16} /><span>Save only</span></button>
              <button type="button" className="btn btn-primary" style={{ backgroundColor: '#15803d', borderColor: '#166534' }} disabled={busy} onClick={() => submit(true)}>
                <WhatsAppIcon size={15} color="#fff" /><span>Save &amp; send WhatsApp</span>
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Recovery (CREDIT) — record or edit
// ===========================================================================
export const RecoveryModal: React.FC<{ customerId?: string; recovery?: CustomerRecovery; onClose: () => void; onSaved?: (r: CustomerRecovery, print: boolean) => void }> = ({ customerId, recovery, onClose, onSaved }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const { busy, error, run } = useSubmit()
  const isManager = currentUser?.role !== 'cashier'
  const customers = activeSiteData.customers.filter((c) => c.status !== 'Archived')
  const initial = customers.find((c) => c.id === (recovery?.customerId ?? customerId)) ?? customers[0]
  const banks = activeSiteData.bankAccounts.filter((b) => b.isActive)

  const [custId, setCustId] = useState(initial?.id ?? '')
  const customer = customers.find((c) => c.id === custId)
  const [method, setMethod] = useState<RecoveryMethod>(recovery?.paymentMethod ?? 'Cash')
  const [amount, setAmount] = useState(recovery ? String(recovery.amount) : initial && initial.currentBalance > 0 ? String(Math.round(initial.currentBalance)) : '')
  const [ref, setRef] = useState(recovery?.referenceNo ?? '')
  const [date, setDate] = useState(recovery?.date ?? todayISO())
  const [bankId, setBankId] = useState(recovery?.bankAccountId ?? '')

  const amt = Number(amount)
  const before = customer ? customer.currentBalance + (recovery ? recovery.amount : 0) : 0
  const after = before - (Number.isFinite(amt) ? amt : 0)

  const submit = (print: boolean) => {
    if (recovery) {
      void run(
        (ack) => act.updateRecovery(recovery.id, { amount: amt, method, referenceNo: ref, date, bankAccountId: bankId, acknowledge: ack }),
        () => { toast.success(`Receipt ${recovery.receiptNo} updated.`); onClose() },
      )
      return
    }
    void run(
      (ack) => act.recordRecovery({ customerId: custId, amount: amt, method, referenceNo: ref, date, bankAccountId: bankId, acknowledge: ack }),
      (saved) => {
        toast.success(`Recorded ${saved.receiptNo} — ${rsn(saved.amount)}${saved.paymentMethod === 'Cash' ? ' (added to the daybook)' : saved.bankPending ? ' (a manager will confirm the bank account)' : ''}`)
        onSaved?.(saved, print)
        onClose()
      },
    )
  }

  return (
    <Modal title={recovery ? `Edit Receipt ${recovery.receiptNo}` : 'Record Customer Recovery'} subtitle={recovery ? 'Correct a payment — balance and cash book are updated' : 'Payment received from a fleet account (credit)'} onClose={onClose} busy={busy} width={640}>
      <form className="modal-form-compact" onSubmit={(e) => { e.preventDefault(); submit(false) }}>
        <Grid2>
          <Field label="Customer account">
            {recovery ? (
              <div className="read-only-box"><strong>{recovery.customerName}</strong></div>
            ) : (
              <select className="form-input" value={custId} onChange={(e) => setCustId(e.target.value)} required>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.businessName} (Due: {rsn(c.currentBalance)})</option>)}
              </select>
            )}
          </Field>
          <Field label="Payment mode">
            <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value as RecoveryMethod)}>
              <option value="Cash">Physical cash</option>
              <option value="Cheque">Bank cheque</option>
              <option value="Online Transfer">Online / Raast transfer</option>
            </select>
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Amount received (PKR)" strong><input type="number" min={1} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
          <Field label={method === 'Cash' ? 'Reference (optional)' : method === 'Cheque' ? 'Cheque number' : 'Transaction reference'}>
            <input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={method === 'Cash' ? 'e.g. Cash desk' : 'e.g. MCB-CHQ-18920'} required={method !== 'Cash'} />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Date" hint={!isManager ? 'Cashiers record today only' : undefined}><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={!isManager} required /></Field>
          {method !== 'Cash' && isManager ? (
            <Field label="Credit to bank account" hint="Where did the money go? You can also leave it and confirm later.">
              <select className="form-input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">Not in a bank yet (I will confirm later)</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Cash book"><div className="read-only-box">{method === 'Cash' ? 'A cash-in line is added to the daybook automatically' : 'Nothing more to do: your manager will choose the bank account later'}</div></Field>
          )}
        </Grid2>
        <CalcStrip items={[
          { label: 'Outstanding before', value: rsn(before), tone: 'red' },
          { label: 'This payment', value: `- ${rsn(Number.isFinite(amt) ? amt : 0)}`, tone: 'green' },
          { label: 'Remaining balance', value: after < 0 ? `${rsn(-after)} advance` : rsn(after), tone: 'gold' },
        ]} />
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {!recovery && <button type="button" className="btn btn-outline" onClick={() => submit(true)} disabled={busy}>Save &amp; print receipt</button>}
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : recovery ? 'Save changes' : 'Save recovery receipt'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Debit / credit note
// ===========================================================================
export const AdjustmentModal: React.FC<{ customerId: string; adjustment?: CustomerAdjustment; onClose: () => void }> = ({ customerId, adjustment, onClose }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const { busy, error, run } = useSubmit()
  const customer = activeSiteData.customers.find((c) => c.id === customerId)
  const [kind, setKind] = useState<'Debit' | 'Credit'>(adjustment?.kind ?? 'Debit')
  const [amount, setAmount] = useState(adjustment ? String(adjustment.amount) : '')
  const [reason, setReason] = useState(adjustment?.reason ?? '')
  const [ref, setRef] = useState(adjustment?.referenceNo ?? '')
  const [date, setDate] = useState(adjustment?.date ?? todayISO())

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (adjustment) {
      void run(() => act.updateAdjustment(adjustment.id, { kind, amount: Number(amount), reason, referenceNo: ref, date }), () => { toast.success('Adjustment updated.'); onClose() })
    } else {
      void run(() => act.addAdjustment({ customerId, kind, amount: Number(amount), reason, referenceNo: ref, date }), () => { toast.success(`${kind} note posted.`); onClose() })
    }
  }

  return (
    <Modal title={adjustment ? 'Edit Ledger Adjustment' : 'Post Debit / Credit Note'} subtitle={customer?.businessName} onClose={onClose} busy={busy} width={560}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Type">
            <select className="form-input" value={kind} onChange={(e) => setKind(e.target.value as 'Debit' | 'Credit')}>
              <option value="Debit">Debit note — customer owes MORE (e.g. late fee, correction)</option>
              <option value="Credit">Credit note — customer owes LESS (e.g. discount, write-off)</option>
            </select>
          </Field>
          <Field label="Amount (PKR)" strong><input type="number" min={0.01} step="any" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
        </Grid2>
        <Field label="Reason" hint="Kept in the audit trail"><input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rate difference on slip SLIP-4011" required /></Field>
        <Grid2>
          <Field label="Reference # (optional)"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Date"><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        </Grid2>
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : adjustment ? 'Save changes' : 'Post note'}</span></button>
        </div>
      </form>
    </Modal>
  )
}
