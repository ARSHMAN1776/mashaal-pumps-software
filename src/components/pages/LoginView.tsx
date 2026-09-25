import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import {
  GasPumpIcon,
  ArrowLeftIcon,
  UserIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  ShieldSparkIcon,
  AlertCircleIcon,
} from '../common/Icons'
import type { UserRole } from '../../types'

export const LoginView: React.FC = () => {
  const { login, loginError, loggingIn, stations, activeSiteId, exitSite } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [keepSignedIn, setKeepSignedIn] = useState(true)

  const site = stations.find((s) => s.id === activeSiteId)

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (loggingIn) return
    void login(username, password, keepSignedIn, selectedRole ?? undefined)
  }

  const isParco = site?.brand === 'TOTAL PARCO'

  return (
    <div className={`luxury-auth-viewport ${isParco ? 'theme-parco' : 'theme-pso'}`}>
      {/* Decorative Architectural Silhouette & Canopy Background */}
      <div className="auth-background-decorations" aria-hidden="true">
        {/* Subtle architectural arch lines in the upper-right */}
        <div className="decor-arch-lines" />
        {/* Soft fuel station canopy silhouette at bottom left */}
        <div className="decor-canopy-silhouette" />
        {/* Elegant tropical leaf shadow in lower right corner */}
        <div className="decor-leaf-shadow" />
      </div>

      {/* Top Navigation Bar */}
      <header className="auth-top-nav">
        <button
          type="button"
          className="auth-back-btn"
          onClick={exitSite}
          title="Return to station selection"
        >
          <ArrowLeftIcon size={14} />
          <span>Change Station</span>
        </button>

        <div className="auth-motto-block">
          <span className="auth-motto-text">F U E L I N G &nbsp; A &nbsp; B E T T E R</span>
          <span className="auth-motto-sub">T O M O R R O W</span>
          <div className="auth-motto-line" />
        </div>
      </header>

      {/* Main Container */}
      <main className="auth-central-stage">
        {/* Premium Login Card - Unified & Full Length */}
        <div className="auth-login-card">
          {/* Station Branding (Inside Card at Top) */}
          <div className="auth-card-branding-header">
            <div className="auth-branding-top-row">
              {/* Circular Gold Gas Pump Emblem */}
              <div className="auth-circular-emblem">
                <div className="emblem-outer-ring">
                  <div className="emblem-inner-glow">
                    <GasPumpIcon size={22} color="#334155" />
                  </div>
                </div>
              </div>

              {/* Badges: [SITE 01/02] and [BRAND] */}
              <div className="auth-badge-duo">
                <span className="auth-site-pill">{site?.code || ''}</span>
                <span className="auth-brand-pill">{site?.brand || ''}</span>
              </div>
            </div>

            {/* Station Name in High-Contrast Luxury Serif */}
            <h1 className="auth-station-title">
              {site?.name || ''}
            </h1>

            {/* Station Location */}
            <p className="auth-station-location">
              {site?.location || ''}
            </p>

            {/* Diamond Divider */}
            <div className="auth-diamond-divider in-header">
              <span className="divider-diamond">◆</span>
              <span className="divider-line" />
            </div>
          </div>

          {/* Middle Content: Role Selection + Login Form */}
          <div className="auth-card-main-content">
            {/* Segmented Role Selection */}
            <div className="auth-role-section">
              <span className="auth-role-eyebrow">S I G N &nbsp; I N &nbsp; A S &nbsp; (optional)</span>
              <div className="auth-segmented-control" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === 'manager'}
                  className={`auth-segment-btn ${selectedRole === 'manager' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRole(selectedRole === 'manager' ? null : 'manager')
                  }}
                >
                  Station Manager
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === 'cashier'}
                  className={`auth-segment-btn ${selectedRole === 'cashier' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRole(selectedRole === 'cashier' ? null : 'cashier')
                  }}
                >
                  Cashier
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === 'owner'}
                  className={`auth-segment-btn ${selectedRole === 'owner' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRole(selectedRole === 'owner' ? null : 'owner')
                  }}
                >
                  Owner
                </button>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="auth-form-body">
              {/* Username / Staff ID */}
              <div className="auth-field-group">
                <label htmlFor="auth-username" className="auth-field-label">
                  Username or Staff ID
                </label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">
                    <UserIcon size={16} color="#475569" />
                  </span>
                  <input
                    id="auth-username"
                    type="text"
                    className="auth-text-input"
                    placeholder="Enter your username or staff ID"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="auth-field-group">
                <label htmlFor="auth-password" className="auth-field-label">
                  Password
                </label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">
                    <LockIcon size={16} color="#475569" />
                  </span>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-text-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={16} color="#475569" />
                    ) : (
                      <EyeIcon size={16} color="#475569" />
                    )}
                  </button>
                </div>
              </div>

              {/* Login Error */}
              {loginError && (
                <div className="auth-error-notice">
                  <AlertCircleIcon size={14} color="#b91c1c" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Security / Session Row */}
              <div className="auth-utility-row">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="auth-checkbox"
                  />
                  <span>Keep me signed in on this station PC</span>
                </label>

                <div className="auth-encrypted-badge">
                  <ShieldSparkIcon size={14} color="#334155" />
                  <span>Encrypted</span>
                </div>
              </div>

              {/* Primary Action Button */}
              <button type="submit" className="auth-primary-btn" disabled={loggingIn}>
                <span className="btn-arrow-mark">→</span>
                <span className="btn-cta-text">
                  {loggingIn ? 'Signing in…' : `Open ${site?.code || 'station'} Workspace`}
                </span>
              </button>
            </form>
          </div>

          {/* Footer: Database Notice */}
          <div className="auth-card-footer">
            <div className="auth-diamond-divider in-card">
              <span className="divider-line" />
              <span className="divider-diamond">◆</span>
              <span className="divider-line" />
            </div>

            <div className="auth-db-notice">
              <p className="notice-line-1">
                Operating with its own separate database tables for {site?.name || 'this station'}.
              </p>
              <p className="notice-line-2">No combined records.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
