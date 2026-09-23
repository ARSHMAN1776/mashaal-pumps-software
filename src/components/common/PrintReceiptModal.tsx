import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon, XIcon } from './Icons'

interface PrintReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  stationName?: string
  stationLocation?: string
  stationPhone?: string
  brandOverride?: 'TOTAL PARCO' | 'PSO'
  defaultMode?: 'a4' | 'thermal'
  children: React.ReactNode
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  title,
  stationName,
  stationLocation,
  stationPhone,
  brandOverride,
  defaultMode = 'a4',
  children,
}) => {
  const { activeSiteData, activeSiteId } = useApp()
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>(defaultMode)

  if (!isOpen) return null

  const siteInfo = activeSiteData?.siteInfo
  const isParco =
    brandOverride === 'TOTAL PARCO'
      ? true
      : brandOverride === 'PSO'
      ? false
      : siteInfo?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01'

  const displayStationName = stationName || siteInfo?.name || (isParco ? 'Mashaal Total PARCO Station' : 'Mashaal PSO Station')
  const displayStationLocation = stationLocation || siteInfo?.location || (isParco ? 'Khanpur Road, Rahim Yar Khan' : 'Raiwind Road, Lahore')
  const displayStationPhone = stationPhone || siteInfo?.phone || (isParco ? '068-5874211' : '042-35321900')
  const displayNtn = siteInfo?.ntn || (isParco ? '4192084-7' : '4192084-8')
  const managerName = siteInfo?.managerName || (isParco ? 'Naveed Akhtar' : 'Chaudhry Tariq Mehmood')

  const now = new Date()
  const printDateStr = now.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const printTimeStr = now.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const docRefNo = `${isParco ? 'TP' : 'PSO'}-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`

  const handlePrint = () => {
    if (printMode === 'thermal') {
      document.body.classList.add('print-thermal-active')
    } else {
      document.body.classList.remove('print-thermal-active')
    }

    window.print()

    setTimeout(() => {
      document.body.classList.remove('print-thermal-active')
    }, 1000)
  }

  return (
    <div className="modal-backdrop receipt-modal-overlay" onClick={onClose}>
      <div
        className={`modal-container receipt-modal-container ${isParco ? 'theme-receipt-parco' : 'theme-receipt-pso'} ${printMode === 'thermal' ? 'modal-mode-thermal' : 'modal-mode-a4'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Screen Action Bar (Hidden in Print) */}
        <div className="receipt-screen-actions no-print">
          <div className="receipt-header-top">
            <div className="modal-title-wrap">
              <h3 className="modal-heading">{title}</h3>
              <span className="modal-sub">
                {isParco ? '🔴 Total PARCO Station Audit' : '🟢 Pakistan State Oil (PSO) Station Audit'}
              </span>
            </div>

            <button
              className="receipt-close-btn"
              onClick={onClose}
              aria-label="Close receipt modal"
              title="Close modal"
            >
              <XIcon size={18} />
            </button>
          </div>

          <div className="receipt-header-toolbar">
            {/* 1-Click Print Mode Toggle (A4 vs 80mm Thermal) */}
            <div className="receipt-format-selector" role="radiogroup" aria-label="Receipt printer format">
              <button
                type="button"
                className={`format-toggle-btn ${printMode === 'a4' ? 'active' : ''}`}
                onClick={() => setPrintMode('a4')}
                title="Full A4 formal report layout with corporate banners"
              >
                📄 Full A4 Report
              </button>
              <button
                type="button"
                className={`format-toggle-btn ${printMode === 'thermal' ? 'active' : ''}`}
                onClick={() => setPrintMode('thermal')}
                title="80mm POS thermal roll printer layout (Epson, Xprinter, Sunmi)"
              >
                🖨️ 80mm Thermal POS
              </button>
            </div>

            <button
              className={`btn ${isParco ? 'btn-parco-print' : 'btn-pso-print'}`}
              onClick={handlePrint}
              title={`Print ${printMode === 'thermal' ? '80mm Thermal Slip' : 'Full A4 Report'}`}
            >
              <PrinterIcon size={16} />
              <span>{printMode === 'thermal' ? 'Print 80mm Slip' : 'Print A4 Report'}</span>
            </button>
          </div>
        </div>

        {/* Printable Paper Document (A4 or 80mm Thermal) */}
        <div className={`receipt-paper print-area ${printMode === 'thermal' ? 'receipt-thermal-80mm' : 'receipt-formal-a4'}`}>
          {printMode === 'thermal' ? (
            /* ==========================================================
               80MM THERMAL RECEIPT LAYOUT (COMPACT POS PRINTER FORMAT)
               ========================================================== */
            <div className="thermal-receipt-wrap">
              {/* Thermal Brand Header */}
              <div className="thermal-header">
                <div className={`thermal-brand-badge ${isParco ? 'parco' : 'pso'}`}>
                  {isParco ? '★ TOTAL PARCO ★' : '★ PAKISTAN STATE OIL ★'}
                </div>
                <div className="thermal-station-title">{displayStationName}</div>
                <div className="thermal-meta-text">{displayStationLocation}</div>
                <div className="thermal-meta-text">Tel: {displayStationPhone}</div>
                <div className="thermal-meta-text">NTN: {displayNtn}</div>
                <div className="thermal-dash-line">------------------------------------------</div>
                <div className="thermal-doc-type">
                  <strong>{title.toUpperCase()}</strong>
                </div>
                <div className="thermal-doc-ref">REF: {docRefNo}</div>
                <div className="thermal-doc-ref">{printDateStr} &nbsp; {printTimeStr}</div>
                <div className="thermal-dash-line">------------------------------------------</div>
              </div>

              {/* Thermal Content Body */}
              <div className="thermal-body">{children}</div>

              {/* Thermal Footer & Barcode Simulation */}
              <div className="thermal-footer">
                <div className="thermal-dash-line">==========================================</div>
                <div className="thermal-barcode-sim">
                  <div className="thermal-barcode-bars">|||| | ||| ||||| || |||| |||| ||| |||||</div>
                  <div className="thermal-barcode-text">*{isParco ? 'TP' : 'PSO'}-{docRefNo.split('-').pop()}*</div>
                </div>
                <div className="thermal-auth-note">
                  <div>Forecourt Incharge: {managerName}</div>
                  <div>Computerized POS Automated Slip</div>
                  <div>Thank You For Fueling With Mashaal!</div>
                </div>
                <div className="thermal-tear-edge" />
              </div>
            </div>
          ) : (
            /* ==========================================================
               FULL A4 CORPORATE REPORT LAYOUT (DESK/OFFICE PRINTER FORMAT)
               ========================================================== */
            <>
              {/* Top Brand Banner */}
              <div className="receipt-brand-banner">
                <div className="receipt-brand-emblem-col">
                  {isParco ? (
                    <div className="parco-receipt-badge">
                      <div className="parco-badge-logo">TOTAL PARCO</div>
                      <div className="parco-badge-sub">Mashaal Petroleum</div>
                    </div>
                  ) : (
                    <div className="pso-receipt-badge">
                      <div className="pso-badge-emblem">PSO</div>
                      <div className="pso-badge-text">
                        <span className="pso-primary-label">Pakistan State Oil</span>
                        <span className="pso-secondary-label">Mashaal Station</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="receipt-station-meta-col">
                  <h2 className="receipt-station-name">{displayStationName}</h2>
                  <p className="receipt-station-address">{displayStationLocation}</p>
                  <div className="receipt-station-tags">
                    <span className="receipt-tag-item"><strong>Tel:</strong> {displayStationPhone}</span>
                    <span className="receipt-tag-sep">•</span>
                    <span className="receipt-tag-item"><strong>NTN:</strong> {displayNtn}</span>
                    <span className="receipt-tag-sep">•</span>
                    <span className="receipt-tag-item"><strong>Incharge:</strong> {managerName}</span>
                  </div>
                </div>
              </div>

              {/* Document Classification Stripe */}
              <div className="receipt-doc-stripe">
                <div className="receipt-doc-title-block">
                  <span className="receipt-doc-badge">{isParco ? 'TOTAL PARCO VERIFIED' : 'PSO AUDIT VERIFIED'}</span>
                  <h3 className="receipt-doc-heading">{title}</h3>
                </div>
                <div className="receipt-doc-meta-block">
                  <div><strong>Voucher Ref:</strong> {docRefNo}</div>
                  <div><strong>Date & Time:</strong> {printDateStr} • {printTimeStr}</div>
                </div>
              </div>

              {/* Main Content Body */}
              <div className="receipt-content-body">{children}</div>

              {/* Verification & Signature Section */}
              <div className="receipt-auth-section">
                <div className="receipt-auth-left">
                  <div className="receipt-qr-sim">
                    <div className="qr-symbol-box">
                      <span>VERIFIED</span>
                    </div>
                    <div className="qr-symbol-text">
                      <strong className="qr-title">AUTOMATED AUDIT VOUCHER</strong>
                      <span className="qr-sub">Forecourt POS • Mashaal System</span>
                      <span className="qr-hash">{isParco ? 'PARCO-PK' : 'PSO-PK'}-{now.getFullYear()}-SECURED</span>
                    </div>
                  </div>
                </div>

                <div className="receipt-auth-right">
                  <div className="signature-stamp-box">
                    <div className="signature-dots-line" />
                    <span className="signature-title">Authorized Station Incharge Signature / Stamp</span>
                  </div>
                </div>
              </div>

              {/* Corporate Footer */}
              <div className="receipt-footer-branding">
                <p className="receipt-tagline">
                  {isParco
                    ? 'TOTAL PARCO PAKISTAN LIMITED • CERTIFIED RETAIL OUTLET'
                    : 'PAKISTAN STATE OIL COMPANY LIMITED • AUTHORIZED DEALERSHIP NETWORK'}
                </p>
                <p className="receipt-disclaimer">
                  This is an official computerized document generated via Mashaal Petroleum Station ERP.
                  Valid for commercial, fleet, and corporate accounting audit.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
