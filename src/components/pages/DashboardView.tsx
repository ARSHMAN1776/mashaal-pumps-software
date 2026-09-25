import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { creditLeft, isLowTank, safeCash } from '../../data/derive'
import { addDays, formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import {
  GasPumpIcon, DropletIcon, CashIcon, UsersIcon, FileTextIcon, AlertCircleIcon, BuildingIcon, ArrowRightIcon, PrinterIcon,
  CheckCircleIcon, CreditCardIcon, ChevronRightIcon,
} from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'

interface Task {
  icon: React.ReactNode
  title: string
  hint: string
  go: () => void
}

/** Home: what needs doing today, the numbers that matter, and how full the tanks are. */
export const DashboardView: React.FC = () => {
  const { activeSiteData, setActiveModule, currentUser } = useApp()
  const [printOpen, setPrintOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const isManager = currentUser?.role !== 'cashier'

  const { siteInfo, tanks, fuelSales, customers, omcInvoices, expenses, recoveries, settings } = activeSiteData
  const isToday = date === todayISO()
  const dayLabel = isToday ? 'today' : formatDate(date)

  const day = useMemo(() => {
    const sales = fuelSales.filter((s) => s.date === date)
    const prev = fuelSales.filter((s) => s.date === addDays(date, -1))
    return {
      sales,
      amount: sales.reduce((s, x) => s + x.totalAmount, 0),
      liters: sales.reduce((s, x) => s + x.netLiters, 0),
      prevAmount: prev.reduce((s, x) => s + x.totalAmount, 0),
      expenses: expenses.filter((e) => e.date === date),
    }
  }, [fuelSales, expenses, date])

  const cash = safeCash(activeSiteData)
  const owed = customers.filter((c) => c.status !== 'Archived').reduce((s, c) => s + Math.max(0, c.currentBalance), 0)
  const dayExpenses = day.expenses.reduce((s, e) => s + e.amount, 0)
  const trend = day.prevAmount > 0 ? Math.round(((day.amount - day.prevAmount) / day.prevAmount) * 100) : null
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (currentUser?.name ?? '').split(' ')[0]

  // things that need a person to act
  const lowTanks = tanks.filter((t) => isLowTank(t, settings.lowStockAlertPct))
  const waitingBank = isManager ? recoveries.filter((r) => r.bankPending).length : 0
  const unpaid = isManager ? omcInvoices.filter((i) => i.paymentStatus !== 'Paid') : []
  const unpaidTotal = unpaid.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0)
  const overLimit = customers.filter((c) => c.status === 'Active' && c.creditLimit > 0 && creditLeft(c) <= 0).length
  const attention: { icon: React.ReactNode; text: React.ReactNode; action: string; go: () => void }[] = [
    ...lowTanks.map((t) => ({
      icon: <DropletIcon size={18} />,
      text: <><strong>Tank #{t.tankNo} ({t.fuelType}) is running low</strong> — about {Math.round(t.currentLiters).toLocaleString()} L left.</>,
      action: 'Open fuel tanks',
      go: () => setActiveModule('tank-dip'),
    })),
    ...(waitingBank > 0
      ? [{
          icon: <CreditCardIcon size={18} />,
          text: <><strong>{waitingBank} cheque / online {waitingBank === 1 ? 'payment is' : 'payments are'} not in a bank account yet.</strong> Choose the bank for each.</>,
          action: 'Open bank',
          go: () => setActiveModule('bank-sheet'),
        }]
      : []),
    ...(unpaid.length > 0
      ? [{
          icon: <BuildingIcon size={18} />,
          text: <><strong>{rs(unpaidTotal)} is still unpaid</strong> to the oil company ({unpaid.length} {unpaid.length === 1 ? 'invoice' : 'invoices'}).</>,
          action: 'Open fuel deliveries',
          go: () => setActiveModule('omc-ledger'),
        }]
      : []),
    ...(overLimit > 0
      ? [{
          icon: <UsersIcon size={18} />,
          text: <><strong>{overLimit} {overLimit === 1 ? 'customer has' : 'customers have'} used up their credit limit.</strong></>,
          action: 'Open credit customers',
          go: () => setActiveModule('customers'),
        }]
      : []),
  ]

  const tasks: Task[] = [
    { icon: <GasPumpIcon size={22} />, title: 'Enter a meter reading', hint: 'Record fuel sold at a pump', go: () => setActiveModule('fuel-sales') },
    { icon: <UsersIcon size={22} />, title: 'Give fuel on credit', hint: 'Write a slip for a customer', go: () => setActiveModule('customers') },
    { icon: <CashIcon size={22} />, title: 'Receive a payment', hint: 'A customer pays what they owe', go: () => setActiveModule('customers') },
    { icon: <FileTextIcon size={22} />, title: 'Add an expense', hint: 'Money spent at the station', go: () => setActiveModule('expenses') },
    { icon: <DropletIcon size={22} />, title: 'Measure a tank', hint: 'Record the dip reading', go: () => setActiveModule('tank-dip') },
    { icon: <PrinterIcon size={22} />, title: 'Print sales summary', hint: `For ${dayLabel}`, go: () => setPrintOpen(true) },
  ]

  const fillOf = (liters: number, cap: number) => Math.max(0, Math.min(100, Math.round((liters / cap) * 100)))

  return (
    <div className="dashboard-page-container home">
      <div className="home-head">
        <div>
          <h2 className="home-hello">{hello}, {firstName}</h2>
          <p className="home-sub">Here is how {siteInfo.name} is doing {dayLabel}.</p>
        </div>
        <label className="home-date">
          <span>Show figures for</span>
          <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </label>
      </div>

      <section className="home-stats" aria-label="Key figures">
        <button type="button" className="home-stat" onClick={() => setActiveModule('fuel-sales')}>
          <span className="home-stat-icon tone-sales"><GasPumpIcon size={20} /></span>
          <span className="home-stat-label">Fuel sold {dayLabel}</span>
          <strong className="home-stat-value">{rs(day.amount)}</strong>
          <span className="home-stat-sub">
            {day.liters.toLocaleString()} litres
            {trend !== null && <em className={trend >= 0 ? 'is-up' : 'is-down'}>{trend > 0 ? '+' : ''}{trend}% vs the day before</em>}
          </span>
        </button>
        <button type="button" className="home-stat" onClick={() => setActiveModule('daybook')}>
          <span className="home-stat-icon tone-cash"><CashIcon size={20} /></span>
          <span className="home-stat-label">Cash in the safe</span>
          <strong className="home-stat-value">{rs(cash)}</strong>
          <span className="home-stat-sub">Right now</span>
        </button>
        <button type="button" className="home-stat" onClick={() => setActiveModule('customers')}>
          <span className="home-stat-icon tone-owed"><UsersIcon size={20} /></span>
          <span className="home-stat-label">Owed by customers</span>
          <strong className="home-stat-value">{rs(owed)}</strong>
          <span className="home-stat-sub">Fuel given on credit, not yet paid</span>
        </button>
        <button type="button" className="home-stat" onClick={() => setActiveModule('expenses')}>
          <span className="home-stat-icon tone-spend"><FileTextIcon size={20} /></span>
          <span className="home-stat-label">Spent {dayLabel}</span>
          <strong className="home-stat-value">{rs(dayExpenses)}</strong>
          <span className="home-stat-sub">{day.expenses.length} {day.expenses.length === 1 ? 'expense' : 'expenses'}</span>
        </button>
      </section>

      <section className="home-grid">
        <div className="home-card">
          <h3 className="home-card-title">What do you want to do?</h3>
          <div className="home-tasks">
            {tasks.map((t) => (
              <button key={t.title} type="button" className="home-task" onClick={t.go}>
                <span className="home-task-icon">{t.icon}</span>
                <span className="home-task-text"><strong>{t.title}</strong><small>{t.hint}</small></span>
                <ChevronRightIcon size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="home-card">
          <h3 className="home-card-title">Needs your attention</h3>
          {attention.length === 0 ? (
            <div className="home-ok"><CheckCircleIcon size={22} /><div><strong>Everything is in order</strong><span>Nothing needs your attention right now.</span></div></div>
          ) : (
            <ul className="home-todo">
              {attention.map((a, i) => (
                <li key={i}>
                  <span className="home-todo-icon"><AlertCircleIcon size={18} /></span>
                  <span className="home-todo-text">{a.text}</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={a.go}>{a.action}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="home-card">
        <div className="home-card-head">
          <h3 className="home-card-title">Fuel in the tanks</h3>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveModule('tank-dip')}>Open fuel tanks <ArrowRightIcon size={14} /></button>
        </div>
        {tanks.length === 0 ? (
          <p className="ui-empty">No tanks have been added yet. Open Fuel tanks to add the first one.</p>
        ) : (
          <div className="home-gauges">
            {tanks.map((t) => {
              const pct = fillOf(t.currentLiters, t.capacityLiters)
              const low = isLowTank(t, settings.lowStockAlertPct)
              return (
                <div key={t.id} className="home-gauge" data-fuel={t.fuelType}>
                  <div className="home-gauge-top">
                    <span className="fuel-chip">{t.fuelType}</span>
                    <span className="home-gauge-tank">Tank #{t.tankNo}</span>
                    {low && <span className="badge badge-danger">Running low</span>}
                  </div>
                  <div className="home-gauge-bar" role="img" aria-label={`${pct} percent full`}>
                    <div className="home-gauge-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="home-gauge-figs">
                    <strong>{Math.round(t.currentLiters).toLocaleString()} L</strong>
                    <span>{pct}% of {t.capacityLiters.toLocaleString()} L</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Daily Fuel Sales Summary Slip" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <div className="slip-meta-grid">
          <div><strong>Report:</strong> Daily fuel sales</div>
          <div><strong>Date:</strong> {formatDate(date)}</div>
          <div><strong>Prepared by:</strong> {currentUser?.name}</div>
          <div><strong>Station:</strong> {siteInfo.code}</div>
        </div>
        <div className="receipt-divider" />
        <table className="slip-table">
          <thead><tr><th>Nozzle</th><th>Shift</th><th>Fuel</th><th>Liters</th><th>Amount</th></tr></thead>
          <tbody>{day.sales.map((s) => <tr key={s.id}><td>D{s.dispenserNo}-N{s.nozzleNo}</td><td>{s.shiftName}</td><td>{s.fuelType}</td><td>{s.netLiters.toLocaleString()} L</td><td>{rs(s.totalAmount)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-summary-list">
          <div className="slip-row highlight"><span>Total fuel revenue:</span><strong>{rs(day.amount)}</strong></div>
          <div className="slip-row"><span>Total volume dispensed:</span><strong>{day.liters.toLocaleString()} liters</strong></div>
          <div className="slip-row"><span>Safe cash closing:</span><strong>{rs(cash)}</strong></div>
          <div className="slip-row"><span>Customer credit balance:</span><span>{rs(owed)}</span></div>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
