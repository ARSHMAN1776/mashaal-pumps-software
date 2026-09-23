import React, { useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import {
  CheckCircleIcon,
  ShieldIcon,
  FileTextIcon,
  GasPumpIcon,
  DropletIcon,
  ReceiptIcon,
  AlertCircleIcon,
  SettingsIcon,
  TrendingUpIcon,
  XIcon,
} from '../common/Icons'
import { validateStationBackup, type BackupValidationResult } from '../../services/storage'
import { SUPABASE_SETUP_SQL } from '../../services/supabase'
import { ModuleGuide } from '../common/ModuleGuide'

export const SettingsView: React.FC = () => {
  const {
    activeSiteData,
    updateSettings,
    exportBackup,
    importBackup,
    applyOgraPriceChange,
    currentUser,
    cloudStatus,
    refreshCloudSync,
  } = useApp()
  const { settings, tanks, nozzles, siteInfo, tariffHistory } = activeSiteData
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSqlBox, setShowSqlBox] = useState(false)

  const [superRate, setSuperRate] = useState<number>(settings.rates['PMG Super'] || 268.36)
  const [dieselRate, setDieselRate] = useState<number>(settings.rates['HSD Diesel'] || 276.45)
  const [octaneRate, setOctaneRate] = useState<number>(settings.rates['Hi-Octane'] || 295.50)

  const [stationPhone, setStationPhone] = useState(settings.stationPhone || '068-5874211')
  const [managerContact, setManagerContact] = useState(settings.managerContact || '0300-6729104')
  const [receiptHeader, setReceiptHeader] = useState(settings.receiptHeader || `${siteInfo.name}\n${siteInfo.location}`)
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter || 'Thank you for fueling with Mashaal!\nComputerized Tax Invoice')
  const [lowStockAlertPct, setLowStockAlertPct] = useState<number>(settings.lowStockAlertPct || 20)

  const [saveSuccess, setSaveSuccess] = useState(false)
  const [backupSuccess, setBackupSuccess] = useState(false)

  // ── OGRA Revision Wizard State ───────────────────────────────────────────
  const [isOgraModalOpen, setIsOgraModalOpen] = useState(false)
  const [newSuperRate, setNewSuperRate] = useState<number>(settings.rates['PMG Super'] || 268.36)
  const [newDieselRate, setNewDieselRate] = useState<number>(settings.rates['HSD Diesel'] || 276.45)
  const [newOctaneRate, setNewOctaneRate] = useState<number>(settings.rates['Hi-Octane'] || 295.50)
  const [effectiveDate, setEffectiveDate] = useState<string>(
    `${new Date().toISOString().split('T')[0]} 00:00`
  )
  const [notifNo, setNotifNo] = useState<string>(
    `OGRA/PL/${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-A`
  )
  const [revisionNotes, setRevisionNotes] = useState<string>('Fortnightly OGRA official price determination')
  const [ograSuccessMsg, setOgraSuccessMsg] = useState<string | null>(null)

  // ── Restore Backup State ──────────────────────────────────────────────────
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<{ result: BackupValidationResult; rawText: string } | null>(null)
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const isCashier = currentUser?.role === 'cashier'

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCashier) return

    updateSettings({
      rates: {
        'PMG Super': Number(superRate),
        'HSD Diesel': Number(dieselRate),
        'Hi-Octane': Number(octaneRate),
      },
      stationPhone,
      managerContact,
      receiptHeader,
      receiptFooter,
      lowStockAlertPct: Number(lowStockAlertPct),
      cashDifferenceAlertLimit: 500,
    })

    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3500)
  }

  const handleBackup = () => {
    exportBackup()
    setBackupSuccess(true)
    setTimeout(() => setBackupSuccess(false), 3500)
  }

  // ── Handle Backup File Selection ─────────────────────────────────────────
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const rawText = event.target?.result as string
      const validation = validateStationBackup(rawText)
      if (!validation.valid) {
        setRestoreError(validation.error || 'Invalid backup file.')
        setTimeout(() => setRestoreError(null), 5000)
      } else {
        setPendingBackup({ result: validation, rawText })
        setIsRestoreModalOpen(true)
      }
    }
    reader.readAsText(file)
    // Reset file input so user can choose same file again if needed
    e.target.value = ''
  }

  const handleConfirmRestore = () => {
    if (!pendingBackup) return
    const res = importBackup(pendingBackup.rawText)
    setIsRestoreModalOpen(false)
    setPendingBackup(null)

    if (res.success) {
      setRestoreSuccess(res.message)
      setTimeout(() => setRestoreSuccess(null), 6000)
    } else {
      setRestoreError(res.message)
      setTimeout(() => setRestoreError(null), 6000)
    }
  }

  // ── Handle OGRA Revision Wizard Application ──────────────────────────────
  const handleOpenOgraWizard = () => {
    setNewSuperRate(superRate)
    setNewDieselRate(dieselRate)
    setNewOctaneRate(octaneRate)
    setIsOgraModalOpen(true)
  }

  // Compute live preview of inventory gain / loss across all tanks
  const liveStockGainLoss = tanks.map((tank) => {
    const oldR = settings.rates[tank.fuelType] || 0
    const newR =
      tank.fuelType === 'PMG Super'
        ? Number(newSuperRate)
        : tank.fuelType === 'HSD Diesel'
        ? Number(newDieselRate)
        : Number(newOctaneRate)
    const diff = Number((newR - oldR).toFixed(2))
    const gainLoss = Math.round(tank.currentLiters * diff)
    return {
      tank,
      oldR,
      newR,
      diff,
      gainLoss,
    }
  })

  const netGainLossTotal = liveStockGainLoss.reduce((sum, item) => sum + item.gainLoss, 0)

  const handleApplyOgraWizard = (e: React.FormEvent) => {
    e.preventDefault()
    const log = applyOgraPriceChange({
      newRates: {
        'PMG Super': Number(newSuperRate),
        'HSD Diesel': Number(newDieselRate),
        'Hi-Octane': Number(newOctaneRate),
      },
      effectiveDate,
      notificationNo: notifNo,
      notes: revisionNotes,
    })

    if (log) {
      setSuperRate(Number(newSuperRate))
      setDieselRate(Number(newDieselRate))
      setOctaneRate(Number(newOctaneRate))
      setIsOgraModalOpen(false)
      const sign = log.netInventoryGainLoss >= 0 ? '+' : ''
      setOgraSuccessMsg(
        `OGRA revision active! All ${nozzles.length} nozzles updated. Total Inventory Impact: ${sign}Rs. ${log.netInventoryGainLoss.toLocaleString()}`
      )
      setTimeout(() => setOgraSuccessMsg(null), 7000)
    }
  }

  const sampleQuantity = 20
  const sampleAmount = (sampleQuantity * superRate).toFixed(2)

  return (
    <div className="settings-view-root">
      {/* 1. Page Header with Station Identity */}
      <div className="settings-header-banner">
        <div>
          <span className="settings-eyebrow">
            <SettingsIcon size={14} />
            CONFIGURATION & OGRA TARIFF
          </span>
          <h1 className="settings-title">Station Settings & Tariff Setup</h1>
          <p className="settings-subtitle">
            Update official petroleum prices, station contact identity, POS thermal slip formatting, and tank safety thresholds.
          </p>
        </div>

        <div className="settings-site-badge-box">
          <span className="settings-site-pill">{siteInfo.code}</span>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#1a1814' }}>{siteInfo.name}</strong>
            <span style={{ fontSize: '11px', color: '#736b5e' }}>{siteInfo.brand} System Sync</span>
          </div>
        </div>
      </div>

      <ModuleGuide
        title="OGRA Tariffs & Station Configuration SOP"
        urduTitle="اوگرا فیول ریٹس اور اسٹیشن ترتیبات"
        role="owner"
        roleLabel="Owner / Manager Exclusive"
        purpose="Set official OGRA retail fuel rates, configure receipt header/footer details, define tank threshold alerts, and manage encrypted database backups."
        steps={[
          {
            step: 1,
            title: 'Fortnightly OGRA Notification (اوگرا نوٹیفکیشن)',
            detail: 'Use the official OGRA price determination wizard on the 1st and 16th midnight.',
            urdu: 'ہر ماہ کی پہلی اور سولہویں تاریخ کی آدھی رات کو اوگرا کا نیا نوٹیفکیشن لاگو کریں۔',
          },
          {
            step: 2,
            title: 'Live Stock Revaluation (اسٹاک نفع و نقصان)',
            detail: 'System automatically calculates inventory gain/loss across all underground tanks at midnight.',
            urdu: 'سسٹم تمام زیر زمین ٹینکوں کے موجودہ پیٹرول اور ڈیزل پر نفع یا نقصان کا خودکار حساب لگائے گا۔',
          },
          {
            step: 3,
            title: 'Backup & Database Health (بیک اپ اور محفوظ ڈیٹا)',
            detail: 'Generate regular station snapshots and sync with cloud database.',
            urdu: 'اسٹیشن کا محفوظ بیک اپ حاصل کریں تاکہ ریکارڈ ہمیشہ محفوظ رہے۔',
          },
        ]}
        criticalChecks={[
          'Cashier role is strictly locked out of tariff modifications to prevent rate tampering.',
          'Always verify notification reference number before publishing rate changes across dispensers.',
        ]}
      />

      {/* Dynamic Success & Alert Notifications */}
      {isCashier && (
        <div className="alert-ribbon-warning" style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircleIcon size={18} color="#b45309" />
          <span>
            <strong>View Only Mode:</strong> Cashier role cannot modify fuel tariffs, OGRA pricing, or thermal receipt layout. Log in as Station Manager or Owner to apply changes.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="alert-ribbon-success">
          <CheckCircleIcon size={18} color="#27ae60" />
          <span>Configuration saved successfully! New fuel tariffs are now active across all {nozzles.length} nozzles.</span>
        </div>
      )}

      {backupSuccess && (
        <div className="alert-ribbon-success">
          <ShieldIcon size={18} color="#27ae60" />
          <span>Encrypted offline system snapshot generated successfully ({siteInfo.code} Database Archive).</span>
        </div>
      )}

      {restoreSuccess && (
        <div className="alert-ribbon-success">
          <CheckCircleIcon size={18} color="#27ae60" />
          <span>{restoreSuccess}</span>
        </div>
      )}

      {restoreError && (
        <div className="alert-ribbon-warning" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircleIcon size={18} color="#b91c1c" />
          <span>{restoreError}</span>
        </div>
      )}

      {ograSuccessMsg && (
        <div className="alert-ribbon-success">
          <TrendingUpIcon size={18} color="#27ae60" />
          <span>{ograSuccessMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* =========================================================================
            SECTION 1: OGRA Petroleum Selling Prices
            ========================================================================= */}
        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble">
                <GasPumpIcon size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">Current Fuel Selling Prices (PKR / Liter)</h2>
                <p className="settings-card-desc">Changes reflect immediately across all nozzle dispensers, sales calculations, and slip generation.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {!isCashier && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleOpenOgraWizard}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                >
                  <TrendingUpIcon size={14} />
                  <span>OGRA Fortnightly Revision Wizard</span>
                </button>
              )}
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: '999px' }}>
                ● Live Pricing Active
              </span>
            </div>
          </div>

          <div className="settings-card-body">
            <div className="settings-rates-grid">
              {/* PMG Super 92 Card */}
              <div className="fuel-rate-panel">
                <div className="fuel-rate-badge-row">
                  <span className="fuel-name-badge super">
                    <DropletIcon size={12} color="#c2410c" />
                    PMG Super 92
                  </span>
                  <span className="fuel-rate-category">OGRA Regulated</span>
                </div>

                <div className="fuel-rate-input-container">
                  <span className="fuel-rate-currency-tag">Rs</span>
                  <input
                    type="number"
                    step="0.01"
                    className="fuel-rate-number-field"
                    value={superRate}
                    onChange={(e) => setSuperRate(parseFloat(e.target.value) || 0)}
                    required
                  />
                  <span className="fuel-rate-unit-tag">/ Litre</span>
                </div>

                <div className="fuel-rate-panel-footer">
                  <span>Standard Consumer Petrol</span>
                  <strong>Motor Gasoline</strong>
                </div>
              </div>

              {/* HSD Diesel Card */}
              <div className="fuel-rate-panel">
                <div className="fuel-rate-badge-row">
                  <span className="fuel-name-badge diesel">
                    <DropletIcon size={12} color="#15803d" />
                    HSD Diesel
                  </span>
                  <span className="fuel-rate-category">Transport Rate</span>
                </div>

                <div className="fuel-rate-input-container">
                  <span className="fuel-rate-currency-tag">Rs</span>
                  <input
                    type="number"
                    step="0.01"
                    className="fuel-rate-number-field"
                    value={dieselRate}
                    onChange={(e) => setDieselRate(parseFloat(e.target.value) || 0)}
                    required
                  />
                  <span className="fuel-rate-unit-tag">/ Litre</span>
                </div>

                <div className="fuel-rate-panel-footer">
                  <span>Heavy Transport & Fleet</span>
                  <strong>High Speed Diesel</strong>
                </div>
              </div>

              {/* Hi-Octane 97 Card */}
              <div className="fuel-rate-panel">
                <div className="fuel-rate-badge-row">
                  <span className="fuel-name-badge octane">
                    <DropletIcon size={12} color="#b91c1c" />
                    Altron / Hi-Octane
                  </span>
                  <span className="fuel-rate-category">Premium 97 RON</span>
                </div>

                <div className="fuel-rate-input-container">
                  <span className="fuel-rate-currency-tag">Rs</span>
                  <input
                    type="number"
                    step="0.01"
                    className="fuel-rate-number-field"
                    value={octaneRate}
                    onChange={(e) => setOctaneRate(parseFloat(e.target.value) || 0)}
                    required
                  />
                  <span className="fuel-rate-unit-tag">/ Litre</span>
                </div>

                <div className="fuel-rate-panel-footer">
                  <span>Luxury & Performance</span>
                  <strong>Hi-Octane 97</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 2: Station Profile & POS Thermal Slip Branding
            ========================================================================= */}
        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble">
                <ReceiptIcon size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">Station Profile & Thermal Slip Branding</h2>
                <p className="settings-card-desc">Official contact numbers, tax receipt headers, and thermal paper layout with live preview.</p>
              </div>
            </div>
            <span style={{ fontSize: '11.5px', color: '#8c8270' }}>80mm Standard POS Format</span>
          </div>

          <div className="settings-card-body">
            <div className="branding-split-layout">
              {/* Left Column: Form Fields */}
              <div className="branding-inputs-col">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-field-group">
                    <label className="form-field-label">
                      Station Landline Phone
                      <span className="label-hint">Official contact</span>
                    </label>
                    <input
                      type="text"
                      className="form-field-input"
                      value={stationPhone}
                      onChange={(e) => setStationPhone(e.target.value)}
                      placeholder="e.g. 068-5874211"
                      required
                    />
                  </div>

                  <div className="form-field-group">
                    <label className="form-field-label">
                      Manager Direct Mobile
                      <span className="label-hint">Emergency contact</span>
                    </label>
                    <input
                      type="text"
                      className="form-field-input"
                      value={managerContact}
                      onChange={(e) => setManagerContact(e.target.value)}
                      placeholder="e.g. 0300-6729104"
                      required
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">
                    Thermal Slip Header Text
                    <span className="label-hint">Printed on top of every receipt</span>
                  </label>
                  <textarea
                    className="form-field-textarea"
                    rows={3}
                    value={receiptHeader}
                    onChange={(e) => setReceiptHeader(e.target.value)}
                    placeholder="Enter station brand, branch name, and complete road address..."
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">
                    Thermal Slip Footer Note
                    <span className="label-hint">Closing greeting and terms</span>
                  </label>
                  <textarea
                    className="form-field-textarea"
                    rows={3}
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    placeholder="Enter customer greeting, software signature, or STRN details..."
                    required
                  />
                </div>
              </div>

              {/* Right Column: Live Thermal Receipt Preview */}
              <div className="receipt-preview-wrap">
                <div className="receipt-preview-banner">
                  <span>LIVE THERMAL SLIP PREVIEW</span>
                  <span>ESC/POS</span>
                </div>

                <div className="thermal-paper-card">
                  <div className="thermal-header-center">{receiptHeader}</div>
                  <div className="thermal-contact-center">
                    Phone: {stationPhone} | Cell: {managerContact}
                  </div>

                  <div className="thermal-dashed-sep" />

                  <div className="thermal-flex-row">
                    <span>DATE: 17-Sep-2026</span>
                    <span>TIME: 03:15 PM</span>
                  </div>
                  <div className="thermal-flex-row">
                    <span>INVOICE: #INV-2026-9041</span>
                    <span>SHIFT: Evening</span>
                  </div>
                  <div className="thermal-flex-row">
                    <span>NOZZLE: #02 (PMG)</span>
                    <span>PUMP ATTENDANT: Asif</span>
                  </div>

                  <div className="thermal-dashed-sep" />

                  <div className="thermal-flex-row">
                    <span>ITEM: PMG Super 92</span>
                    <span>{sampleQuantity.toFixed(2)} L</span>
                  </div>
                  <div className="thermal-flex-row">
                    <span>RATE: Rs. {superRate.toFixed(2)} / L</span>
                    <span>Rs. {sampleAmount}</span>
                  </div>

                  <div className="thermal-dashed-sep" />

                  <div className="thermal-flex-row bold-row">
                    <span>TOTAL AMOUNT:</span>
                    <span>Rs. {sampleAmount}</span>
                  </div>
                  <div className="thermal-flex-row">
                    <span>PAYMENT METHOD:</span>
                    <span>CASH</span>
                  </div>

                  <div className="thermal-dashed-sep" />

                  <div className="thermal-footer-center">{receiptFooter}</div>
                  <div className="thermal-barcode-sim">||| | ||||| || ||| |||| |</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 3: Inventory Safety & Alert Thresholds
            ========================================================================= */}
        <section className="settings-surface-card">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble">
                <AlertCircleIcon size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">Inventory Safety & Alert Thresholds</h2>
                <p className="settings-card-desc">Configured underground tank capacities, dip warning triggers, and dispensing nozzle telemetry.</p>
              </div>
            </div>
            <span style={{ fontSize: '11.5px', color: '#8c8270' }}>Real-Time Calibration Monitor</span>
          </div>

          <div className="settings-card-body">
            <div className="safety-thresholds-grid">
              {/* Left: Threshold Slider */}
              <div className="threshold-control-card">
                <label className="form-field-label">
                  Low Stock Alert Trigger (%)
                  <span className="label-hint">Adjust safety margin</span>
                </label>

                <div className="threshold-slider-group">
                  <input
                    type="range"
                    min="10"
                    max="45"
                    step="1"
                    className="threshold-slider-field"
                    value={lowStockAlertPct}
                    onChange={(e) => setLowStockAlertPct(Number(e.target.value))}
                  />
                  <span className="threshold-pct-pill">{lowStockAlertPct}%</span>
                </div>

                <div className="threshold-hint-box">
                  <strong>Automatic Safety Trigger:</strong> When physical dip levels fall below{' '}
                  <strong>{lowStockAlertPct}%</strong> of tank capacity, the dashboard and nozzle registers will automatically highlight amber warning badges to prevent line starvation.
                </div>
              </div>

              {/* Right: Active Infrastructure Summary */}
              <div className="infra-summary-card">
                <span className="infra-header-title">Active Calibrated Infrastructure</span>

                <div className="infra-badge-item">
                  <span className="infra-item-name">Underground Fuel Tanks</span>
                  <span className="infra-item-val">{tanks.length} Calibrated Tanks</span>
                </div>

                <div className="infra-badge-item">
                  <span className="infra-item-name">Electronic Dispenser Nozzles</span>
                  <span className="infra-item-val">{nozzles.length} Active Nozzles</span>
                </div>

                <div className="infra-badge-item">
                  <span className="infra-item-name">OMC Weights & Measures</span>
                  <span className="infra-item-val" style={{ color: '#15803d' }}>● Digitally Sealed & Certified</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 4: Supabase Cloud Database & Remote Live Sync
            ========================================================================= */}
        <section className="settings-surface-card" style={{ marginTop: '20px' }}>
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble" style={{ backgroundColor: '#ecfdf5', color: '#15803d' }}>
                <ShieldIcon size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">Supabase Cloud Database &amp; Remote Live Sync</h2>
                <p className="settings-card-desc">
                  Serverless PostgreSQL cloud database connected to your Supabase project (Project ID: <code>fjrvayncixrkbeepedre</code>).
                </p>
              </div>
            </div>
            <span
              className={`badge ${cloudStatus.connected && cloudStatus.tableExists ? 'badge-success' : cloudStatus.connected ? 'badge-warning' : 'badge-neutral'}`}
              style={{ fontSize: '12px' }}
            >
              {cloudStatus.connected && cloudStatus.tableExists
                ? '🟢 Cloud Sync Active'
                : cloudStatus.connected
                ? '🟡 Setup SQL Needed'
                : '⚪ Offline / Connecting'}
            </span>
          </div>

          <div className="settings-card-body" style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Cloud Endpoint URL</span>
                <strong style={{ fontSize: '12.5px', color: '#0f172a', wordBreak: 'break-all' }}>https://fjrvayncixrkbeepedre.supabase.co</strong>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Database Engine</span>
                <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>PostgreSQL 15 (Serverless Cloud)</strong>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Multi-Device Real-Time Sync</span>
                <strong style={{ fontSize: '12.5px', color: '#15803d' }}>Enabled (Websocket Push)</strong>
              </div>
            </div>

            {(!cloudStatus.tableExists || showSqlBox) && (
              <div style={{ padding: '14px 16px', borderRadius: '8px', backgroundColor: '#fefce8', border: '1px solid #fef08a', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#854d0e' }}>
                    ⚡ 1-Click Database Setup (Run in Supabase SQL Editor):
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(SUPABASE_SETUP_SQL)
                      alert('SQL copied to clipboard! Paste it into Supabase SQL Editor and click RUN.')
                    }}
                    style={{ borderColor: '#854d0e', color: '#854d0e' }}
                  >
                    📋 Copy Setup SQL
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#713f12', margin: '0 0 8px 0' }}>
                  Open your <strong>Supabase Dashboard ➔ SQL Editor</strong>, paste this code, and press <strong>RUN</strong> to create the stations table:
                </p>
                <pre style={{ margin: 0, padding: '12px', borderRadius: '6px', backgroundColor: '#1e293b', color: '#38bdf8', fontSize: '11px', overflowX: 'auto' }}>
                  {SUPABASE_SETUP_SQL}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await refreshCloudSync()
                  alert('Cloud connection checked!')
                }}
              >
                🔄 Refresh Cloud Status
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSqlBox(!showSqlBox)}
              >
                {showSqlBox ? 'Hide Setup SQL' : 'View / Copy Setup SQL'}
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 5: Action Buttons Footer
            ========================================================================= */}
        <div className="settings-bottom-actions">
          <div className="settings-security-assurance">
            <ShieldIcon size={16} color="#78716c" />
            <span>Encrypted local database state. Changes persist across application sessions.</span>
          </div>

          <div className="settings-buttons-cluster">
            <button type="button" className="btn btn-outline" onClick={handleBackup}>
              <FileTextIcon size={16} />
              <span>Generate Station Backup</span>
            </button>
            {!isCashier && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ borderColor: '#967938', color: '#967938' }}
                >
                  <ShieldIcon size={16} />
                  <span>Restore Database from Backup (.json)</span>
                </button>
              </>
            )}
            {!isCashier && (
              <button type="submit" className="btn btn-primary btn-large btn-save-settings">
                <CheckCircleIcon size={16} />
                <span>Save Station Configuration</span>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* =========================================================================
          AUDIT LOG: Past OGRA Price Revisions & Inventory Revaluations
          ========================================================================= */}
      {tariffHistory && tariffHistory.length > 0 && (
        <section className="settings-surface-card" style={{ marginTop: '20px' }}>
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon-bubble">
                <TrendingUpIcon size={18} />
              </div>
              <div>
                <h2 className="settings-card-title">OGRA Price Revision History &amp; Stock Gain/Loss Log</h2>
                <p className="settings-card-desc">Audit trail of midnight fortnightly price revisions and financial revaluations of tank stocks.</p>
              </div>
            </div>
            <span className="badge badge-neutral">{tariffHistory.length} Revisions Recorded</span>
          </div>

          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Effective Date</th>
                  <th>Notification #</th>
                  <th>PMG Super Rate</th>
                  <th>HSD Diesel Rate</th>
                  <th>Hi-Octane Rate</th>
                  <th>Net Inventory Gain / Loss</th>
                  <th>Authorized By</th>
                </tr>
              </thead>
              <tbody>
                {tariffHistory.map((rev) => {
                  const isGain = rev.netInventoryGainLoss >= 0
                  return (
                    <tr key={rev.id}>
                      <td>
                        <strong>{rev.effectiveDate}</strong>
                        <div className="text-muted text-xs">{rev.date}</div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>{rev.notificationNo}</span>
                      </td>
                      <td>
                        Rs. {rev.newRates['PMG Super'].toFixed(2)}
                        <span style={{ fontSize: '11px', color: '#736b5e', display: 'block' }}>
                          was Rs. {rev.oldRates['PMG Super'].toFixed(2)}
                        </span>
                      </td>
                      <td>
                        Rs. {rev.newRates['HSD Diesel'].toFixed(2)}
                        <span style={{ fontSize: '11px', color: '#736b5e', display: 'block' }}>
                          was Rs. {rev.oldRates['HSD Diesel'].toFixed(2)}
                        </span>
                      </td>
                      <td>
                        Rs. {rev.newRates['Hi-Octane'].toFixed(2)}
                        <span style={{ fontSize: '11px', color: '#736b5e', display: 'block' }}>
                          was Rs. {rev.oldRates['Hi-Octane'].toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <strong className={isGain ? 'text-green' : 'text-red'} style={{ fontSize: '14px' }}>
                          {isGain ? '+' : ''}Rs. {rev.netInventoryGainLoss.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: '10.5px', color: '#736b5e', display: 'block' }}>
                          {isGain ? 'Inventory Gain' : 'Inventory Loss'}
                        </span>
                      </td>
                      <td>
                        <div>{rev.revisedBy}</div>
                        <span className="text-muted text-xs">{rev.notes}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =========================================================================
          MODAL 1: OGRA Fortnightly Revision Wizard
          ========================================================================= */}
      {isOgraModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsOgraModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUpIcon size={20} color="#967938" />
                  OGRA Fortnightly Price Revision Wizard
                </h3>
                <span className="modal-sub">
                  Applies new official tariffs across all nozzles and calculates immediate inventory stock gain/loss.
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setIsOgraModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyOgraWizard} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Effective Date &amp; Time (Midnight)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    placeholder="YYYY-MM-DD 00:00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">OGRA Notification Reference</label>
                  <input
                    type="text"
                    className="form-input"
                    value={notifNo}
                    onChange={(e) => setNotifNo(e.target.value)}
                    placeholder="e.g. OGRA/PL/2026-09-B"
                    required
                  />
                </div>
              </div>

              <div style={{ fontSize: '11px', fontWeight: 700, color: '#8c7333', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 2px' }}>
                Enter New Official Rates (PKR / Liter)
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">PMG Super 92</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={newSuperRate}
                    onChange={(e) => setNewSuperRate(Number(e.target.value))}
                    required
                  />
                  <span style={{ fontSize: '10.5px', color: '#686256', marginTop: '2px', display: 'block' }}>
                    Current: Rs. {superRate.toFixed(2)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">HSD Diesel</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={newDieselRate}
                    onChange={(e) => setNewDieselRate(Number(e.target.value))}
                    required
                  />
                  <span style={{ fontSize: '10.5px', color: '#686256', marginTop: '2px', display: 'block' }}>
                    Current: Rs. {dieselRate.toFixed(2)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Hi-Octane 97</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={newOctaneRate}
                    onChange={(e) => setNewOctaneRate(Number(e.target.value))}
                    required
                  />
                  <span style={{ fontSize: '10.5px', color: '#686256', marginTop: '2px', display: 'block' }}>
                    Current: Rs. {octaneRate.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Real-time Tank Stock Gain / Loss Evaluation Box */}
              <div style={{ background: '#faf6ee', border: '1px solid #ebd9c8', borderRadius: '8px', padding: '10px 12px', marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a1814', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Underground Tank Stock Revaluation (Live Dip)
                  </span>
                  <span className={`badge ${netGainLossTotal >= 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px' }}>
                    {netGainLossTotal >= 0 ? 'Net Inventory Gain' : 'Net Inventory Loss'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {liveStockGainLoss.map(({ tank, oldR, newR, diff, gainLoss }) => {
                    const isPositive = diff >= 0
                    return (
                      <div key={tank.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', padding: '2px 0', borderBottom: '1px dashed #e5dcc7' }}>
                        <div>
                          <strong>Tank #{tank.tankNo}: {tank.fuelType}</strong>
                          <span style={{ color: '#686256', marginLeft: '6px' }}>
                            ({tank.currentLiters.toLocaleString()} L @ Rs. {oldR} → Rs. {newR})
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: isPositive ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                            {isPositive ? '+' : ''}Rs. {diff.toFixed(2)}/L
                          </span>
                          <span style={{ marginLeft: '8px', fontWeight: 700, color: isPositive ? '#15803d' : '#b91c1c' }}>
                            {isPositive ? '+' : ''}Rs. {gainLoss.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )
                  })}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', marginTop: '2px', fontSize: '12.5px' }}>
                    <strong>Total Net Revaluation Impact:</strong>
                    <strong style={{ fontSize: '14.5px', color: netGainLossTotal >= 0 ? '#15803d' : '#b91c1c' }}>
                      {netGainLossTotal >= 0 ? '+' : ''}Rs. {netGainLossTotal.toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="form-label">Audit Remarks</label>
                <input
                  type="text"
                  className="form-input"
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="e.g. Official OGRA fortnightly revision applied"
                />
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsOgraModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Apply OGRA Revision &amp; Update Nozzles</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Database Restore Confirmation
          ========================================================================= */}
      {isRestoreModalOpen && pendingBackup && (
        <div className="modal-backdrop" onClick={() => setIsRestoreModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9a3412' }}>
                  <ShieldIcon size={20} color="#9a3412" />
                  Restore Station Database
                </h3>
                <span className="modal-sub">
                  Verify the archive snapshot details before replacing active station records.
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setIsRestoreModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <AlertCircleIcon size={18} color="#b45309" />
                  <strong style={{ color: '#92400e', fontSize: '13px' }}>Confirm Database Overwrite</strong>
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: '#78350f', lineHeight: 1.4 }}>
                  Restoring will safely load all tanks, sales, fuel slips, customers, daybook cash, and station settings from this backup file.
                </p>
              </div>

              <div style={{ background: '#faf6ee', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#686256' }}>Target Station:</span>
                  <strong>{pendingBackup.result.siteName} ({pendingBackup.result.siteId})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#686256' }}>Backup Generated:</span>
                  <span>{new Date(pendingBackup.result.exportedAt || Date.now()).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#686256' }}>Underground Tanks:</span>
                  <span>{pendingBackup.result.data?.tanks.length} Tanks</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#686256' }}>Dispensing Nozzles:</span>
                  <span>{pendingBackup.result.data?.nozzles.length} Nozzles</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#686256' }}>Credit Fleet Clients:</span>
                  <span>{pendingBackup.result.data?.customers.length} Accounts</span>
                </div>
              </div>
            </div>

            <div className="modal-actions-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setIsRestoreModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmRestore} style={{ background: '#9a3412', borderColor: '#7c2d12' }}>
                <CheckCircleIcon size={16} />
                <span>Confirm &amp; Restore Station Database</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
