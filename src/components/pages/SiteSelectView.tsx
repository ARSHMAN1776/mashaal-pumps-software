import React from 'react'
import { useApp } from '../../context/AppContext'
import { GasPumpIcon, ShieldIcon, ArrowRightIcon, BuildingIcon } from '../common/Icons'

export const SiteSelectView: React.FC = () => {
  const { selectSite, stations } = useApp()

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
            <p className="hero-desc">Each station has its own private records, reports, stock, and accounts.</p>
          </div>
          <div className="hero-date-pill">
            <span className="date-pill-label">TODAY</span>
            <strong className="date-pill-val">
              {new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
            </strong>
          </div>
        </div>

        <div className="site-cards-flow">
          {stations.map((s) => {
            const accent = s.brand === 'TOTAL PARCO' ? '#9e1b1b' : '#006a4e'
            const dark = s.brand === 'TOTAL PARCO' ? '#320a0a' : '#0d281a'
            return (
              <div
                key={s.id}
                className="station-launch-card"
                onClick={() => void selectSite(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void selectSite(s.id)
                }}
              >
                <div className="station-card-ribbon" style={{ backgroundColor: accent }}>
                  <span className="station-code-pill">{s.code}</span>
                  <span className="station-brand-name">{s.brand}</span>
                </div>

                <div className="station-card-main">
                  <div className="station-card-header" style={{ marginBottom: '24px' }}>
                    <div className="station-brand-crest">
                      <BuildingIcon size={24} color="#b88d2b" />
                    </div>
                    <div>
                      <h2 className="station-card-title">{s.name}</h2>
                      <p className="station-card-address">{s.location}</p>
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
                      style={{ backgroundColor: dark, borderColor: dark }}
                      onClick={(e) => {
                        e.stopPropagation()
                        void selectSite(s.id)
                      }}
                    >
                      <span>Select {s.code}</span>
                      <ArrowRightIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="system-assurance-banner">
          <ShieldIcon size={18} color="#b88d2b" />
          <p>
            <strong>Strict Data Isolation Active:</strong> every station keeps its records in its own separate database
            tables. Nozzle readings, expenses, tank dips or customer vouchers entered in one station can never appear in
            another.
          </p>
        </div>
      </main>

      <footer className="site-select-footer">
        <p>© {new Date().getFullYear()} Mashaal Petroleum Software. Designed for high-reliability station operations.</p>
      </footer>
    </div>
  )
}
