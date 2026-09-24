import React from 'react'
import { useApp } from './context/AppContext'
import { LoginView } from './components/pages/LoginView'
import { SiteSelectView } from './components/pages/SiteSelectView'
import { Navbar } from './components/layout/Navbar'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardView } from './components/pages/DashboardView'
import { FuelSalesView } from './components/pages/FuelSalesView'
import { TankDipView } from './components/pages/TankDipView'
import { OmcLedgerView } from './components/pages/OmcLedgerView'
import { DaybookView } from './components/pages/DaybookView'
import { CustomersView } from './components/pages/CustomersView'
import { LedgerView } from './components/pages/LedgerView'
import { BankSheetView } from './components/pages/BankSheetView'
import { ExpensesView } from './components/pages/ExpensesView'
import { StaffView } from './components/pages/StaffView'
import { LubricantsView } from './components/pages/LubricantsView'
import { SuppliersView } from './components/pages/SuppliersView'
import { ReportsView } from './components/pages/ReportsView'
import { SettingsView } from './components/pages/SettingsView'
import { OwnerPortalView } from './components/pages/OwnerPortalView'
import { OwnerFinancialView } from './components/pages/OwnerFinancialView'
import { LegacyCopyBanner } from './components/common/LegacyCopyBanner'
import { Spinner } from './components/common/kit'
import { WifiOffIcon } from './components/common/Icons'

const CASHIER_BLOCKED = ['owner-portal', 'owner-financials', 'bank-sheet', 'settings', 'reports', 'omc-ledger', 'staff', 'suppliers']

const Splash: React.FC<{ title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <div className="ui-splash">
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {action}
  </div>
)

export const AppContent: React.FC = () => {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const {
    booting, bootError, backendKind, activeSiteId, isSiteLoggedIn, activeModule, activeSiteData, currentUser,
    dataStatus, dataError, reloadData, online, logout, selectSite, login,
  } = useApp()

  // demo mode only (compiled out of production): ?as=username&site=SITE-01 signs in a sample user for screenshots
  const autoLogin = React.useRef(false)
  React.useEffect(() => {
    if (!__PREVIEW__ || booting || autoLogin.current || isSiteLoggedIn) return
    const q = new URLSearchParams(window.location.search)
    const as = q.get('as')
    if (!as) return
    autoLogin.current = true
    void (async () => {
      await selectSite(q.get('site') ?? 'SITE-01')
      await new Promise((r) => setTimeout(r, 300)) // let the station selection render before signing in
      await login(as, 'Preview#123', false)
    })()
  }, [booting, isSiteLoggedIn, selectSite, login])

  if (booting) {
    return (
      <div className="ui-splash">
        <Spinner label="Starting Mashaal Petroleum…" />
      </div>
    )
  }
  if (bootError) {
    return (
      <Splash
        title="Cannot start the software"
        action={<button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>}
      >
        {bootError}
      </Splash>
    )
  }

  // 1. choose the station
  if (!activeSiteId) return <SiteSelectView />

  // 2. sign in for that station
  if (!isSiteLoggedIn || !currentUser) return <LoginView />

  // 3. load the station's data
  if (dataStatus === 'loading' || dataStatus === 'idle') {
    return (
      <div className="ui-splash">
        <Spinner label="Loading station data…" />
      </div>
    )
  }
  if (dataStatus === 'error') {
    return (
      <Splash
        title="Could not load the station data"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => void reloadData()}>Try again</button>
            <button type="button" className="btn btn-outline" onClick={() => void logout()}>Sign out</button>
          </div>
        }
      >
        {dataError}
      </Splash>
    )
  }

  const renderModule = () => {
    const isCashier = currentUser.role === 'cashier'
    if (isCashier && CASHIER_BLOCKED.includes(activeModule)) return <FuelSalesView />

    switch (activeModule) {
      case 'owner-portal':
        return currentUser.role === 'owner' ? <OwnerPortalView /> : <DashboardView />
      case 'owner-financials':
        return currentUser.role === 'owner' ? <OwnerFinancialView /> : <DashboardView />
      case 'dashboard':
        return currentUser.role === 'owner' ? <OwnerPortalView /> : <DashboardView />
      case 'fuel-sales':
        return <FuelSalesView />
      case 'tank-dip':
        return <TankDipView />
      case 'omc-ledger':
        return <OmcLedgerView />
      case 'daybook':
        return <DaybookView />
      case 'customers':
        return <CustomersView />
      case 'ledger':
        return <LedgerView />
      case 'bank-sheet':
        return <BankSheetView />
      case 'expenses':
        return <ExpensesView />
      case 'staff':
        return <StaffView />
      case 'lubricants':
        return <LubricantsView />
      case 'suppliers':
        return <SuppliersView />
      case 'reports':
        return <ReportsView />
      case 'settings':
        return <SettingsView />
      default:
        return currentUser.role === 'owner' ? <OwnerPortalView /> : <DashboardView />
    }
  }

  const themeClass = activeSiteData.siteInfo.brand === 'TOTAL PARCO' ? 'theme-parco' : 'theme-pso'

  return (
    <div className={`app-shell-root ${themeClass}`}>
      {menuOpen && <div className="ui-menu-backdrop" onClick={() => setMenuOpen(false)} />}
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="app-workspace-layout">
        <Navbar onMenu={() => setMenuOpen(true)} />
        {!online && (
          <div className="ui-offline-banner" role="alert">
            <WifiOffIcon size={16} />
            <span>No internet connection — changes cannot be saved until it returns. Nothing you see here is lost.</span>
          </div>
        )}
        {backendKind === 'memory' && (
          <div className="ui-offline-banner" style={{ background: '#1d5f94' }}>
            <span>PREVIEW MODE — sample data in memory only. Nothing is saved to Supabase.</span>
          </div>
        )}
        <main className="app-workspace-main">
          <LegacyCopyBanner />
          {renderModule()}
        </main>
      </div>
    </div>
  )
}

function App() {
  return <AppContent />
}

export default App
