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

export const AppContent: React.FC = () => {
  const { activeSiteId, isSiteLoggedIn, activeModule, activeSiteData, currentUser } = useApp()

  // 1. FIRST: Select Site (Site 1 vs Site 2)
  if (!activeSiteId) {
    return <SiteSelectView />
  }

  // 2. SECOND: Login specifically for the chosen site's manager/staff
  if (!isSiteLoggedIn) {
    return <LoginView />
  }

  // 3. Inside active site: Render Navbar, Sidebar, and the active module
  const renderModule = () => {
    const isCashier = currentUser?.role === 'cashier'

    // Cashier role guards: prevent unauthorized access to sensitive views
    if (isCashier && ['owner-portal', 'owner-financials', 'bank-sheet', 'settings', 'reports', 'omc-ledger', 'staff', 'suppliers'].includes(activeModule)) {
      return <FuelSalesView />
    }

    switch (activeModule) {
      case 'owner-portal':
        return <OwnerPortalView />
      case 'owner-financials':
        return <OwnerFinancialView />
      case 'dashboard':
        return currentUser?.role === 'owner' ? <OwnerPortalView /> : <DashboardView />
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
        return currentUser?.role === 'owner' ? <OwnerPortalView /> : <DashboardView />
    }
  }

  const themeClass = activeSiteData?.siteInfo?.brand === 'TOTAL PARCO' || activeSiteId === 'SITE-01' ? 'theme-parco' : 'theme-pso'

  return (
    <div className={`app-shell-root ${themeClass}`}>
      <Sidebar />
      <div className="app-workspace-layout">
        <Navbar />
        <main className="app-workspace-main">
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
