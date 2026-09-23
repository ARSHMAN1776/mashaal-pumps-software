import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FC,
} from 'react'
import type {
  User,
  Customer,
  FuelSaleRecord,
  ShiftRecord,
  TankDipRecord,
  OmcInvoice,
  OmcPayment,
  DaybookEntry,
  CreditSaleSlip,
  CustomerRecovery,
  ExpenseRecord,
  BankTransaction,
  StationSettings,
  TariffRevisionLog,
  OwnerTransferRecord,
} from '../types'
import type { StationData } from '../data/mockData'
import { loadStationData, saveStationData, validateStationBackup, restoreStationBackup } from '../services/storage'
import { authenticate, saveSession, getSession, clearSession } from '../services/auth'
import {
  checkCloudConnection,
  fetchStationFromCloud,
  saveStationToCloud,
  subscribeToStationChanges,
  syncRelationalRecord,
  type CloudStatus,
} from '../services/supabase'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AppContextType {
  currentUser: User | null
  activeSiteId: 'SITE-01' | 'SITE-02' | null
  isSiteLoggedIn: boolean
  activeModule: string
  activeSiteData: StationData
  allSitesData: { 'SITE-01': StationData; 'SITE-02': StationData }
  loginError: string | null

  // Auth
  login: (username: string, password: string, keepSignedIn: boolean) => boolean
  logout: () => void
  selectSite: (siteId: 'SITE-01' | 'SITE-02') => void
  exitSite: () => void
  setActiveModule: (module: string) => void

  // Fuel sales
  addFuelSale: (sale: Omit<FuelSaleRecord, 'id'>) => void
  closeShift: (shift: Omit<ShiftRecord, 'id'>) => void

  // Tank dips
  addTankDip: (dip: Omit<TankDipRecord, 'id'>) => void

  // OMC
  addOmcInvoice: (inv: Omit<OmcInvoice, 'id'>) => void
  addOmcPayment: (pay: Omit<OmcPayment, 'id'>) => void

  // Daybook
  addDaybookEntry: (entry: Omit<DaybookEntry, 'id'>) => void

  // Customers
  addCustomer: (customer: Omit<Customer, 'id' | 'siteId'>) => void
  addCreditSlip: (slip: Omit<CreditSaleSlip, 'id'>) => void
  addCustomerRecovery: (rec: Omit<CustomerRecovery, 'id'>) => void

  // Expenses
  addExpense: (exp: Omit<ExpenseRecord, 'id'>) => void

  // Staff
  updateStaffAdvance: (staffId: string, amount: number) => void
  updateStaffStatus: (staffId: string, status: 'On Duty' | 'Off Duty' | 'On Leave') => void

  // Lubricants
  updateLubricantStock: (productId: string, quantitySold: number) => void

  // Bank
  addBankDeposit: (deposit: {
    bankId: string
    amount: number
    slipNo: string
    description: string
  }) => void

  // Suppliers
  paySupplier: (supplierId: string, amount: number) => void

  // Settings
  updateSettings: (settings: StationSettings) => void

  // Backup
  exportBackup: () => void
  importBackup: (fileContent: string) => { success: boolean; message: string; siteId?: string }

  // OGRA Tariff Wizard
  applyOgraPriceChange: (params: {
    newRates: { 'PMG Super': number; 'HSD Diesel': number; 'Hi-Octane': number }
    effectiveDate: string
    notificationNo?: string
    notes?: string
  }) => TariffRevisionLog | null

  // Owner Transfers & Capital Distributions
  addOwnerTransfer: (transfer: Omit<OwnerTransferRecord, 'id'>) => void

  // Cloud Sync
  cloudStatus: CloudStatus
  refreshCloudSync: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

const AppContext = createContext<AppContextType | undefined>(undefined)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // ── Auth / navigation state ────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [activeSiteId, setActiveSiteId] = useState<'SITE-01' | 'SITE-02' | null>(null)
  const [isSiteLoggedIn, setIsSiteLoggedIn] = useState<boolean>(false)
  const [activeModule, setActiveModule] = useState<string>('dashboard')
  const [loginError, setLoginError] = useState<string | null>(null)

  // ── Station data (both sites loaded from localStorage) ─────────────────
  const [stations, setStations] = useState<{ 'SITE-01': StationData; 'SITE-02': StationData }>(
    () => ({
      'SITE-01': loadStationData('SITE-01'),
      'SITE-02': loadStationData('SITE-02'),
    })
  )

  // ── Cloud status state ──────────────────────────────────────────────────
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>({
    connected: false,
    tableExists: false,
    lastSyncedAt: null,
  })

  // ── Initial cloud sync and real-time listeners ─────────────────────────
  const refreshCloudSync = useCallback(async () => {
    try {
      const status = await checkCloudConnection()
      setCloudStatus(status)
      if (status.connected && status.tableExists) {
        const [site1Cloud, site2Cloud] = await Promise.all([
          fetchStationFromCloud('SITE-01'),
          fetchStationFromCloud('SITE-02'),
        ])
        if (site1Cloud || site2Cloud) {
          setStations((prev) => ({
            'SITE-01': site1Cloud || prev['SITE-01'],
            'SITE-02': site2Cloud || prev['SITE-02'],
          }))
        }
      }
    } catch (err) {
      console.warn('[CloudSync] Check failed:', err)
    }
  }, [])

  useEffect(() => {
    refreshCloudSync()

    const unsub1 = subscribeToStationChanges('SITE-01', (cloudData) => {
      setStations((prev) => ({ ...prev, 'SITE-01': cloudData }))
      setCloudStatus((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }))
    })

    const unsub2 = subscribeToStationChanges('SITE-02', (cloudData) => {
      setStations((prev) => ({ ...prev, 'SITE-02': cloudData }))
      setCloudStatus((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }))
    })

    return () => {
      unsub1()
      unsub2()
    }
  }, [refreshCloudSync])

  // ── Persist station data locally and to cloud ────────────────────────────
  useEffect(() => {
    saveStationData('SITE-01', stations['SITE-01'])
    saveStationToCloud('SITE-01', stations['SITE-01']).then((saved) => {
      if (saved) {
        setCloudStatus((prev) => ({ ...prev, connected: true, tableExists: true, lastSyncedAt: new Date().toISOString() }))
      }
    }).catch(() => {})
  }, [stations['SITE-01']])

  useEffect(() => {
    saveStationData('SITE-02', stations['SITE-02'])
    saveStationToCloud('SITE-02', stations['SITE-02']).then((saved) => {
      if (saved) {
        setCloudStatus((prev) => ({ ...prev, connected: true, tableExists: true, lastSyncedAt: new Date().toISOString() }))
      }
    }).catch(() => {})
  }, [stations['SITE-02']])

  // ── Computed: active site data ──────────────────────────────────────────
  const activeSiteData = stations[activeSiteId || 'SITE-01']

  // ── Helper: mutate only the active station ──────────────────────────────
  const updateActiveStation = useCallback(
    (updater: (prev: StationData) => StationData) => {
      if (!activeSiteId) return
      setStations((prev) => ({
        ...prev,
        [activeSiteId]: updater(prev[activeSiteId]),
      }))
    },
    [activeSiteId]
  )

  // ── Helper: get running daybook balance for active station ──────────────
  const getDaybookBalance = useCallback(
    (stationData: StationData): number => {
      const db = stationData.daybook
      return db.length > 0 ? db[db.length - 1].balanceAfter : 0
    },
    []
  )

  // =========================================================================
  // Auth actions
  // =========================================================================

  /**
   * Validate credentials and sign the user in.
   * Returns true on success, false on failure (with loginError set).
   */
  const login = useCallback(
    (username: string, password: string, keepSignedIn: boolean): boolean => {
      if (!activeSiteId) return false

      const user = authenticate(activeSiteId, username, password)
      if (!user) {
        setLoginError('Invalid username or password. Please try again.')
        return false
      }

      setLoginError(null)
      setCurrentUser(user)
      setIsSiteLoggedIn(true)
      setActiveModule(user.role === 'owner' ? 'owner-portal' : 'dashboard')

      if (keepSignedIn) {
        saveSession(activeSiteId, user)
      } else {
        clearSession(activeSiteId)
      }

      return true
    },
    [activeSiteId]
  )

  const logout = useCallback(() => {
    if (activeSiteId) clearSession(activeSiteId)
    setCurrentUser(null)
    setIsSiteLoggedIn(false)
    setActiveSiteId(null)
    setActiveModule('dashboard')
    setLoginError(null)
  }, [activeSiteId])

  const selectSite = useCallback((siteId: 'SITE-01' | 'SITE-02') => {
    // Strict Data Isolation: If already logged into a station, cannot switch to another station without logging out
    if (isSiteLoggedIn && activeSiteId && activeSiteId !== siteId) {
      console.warn(`[Data Isolation Guard] Cross-access blocked: Cannot switch from ${activeSiteId} to ${siteId} while active session is running.`)
      return
    }

    setActiveSiteId(siteId)
    setLoginError(null)

    // Check for a saved session — if found, verify site access and restore it
    const savedUser = getSession(siteId)
    if (savedUser && savedUser.stationAccess?.includes(siteId)) {
      setCurrentUser(savedUser)
      setIsSiteLoggedIn(true)
      setActiveModule(savedUser.role === 'owner' ? 'owner-portal' : 'dashboard')
    } else {
      setCurrentUser(null)
      setIsSiteLoggedIn(false)
      setActiveModule('dashboard')
    }
  }, [isSiteLoggedIn, activeSiteId])

  const exitSite = useCallback(() => {
    setActiveSiteId(null)
    setIsSiteLoggedIn(false)
    setCurrentUser(null)
    setActiveModule('dashboard')
    setLoginError(null)
  }, [])

  // =========================================================================
  // Fuel Sales
  // =========================================================================

  const addFuelSale = useCallback(
    (sale: Omit<FuelSaleRecord, 'id'>) => {
      const id = `FS-${Date.now()}`
      updateActiveStation((station) => ({
        ...station,
        fuelSales: [{ ...sale, id }, ...station.fuelSales],
      }))
      if (activeSiteId) {
        syncRelationalRecord('fuel_sales', {
          id,
          site_id: activeSiteId,
          date: sale.date,
          shift: sale.shiftId,
          nozzle_id: sale.nozzleId,
          dispenser_no: sale.dispenserNo,
          nozzle_no: sale.nozzleNo,
          fuel_type: sale.fuelType,
          opening_meter: sale.openingMeter,
          closing_meter: sale.closingMeter,
          testing_liters: sale.testingLiters,
          liters_sold: sale.netLiters,
          rate: sale.ratePerLiter,
          amount: sale.totalAmount,
          recorded_by: sale.cashierName,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  const closeShift = useCallback(
    (shift: Omit<ShiftRecord, 'id'>) => {
      updateActiveStation((station) => ({
        ...station,
        shifts: [{ ...shift, id: `SH-${Date.now()}` }, ...station.shifts],
      }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Tank Dips
  // =========================================================================

  const addTankDip = useCallback(
    (dip: Omit<TankDipRecord, 'id'>) => {
      const id = `DIP-${Date.now()}`
      updateActiveStation((station) => {
        const updatedTanks = station.tanks.map((t) =>
          t.id === dip.tankId
            ? { ...t, currentLiters: dip.closingPhysicalLiters, currentDipMm: dip.closingDipMm, lastUpdated: 'Just now' }
            : t
        )
        return {
          ...station,
          tankDips: [{ ...dip, id }, ...station.tankDips],
          tanks: updatedTanks,
        }
      })
      if (activeSiteId) {
        syncRelationalRecord('tank_dips', {
          id,
          site_id: activeSiteId,
          date: dip.date,
          tank_id: dip.tankId,
          tank_no: dip.tankNo,
          fuel_type: dip.fuelType,
          morning_dip_mm: dip.morningDipMm,
          morning_liters: dip.morningLiters,
          decanted_liters: dip.decantedLiters,
          dispensed_liters: dip.dispensedLiters,
          book_stock_liters: dip.bookStockLiters,
          closing_dip_mm: dip.closingDipMm,
          closing_physical_liters: dip.closingPhysicalLiters,
          variance_liters: dip.varianceLiters,
          water_dip_mm: dip.waterDipMm,
          inspector: dip.inspector,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  // =========================================================================
  // OMC Ledger — BUG FIX: addOmcPayment now updates invoice paidAmount + status
  // =========================================================================

  const addOmcInvoice = useCallback(
    (inv: Omit<OmcInvoice, 'id'>) => {
      updateActiveStation((station) => ({
        ...station,
        omcInvoices: [{ ...inv, id: `OMC-INV-${Date.now()}` }, ...station.omcInvoices],
      }))
    },
    [updateActiveStation]
  )

  const addOmcPayment = useCallback(
    (pay: Omit<OmcPayment, 'id'>) => {
      updateActiveStation((station) => {
        // Update the matching invoice's paidAmount and paymentStatus
        const updatedInvoices = station.omcInvoices.map((inv) => {
          if (inv.invoiceNo === pay.invoiceNo) {
            const newPaidAmount = inv.paidAmount + pay.amount
            const paymentStatus: OmcInvoice['paymentStatus'] =
              newPaidAmount >= inv.totalAmount
                ? 'Paid'
                : newPaidAmount > 0
                ? 'Partial'
                : 'Pending'
            return { ...inv, paidAmount: newPaidAmount, paymentStatus }
          }
          return inv
        })

        return {
          ...station,
          omcPayments: [{ ...pay, id: `PAY-${Date.now()}` }, ...station.omcPayments],
          omcInvoices: updatedInvoices,
        }
      })
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Daybook — BUG FIX: compute balanceAfter from current running balance
  // =========================================================================

  const addDaybookEntry = useCallback(
    (entry: Omit<DaybookEntry, 'id'>) => {
      const id = `DB-${Date.now()}`
      updateActiveStation((station) => {
        const runningBalance = getDaybookBalance(station)
        const balanceAfter =
          entry.balanceAfter !== 0
            ? entry.balanceAfter
            : runningBalance + entry.cashIn - entry.cashOut

        const newEntry: DaybookEntry = {
          ...entry,
          id,
          balanceAfter,
        }
        return {
          ...station,
          daybook: [...station.daybook, newEntry],
        }
      })
      if (activeSiteId) {
        syncRelationalRecord('daybook_vouchers', {
          id,
          site_id: activeSiteId,
          date: entry.date,
          time: entry.time,
          particulars: entry.particulars,
          category: entry.category,
          cash_in: entry.cashIn,
          cash_out: entry.cashOut,
          balance_after: entry.balanceAfter,
          reference_no: entry.referenceNo,
          handled_by: entry.handledBy,
        })
      }
    },
    [updateActiveStation, getDaybookBalance, activeSiteId]
  )

  // =========================================================================
  // Customers
  // =========================================================================

  const addCreditSlip = useCallback(
    (slip: Omit<CreditSaleSlip, 'id'>) => {
      const id = `CS-${Date.now()}`
      updateActiveStation((station) => {
        const updatedCustomers = station.customers.map((c) =>
          c.id === slip.customerId ? { ...c, currentBalance: c.currentBalance + slip.totalAmount } : c
        )
        return {
          ...station,
          creditSlips: [{ ...slip, id }, ...station.creditSlips],
          customers: updatedCustomers,
        }
      })
      if (activeSiteId) {
        syncRelationalRecord('credit_fuel_slips', {
          id,
          slip_no: slip.slipNo,
          site_id: activeSiteId,
          date: slip.date,
          customer_id: slip.customerId,
          customer_name: slip.customerName,
          vehicle_no: slip.vehicleNo,
          driver_name: slip.driverName,
          fuel_type: slip.fuelType,
          liters: slip.liters,
          rate: slip.rate,
          total_amount: slip.totalAmount,
          authorized_by: slip.authorizedBy,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  const addCustomer = useCallback(
    (customer: Omit<Customer, 'id' | 'siteId'>) => {
      const id = `CUST-${Date.now().toString().slice(-4)}`
      updateActiveStation((station) => {
        const newCust: Customer = {
          ...customer,
          id,
          siteId: station.siteInfo.id,
        }
        return {
          ...station,
          customers: [newCust, ...station.customers],
        }
      })
      if (activeSiteId) {
        syncRelationalRecord('customers', {
          id,
          site_id: activeSiteId,
          name: customer.name,
          business_name: customer.businessName,
          phone: customer.phone,
          vehicle_numbers: customer.vehicleNumbers,
          credit_limit: customer.creditLimit,
          current_balance: customer.currentBalance,
          status: customer.status,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  const addCustomerRecovery = useCallback(
    (rec: Omit<CustomerRecovery, 'id'>) => {
      const id = `REC-${Date.now()}`
      updateActiveStation((station) => {
        const updatedCustomers = station.customers.map((c) =>
          c.id === rec.customerId
            ? { ...c, currentBalance: Math.max(0, c.currentBalance - rec.amount) }
            : c
        )
        return {
          ...station,
          recoveries: [{ ...rec, id }, ...station.recoveries],
          customers: updatedCustomers,
        }
      })
      if (activeSiteId) {
        syncRelationalRecord('customer_recoveries', {
          id,
          receipt_no: rec.receiptNo,
          site_id: activeSiteId,
          date: rec.date,
          customer_id: rec.customerId,
          customer_name: rec.customerName,
          payment_method: rec.paymentMethod,
          amount: rec.amount,
          reference_no: rec.referenceNo,
          received_by: rec.receivedBy,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  // =========================================================================
  // Expenses
  // =========================================================================

  const addExpense = useCallback(
    (exp: Omit<ExpenseRecord, 'id'>) => {
      updateActiveStation((station) => ({
        ...station,
        expenses: [{ ...exp, id: `EXP-${Date.now()}` }, ...station.expenses],
      }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Staff — NEW: persist advances and status through AppContext
  // =========================================================================

  const updateStaffAdvance = useCallback(
    (staffId: string, amount: number) => {
      updateActiveStation((station) => ({
        ...station,
        staff: station.staff.map((s) =>
          s.id === staffId ? { ...s, currentAdvances: s.currentAdvances + amount } : s
        ),
      }))
    },
    [updateActiveStation]
  )

  const updateStaffStatus = useCallback(
    (staffId: string, status: 'On Duty' | 'Off Duty' | 'On Leave') => {
      updateActiveStation((station) => ({
        ...station,
        staff: station.staff.map((s) => (s.id === staffId ? { ...s, status } : s)),
      }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Lubricants — NEW: persist stock deductions through AppContext
  // =========================================================================

  const updateLubricantStock = useCallback(
    (productId: string, quantitySold: number) => {
      updateActiveStation((station) => ({
        ...station,
        lubricants: station.lubricants.map((p) =>
          p.id === productId
            ? { ...p, stockCans: Math.max(0, p.stockCans - quantitySold) }
            : p
        ),
      }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Bank Sheet — NEW: persist cash deposits to bank account + transaction log
  // =========================================================================

  const addBankDeposit = useCallback(
    (dep: { bankId: string; amount: number; slipNo: string; description: string }) => {
      updateActiveStation((station) => {
        const targetBank = station.bankAccounts.find((b) => b.id === dep.bankId)
        const balanceAfter = (targetBank?.currentBalance || 0) + dep.amount

        const updatedBanks = station.bankAccounts.map((b) =>
          b.id === dep.bankId ? { ...b, currentBalance: balanceAfter } : b
        )

        const newTx: BankTransaction = {
          id: `BTX-${Date.now()}`,
          bankId: dep.bankId,
          date: new Date().toISOString().split('T')[0],
          type: 'Deposit',
          amount: dep.amount,
          depositSlipNo: dep.slipNo,
          description: dep.description,
          balanceAfter,
        }

        return {
          ...station,
          bankAccounts: updatedBanks,
          bankTransactions: [newTx, ...station.bankTransactions],
        }
      })
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Owner Transfers — Transfer station profits to owner's personal bank account
  // =========================================================================

  const addOwnerTransfer = useCallback(
    (transfer: Omit<OwnerTransferRecord, 'id'>) => {
      const id = `OTX-${Date.now()}`
      updateActiveStation((station) => {
        let updatedBanks = station.bankAccounts
        let newBankTxs = station.bankTransactions

        const targetBank = station.bankAccounts.find((b) => b.id === transfer.bankId)
        if (targetBank) {
          const balanceAfter = Math.max(0, targetBank.currentBalance - transfer.amount)
          updatedBanks = station.bankAccounts.map((b) =>
            b.id === transfer.bankId ? { ...b, currentBalance: balanceAfter } : b
          )
          const newTx: BankTransaction = {
            id: `BTX-${Date.now()}`,
            bankId: transfer.bankId,
            date: transfer.date || new Date().toISOString().split('T')[0],
            type: 'Owner Transfer',
            amount: transfer.amount,
            description: `Owner Bank Transfer to ${transfer.bankName} (${transfer.accountNumber})`,
            balanceAfter,
          }
          newBankTxs = [newTx, ...station.bankTransactions]
        }

        const newTransfer: OwnerTransferRecord = {
          ...transfer,
          id,
        }

        return {
          ...station,
          bankAccounts: updatedBanks,
          bankTransactions: newBankTxs,
          ownerTransfers: [newTransfer, ...(station.ownerTransfers || [])],
        }
      })

      if (activeSiteId) {
        syncRelationalRecord('owner_transfers', {
          id,
          site_id: activeSiteId,
          date: transfer.date,
          amount: transfer.amount,
          bank_id: transfer.bankId,
          bank_name: transfer.bankName,
          account_title: transfer.accountTitle,
          account_number: transfer.accountNumber,
          reference_no: transfer.referenceNo,
          status: transfer.status || 'Completed',
          notes: transfer.notes || '',
          transferred_by: transfer.transferredBy,
        })
      }
    },
    [updateActiveStation, activeSiteId]
  )

  // =========================================================================
  // Suppliers — NEW: persist vendor payments
  // =========================================================================

  const paySupplier = useCallback(
    (supplierId: string, amount: number) => {
      updateActiveStation((station) => ({
        ...station,
        suppliers: station.suppliers.map((s) =>
          s.id === supplierId ? { ...s, balanceDue: Math.max(0, s.balanceDue - amount) } : s
        ),
      }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Settings
  // =========================================================================

  const updateSettings = useCallback(
    (settings: StationSettings) => {
      updateActiveStation((station) => ({ ...station, settings }))
    },
    [updateActiveStation]
  )

  // =========================================================================
  // Backup Export — NEW: downloads station data as a JSON file
  // =========================================================================

  const exportBackup = useCallback(() => {
    if (!activeSiteId) return
    const data = stations[activeSiteId]
    const payload = {
      exportedAt: new Date().toISOString(),
      siteId: activeSiteId,
      siteName: data.siteInfo.name,
      data,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mashaal-backup-${activeSiteId}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [activeSiteId, stations])

  // =========================================================================
  // Backup Import — Restores database from a validated JSON backup file
  // =========================================================================

  const importBackup = useCallback((fileContent: string) => {
    const validation = validateStationBackup(fileContent)
    if (!validation.valid || !validation.data || !validation.siteId) {
      return { success: false, message: validation.error || 'Invalid backup file structure.' }
    }

    const targetSiteId = validation.siteId
    setStations((prev) => ({
      ...prev,
      [targetSiteId]: validation.data!,
    }))
    restoreStationBackup(targetSiteId, validation.data!)

    return {
      success: true,
      siteId: targetSiteId,
      message: `Successfully restored ${validation.siteName} (${targetSiteId}) database archive.`,
    }
  }, [])

  // =========================================================================
  // OGRA Tariff Revision Wizard — Automated Midnight Price Change & Gain/Loss
  // =========================================================================

  const applyOgraPriceChange = useCallback(
    (params: {
      newRates: { 'PMG Super': number; 'HSD Diesel': number; 'Hi-Octane': number }
      effectiveDate: string
      notificationNo?: string
      notes?: string
    }) => {
      if (!activeSiteId) return null
      const currentSite = stations[activeSiteId]
      const oldRates = { ...currentSite.settings.rates }
      const newRates = params.newRates

      // Calculate instantaneous stock gain/loss across all underground tanks
      const tankSnapshots = currentSite.tanks.map((tank) => {
        const fuelType = tank.fuelType
        const oldR = oldRates[fuelType] || 0
        const newR = newRates[fuelType] || oldR
        const diff = newR - oldR
        const gainLossAmount = Math.round(tank.currentLiters * diff)

        return {
          tankNo: tank.tankNo,
          fuelType,
          litersAtRevision: tank.currentLiters,
          oldRate: oldR,
          newRate: newR,
          rateDiff: diff,
          gainLossAmount,
        }
      })

      const netInventoryGainLoss = tankSnapshots.reduce((sum, t) => sum + t.gainLossAmount, 0)

      const revisionLog: TariffRevisionLog = {
        id: `REV-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        effectiveDate: params.effectiveDate || new Date().toISOString(),
        notificationNo: params.notificationNo || `OGRA/NOTIF/${new Date().toISOString().split('T')[0]}`,
        oldRates,
        newRates,
        tankSnapshots,
        netInventoryGainLoss,
        revisedBy: currentUser?.name || 'Authorized Manager',
        notes: params.notes || 'Fortnightly OGRA price revision applied.',
      }

      // Update settings rates, nozzle rates, and tariffHistory
      updateActiveStation((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          rates: newRates,
        },
        nozzles: prev.nozzles.map((nozzle) => ({
          ...nozzle,
          ratePerLiter: newRates[nozzle.fuelType] ?? nozzle.ratePerLiter,
        })),
        tariffHistory: [revisionLog, ...(prev.tariffHistory || [])],
      }))

      return revisionLog
    },
    [activeSiteId, stations, currentUser, updateActiveStation]
  )

  // =========================================================================
  // Context value
  // =========================================================================

  // ── Authorized Station Data Filter (Strict Company Isolation) ───────────
  const authorizedSitesData = {
    'SITE-01': (!isSiteLoggedIn || activeSiteId === 'SITE-01' || currentUser?.stationAccess?.includes('SITE-01'))
      ? stations['SITE-01']
      : { ...stations['SITE-01'], fuelSales: [], expenses: [], daybook: [], creditSlips: [], recoveries: [], omcInvoices: [], bankTransactions: [], ownerTransfers: [] },
    'SITE-02': (!isSiteLoggedIn || activeSiteId === 'SITE-02' || currentUser?.stationAccess?.includes('SITE-02'))
      ? stations['SITE-02']
      : { ...stations['SITE-02'], fuelSales: [], expenses: [], daybook: [], creditSlips: [], recoveries: [], omcInvoices: [], bankTransactions: [], ownerTransfers: [] },
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        activeSiteId,
        isSiteLoggedIn,
        activeModule,
        activeSiteData,
        allSitesData: authorizedSitesData,
        loginError,
        login,
        logout,
        selectSite,
        exitSite,
        setActiveModule,
        addFuelSale,
        closeShift,
        addTankDip,
        addOmcInvoice,
        addOmcPayment,
        addDaybookEntry,
        addCustomer,
        addCreditSlip,
        addCustomerRecovery,
        addExpense,
        updateStaffAdvance,
        updateStaffStatus,
        updateLubricantStock,
        addBankDeposit,
        addOwnerTransfer,
        paySupplier,
        updateSettings,
        exportBackup,
        importBackup,
        applyOgraPriceChange,
        cloudStatus,
        refreshCloudSync,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
