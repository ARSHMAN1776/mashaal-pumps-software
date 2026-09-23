import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import {
  MapPinIcon,
  CalendarIcon,
  GasPumpIcon,
} from '../common/Icons'

export const Navbar: React.FC = () => {
  const { currentUser, activeSiteData, activeSiteId, cloudStatus } = useApp()
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const site = activeSiteData?.siteInfo
  const isParco = site?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01'

  const formattedDate = new Intl.DateTimeFormat('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(currentTime)

  const formattedTime = new Intl.DateTimeFormat('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(currentTime)

  const initials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SM'

  return (
    <header className="navbar-surface">
      {/* Left: Station Identity */}
      <div className="navbar-left-identity">
        <div className={`station-badge-pill ${isParco ? 'badge-parco' : 'badge-pso'}`}>
          <GasPumpIcon size={14} />
          <span>{site?.code || 'SITE 01'}</span>
        </div>

        <div className="header-station-info">
          <h1 className="header-station-title">{site?.name || 'Mashaal Total PARCO Station'}</h1>
          <div className="header-station-location">
            <MapPinIcon size={13} color={isParco ? '#9e1b1b' : '#006a4e'} />
            <span>{site?.location || 'Khanpur Road, Rahim Yar Khan'}</span>
          </div>
        </div>
      </div>

      {/* Right: Status, Date/Time, User Profile */}
      <div className="navbar-right-cluster">
        {/* Station Online & Synchronized Status */}
        <div className="header-online-status" title={cloudStatus.tableExists ? 'Supabase PostgreSQL Cloud Sync Active' : cloudStatus.connected ? 'Supabase connected - create public.stations table in SQL editor' : 'Local Storage Mode'}>
          <span
            className="live-status-dot"
            style={{
              backgroundColor:
                cloudStatus.connected && cloudStatus.tableExists
                  ? '#16a34a'
                  : cloudStatus.connected
                  ? '#f59e0b'
                  : '#10b981',
            }}
          />
          <span className="live-status-label">
            {cloudStatus.connected && cloudStatus.tableExists
              ? 'Cloud Live Synced'
              : cloudStatus.connected
              ? 'Cloud: Run SQL Setup'
              : 'Station Online & Synchronized'}
          </span>
        </div>

        <div className="header-divider" />

        {/* Date & Time */}
        <div className="header-datetime-chip">
          <CalendarIcon size={14} color="#6b7280" />
          <span className="header-datetime-text">
            {formattedDate} &nbsp;•&nbsp; {formattedTime}
          </span>
        </div>

        <div className="header-divider" />

        {/* User Identity Chip (Static, No Dropdown) */}
        <div className="header-profile-trigger" style={{ cursor: 'default' }}>
          <div className={`user-avatar-circle ${isParco ? 'avatar-parco' : 'avatar-pso'}`}>
            <span>{initials}</span>
          </div>
          <div className="header-user-meta">
            <span className="header-user-title">{currentUser?.name || 'Station Manager'}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
