import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import {
  PlusIcon,
  PrinterIcon,
  CheckCircleIcon,
  XIcon,
  SearchIcon,
  CashIcon,
  WhatsAppIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import type { FuelType, CreditSaleSlip, Customer, CustomerRecovery } from '../../types'

// Normalizes Pakistani phone numbers (e.g. 0300-8671234, +92 300 8671234 -> 923008671234)
const normalizePakistaniPhone = (phone: string): string => {
  let cleaned = (phone || '').replace(/\D/g, '')
  if (cleaned.startsWith('03')) {
    cleaned = '92' + cleaned.substring(1)
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '92' + cleaned
  } else if (cleaned.startsWith('0092')) {
    cleaned = cleaned.substring(2)
  }
  return cleaned
}

// Builds formatted running ledger statement for WhatsApp (Total Parco Red Theme vs PSO Green Theme)
const buildWhatsAppCustomerStatementText = (
  customer: Customer,
  siteInfo: { name: string; location: string; brand: string; phone: string; managerName: string },
  bankAccount: { bankName: string; accountTitle: string; accountNumber: string; branch: string } | undefined,
  recentSlips: CreditSaleSlip[],
  recentRecoveries: CustomerRecovery[]
): string => {
  const isParco = siteInfo.brand === 'TOTAL PARCO'
  const todayStr = new Date().toISOString().split('T')[0]
  const totalBilled = recentSlips.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalPaid = recentRecoveries.reduce((sum, r) => sum + r.amount, 0)

  if (isParco) {
    return [
      `🔴 *TOTAL PARCO - MASHAAL PETROLEUM* 🔴`,
      `📑 *COMMERCIAL FLEET RUNNING STATEMENT*`,
      `══════════════════════════`,
      `🏢 *Station:* ${siteInfo.name}`,
      `📍 *Location:* ${siteInfo.location}`,
      `👤 *Transporter Account:* ${customer.businessName}`,
      `📞 *Client Contact:* ${customer.phone}`,
      `📅 *Statement Date:* ${todayStr}`,
      `══════════════════════════`,
      `🚛 *REGISTERED FLEET VEHICLES:*`,
      customer.vehicleNumbers.map((v) => `• ${v}`).join('  |  '),
      `══════════════════════════`,
      `⛽ *RECENT FLEET FUEL DISPATCHES:*`,
      ...(recentSlips.length === 0
        ? ['• No recent dispatches logged.']
        : recentSlips.slice(-3).map((s) => `• ${s.date} | ${s.vehicleNo} | ${s.fuelType} (${s.liters}L) = Rs. ${Math.round(s.totalAmount).toLocaleString()}`)),
      `══════════════════════════`,
      `📊 *FINANCIAL LEDGER SUMMARY:*`,
      `🔹 *Total Period Fuel Billed:* Rs. ${Math.round(totalBilled).toLocaleString()} PKR`,
      `🔹 *Total Recoveries / Paid:* Rs. ${Math.round(totalPaid).toLocaleString()} PKR`,
      `💰 *NET OUTSTANDING BALANCE:* Rs. ${Math.round(customer.currentBalance).toLocaleString()} PKR`,
      `💳 *Approved Credit Limit:* Rs. ${customer.creditLimit.toLocaleString()} PKR`,
      `══════════════════════════`,
      `🏦 *OFFICIAL BANK REMITTANCE ACCOUNT:*`,
      `🏛️ *Bank:* ${bankAccount?.bankName || 'Habib Bank Limited (HBL)'}`,
      `🏷️ *Title:* ${bankAccount?.accountTitle || 'Mashaal Petroleum Services'}`,
      `🔢 *Account #:* ${bankAccount?.accountNumber || '01847900192803'}`,
      `🏢 *Branch:* ${bankAccount?.branch || 'Khanpur Road Branch RYK'}`,
      `══════════════════════════`,
      `✍️ *Station Manager:* ${siteInfo.managerName} (${siteInfo.phone})`,
      `🔐 *Voucher Hash:* TP-STMT-${customer.id}-${todayStr}-VERIFIED`,
      `✅ *Total Parco Pakistan • Energy for a Brighter Tomorrow*`,
    ].join('\n')
  }

  // PSO Green Theme
  return [
    `🟢 *PAKISTAN STATE OIL (PSO) - MASHAAL* 🟢`,
    `📑 *COMMERCIAL FLEET RUNNING STATEMENT*`,
    `══════════════════════════`,
    `🏢 *Station:* ${siteInfo.name}`,
    `📍 *Location:* ${siteInfo.location}`,
    `👤 *Transporter Account:* ${customer.businessName}`,
    `📞 *Client Contact:* ${customer.phone}`,
    `📅 *Statement Date:* ${todayStr}`,
    `══════════════════════════`,
    `🚛 *REGISTERED FLEET VEHICLES:*`,
    customer.vehicleNumbers.map((v) => `• ${v}`).join('  |  '),
    `══════════════════════════`,
    `⛽ *RECENT FLEET FUEL DISPATCHES:*`,
    ...(recentSlips.length === 0
      ? ['• No recent dispatches logged.']
      : recentSlips.slice(-3).map((s) => `• ${s.date} | ${s.vehicleNo} | ${s.fuelType} (${s.liters}L) = Rs. ${Math.round(s.totalAmount).toLocaleString()}`)),
    `══════════════════════════`,
    `📊 *FINANCIAL LEDGER SUMMARY:*`,
    `🔹 *Total Period Fuel Billed:* Rs. ${Math.round(totalBilled).toLocaleString()} PKR`,
    `🔹 *Total Recoveries / Paid:* Rs. ${Math.round(totalPaid).toLocaleString()} PKR`,
    `💰 *NET OUTSTANDING BALANCE:* Rs. ${Math.round(customer.currentBalance).toLocaleString()} PKR`,
    `💳 *Approved Credit Limit:* Rs. ${customer.creditLimit.toLocaleString()} PKR`,
    `══════════════════════════`,
    `🏦 *OFFICIAL BANK REMITTANCE ACCOUNT:*`,
    `🏛️ *Bank:* ${bankAccount?.bankName || 'MCB Bank Limited'}`,
    `🏷️ *Title:* ${bankAccount?.accountTitle || 'Mashaal PSO Station Lahore'}`,
    `🔢 *Account #:* ${bankAccount?.accountNumber || '10928471629001'}`,
    `🏢 *Branch:* ${bankAccount?.branch || 'Raiwind Road Branch Lahore'}`,
    `══════════════════════════`,
    `✍️ *Station Manager:* ${siteInfo.managerName} (${siteInfo.phone})`,
    `🔐 *Voucher Hash:* PSO-STMT-${customer.id}-${todayStr}-VERIFIED`,
    `✅ *Pakistan State Oil (PSO) • Fueling the Nation's Journey*`,
  ].join('\n')
}

// Builds formatted computerized receipt for WhatsApp (Parco Red Theme vs PSO Green Theme)
const buildWhatsAppSlipText = (
  slip: {
    slipNo: string
    date: string
    customerName: string
    vehicleNo: string
    driverName: string
    fuelType: string
    liters: number
    rate: number
    totalAmount: number
    authorizedBy: string
  },
  stationName: string,
  location: string,
  brand: string = 'TOTAL PARCO'
): string => {
  const isParco = brand === 'TOTAL PARCO'

  if (isParco) {
    return [
      `🔴 *TOTAL PARCO - MASHAAL PETROLEUM* 🔴`,
      `⛽ *OFFICIAL FORECOURT CREDIT VOUCHER*`,
      `══════════════════════════`,
      `🏢 *Station:* ${stationName}`,
      `📍 *Location:* ${location}`,
      `📄 *Voucher Slip #:* ${slip.slipNo}`,
      `📅 *Date & Shift:* ${slip.date} • Morning Shift`,
      `══════════════════════════`,
      `🚛 *COMMERCIAL FLEET ACCOUNT*`,
      `👤 *Transporter:* ${slip.customerName}`,
      `🚚 *Vehicle Reg #:* ${slip.vehicleNo}`,
      `👨‍✈️ *Authorized Driver:* ${slip.driverName}`,
      `══════════════════════════`,
      `⛽ *DISPENSER TRANSACTION DETAILS*`,
      `🔹 *Product:* ${slip.fuelType}`,
      `🔹 *Volume Dispensed:* ${slip.liters.toLocaleString()} Liters`,
      `🔹 *Official Tariff Rate:* Rs. ${slip.rate.toFixed(2)} / L`,
      `💰 *NET AMOUNT DUE:* Rs. ${Math.round(slip.totalAmount).toLocaleString()} PKR`,
      `══════════════════════════`,
      `✍️ *Authorized Incharge:* ${slip.authorizedBy}`,
      `🔐 *Voucher Hash:* TP-${slip.slipNo.replace(/[^0-9]/g, '') || '4011'}-VERIFIED`,
      `✅ *Total Parco Pakistan • Energy for a Brighter Tomorrow*`,
    ].join('\n')
  }

  // PSO Green Theme
  return [
    `🟢 *PAKISTAN STATE OIL (PSO) - MASHAAL* 🟢`,
    `⛽ *OFFICIAL FORECOURT CREDIT VOUCHER*`,
    `══════════════════════════`,
    `🏢 *Station:* ${stationName}`,
    `📍 *Location:* ${location}`,
    `📄 *Voucher Slip #:* ${slip.slipNo}`,
    `📅 *Date & Shift:* ${slip.date} • Morning Shift`,
    `══════════════════════════`,
    `🚛 *COMMERCIAL FLEET ACCOUNT*`,
    `👤 *Transporter:* ${slip.customerName}`,
    `🚚 *Vehicle Reg #:* ${slip.vehicleNo}`,
    `👨‍✈️ *Authorized Driver:* ${slip.driverName}`,
    `══════════════════════════`,
    `⛽ *DISPENSER TRANSACTION DETAILS*`,
    `🔹 *Product:* ${slip.fuelType}`,
    `🔹 *Volume Dispensed:* ${slip.liters.toLocaleString()} Liters`,
    `🔹 *Official Tariff Rate:* Rs. ${slip.rate.toFixed(2)} / L`,
    `💰 *NET AMOUNT DUE:* Rs. ${Math.round(slip.totalAmount).toLocaleString()} PKR`,
    `══════════════════════════`,
    `✍️ *Authorized Incharge:* ${slip.authorizedBy}`,
    `🔐 *Voucher Hash:* PSO-${slip.slipNo.replace(/[^0-9]/g, '') || '9021'}-VERIFIED`,
    `✅ *Pakistan State Oil (PSO) • Fueling the Nation's Journey*`,
  ].join('\n')
}

export const CustomersView: React.FC = () => {
  const { activeSiteData, addCustomer, addCreditSlip, addCustomerRecovery, currentUser } = useApp()
  const { customers, creditSlips, recoveries, settings, siteInfo, bankAccounts } = activeSiteData
  const isCashier = currentUser?.role === 'cashier'
  const isParco = siteInfo.brand === 'TOTAL PARCO'

  const [searchTerm, setSearchTerm] = useState('')
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false)
  const [creditSlipModalOpen, setCreditSlipModalOpen] = useState(false)
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)
  const [statementPrintOpen, setStatementPrintOpen] = useState(false)

  // Form states for New Customer Onboarding (Manager/Owner exclusive)
  const [newCustBusiness, setNewCustBusiness] = useState('')
  const [newCustOwner, setNewCustOwner] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustLimit, setNewCustLimit] = useState<number>(500000)
  const [newCustVehicles, setNewCustVehicles] = useState('')
  const [newCustOpeningBal, setNewCustOpeningBal] = useState<number>(0)

  // Form states for Credit Sale Slip
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '')
  const [vehicleNo, setVehicleNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('HSD Diesel')
  const [liters, setLiters] = useState<number>(100)
  const [recipientPhone, setRecipientPhone] = useState(customers[0]?.phone || '')
  const [authorizedBy] = useState(siteInfo.managerName)

  // Form states for Customer Recovery
  const [recoveryCustId, setRecoveryCustId] = useState(customers[0]?.id || '')
  const [recMethod, setRecMethod] = useState<'Cash' | 'Cheque' | 'Online Transfer'>('Cash')
  const [recAmount, setRecAmount] = useState<number>(50000)
  const [recRef, setRecRef] = useState('')
  const [receivedBy] = useState(siteInfo.managerName)

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || customers[0]
  const currentFuelRate = settings.rates[fuelType] || 276.45
  const slipAmount = liters * currentFuelRate

  const handleOpenCreditSlip = (customerId?: string) => {
    const targetId = customerId || customers[0]?.id || ''
    setSelectedCustomerId(targetId)
    const c = customers.find((cust) => cust.id === targetId)
    if (c) {
      if (c.vehicleNumbers.length > 0) {
        setVehicleNo(c.vehicleNumbers[0])
      }
      setRecipientPhone(c.phone || '')
    }
    setCreditSlipModalOpen(true)
  }

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId)
    const c = customers.find((cust) => cust.id === customerId)
    if (c) {
      if (c.vehicleNumbers.length > 0) {
        setVehicleNo(c.vehicleNumbers[0])
      }
      setRecipientPhone(c.phone || '')
    }
  }

  const handleOpenRecovery = (customerId?: string) => {
    const targetId = customerId || customers[0]?.id || ''
    setRecoveryCustId(targetId)
    if (targetId) {
      const c = customers.find((cust) => cust.id === targetId)
      if (c) {
        setRecAmount(Math.min(c.currentBalance, 100000))
      }
    }
    setRecoveryModalOpen(true)
  }

  const handleSaveNewCustomer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustBusiness.trim() || !newCustPhone.trim()) {
      alert('Please provide business name and phone number.')
      return
    }

    const vehicleList = newCustVehicles
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean)

    addCustomer({
      name: newCustOwner || newCustBusiness,
      businessName: newCustBusiness,
      phone: newCustPhone,
      creditLimit: Number(newCustLimit),
      currentBalance: Number(newCustOpeningBal),
      vehicleNumbers: vehicleList.length > 0 ? vehicleList : ['GENERAL-FLEET'],
      status: 'Active',
    })

    // Reset form
    setNewCustBusiness('')
    setNewCustOwner('')
    setNewCustPhone('')
    setNewCustLimit(500000)
    setNewCustVehicles('')
    setNewCustOpeningBal(0)
    setAddCustomerModalOpen(false)
  }

  const handleSendWhatsApp = (slip: CreditSaleSlip | any, phoneOverride?: string) => {
    const targetCust = customers.find((c) => c.id === slip.customerId || c.businessName === slip.customerName)
    const phone = phoneOverride || targetCust?.phone || ''
    const normalizedPhone = normalizePakistaniPhone(phone)
    const message = buildWhatsAppSlipText(slip, siteInfo.name, siteInfo.location, siteInfo.brand)
    const url = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const handleSendStatementWhatsApp = (customer: Customer) => {
    const custSlips = creditSlips.filter(
      (s) => s.customerId === customer.id || s.customerName === customer.businessName
    )
    const custRecoveries = recoveries.filter(
      (r) => r.customerId === customer.id || r.customerName === customer.businessName
    )
    const primaryBank = bankAccounts?.[0]
    const message = buildWhatsAppCustomerStatementText(
      customer,
      siteInfo,
      primaryBank,
      custSlips,
      custRecoveries
    )
    const normalizedPhone = normalizePakistaniPhone(customer.phone)
    const url = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const handleSaveCreditSlip = (e: React.FormEvent, sendWhatsApp: boolean = false) => {
    e.preventDefault()
    const slipPayload = {
      slipNo: `SLIP-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.businessName,
      vehicleNo,
      driverName,
      fuelType,
      liters,
      rate: currentFuelRate,
      totalAmount: slipAmount,
      authorizedBy,
    }
    addCreditSlip(slipPayload)
    setCreditSlipModalOpen(false)

    if (sendWhatsApp) {
      handleSendWhatsApp(slipPayload, recipientPhone)
    }
  }

  const handleSaveRecovery = (e: React.FormEvent) => {
    e.preventDefault()
    const targetCust = customers.find((c) => c.id === recoveryCustId) || customers[0]
    addCustomerRecovery({
      receiptNo: `RCP-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      customerId: targetCust.id,
      customerName: targetCust.businessName,
      paymentMethod: recMethod,
      amount: recAmount,
      referenceNo: recRef || 'Direct Collection',
      receivedBy,
    })
    setRecoveryModalOpen(false)
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  )

  const totalOutstandingCredit = customers.reduce((sum, c) => sum + c.currentBalance, 0)


  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">FLEET & CREDIT ACCOUNTS</span>
          <h2 className="page-heading">Customers & Credit Ledger</h2>
          <p className="page-sub">
            Commercial fleet clients, credit limits, daily fuel slips, and cash payment recoveries
            {isCashier && ' • 🔒 Cashier Mode: Customer credit limits locked by Station Policy'}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Credit Aging</span>
          </button>
          {!isCashier && (
            <button className="btn btn-outline" style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }} onClick={() => setAddCustomerModalOpen(true)}>
              <PlusIcon size={16} />
              <span>Register Fleet Transporter</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => handleOpenRecovery()}>
            <CashIcon size={16} />
            <span>Record Cash Recovery</span>
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenCreditSlip()}>
            <PlusIcon size={16} />
            <span>Issue Credit Fuel Slip</span>
          </button>
        </div>
      </div>

      {/* Module Operational Guide */}
      <ModuleGuide
        title="Commercial Fleet Credit & Recoveries Guide"
        urduTitle="ٹرانسپورٹ کھاتہ، ادھار ڈیزل پرچیاں اور وصولیوں کی رہنمائی"
        role="cashier"
        roleLabel="Cashier &amp; Manager"
        purpose="Issue computerized credit fuel slips to authorized transporter vehicles, track credit limits, receive debt settlements (recoveries), and dispatch WhatsApp running ledgers."
        steps={[
          {
            step: 1,
            title: 'Issue Credit Fuel (ادھار پرچی جاری کرنا)',
            detail: 'Click "Issue Credit Fuel Slip", pick Transporter Account, input Vehicle Registration # and Driver Name.',
            urdu: 'گاڑی نمبر، ڈرائیور کا نام اور لیٹر درج کر کے ادھار پرچی کاٹیں۔',
          },
          {
            step: 2,
            title: 'Instant WhatsApp Slip (واٹس ایپ پرچی کا ارسال)',
            detail: 'Click "Save & Send WhatsApp" to immediately send computerized fuel receipt to transporter owner\'s phone.',
            urdu: 'سیو کرتے ہی گاڑی مالک کے واٹس ایپ پر کمپیوٹرائزڈ بل فوری روانہ ہو جائے گا۔',
          },
          {
            step: 3,
            title: 'Record Payment Recovery (کھاتے کی وصولی)',
            detail: 'When transporter pays cash or cheque, click "Record Cash Recovery" and print the payment receipt.',
            urdu: 'جب گاہک نقد رقم یا چیک ادا کرے تو وصولی درج کر کے رسید پرنٹ کریں۔',
          },
          {
            step: 4,
            title: 'Running Ledger & Statements (کھاتہ کا مکمل ریکارڈ)',
            detail: 'Click "View Statement & WhatsApp" on any customer to inspect full debit/credit history and bank IBAN info.',
            urdu: 'گاہک کی مکمل ہسٹری اور بینک اکاؤنٹ تفصیلات کے ساتھ اسٹیٹمنٹ دیکھیں۔',
          },
        ]}
        criticalChecks={[
          'Always verify that the vehicle registration matches the client\'s authorized fleet list.',
          'If a customer exceeds their approved credit limit, obtain Manager authorization before dispensing.',
          'Customer cash recoveries automatically post to the station Daybook cash safe.',
        ]}
      />

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Active Credit Accounts</span>
          <strong className="kpi-cell-value">{customers.length} Accounts</strong>
          <span className="kpi-cell-sub">Fleet & industrial clients</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total Outstanding Balance</span>
          <strong className="kpi-cell-value text-gold">Rs {totalOutstandingCredit.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Current station receivables</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Today's Credit Slips Issued</span>
          <strong className="kpi-cell-value">
            Rs {creditSlips.reduce((acc, s) => acc + s.totalAmount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">{creditSlips.length} Slips signed</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Today's Recoveries Collected</span>
          <strong className="kpi-cell-value text-green">
            Rs {recoveries.reduce((acc, r) => acc + r.amount, 0).toLocaleString()}
          </strong>
          <span className="kpi-cell-sub">Cash & cheques cleared</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="table-search-bar">
        <div className="search-input-wrap">
          <SearchIcon size={18} color="#9c7728" />
          <input
            type="text"
            className="search-field"
            placeholder="Search by client name, transport company, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Credit Customer Directory</h3>
            <p className="surface-sub">Authorized commercial parties with active credit limits</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Customer &amp; Contact</th>
                <th>Registered Vehicles</th>
                <th>Credit Limit</th>
                <th>Current Balance</th>
                <th>Limit Utilization</th>
                <th>Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((cust) => {
                const utilPct = Math.round((cust.currentBalance / cust.creditLimit) * 100)
                const isOverLimit = cust.currentBalance >= cust.creditLimit

                return (
                  <tr key={cust.id}>
                    <td>
                      <strong style={{ fontSize: '12.5px' }}>{cust.businessName}</strong>
                      <div className="text-muted text-xs">Prop: {cust.name} • 📞 {cust.phone}</div>
                    </td>
                    <td>
                      <div className="vehicle-pills-list" style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', maxWidth: '140px' }}>
                        {cust.vehicleNumbers.map((v) => (
                          <span key={v} className="vehicle-pill" style={{ fontSize: '10px', padding: '1px 5px' }}>
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>Rs {cust.creditLimit.toLocaleString()}</td>
                    <td className="text-gold font-bold">Rs {cust.currentBalance.toLocaleString()}</td>
                    <td>
                      <div className="util-bar-wrap" style={{ width: '60px' }}>
                        <div
                          className={`util-bar-fill ${isOverLimit ? 'fill-danger' : 'fill-gold'}`}
                          style={{ width: `${Math.min(100, utilPct)}%` }}
                        />
                        <span className="util-text">{utilPct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${cust.status === 'Active' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10.5px', padding: '2px 6px' }}>
                        {cust.status}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '3px 7px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          onClick={() => handleOpenCreditSlip(cust.id)}
                          title="Issue Fuel Slip"
                        >
                          + Slip
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 7px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          onClick={() => handleOpenRecovery(cust.id)}
                          title="Record Payment"
                        >
                          Recover
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            backgroundColor: '#eff6ff',
                            borderColor: '#bfdbfe',
                            color: '#1d4ed8',
                            fontWeight: 600,
                            padding: '3px 7px',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          onClick={() => setStatementCustomer(cust)}
                          title="View Ledger Statement"
                        >
                          Statement
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Credit Slips & Quick WhatsApp Dispatch */}
      <div className="table-surface" style={{ marginTop: '24px' }}>
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WhatsAppIcon size={20} color="#15803d" />
              <span>Recent Credit Fuel Slips & Instant WhatsApp Dispatch</span>
            </h3>
            <p className="surface-sub">
              Instant computerized vouchers for commercial transport fleets (Al-Hafiz, Khanpur Sugar Mills, etc.). Click green button to dispatch directly to owner/manager on WhatsApp Web.
            </p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Slip # &amp; Date</th>
                <th>Client / Transport Fleet</th>
                <th>Vehicle &amp; Driver</th>
                <th>Product &amp; Volume</th>
                <th>Total Value</th>
                <th>Authorized By</th>
                <th className="col-actions">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {creditSlips.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#686256' }}>
                    No credit fuel slips issued yet today. Click "Issue Credit Fuel Slip" to start.
                  </td>
                </tr>
              ) : (
                creditSlips.slice().reverse().map((slip) => {
                  const cust = customers.find((c) => c.id === slip.customerId || c.businessName === slip.customerName)
                  return (
                    <tr key={slip.id}>
                      <td>
                        <strong>{slip.slipNo}</strong>
                        <div className="text-muted text-xs">{slip.date}</div>
                      </td>
                      <td>
                        <strong style={{ fontSize: '12.5px' }}>{slip.customerName}</strong>
                        {cust && <div className="text-muted text-xs">Ph: {cust.phone}</div>}
                      </td>
                      <td>
                        <strong>{slip.vehicleNo}</strong>
                        <div className="text-muted text-xs">{slip.driverName}</div>
                      </td>
                      <td>
                        <span className="category-tag" style={{ fontSize: '10.5px' }}>{slip.fuelType}</span>
                        <div style={{ fontSize: '11px', color: '#686256', marginTop: '2px' }}>
                          <strong>{slip.liters} L</strong> @ Rs {slip.rate.toFixed(2)}
                        </div>
                      </td>
                      <td>
                        <strong className="text-gold font-bold">Rs {Math.round(slip.totalAmount).toLocaleString()}</strong>
                      </td>
                      <td className="text-xs text-muted">{slip.authorizedBy}</td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn"
                          style={{
                            backgroundColor: '#ecfdf5',
                            borderColor: '#86efac',
                            color: '#15803d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleSendWhatsApp(slip, cust?.phone)}
                          title={`Send slip ${slip.slipNo} via WhatsApp`}
                        >
                          <WhatsAppIcon size={13} color="#15803d" />
                          <span>WhatsApp</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-Scroll Compact Add Fleet Customer Modal (Manager/Owner) */}
      {addCustomerModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddCustomerModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Register New Fleet Transporter</h3>
                <span className="modal-sub">Create authorized commercial credit account with approved limit &amp; vehicles</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setAddCustomerModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewCustomer} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Business / Transporter Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Al-Madina Goods Transport"
                    value={newCustBusiness}
                    onChange={(e) => setNewCustBusiness(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Proprietor / Contact Person</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Haji Munir Ahmed"
                    value={newCustOwner}
                    onChange={(e) => setNewCustOwner(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Phone # (for WhatsApp Computerized Slips)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0300-1234567"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Approved Credit Limit (PKR)</label>
                  <input
                    type="number"
                    step="10000"
                    className="form-input"
                    placeholder="500000"
                    value={newCustLimit}
                    onChange={(e) => setNewCustLimit(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Authorized Vehicle Numbers (Comma separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. TKA-992, LWO-4481, RYK-1290"
                    value={newCustVehicles}
                    onChange={(e) => setNewCustVehicles(e.target.value)}
                  />
                  <span style={{ fontSize: '10.5px', color: '#686256', marginTop: '2px', display: 'block' }}>
                    Cashiers can only issue slips to registered plate numbers.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Opening Balance Due (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={newCustOpeningBal}
                    onChange={(e) => setNewCustOpeningBal(Number(e.target.value))}
                  />
                  <span style={{ fontSize: '10.5px', color: '#686256', marginTop: '2px', display: 'block' }}>
                    Existing historical credit carried over (if any).
                  </span>
                </div>
              </div>

              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Authorized Limit</span>
                  <span className="calc-pill-val text-gold font-bold">Rs {newCustLimit.toLocaleString()}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Opening Due</span>
                  <span className="calc-pill-val">Rs {newCustOpeningBal.toLocaleString()}</span>
                </div>
                <div className="calc-pill-item highlight-green">
                  <span className="calc-pill-label">WhatsApp Status</span>
                  <span className="calc-pill-val">Enabled (Instant PDF/Text)</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAddCustomerModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Register Fleet Customer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zero-Scroll Compact Credit Slip Modal */}
      {creditSlipModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreditSlipModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Issue Credit Fuel Slip</h3>
                <span className="modal-sub">Authorized diesel or petrol taken on transporter credit account</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setCreditSlipModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={(e) => handleSaveCreditSlip(e, false)} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Customer / Fleet Account</label>
                  <select
                    className="form-input"
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} (Due: Rs {c.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Vehicle Registration #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="e.g. TKA-992 or Truck 14"
                    required
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Driver Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Driver who took fuel"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Fuel Product</label>
                  <select
                    className="form-input"
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value as FuelType)}
                  >
                    <option value="HSD Diesel">HSD Diesel (Rs {settings.rates['HSD Diesel']})</option>
                    <option value="PMG Super">PMG Super 92 (Rs {settings.rates['PMG Super']})</option>
                    <option value="Hi-Octane">Hi-Octane (Rs {settings.rates['Hi-Octane']})</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold text-gold">Liters Dispensed</label>
                  <input
                    type="number"
                    className="form-input"
                    value={liters}
                    onChange={(e) => setLiters(Number(e.target.value))}
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <WhatsAppIcon size={14} color="#15803d" />
                  <span>Transporter WhatsApp Number</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="e.g. 0300-8671234"
                />
              </div>

              {/* Inline Calculation Strip */}
              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Rate / Liter:</span>
                  <span className="calc-pill-val">Rs {currentFuelRate}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Fuel Liters:</span>
                  <span className="calc-pill-val text-green">{liters} L</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Current Balance:</span>
                  <span className="calc-pill-val text-gold">Rs {selectedCustomer?.currentBalance.toLocaleString()}</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Total Slip Value:</span>
                  <span className="calc-pill-val text-red">Rs {Math.round(slipAmount).toLocaleString()}</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setCreditSlipModalOpen(false)}>
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-secondary">
                    <CheckCircleIcon size={16} />
                    <span>Save Only</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ backgroundColor: '#15803d', borderColor: '#166534', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={(e) => {
                      if (!vehicleNo || !driverName) {
                        alert('Please fill Vehicle Registration and Driver Name before sending.')
                        return
                      }
                      handleSaveCreditSlip(e, true)
                    }}
                  >
                    <WhatsAppIcon size={15} color="#fff" />
                    <span>Save &amp; Send WhatsApp</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zero-Scroll Compact Customer Recovery Modal */}
      {recoveryModalOpen && (
        <div className="modal-backdrop" onClick={() => setRecoveryModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Customer Cash / Cheque Recovery</h3>
                <span className="modal-sub">Log cash settlement from fleet account into station daybook</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setRecoveryModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRecovery} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Customer Account</label>
                  <select
                    className="form-input"
                    value={recoveryCustId}
                    onChange={(e) => setRecoveryCustId(e.target.value)}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} (Outstanding: Rs {c.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="form-input"
                    value={recMethod}
                    onChange={(e) => setRecMethod(e.target.value as any)}
                  >
                    <option value="Cash">Physical Cash</option>
                    <option value="Cheque">Bank Cheque</option>
                    <option value="Online Transfer">Online / Raast Transfer</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label font-bold text-gold">Amount Received (PKR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={recAmount}
                    onChange={(e) => setRecAmount(Number(e.target.value))}
                    required
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Cheque / Reference Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={recRef}
                    onChange={(e) => setRecRef(e.target.value)}
                    placeholder="e.g. MCB-CHQ-18920 or Cash Desk"
                  />
                </div>
              </div>

              {/* Inline Calculation Strip */}
              {(() => {
                const targetCust = customers.find((c) => c.id === recoveryCustId) || customers[0]
                const balBefore = targetCust?.currentBalance || 0
                const balAfter = Math.max(0, balBefore - recAmount)
                return (
                  <div className="calc-preview-inline-strip">
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Outstanding Before:</span>
                      <span className="calc-pill-val text-red">Rs. {balBefore.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">Recovery Amount:</span>
                      <span className="calc-pill-val text-green">- Rs. {recAmount.toLocaleString()}</span>
                    </div>
                    <div className="calc-pill-item">
                      <span className="calc-pill-label">New Remaining Balance:</span>
                      <span className="calc-pill-val text-gold">Rs. {balAfter.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setRecoveryModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Save Recovery Receipt</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Aging Statement */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Customer Credit Aging & Outstanding Balances"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Client / Party</th>
              <th>Phone</th>
              <th>Credit Limit</th>
              <th>Outstanding Balance</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.businessName}</td>
                <td>{c.phone}</td>
                <td>Rs {c.creditLimit.toLocaleString()}</td>
                <td>Rs {c.currentBalance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Total Receivables:</span>
          <strong>Rs {totalOutstandingCredit.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>

      {/* Modal: Customer Ledger Statement & WhatsApp Dispatch */}
      {statementCustomer && (
        <div className="modal-backdrop" onClick={() => setStatementCustomer(null)}>
          <div
            className="modal-container"
            style={{ maxWidth: '850px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Commercial Fleet Running Statement</h3>
                <span className="modal-sub">{statementCustomer.businessName} (Prop: {statementCustomer.name})</span>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setStatementCustomer(null)}
                aria-label="Close statement modal"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Statement Header Card */}
            <div className="statement-client-header">
              <div>
                <div className="statement-client-title">{statementCustomer.businessName}</div>
                <div className="statement-client-sub">
                  <span>Proprietor: {statementCustomer.name}</span> &nbsp;•&nbsp;
                  <span>Phone: {statementCustomer.phone}</span>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {statementCustomer.vehicleNumbers.map((v) => (
                    <span key={v} className="vehicle-pill" style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>
                      🚛 {v}
                    </span>
                  ))}
                </div>
              </div>

              <div className="statement-kpi-badge-group">
                <div className="statement-kpi-chip">
                  <span className="statement-kpi-label">Credit Limit</span>
                  <span className="statement-kpi-val">Rs {statementCustomer.creditLimit.toLocaleString()}</span>
                </div>
                <div className={`statement-kpi-chip ${isParco ? 'highlight-parco' : 'highlight-pso'}`}>
                  <span className="statement-kpi-label">Net Balance Due</span>
                  <span className="statement-kpi-val">Rs {statementCustomer.currentBalance.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div className="ledger-table-wrap">
              {(() => {
                const custSlips = creditSlips.filter(
                  (s) => s.customerId === statementCustomer.id || s.customerName === statementCustomer.businessName
                )
                const custRecoveries = recoveries.filter(
                  (r) => r.customerId === statementCustomer.id || r.customerName === statementCustomer.businessName
                )

                type StatementEntry = {
                  id: string
                  date: string
                  type: 'Credit Slip' | 'Payment Recovery'
                  refNo: string
                  particulars: string
                  debit: number
                  credit: number
                }

                const entries: StatementEntry[] = [
                  ...custSlips.map((s) => ({
                    id: s.id,
                    date: s.date,
                    type: 'Credit Slip' as const,
                    refNo: s.slipNo,
                    particulars: `${s.fuelType} - ${s.liters}L (Vehicle: ${s.vehicleNo}, Driver: ${s.driverName})`,
                    debit: s.totalAmount,
                    credit: 0,
                  })),
                  ...custRecoveries.map((r) => ({
                    id: r.id,
                    date: r.date,
                    type: 'Payment Recovery' as const,
                    refNo: r.receiptNo,
                    particulars: `Payment via ${r.paymentMethod} ${r.referenceNo ? `(${r.referenceNo})` : ''} - Recd by ${r.receivedBy}`,
                    debit: 0,
                    credit: r.amount,
                  })),
                ].sort((a, b) => a.date.localeCompare(b.date))

                return (
                  <table className="clean-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Voucher #</th>
                        <th>Particulars / Fuel & Vehicle</th>
                        <th style={{ textAlign: 'right' }}>Debit (Billed)</th>
                        <th style={{ textAlign: 'right' }}>Credit (Paid)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                            No transaction ledger entries recorded yet for this client.
                          </td>
                        </tr>
                      ) : (
                        entries.map((item) => (
                          <tr key={item.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{item.date}</td>
                            <td>
                              <span
                                className="category-tag"
                                style={{
                                  backgroundColor: item.type === 'Credit Slip' ? '#fef2f2' : '#f0fdf4',
                                  color: item.type === 'Credit Slip' ? '#991b1b' : '#166534',
                                  border: `1px solid ${item.type === 'Credit Slip' ? '#fca5a5' : '#86efac'}`,
                                }}
                              >
                                {item.type}
                              </span>
                            </td>
                            <td><strong>{item.refNo}</strong></td>
                            <td>{item.particulars}</td>
                            <td style={{ textAlign: 'right', fontWeight: item.debit > 0 ? 700 : 400, color: item.debit > 0 ? '#b91c1c' : '#64748b' }}>
                              {item.debit > 0 ? `Rs ${Math.round(item.debit).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: item.credit > 0 ? 700 : 400, color: item.credit > 0 ? '#15803d' : '#64748b' }}>
                              {item.credit > 0 ? `Rs ${Math.round(item.credit).toLocaleString()}` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )
              })()}
            </div>

            {/* Bank Remittance Instructions Info */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '11.5px', color: '#334155' }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏦 Official Station Bank Account (Direct Remittance / IBFT):</span>
              </div>
              <div>
                <strong>{bankAccounts?.[0]?.bankName || 'Habib Bank Limited (HBL)'}</strong> &nbsp;•&nbsp;
                Title: <strong>{bankAccounts?.[0]?.accountTitle || 'Mashaal Petroleum Services'}</strong> &nbsp;•&nbsp;
                A/C: <strong>{bankAccounts?.[0]?.accountNumber || '01847900192803'}</strong> &nbsp;•&nbsp;
                Branch: {bankAccounts?.[0]?.branch || 'Main Branch'}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStatementCustomer(null)}
              >
                Close
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    backgroundColor: '#15803d',
                    borderColor: '#166534',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontWeight: 700,
                  }}
                  onClick={() => handleSendStatementWhatsApp(statementCustomer)}
                  title="Send formatted statement on WhatsApp"
                >
                  <WhatsAppIcon size={16} color="#ffffff" />
                  <span>Send WhatsApp Statement</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStatementPrintOpen(true)}
                  title="Print official statement (A4 or 80mm Thermal)"
                >
                  <PrinterIcon size={16} />
                  <span>Print Official Statement</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Statement Print Modal (A4 or 80mm Thermal Mode) */}
      {statementCustomer && (
        <PrintReceiptModal
          isOpen={statementPrintOpen}
          onClose={() => setStatementPrintOpen(false)}
          title={`Fleet Account Statement: ${statementCustomer.businessName}`}
          stationName={siteInfo.name}
          stationLocation={siteInfo.location}
          stationPhone={siteInfo.phone}
          defaultMode="a4"
        >
          <div className="slip-meta-grid">
            <div><strong>Client / Party:</strong> {statementCustomer.businessName}</div>
            <div><strong>Proprietor:</strong> {statementCustomer.name}</div>
            <div><strong>Contact:</strong> {statementCustomer.phone}</div>
            <div><strong>Credit Limit:</strong> Rs {statementCustomer.creditLimit.toLocaleString()}</div>
          </div>

          <table className="slip-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Voucher #</th>
                <th>Particulars</th>
                <th style={{ textAlign: 'right' }}>Debit (PKR)</th>
                <th style={{ textAlign: 'right' }}>Credit (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const custSlips = creditSlips.filter(
                  (s) => s.customerId === statementCustomer.id || s.customerName === statementCustomer.businessName
                )
                const custRecoveries = recoveries.filter(
                  (r) => r.customerId === statementCustomer.id || r.customerName === statementCustomer.businessName
                )
                const combined = [
                  ...custSlips.map((s) => ({
                    id: s.id,
                    date: s.date,
                    type: 'Slip',
                    refNo: s.slipNo,
                    particulars: `${s.fuelType} - ${s.liters}L (${s.vehicleNo})`,
                    debit: s.totalAmount,
                    credit: 0,
                  })),
                  ...custRecoveries.map((r) => ({
                    id: r.id,
                    date: r.date,
                    type: 'Payment',
                    refNo: r.receiptNo,
                    particulars: `Paid via ${r.paymentMethod}`,
                    debit: 0,
                    credit: r.amount,
                  })),
                ].sort((a, b) => a.date.localeCompare(b.date))

                if (combined.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '12px' }}>
                        No ledger transactions found.
                      </td>
                    </tr>
                  )
                }

                return combined.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>{entry.type}</td>
                    <td><strong>{entry.refNo}</strong></td>
                    <td>{entry.particulars}</td>
                    <td style={{ textAlign: 'right' }}>{entry.debit > 0 ? `Rs ${Math.round(entry.debit).toLocaleString()}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{entry.credit > 0 ? `Rs ${Math.round(entry.credit).toLocaleString()}` : '—'}</td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>

          <div className="receipt-divider" />

          <div className="slip-row highlight">
            <span>Current Net Balance Due:</span>
            <strong>Rs {statementCustomer.currentBalance.toLocaleString()} PKR</strong>
          </div>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
            <div><strong>Remittance Bank:</strong> {bankAccounts?.[0]?.bankName || 'Habib Bank Limited'}</div>
            <div><strong>A/C Title:</strong> {bankAccounts?.[0]?.accountTitle || 'Mashaal Petroleum Services'} &nbsp;•&nbsp; <strong>A/C:</strong> {bankAccounts?.[0]?.accountNumber || '01847900192803'}</div>
          </div>
        </PrintReceiptModal>
      )}
    </div>
  )
}
