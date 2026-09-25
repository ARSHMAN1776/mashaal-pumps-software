import React from 'react'
import { useApp } from '../../context/AppContext'
import { isLowTank } from '../../data/derive'
import {
  GasPumpIcon,
  DropletIcon,
  BuildingIcon,
  UsersIcon,
  FileTextIcon,
  CreditCardIcon,
  CashIcon,
  PackageIcon,
  TruckIcon,
  BarChartIcon,
  SettingsIcon,
  LogOutIcon,
  TrendingUpIcon,
  HomeIcon,
  BookOpenIcon,
} from '../common/Icons'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

interface NavGroup {
  title?: string
  items: NavItem[]
}

/** The menu. Names are plain words for what people do; the ids are what the app uses internally. */
export const Sidebar: React.FC<{ open?: boolean; onNavigate?: () => void }> = ({ open = false, onNavigate }) => {
  const { activeModule, setActiveModule, activeSiteData, currentUser, logout } = useApp()

  const isOwner = currentUser?.role === 'owner'
  const isCashier = currentUser?.role === 'cashier'
  const lowTanks = activeSiteData.tanks.filter((t) => isLowTank(t, activeSiteData.settings.lowStockAlertPct)).length
  const home = isOwner ? 'owner-portal' : 'dashboard'
  const site = activeSiteData.siteInfo

  const groups: NavGroup[] = [
    { items: [{ id: home, label: 'Home', icon: <HomeIcon size={19} /> }] },
    {
      title: 'Daily work',
      items: [
        { id: 'fuel-sales', label: 'Sell fuel', icon: <GasPumpIcon size={19} /> },
        { id: 'customers', label: 'Credit customers', icon: <UsersIcon size={19} /> },
        { id: 'ledger', label: 'Customer accounts', icon: <BookOpenIcon size={19} /> },
        { id: 'daybook', label: 'Cash book', icon: <CashIcon size={19} /> },
        { id: 'expenses', label: 'Expenses', icon: <FileTextIcon size={19} /> },
      ],
    },
    {
      title: 'Stock',
      items: [
        { id: 'tank-dip', label: 'Fuel tanks', icon: <DropletIcon size={19} />, badge: lowTanks },
        ...(!isCashier ? [{ id: 'omc-ledger', label: 'Fuel deliveries', icon: <BuildingIcon size={19} /> }] : []),
        { id: 'lubricants', label: 'Oil & lubricants', icon: <PackageIcon size={19} /> },
      ],
    },
    ...(!isCashier
      ? [
          {
            title: 'Money & people',
            items: [
              { id: 'bank-sheet', label: 'Bank', icon: <CreditCardIcon size={19} /> },
              { id: 'suppliers', label: 'Suppliers', icon: <TruckIcon size={19} /> },
              { id: 'staff', label: 'Staff & salaries', icon: <UsersIcon size={19} /> },
            ],
          },
          {
            title: isOwner ? 'Owner & reports' : 'Reports & settings',
            items: [
              ...(isOwner ? [{ id: 'owner-financials', label: 'Profit & withdrawals', icon: <TrendingUpIcon size={19} /> }] : []),
              { id: 'reports', label: 'Reports', icon: <BarChartIcon size={19} /> },
              { id: 'settings', label: 'Settings & prices', icon: <SettingsIcon size={19} /> },
            ],
          },
        ]
      : []),
  ]

  const isActive = (id: string) => activeModule === id || (id === home && (activeModule === 'dashboard' || activeModule === 'owner-portal' || !activeModule))

  return (
    <aside className={`shell-side ${open ? 'is-open' : ''}`} aria-label="Main menu">
      <div className="shell-brand">
        <div className="shell-brand-mark"><GasPumpIcon size={22} /></div>
        <div className="shell-brand-text">
          <strong>Mashaal Petroleum</strong>
          <small>{site.brand} • {site.code}</small>
        </div>
      </div>

      <nav className="shell-nav">
        {groups.map((g, gi) => (
          <div key={g.title ?? `g${gi}`}>
            {g.title && <p className="shell-group-title">{g.title}</p>}
            {g.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="shell-link"
                aria-current={isActive(item.id) ? 'page' : undefined}
                onClick={() => {
                  setActiveModule(item.id)
                  onNavigate?.()
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? <span className="shell-badge" title="Tanks running low">{item.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="shell-foot">
        <span className="shell-version" title={`Built on ${__BUILD_DATE__}`}>Version {__APP_VERSION__}</span>
        <button type="button" className="shell-out" onClick={() => void logout()}>
          <LogOutIcon size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
