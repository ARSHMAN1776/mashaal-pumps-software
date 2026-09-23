import React from 'react'
import { useApp } from '../../context/AppContext'
import {
  GasPumpIcon,
  GaugeIcon,
  DropletIcon,
  BuildingIcon,
  BookOpenIcon,
  UsersIcon,
  FileTextIcon,
  CreditCardIcon,
  CashIcon,
  PackageIcon,
  TruckIcon,
  BarChartIcon,
  SettingsIcon,
  ShieldIcon,
  LogOutIcon,
  TrendingUpIcon,
} from '../common/Icons'

interface NavItemDef {
  id: string
  label: string
  icon: React.ReactNode
  badge?: string
  badgeColor?: string
}

export const Sidebar: React.FC = () => {
  const { activeModule, setActiveModule, activeSiteData, activeSiteId, currentUser, logout } = useApp()

  const isParco = activeSiteData?.siteInfo?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01'
  const isOwner = currentUser?.role === 'owner'
  const isCashier = currentUser?.role === 'cashier'
  const lowStockCount = activeSiteData.tanks.filter((t) => t.currentLiters <= t.minReserveLiters).length

  const ownerSection: { title: string; items: NavItemDef[] } = {
    title: 'Executive Command',
    items: [
      {
        id: 'owner-portal',
        label: 'Owner Portal (Executive)',
        icon: <ShieldIcon size={18} color="#967938" />,
        badge: 'Owner',
        badgeColor: '#967938',
      },
      {
        id: 'owner-financials',
        label: 'Financial & Annual Performance',
        icon: <TrendingUpIcon size={18} color="#967938" />,
        badge: 'Annual',
        badgeColor: '#15803d',
      },
    ],
  }

  const menuSections: { title: string; items: NavItemDef[] }[] = [
    ...(isOwner ? [ownerSection] : []),
    {
      title: isOwner ? 'Station Deep-Dives' : 'Core Operations',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <GaugeIcon size={18} /> },
        { id: 'fuel-sales', label: 'Fuel Sales & Nozzles', icon: <GasPumpIcon size={18} /> },
        {
          id: 'tank-dip',
          label: 'Tank Dip & Stock',
          icon: <DropletIcon size={18} />,
          badge: lowStockCount > 0 ? 'Dip Alert' : undefined,
          badgeColor: '#b45309',
        },
      ],
    },
    {
      title: 'Accounting & Ledger',
      items: [
        { id: 'daybook', label: 'Daybook (Cash Register)', icon: <CashIcon size={18} /> },
        ...(!isCashier
          ? [{ id: 'omc-ledger', label: 'OMC Purchases & Ledger', icon: <BuildingIcon size={18} /> }]
          : []),
        { id: 'customers', label: 'Customers & Credit', icon: <UsersIcon size={18} /> },
        { id: 'ledger', label: 'Debit / Credit Ledger', icon: <BookOpenIcon size={18} /> },
        ...(!isCashier
          ? [{ id: 'bank-sheet', label: 'Bank Sheet & Deposits', icon: <CreditCardIcon size={18} /> }]
          : []),
        { id: 'expenses', label: 'Daily Expenses', icon: <FileTextIcon size={18} /> },
      ],
    },
    {
      title: 'Management & Control',
      items: [
        ...(!isCashier ? [{ id: 'staff', label: 'Staff & Payroll', icon: <UsersIcon size={18} /> }] : []),
        { id: 'lubricants', label: 'Lubricants Inventory', icon: <PackageIcon size={18} /> },
        ...(!isCashier
          ? [{ id: 'suppliers', label: 'Suppliers & Vendors', icon: <TruckIcon size={18} /> }]
          : []),
        ...(!isCashier
          ? [{ id: 'reports', label: 'Station Reports', icon: <BarChartIcon size={18} /> }]
          : []),
        ...(!isCashier
          ? [{ id: 'settings', label: 'Station Setup & Rates', icon: <SettingsIcon size={18} /> }]
          : []),
      ],
    },
  ]

  return (
    <aside className="sidebar-surface">
      {/* Brand Logo Header at Top of Sidebar */}
      <div className="sidebar-brand-header">
        {isParco ? (
          <div className="parco-logo-container">
            <svg viewBox="0 0 160 48" className="parco-brand-svg" fill="none">
              <text x="32" y="32" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="900" fontSize="26" fill="#ffffff" letterSpacing="-0.5">
                PARCO
              </text>
              <path d="M 8 36 Q 45 42 125 31" stroke="#e52d27" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <circle cx="16" cy="18" r="7" fill="#e52d27" />
              <path d="M 12 18 Q 18 12 24 16" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        ) : (
          <div className="pso-logo-container">
            <div className="pso-emblem-badge">
              <span className="pso-badge-circle green"></span>
              <span className="pso-badge-circle blue"></span>
            </div>
            <div className="pso-text-block">
              <strong className="pso-title-text">PSO</strong>
              <span className="pso-sub-text">Pakistan State Oil</span>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-scrollable">
        {menuSections.map((section) => (
          <div key={section.title} className="sidebar-section">
            <span className="sidebar-section-title">{section.title}</span>
            <nav className="sidebar-nav-list" aria-label={section.title}>
              {section.items.map((item) => {
                const isActive =
                  activeModule === item.id ||
                  (item.id === 'owner-portal' && (activeModule === 'dashboard' || !activeModule) && isOwner)
                return (
                  <button
                    key={item.id}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveModule(item.id)}
                  >
                    <span className="nav-item-icon">{item.icon}</span>
                    <span className="nav-item-label">{item.label}</span>
                    {item.badge && (
                      <span className="nav-item-badge" style={{ backgroundColor: item.badgeColor || '#a82315' }}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Sidebar Footer Logout Button */}
      <div className="sidebar-footer-area">
        <button
          type="button"
          className="sidebar-logout-btn"
          onClick={() => logout()}
          title="Sign Out of Session"
        >
          <span className="logout-icon">
            <LogOutIcon size={16} />
          </span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}
