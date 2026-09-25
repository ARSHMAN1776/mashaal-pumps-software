import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { MapPinIcon, KeyIcon } from '../common/Icons'
import { PasswordDialog } from '../common/PasswordDialog'

/** The bar at the top: which station, whether everything is being saved, the date, and who is signed in. */
export const Navbar: React.FC<{ onMenu?: () => void }> = ({ onMenu }) => {
  const { currentUser, activeSiteData, realtime, online, backendKind } = useApp()
  const [now, setNow] = useState(new Date())
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const site = activeSiteData.siteInfo
  const date = new Intl.DateTimeFormat('en-PK', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const time = new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true }).format(now)
  const initials = currentUser?.name ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '?'

  // plain words for "is my work being saved?"
  const status = !online
    ? { color: '#dc2626', text: 'No internet — not saving', title: 'No internet connection. Nothing can be saved until it comes back.' }
    : backendKind === 'memory'
    ? { color: '#2563eb', text: 'Demo — nothing is saved', title: 'Demo mode with sample data. Nothing is stored.' }
    : realtime === 'live'
    ? { color: '#16a34a', text: 'Saved online', title: 'Everything you enter is saved to the database and shows on other computers straight away.' }
    : { color: '#d97706', text: 'Connecting…', title: 'Saving works. Updates from other computers may be a little late.' }

  return (
    <header className="shell-top">
      <div className="shell-top-left">
        <button type="button" className="shell-icon-btn shell-menu-btn" onClick={onMenu} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="shell-station">
          <strong>{site.name}</strong>
          <span><MapPinIcon size={13} />{site.location}</span>
        </div>
      </div>

      <div className="shell-top-right">
        <span className="shell-status" title={status.title}>
          <span className="shell-status-dot" style={{ background: status.color }} />
          <span className="shell-status-text">{status.text}</span>
        </span>
        <span className="shell-clock">{date} · {time}</span>
        <div className="shell-user">
          <div className="shell-avatar" aria-hidden="true">{initials}</div>
          <div className="shell-user-meta">
            <strong>{currentUser?.name}</strong>
            <span>{currentUser?.role}</span>
          </div>
          <button type="button" className="shell-icon-btn" title="Change my password" aria-label="Change my password" onClick={() => setPasswordOpen(true)}>
            <KeyIcon size={16} />
          </button>
        </div>
      </div>
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
    </header>
  )
}
