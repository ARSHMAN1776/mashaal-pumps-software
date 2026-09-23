import React from 'react'
import { useApp } from '../../context/AppContext'
import {
  GasPumpIcon,
  ShieldIcon,
  ArrowRightIcon,
  BuildingIcon,
} from '../common/Icons'

export const SiteSelectView: React.FC = () => {
  const { selectSite, allSitesData } = useApp()

  const site1 = allSitesData['SITE-01']
  const site2 = allSitesData['SITE-02']

  const sites = [
    {
      id: 'SITE-01' as const,
      data: site1,
      accentColor: '#9e1b1b',
    },
    {
      id: 'SITE-02' as const,
      data: site2,
      accentColor: '#006a4e',
    },
  ]

  return (
    <div className="site-select-surface">
      <header className="site-select-topbar">
        <div className="brand-crest">
          <div className="brand-crest-icon">
            <GasPumpIcon size={20} color="#b88d2b" />
          </div>
          <div className="brand-crest-text">
            <span className="brand-crest-company">Mashaal Petroleum</span>
            <span className="brand-crest-tag">Enterprise Network</span>
          </div>
        </div>

        <div className="topbar-user-area" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#686256', fontWeight: 600 }}>
            {new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
          </span>
          <span className="badge badge-gold">
            <ShieldIcon size={14} /> Multi-Station Portal
          </span>
        </div>
      </header>

      <main className="site-select-body">
        <div className="site-select-hero">
          <div className="hero-text-block">
            <span className="hero-eyebrow">PETROLEUM OPERATIONS</span>
            <h1 className="hero-title">Choose a station to continue</h1>
            <p className="hero-desc">
              Each station has its own private records, reports, stock, and accounts.
            </p>
          </div>
          <div className="hero-date-pill">
            <span className="date-pill-label">TODAY</span>
            <strong className="date-pill-val">
              {new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
            </strong>
          </div>
        </div>

        <div className="site-cards-flow">
          {sites.map(({ id, data, accentColor }) => (
            <div
              key={id}
              className="station-launch-card"
              onClick={() => selectSite(id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') selectSite(id)
              }}
            >
              <div className="station-card-ribbon" style={{ backgroundColor: accentColor }}>
                <span className="station-code-pill">{data.siteInfo.code}</span>
                <span className="station-brand-name">{data.siteInfo.brand}</span>
              </div>

              <div className="station-card-main">
                <div className="station-card-header" style={{ marginBottom: '24px' }}>
                  <div className="station-brand-crest">
                    <BuildingIcon size={24} color="#b88d2b" />
                  </div>
                  <div>
                    <h2 className="station-card-title">{data.siteInfo.name}</h2>
                    <p className="station-card-address">{data.siteInfo.location}</p>
                  </div>
                </div>

                <div className="station-card-footer" style={{ borderTop: '1px solid #ece5d6', paddingTop: '20px' }}>
                  <span className="station-security-note">
                    <ShieldIcon size={14} color="#787265" />
                    Dedicated Station Records
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary station-open-btn"
                    style={{ backgroundColor: id === 'SITE-01' ? '#320a0a' : '#0d281a', borderColor: id === 'SITE-01' ? '#320a0a' : '#0d281a' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectSite(id)
                    }}
                  >
                    <span>Select {data.siteInfo.code}</span>
                    <ArrowRightIcon size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="system-assurance-banner">
          <ShieldIcon size={18} color="#b88d2b" />
          <p>
            <strong>Strict Data Isolation Active:</strong> Any nozzle readings, expenses, tank dip adjustments, or
            customer vouchers entered inside Site 1 will never merge into Site 2.
          </p>
        </div>
      </main>

      <footer className="site-select-footer">
        <p>© {new Date().getFullYear()} Mashaal Petroleum Software. Designed for high-reliability station operations.</p>
      </footer>
    </div>
  )
}
