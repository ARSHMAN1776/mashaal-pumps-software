import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { ManagedUser } from '../../data/backend'
import type { BackupCheck } from '../../data/backup'
import type { AuditEntry, FuelRates, FuelType, UserRole } from '../../types'
import { FUEL_TYPES } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import {
  CheckCircleIcon, ShieldIcon, FileTextIcon, GasPumpIcon, DropletIcon, ReceiptIcon, AlertCircleIcon, SettingsIcon, TrendingUpIcon,
  KeyIcon, DownloadIcon, PlusIcon, EditIcon, TrashIcon, RefreshIcon,
} from '../common/Icons'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { PasswordDialog } from '../common/PasswordDialog'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, Grid3, IconButton, Notice, RowActions } from '../common/kit'

const FUEL_LABEL: Record<FuelType, string> = { 'PMG Super': 'PMG Super 92', 'HSD Diesel': 'HSD Diesel', 'Hi-Octane': 'Altron / Hi-Octane' }
const FUEL_SUB: Record<FuelType, [string, string]> = {
  'PMG Super': ['Standard Consumer Petrol', 'Motor Gasoline'],
  'HSD Diesel': ['Heavy Transport & Fleet', 'High Speed Diesel'],
  'Hi-Octane': ['Luxury & Performance', 'Hi-Octane 97'],
}
const FUEL_BADGE: Record<FuelType, { cls: string; color: string }> = {
  'PMG Super': { cls: 'super', color: '#c2410c' }, 'HSD Diesel': { cls: 'diesel', color: '#15803d' }, 'Hi-Octane': { cls: 'octane', color: '#b91c1c' },
}

// ===========================================================================
// OGRA fortnightly revision wizard
// ===========================================================================
const OgraModal: React.FC<{ onClose: () => void; onApplied?: () => void }> = ({ onClose, onApplied }) => {
  const { activeSiteData, act } = useApp()
  const toast = useToast()
  const { settings, tanks, nozzles } = activeSiteData
  const [rates, setRates] = useState<Record<FuelType, string>>({
    'PMG Super': String(settings.rates['PMG Super']), 'HSD Diesel': String(settings.rates['HSD Diesel']), 'Hi-Octane': String(settings.rates['Hi-Octane']),
  })
  const [effective, setEffective] = useState(todayISO())
  const [notif, setNotif] = useState(`OGRA/PL/${todayISO().slice(0, 7)}-A`)
  const [notes, setNotes] = useState('Fortnightly OGRA official price determination')
  const { busy, error, run } = useSubmit()

  const lines = tanks.map((t) => {
    const oldR = settings.rates[t.fuelType] || 0
    const newR = Number(rates[t.fuelType]) || 0
    const diff = Math.round((newR - oldR) * 100) / 100
    return { tank: t, oldR, newR, diff, gain: Math.round(t.estimatedBookLiters * diff) }
  })
  const net = lines.reduce((s, l) => s + l.gain, 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const newRates = Object.fromEntries(FUEL_TYPES.map((f) => [f, Number(rates[f])])) as FuelRates
    void run(
      () => act.applyOgraPriceChange({ newRates, effectiveDate: effective, notificationNo: notif, notes }),
      (log) => { toast.success(`OGRA revision active — all ${nozzles.length} nozzles updated. Inventory impact ${log.netInventoryGainLoss >= 0 ? '+' : ''}${rs(log.netInventoryGainLoss)}`); onApplied?.(); onClose() },
    )
  }

  return (
    <Modal title="OGRA Fortnightly Price Revision Wizard" subtitle="Applies new official tariffs to every nozzle and calculates the stock gain / loss" onClose={onClose} busy={busy} width={780}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="New prices start on" hint="Earlier readings keep the old price"><input type="date" className="form-input" value={effective} max={todayISO()} onChange={(e) => setEffective(e.target.value)} required /></Field>
          <Field label="OGRA notification no."><input className="form-input" value={notif} onChange={(e) => setNotif(e.target.value)} required /></Field>
          <Field label="Remarks" hint="Optional"><input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </Grid3>
        <Grid3>
          {FUEL_TYPES.map((f) => (
            <Field key={f} label={FUEL_LABEL[f]} hint={`Current: Rs. ${settings.rates[f]}`}>
              <input type="number" min={0.01} step="0.01" className="form-input" value={rates[f]} onChange={(e) => setRates({ ...rates, [f]: e.target.value })} required />
            </Field>
          ))}
        </Grid3>
        <div style={{ background: '#f3f6fa', border: '1px solid #d9dce0', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fuel in your tanks now: gain or loss from the new price</strong>
            <span className={`badge ${net >= 0 ? 'badge-success' : 'badge-danger'}`}>{net >= 0 ? 'Net inventory gain' : 'Net inventory loss'}</span>
          </div>
          {lines.map(({ tank, oldR, newR, diff, gain }) => (
            <div key={tank.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 12px', fontSize: 11.5, padding: '3px 0', borderBottom: '1px dashed #d9dce0' }}>
              <span style={{ minWidth: 0 }}><strong>Tank #{tank.tankNo}: {tank.fuelType}</strong> <span style={{ color: '#686256' }}>({Math.round(tank.estimatedBookLiters).toLocaleString()} L @ Rs. {oldR} → Rs. {newR})</span></span>
              <span style={{ color: diff >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700, whiteSpace: 'nowrap' }}>{diff >= 0 ? '+' : ''}Rs. {gain.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2px 12px', paddingTop: 6, fontSize: 12.5 }}>
            <strong>Total net revaluation impact:</strong>
            <strong style={{ color: net >= 0 ? '#15803d' : '#b91c1c' }}>{net >= 0 ? '+' : ''}Rs. {net.toLocaleString()}</strong>
          </div>
        </div>
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Applying…' : 'Apply new prices'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Users (owner only)
// ===========================================================================
const UserModal: React.FC<{ user?: ManagedUser; onClose: () => void; onSaved: () => void }> = ({ user, onClose, onSaved }) => {
  const { saveUser, stations, currentUser } = useApp()
  const toast = useToast()
  const mine = stations.filter((s) => currentUser?.stationAccess.includes(s.id))
  const [username, setUsername] = useState(user?.username ?? '')
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [role, setRole] = useState<UserRole>(user?.role ?? 'cashier')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [sites, setSites] = useState<string[]>(user?.sites ?? (mine.length === 1 ? [mine[0].id] : []))
  const [active, setActive] = useState(user?.isActive ?? true)
  const [password, setPassword] = useState('')
  const { busy, error, setError, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sites.length === 0) return setError('Select at least one station.')
    void run(
      () => saveUser({ username, password: password || undefined, fullName, role, phone, sites, isActive: active }),
      () => { toast.success(user ? 'User updated.' : `User ${username.toLowerCase()} created — they must choose a new password at first sign-in.`); onSaved(); onClose() },
    )
  }

  return (
    <Modal title={user ? `Edit User — ${user.username}` : 'Add User'} subtitle={user ? 'Change role, stations, status or reset the password' : 'Create a sign-in for a manager or cashier'} onClose={onClose} busy={busy} width={620}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Username" hint="3–40 letters, digits, dot or dash. Used to sign in.">
            <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={Boolean(user)} autoCapitalize="none" required autoFocus={!user} />
          </Field>
          <Field label="Full name"><input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>
        </Grid2>
        <Grid2>
          <Field label="Role">
            <select className="form-input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="cashier">Cashier — records sales, slips, expenses; no edits or deletes</option>
              <option value="manager">Station Manager — full station access</option>
              <option value="owner">Owner — everything, including users and restore</option>
            </select>
          </Field>
          <Field label="Phone"><input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </Grid2>
        <Field label="Stations this user may open">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {mine.map((s) => (
              <label key={s.id} className="ui-checkbox-row" style={{ margin: 0 }}>
                <input type="checkbox" checked={sites.includes(s.id)} onChange={(e) => setSites(e.target.checked ? [...sites, s.id] : sites.filter((x) => x !== s.id))} />
                <span>{s.code} — {s.name}</span>
              </label>
            ))}
          </div>
        </Field>
        <Grid2>
          <Field label={user ? 'New password (leave empty to keep)' : 'Temporary password'} hint="At least 8 characters. The user must replace it at first sign-in.">
            <input type="text" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required={!user} autoComplete="off" />
          </Field>
          {user && <label className="ui-checkbox-row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Account active (untick to block sign-in)</span></label>}
        </Grid2>
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

const UsersPanel: React.FC = () => {
  const { listUsers, deleteUser, stations, currentUser } = useApp()
  const confirm = useConfirm()
  const toast = useToast()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ user?: ManagedUser } | null>(null)

  const load = useCallback(async () => {
    const r = await listUsers()
    if (r.ok) { setUsers(r.value); setError(null) } else setError(r.error)
  }, [listUsers])
  useEffect(() => { void load() }, [load])

  const code = (id: string) => stations.find((s) => s.id === id)?.code ?? id
  const remove = async (u: ManagedUser) => {
    if (!(await confirm({ title: `Delete user ${u.username}?`, message: 'The account is removed permanently and can no longer sign in. Records they created keep their name. To keep the account but block it, edit the user and untick "active".', confirmLabel: 'Delete user', tone: 'danger' }))) return
    const r = await deleteUser(u.userId)
    if (r.ok) { toast.success('User deleted.'); void load() } else toast.error(r.error)
  }

  return (
    <section className="settings-surface-card">
      <div className="settings-card-header">
        <div className="settings-card-header-left">
          <div className="settings-card-icon-bubble"><KeyIcon size={18} /></div>
          <div><h2 className="settings-card-title">Users & Sign-in Accounts</h2><p className="settings-card-desc">Who can sign in, with which role, on which stations. Owner only.</p></div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({})}><PlusIcon size={14} /><span>Add user</span></button>
      </div>
      <div className="settings-card-body" style={{ padding: 0 }}>
        {error && <div style={{ padding: 16 }}><FormError message={error} /></div>}
        <div className="table-responsive">
          <table className="clean-table">
            <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Stations</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users === null ? <EmptyRow colSpan={6}>Loading…</EmptyRow> : users.length === 0 ? <EmptyRow colSpan={6}>No users.</EmptyRow> : users.map((u) => (
                <tr key={u.userId} style={u.isActive ? undefined : { opacity: 0.55 }}>
                  <td><strong>{u.username}</strong>{u.userId === currentUser?.id && <span className="ui-tag" style={{ marginLeft: 6 }}>you</span>}</td>
                  <td>{u.fullName}<div className="text-muted text-xs">{u.phone}</div></td>
                  <td><span className={`badge ${u.role === 'owner' ? 'badge-gold' : u.role === 'manager' ? 'badge-success' : 'badge-neutral'}`} style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                  <td>{u.sites.map(code).join(', ')}</td>
                  <td>{!u.isActive ? <span className="badge badge-danger">Disabled</span> : <span className="badge badge-success">Active</span>}</td>
                  <td><RowActions>
                    <IconButton label="Edit / reset password" onClick={() => setForm({ user: u })}><EditIcon size={14} /></IconButton>
                    {u.userId !== currentUser?.id && <IconButton label="Delete user" tone="danger" onClick={() => void remove(u)}><TrashIcon size={14} /></IconButton>}
                  </RowActions></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {form && <UserModal user={form.user} onClose={() => setForm(null)} onSaved={() => void load()} />}
    </section>
  )
}

// ===========================================================================
// Audit trail
// ===========================================================================
const AuditPanel: React.FC = () => {
  const { loadAudit } = useApp()
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    const r = await loadAudit(150)
    setBusy(false)
    if (r.ok) { setRows(r.value); setError(null) } else setError(r.error)
  }

  return (
    <section className="settings-surface-card">
      <div className="settings-card-header">
        <div className="settings-card-header-left">
          <div className="settings-card-icon-bubble"><ShieldIcon size={18} /></div>
          <div><h2 className="settings-card-title">Audit Trail</h2><p className="settings-card-desc">Who edited or deleted what — customers, slips, receipts, vouchers, tariffs, backups.</p></div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()} disabled={busy}><RefreshIcon size={14} /><span>{rows ? 'Refresh' : 'Show latest 150'}</span></button>
      </div>
      {(rows || error) && (
        <div className="settings-card-body" style={{ padding: 0 }}>
          {error && <div style={{ padding: 16 }}><FormError message={error} /></div>}
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What happened</th></tr></thead>
              <tbody>
                {rows && rows.length === 0 ? <EmptyRow colSpan={4}>Nothing recorded yet.</EmptyRow> : rows?.map((a) => (
                  <tr key={a.id}>
                    <td className="ui-nowrap">{formatDate(a.at.slice(0, 10))} <span className="text-muted text-xs">{new Date(a.at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td>{a.actor}</td><td><span className="ui-tag">{a.action}</span></td><td>{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ===========================================================================
// Page
// ===========================================================================
export const SettingsView: React.FC = () => {
  const { activeSiteData, act, currentUser, realtime, online, backendKind, exportBackup, checkBackupFile, updateStationProfile } = useApp()
  const { settings, tanks, nozzles, siteInfo, tariffHistory } = activeSiteData
  const toast = useToast()
  const confirm = useConfirm()
  const isOwner = currentUser?.role === 'owner'
  const fileRef = useRef<HTMLInputElement>(null)

  const [rates, setRates] = useState<Record<FuelType, string>>({ 'PMG Super': String(settings.rates['PMG Super']), 'HSD Diesel': String(settings.rates['HSD Diesel']), 'Hi-Octane': String(settings.rates['Hi-Octane']) })
  const [margins, setMargins] = useState<Record<FuelType, string>>({ 'PMG Super': String(settings.margins['PMG Super']), 'HSD Diesel': String(settings.margins['HSD Diesel']), 'Hi-Octane': String(settings.margins['Hi-Octane']) })
  const [phone, setPhone] = useState(settings.stationPhone)
  const [manager, setManager] = useState(settings.managerContact)
  const [header, setHeader] = useState(settings.receiptHeader)
  const [footer, setFooter] = useState(settings.receiptFooter)
  const [lowPct, setLowPct] = useState(String(settings.lowStockAlertPct))
  const [cashLimit, setCashLimit] = useState(String(settings.cashDifferenceAlertLimit))
  const [ogra, setOgra] = useState(false)
  // the settings' version as this page last loaded / saved them; a save is refused if someone else saved since
  const [version, setVersion] = useState(settings.updatedAt)
  const [resync, setResync] = useState(false)
  useEffect(() => {
    if (resync) { setVersion(settings.updatedAt); setResync(false) }
  }, [resync, settings.updatedAt])
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [pending, setPending] = useState<BackupCheck | null>(null)
  const { busy, error, run } = useSubmit()
  const [profileName, setProfileName] = useState(siteInfo.name)
  const [profileLocation, setProfileLocation] = useState(siteInfo.location)
  const [profileManager, setProfileManager] = useState(siteInfo.managerName)
  const [profileNtn, setProfileNtn] = useState(siteInfo.ntn)
  const profile = useSubmit()

  // pick up changes made from another device / the OGRA wizard
  useEffect(() => {
    setRates({ 'PMG Super': String(settings.rates['PMG Super']), 'HSD Diesel': String(settings.rates['HSD Diesel']), 'Hi-Octane': String(settings.rates['Hi-Octane']) })
  }, [settings.rates])

  const sampleAmount = (20 * (Number(rates['PMG Super']) || 0)).toFixed(2)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => act.saveSettings({
        rates: Object.fromEntries(FUEL_TYPES.map((f) => [f, Number(rates[f])])) as FuelRates,
        margins: Object.fromEntries(FUEL_TYPES.map((f) => [f, Number(margins[f])])) as FuelRates,
        stationPhone: phone, managerContact: manager, receiptHeader: header, receiptFooter: footer,
        lowStockAlertPct: Number(lowPct), cashDifferenceAlertLimit: Number(cashLimit),
      }, version),
      () => { setResync(true); toast.success(`Configuration saved — new prices are active on all ${nozzles.length} nozzles.`) },
    )
  }

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    void profile.run(
      () => updateStationProfile({ name: profileName.trim(), location: profileLocation.trim(), managerName: profileManager.trim(), ntn: profileNtn.trim() }),
      () => toast.success('Station profile saved.'),
    )
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const check = checkBackupFile(String(reader.result ?? ''))
      if (!check.valid) toast.error(check.error ?? 'Invalid backup file.')
      else setPending(check)
    }
    reader.readAsText(file)
  }

  const restore = async () => {
    if (!pending?.raw) return
    const raw = pending.raw
    const yes = await confirm({
      title: 'Replace ALL station data?',
      message: <>This deletes every record of <strong>{siteInfo.name}</strong> and replaces it with the {pending.counts?.records.toLocaleString()} records in the backup file. This cannot be undone — take a fresh backup first if you are unsure.</>,
      confirmLabel: 'Yes, replace everything',
      tone: 'danger',
    })
    if (!yes) return
    const r = await act.restoreBackup(raw)
    if (r.ok) { toast.success('Backup restored.'); setPending(null) } else toast.error(r.error)
  }

  const sync = !online ? { c: '#dc2626', t: 'Offline' } : backendKind === 'memory' ? { c: '#2563eb', t: 'Preview (sample data)' } : realtime === 'live' ? { c: '#16a34a', t: 'Connected — live sync active' } : { c: '#f59e0b', t: 'Connected — live updates reconnecting' }

  return (
    <div className="settings-view-root">
      <div className="settings-header-banner">
        <div>
          <span className="settings-eyebrow"><SettingsIcon size={14} />CONFIGURATION & OGRA TARIFF</span>
          <h1 className="settings-title">Station Settings & Tariff Setup</h1>
          <p className="settings-subtitle">Official petroleum prices, dealer margins, station identity, receipt layout, alert thresholds, users and backups.</p>
        </div>
        <div className="settings-site-badge-box">
          <span className="settings-site-pill">{siteInfo.code}</span>
          <div><strong style={{ display: 'block', fontSize: 13, color: '#1a1814' }}>{siteInfo.name}</strong><span style={{ fontSize: 11, color: '#736b5e' }}>{siteInfo.brand}</span></div>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble"><GasPumpIcon size={18} /></div>
              <div><h2 className="settings-card-title">Current Fuel Selling Prices (PKR / Liter)</h2><p className="settings-card-desc">Changes apply immediately to every nozzle, sale calculation and slip.</p></div>
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOgra(true)}><TrendingUpIcon size={14} /><span>OGRA Fortnightly Revision Wizard</span></button>
          </div>
          <div className="settings-card-body">
            <div className="settings-rates-grid">
              {FUEL_TYPES.map((f) => (
                <div key={f} className="fuel-rate-panel">
                  <div className="fuel-rate-badge-row">
                    <span className={`fuel-name-badge ${FUEL_BADGE[f].cls}`}><DropletIcon size={12} color={FUEL_BADGE[f].color} />{FUEL_LABEL[f]}</span>
                    <span className="fuel-rate-category">OGRA regulated</span>
                  </div>
                  <div className="fuel-rate-input-container">
                    <span className="fuel-rate-currency-tag">Rs</span>
                    <input type="number" min={0} step="0.01" className="fuel-rate-number-field" value={rates[f]} onChange={(e) => setRates({ ...rates, [f]: e.target.value })} required />
                    <span className="fuel-rate-unit-tag">/ Litre</span>
                  </div>
                  <div className="fuel-rate-panel-footer"><span>{FUEL_SUB[f][0]}</span><strong>{FUEL_SUB[f][1]}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble"><TrendingUpIcon size={18} /></div>
              <div><h2 className="settings-card-title">Dealer Margin per Liter (for profit estimates)</h2><p className="settings-card-desc">Used by the Reports and Owner screens to estimate profit. Set the margin your oil company actually pays you for each fuel.</p></div>
            </div>
          </div>
          <div className="settings-card-body">
            <Grid3>
              {FUEL_TYPES.map((f) => (
                <Field key={f} label={`${FUEL_LABEL[f]} — Rs per liter`}>
                  <input type="number" min={0} step="0.01" className="form-input" value={margins[f]} onChange={(e) => setMargins({ ...margins, [f]: e.target.value })} required />
                </Field>
              ))}
            </Grid3>
          </div>
        </section>

        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble"><ReceiptIcon size={18} /></div>
              <div><h2 className="settings-card-title">Thermal Slip Branding</h2><p className="settings-card-desc">Contact numbers, header and footer for slips, with a live preview.</p></div>
            </div>
            <span style={{ fontSize: 11.5, color: '#8c8270' }}>80mm standard POS format</span>
          </div>
          <div className="settings-card-body">
            <div className="branding-split-layout">
              <div className="branding-inputs-col">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="form-field-group"><label className="form-field-label">Station landline<span className="label-hint">Official contact</span></label><input className="form-field-input" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
                  <div className="form-field-group"><label className="form-field-label">Manager direct mobile<span className="label-hint">Emergency contact</span></label><input className="form-field-input" value={manager} onChange={(e) => setManager(e.target.value)} required /></div>
                </div>
                <div className="form-field-group"><label className="form-field-label">Slip header<span className="label-hint">Top of every receipt</span></label><textarea className="form-field-textarea" rows={3} value={header} onChange={(e) => setHeader(e.target.value)} required /></div>
                <div className="form-field-group"><label className="form-field-label">Slip footer<span className="label-hint">Closing greeting and terms</span></label><textarea className="form-field-textarea" rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} required /></div>
              </div>
              <div className="receipt-preview-wrap">
                <div className="receipt-preview-banner"><span>LIVE THERMAL SLIP PREVIEW</span><span>ESC/POS</span></div>
                <div className="thermal-paper-card">
                  <div className="thermal-header-center ui-pre-wrap">{header}</div>
                  <div className="thermal-contact-center">Phone: {phone} | Cell: {manager}</div>
                  <div className="thermal-dashed-sep" />
                  <div className="thermal-flex-row"><span>DATE: {formatDate(todayISO())}</span><span>SHIFT: Morning</span></div>
                  <div className="thermal-flex-row"><span>NOZZLE: D1-N1 (PMG)</span><span>SAMPLE</span></div>
                  <div className="thermal-dashed-sep" />
                  <div className="thermal-flex-row"><span>ITEM: PMG Super 92</span><span>20.00 L</span></div>
                  <div className="thermal-flex-row"><span>RATE: Rs. {(Number(rates['PMG Super']) || 0).toFixed(2)} / L</span><span>Rs. {sampleAmount}</span></div>
                  <div className="thermal-dashed-sep" />
                  <div className="thermal-flex-row bold-row"><span>TOTAL AMOUNT:</span><span>Rs. {sampleAmount}</span></div>
                  <div className="thermal-dashed-sep" />
                  <div className="thermal-footer-center ui-pre-wrap">{footer}</div>
                  <div className="thermal-barcode-sim">||| | ||||| || ||| |||| |</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble"><AlertCircleIcon size={18} /></div>
              <div><h2 className="settings-card-title">Alert Thresholds & Infrastructure</h2><p className="settings-card-desc">When the dashboard and tank pages raise warnings.</p></div>
            </div>
          </div>
          <div className="settings-card-body">
            <div className="safety-thresholds-grid">
              <div className="threshold-control-card">
                <label className="form-field-label">Low stock alert (% of tank capacity)<span className="label-hint">Amber warning below this level</span></label>
                <div className="threshold-slider-group">
                  <input type="range" min="5" max="50" step="1" className="threshold-slider-field" value={lowPct} onChange={(e) => setLowPct(e.target.value)} />
                  <span className="threshold-pct-pill">{lowPct}%</span>
                </div>
                <div className="form-field-group" style={{ marginTop: 12 }}>
                  <label className="form-field-label">Cash-difference alert limit (PKR)<span className="label-hint">A shift cash shortage / excess above this needs an explanation</span></label>
                  <input type="number" min={0} step="1" className="form-field-input" value={cashLimit} onChange={(e) => setCashLimit(e.target.value)} required />
                </div>
              </div>
              <div className="infra-summary-card">
                <span className="infra-header-title">Active calibrated infrastructure</span>
                <div className="infra-badge-item"><span className="infra-item-name">Underground fuel tanks</span><span className="infra-item-val">{tanks.length} tanks</span></div>
                <div className="infra-badge-item"><span className="infra-item-name">Dispenser nozzles</span><span className="infra-item-val">{nozzles.filter((n) => n.isActive).length} active of {nozzles.length}</span></div>
                <div className="infra-badge-item"><span className="infra-item-name">Manage them in</span><span className="infra-item-val">Fuel Sales & Tank Dip</span></div>
              </div>
            </div>
          </div>
        </section>

        <FormError message={error} />
        <div className="settings-bottom-actions">
          <div className="settings-security-assurance"><ShieldIcon size={16} color="#78716c" /><span>Saved in the Supabase cloud database. Nothing is stored in this browser.</span></div>
          <div className="settings-buttons-cluster">
            <button type="submit" className="btn btn-primary btn-large btn-save-settings" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : 'Save Station Configuration'}</span></button>
          </div>
        </div>
      </form>

      <section className="settings-surface-card">
        <div className="settings-card-header">
          <div className="settings-card-header-left">
            <div className="settings-card-icon-bubble"><ShieldIcon size={18} /></div>
            <div><h2 className="settings-card-title">Station Profile</h2><p className="settings-card-desc">Name, address and tax number printed on documents.</p></div>
          </div>
        </div>
        <div className="settings-card-body">
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Grid2>
              <Field label="Station name"><input className="form-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} required /></Field>
              <Field label="Location / address"><input className="form-input" value={profileLocation} onChange={(e) => setProfileLocation(e.target.value)} /></Field>
            </Grid2>
            <Grid2>
              <Field label="Manager name"><input className="form-input" value={profileManager} onChange={(e) => setProfileManager(e.target.value)} /></Field>
              <Field label="NTN"><input className="form-input" value={profileNtn} onChange={(e) => setProfileNtn(e.target.value)} /></Field>
            </Grid2>
            <FormError message={profile.error} />
            <div><button type="submit" className="btn btn-outline" disabled={profile.busy}>{profile.busy ? 'Saving…' : 'Save station profile'}</button></div>
          </form>
        </div>
      </section>

      {isOwner && <UsersPanel />}
      <AuditPanel />

      <section className="settings-surface-card">
        <div className="settings-card-header">
          <div className="settings-card-header-left">
            <div className="settings-card-icon-bubble" style={{ backgroundColor: '#ecfdf5', color: '#15803d' }}><ShieldIcon size={18} /></div>
            <div><h2 className="settings-card-title">My Account, Cloud Database & Backup</h2><p className="settings-card-desc">Signed in as <strong>{currentUser?.name}</strong> ({currentUser?.role}).</p></div>
          </div>
          <span className="badge" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: sync.c }} />{sync.t}</span>
        </div>
        <div className="settings-card-body">
          <Notice tone="info">All business data lives in the Supabase database and is shared live between devices. The only thing kept in this browser is your sign-in token.</Notice>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={() => setPasswordOpen(true)}><KeyIcon size={16} /><span>Change my password</span></button>
            <button type="button" className="btn btn-outline" onClick={() => { exportBackup(); toast.success('Backup file downloaded.') }}><DownloadIcon size={16} /><span>Download station backup</span></button>
            {isOwner && (
              <>
                <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
                <button type="button" className="btn btn-outline" style={{ borderColor: '#475569', color: '#475569' }} onClick={() => fileRef.current?.click()}><FileTextIcon size={16} /><span>Restore from backup (.json)</span></button>
              </>
            )}
          </div>
        </div>
      </section>

      {tariffHistory.length > 0 && (
        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble"><TrendingUpIcon size={18} /></div>
              <div><h2 className="settings-card-title">OGRA Price Revision History & Stock Gain/Loss Log</h2><p className="settings-card-desc">Audit trail of fortnightly price revisions and tank stock revaluations.</p></div>
            </div>
            <span className="badge badge-neutral">{tariffHistory.length} revisions</span>
          </div>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Effective</th><th>Notification</th>{FUEL_TYPES.map((f) => <th key={f}>{f}</th>)}<th>Inventory gain / loss</th><th>By</th></tr></thead>
              <tbody>
                {tariffHistory.map((rev) => (
                  <tr key={rev.id}>
                    <td><strong>{rev.effectiveDate}</strong><div className="text-muted text-xs">{formatDate(rev.date)}</div></td>
                    <td><span className="badge badge-neutral" style={{ fontSize: 11 }}>{rev.notificationNo}</span></td>
                    {FUEL_TYPES.map((f) => <td key={f}>Rs. {rev.newRates[f].toFixed(2)}<span style={{ fontSize: 11, color: '#736b5e', display: 'block' }}>was Rs. {rev.oldRates[f].toFixed(2)}</span></td>)}
                    <td><strong className={rev.netInventoryGainLoss >= 0 ? 'text-green' : 'text-red'}>{rev.netInventoryGainLoss >= 0 ? '+' : ''}{rs(rev.netInventoryGainLoss)}</strong></td>
                    <td>{rev.revisedBy}<div className="text-muted text-xs">{rev.notes}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ogra && <OgraModal onClose={() => setOgra(false)} onApplied={() => setResync(true)} />}
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
      {pending && (
        <Modal title="Restore Station Database" subtitle="Check the backup before it replaces the live data" onClose={() => setPending(null)} width={560}>
          <div className="modal-form-compact">
            <Notice tone="warning"><div><strong>This replaces every record of this station.</strong> It cannot be undone.</div></Notice>
            <CalcStrip items={[
              { label: 'Backup of', value: pending.siteName ?? '—' },
              { label: 'Made on', value: pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : 'unknown' },
              { label: 'Format', value: pending.kind === 'legacy' ? 'Previous software' : 'Current' },
              { label: 'Records', value: (pending.counts?.records ?? 0).toLocaleString() },
              { label: 'Tanks / nozzles / customers', value: `${pending.counts?.tanks} / ${pending.counts?.nozzles} / ${pending.counts?.customers}` },
            ]} />
            <div className="modal-actions-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => void restore()}>Replace all data with this backup</button>
            </div>
          </div>
        </Modal>
      )}

      <ModuleGuide
        title="OGRA Tariffs & Station Configuration SOP"
        urduTitle="اوگرا فیول ریٹس اور اسٹیشن ترتیبات"
        role="owner"
        roleLabel="Owner / Manager"
        purpose="Set fuel prices and dealer margins, apply the fortnightly OGRA revision, keep station identity and slips correct, manage users, and take backups."
        steps={[
          { step: 1, title: 'Fortnightly OGRA notification (اوگرا نوٹیفکیشن)', detail: 'Use the OGRA wizard on the 1st and 16th at midnight. Every nozzle takes the new rate.', urdu: 'ہر ماہ کی پہلی اور سولہویں تاریخ کو اوگرا کا نیا نوٹیفکیشن لاگو کریں۔' },
          { step: 2, title: 'Stock revaluation (اسٹاک نفع و نقصان)', detail: 'The wizard calculates the gain or loss on the fuel currently in each tank.', urdu: 'ٹینکوں میں موجود تیل پر نفع یا نقصان کا خودکار حساب۔' },
          { step: 3, title: 'Users (صارفین)', detail: 'The owner creates sign-ins and chooses each person\'s role and stations.', urdu: 'مالک صارفین بناتا اور ان کا کردار اور اسٹیشن منتخب کرتا ہے۔' },
          { step: 4, title: 'Backup (بیک اپ)', detail: 'Download a station backup regularly. The live data is already safe in the cloud database.', urdu: 'وقتاً فوقتاً بیک اپ ڈاؤن لوڈ کریں۔' },
        ]}
        criticalChecks={[
          'Cashiers cannot see this page — only managers and the owner change prices.',
          'Verify the OGRA notification number before applying a revision.',
          'Restoring a backup replaces ALL data of the station and is owner-only.',
        ]}
      />

      <p className="ui-muted" style={{ textAlign: 'center', margin: '0' }}>Mashaal Petroleum software — version {__APP_VERSION__} (built {__BUILD_DATE__})</p>
    </div>
  )
}
