import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { MapPinIcon, CalendarIcon, GasPumpIcon, KeyIcon } from '../common/Icons'
import { PasswordDialog } from '../common/PasswordDialog'

export const Navbar: React.FC<{ onMenu?: () => void }> = ({ onMenu }) => {
  const { currentUser, activeSiteData, realtime, online, backendKind } = useApp()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const site = activeSiteData.siteInfo
  const isParco = site.brand === 'TOTAL PARCO'

  const formattedDate = new Intl.DateTimeFormat('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(currentTime)
  const formattedTime = new Intl.DateTimeFormat('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }).format(currentTime)

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  // what the dot means: green = saved to the cloud and live-synced, amber = reconnecting, red = offline
  const status = !online
    ? { color: '#dc2626', label: 'Offline — not saving', title: 'No internet connection. Changes cannot be saved.' }
    : backendKind === 'memory'
    ? { color: '#2563eb', label: 'Preview (not saved)', title: 'Preview mode: sample data, nothing is stored.' }
    : realtime === 'live'
    ? { color: '#16a34a', label: 'Cloud live synced', title: 'Every change is saved to the cloud database and appears on other devices instantly.' }
    : realtime === 'connecting'
    ? { color: '#f59e0b', label: 'Connecting…', title: 'Connecting live updates. Saving works normally.' }
    : { color: '#f59e0b', label: 'Live updates paused', title: 'Saving works, but changes from other devices may be delayed. Reconnecting…' }

  return (
    <header className="navbar-surface">
      <div className="navbar-left-identity">
        <button type="button" className="ui-menu-btn" onClick={onMenu} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <div className={`station-badge-pill ${isParco ? 'badge-parco' : 'badge-pso'}`}>
          <GasPumpIcon size={14} />
          <span>{site.code}</span>
        </div>

        <div className="header-station-info">
          <h1 className="header-station-title">{site.name}</h1>
          <div className="header-station-location">
            <MapPinIcon size={13} color={isParco ? '#9e1b1b' : '#006a4e'} />
            <span>{site.location}</span>
          </div>
        </div>
      </div>

      <div className="navbar-right-cluster">
        <div className="header-online-status" title={status.title}>
          <span className="live-status-dot" style={{ backgroundColor: status.color }} />
          <span className="live-status-label">{status.label}</span>
        </div>

        <div className="header-divider" />

        <div className="header-datetime-chip">
          <CalendarIcon size={14} color="#6b7280" />
          <span className="header-datetime-text">
            {formattedDate} &nbsp;•&nbsp; {formattedTime}
          </span>
        </div>

        <div className="header-divider" />

        <div className="header-profile-trigger" style={{ cursor: 'default' }}>
          <div className={`user-avatar-circle ${isParco ? 'avatar-parco' : 'avatar-pso'}`}>
            <span>{initials}</span>
          </div>
          <div className="header-user-meta">
            <span className="header-user-title">{currentUser?.name}</span>
            <span className="ui-muted" style={{ textTransform: 'capitalize' }}>{currentUser?.role}</span>
          </div>
          <button type="button" className="ui-icon-btn" style={{ marginLeft: 8 }} title="Change my password" aria-label="Change my password" onClick={() => setPasswordOpen(true)}>
            <KeyIcon size={15} />
          </button>
        </div>
      </div>
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
    </header>
  )
}
