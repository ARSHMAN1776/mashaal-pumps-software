import React from 'react'
import { useApp } from '../../context/AppContext'
import { GasPumpIcon, ArrowRightIcon, ShieldIcon } from '../common/Icons'

export const SiteSelectView: React.FC = () => {
  const { selectSite, stations } = useApp()
  const today = new Intl.DateTimeFormat('en-PK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="pick">
      <header className="pick-top">
        <div className="pick-logo">
          <span className="pick-logo-icon"><GasPumpIcon size={20} color="#fff" /></span>
          <span>Mashaal Petroleum</span>
        </div>
        <span className="pick-date">{today}</span>
      </header>

      <main className="pick-body">
        <h1 className="pick-title">Which station are you working at?</h1>
        <p className="pick-sub">Each station keeps its own records, so what you enter at one never shows up at the other.</p>

        <div className="pick-cards">
          {stations.map((s) => {
            const theme = s.brand === 'TOTAL PARCO' ? 'theme-parco' : 'theme-pso'
            return (
              <button key={s.id} type="button" className={`pick-card ${theme}`} onClick={() => void selectSite(s.id)}>
                <span className="pick-card-band">{s.brand}</span>
                <span className="pick-card-name">{s.name}</span>
                <span className="pick-card-place">{s.location}</span>
                <span className="pick-card-go">Open this station <ArrowRightIcon size={16} /></span>
              </button>
            )
          })}
        </div>

        <p className="pick-note"><ShieldIcon size={15} color="#64748b" /> You will be asked to sign in after you choose.</p>
      </main>
    </div>
  )
}
