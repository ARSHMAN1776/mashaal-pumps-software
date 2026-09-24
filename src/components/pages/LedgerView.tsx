import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon } from '../common/Icons'
import { ModuleGuide } from '../common/ModuleGuide'
import { PageHeader } from '../common/kit'
import { rs } from '../../lib/money'
import { CustomerFormModal } from '../../features/customers/CustomerModals'
import { CustomerLedgerPanel } from '../../features/customers/CustomerLedgerPanel'

/** Debit / credit running ledger: pick a customer, then add / edit / delete customers and every debit and credit entry. */
export const LedgerView: React.FC = () => {
  const { activeSiteData, currentUser } = useApp()
  const isManager = currentUser?.role !== 'cashier'
  const [showArchived, setShowArchived] = useState(false)
  const list = activeSiteData.customers.filter((c) => showArchived || c.status !== 'Archived')
  const [selectedId, setSelectedId] = useState(list[0]?.id ?? '')
  const [newCustomer, setNewCustomer] = useState(false)

  // keep the selection valid when the selected customer is deleted / archived / filtered out
  useEffect(() => {
    if (!list.some((c) => c.id === selectedId)) setSelectedId(list[0]?.id ?? '')
  }, [list, selectedId])

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="PARTY STATEMENT"
        title="Debit / Credit Running Ledger"
        subtitle="Itemized history of fuel credit (debit), payments received (credit) and the running balance — add, edit or delete customers and entries here"
        actions={isManager && (
          <button type="button" className="btn btn-outline" style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }} onClick={() => setNewCustomer(true)}>
            <PlusIcon size={16} /><span>Add Customer</span>
          </button>
        )}
      />

      <div className="account-selector-ribbon">
        <div className="form-group flex-1">
          <label className="form-label">Select customer account</label>
          <select className="form-input form-input-lg" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={list.length === 0}>
            {list.length === 0 && <option value="">No customers yet</option>}
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName} — {c.currentBalance < 0 ? `advance ${rs(-c.currentBalance)}` : `due ${rs(c.currentBalance)}`} (limit {rs(c.creditLimit)}){c.status !== 'Active' ? ` [${c.status}]` : ''}
              </option>
            ))}
          </select>
        </div>
        {isManager && (
          <label className="ui-checkbox-row" style={{ alignSelf: 'flex-end', paddingBottom: 12 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /><span>Show archived</span>
          </label>
        )}
      </div>

      {selectedId ? (
        <CustomerLedgerPanel key={selectedId} customerId={selectedId} onRemoved={() => setSelectedId('')} />
      ) : (
        <div className="ui-empty">{isManager ? 'No customers yet — click "Add Customer" to register one.' : 'No customers yet. Ask a manager to register them.'}</div>
      )}

      {newCustomer && <CustomerFormModal onClose={() => setNewCustomer(false)} onSaved={(c) => c && setSelectedId(c.id)} />}

      <ModuleGuide
        title="Debit / Credit Ledger Guide"
        urduTitle="ڈیبٹ / کریڈٹ کھاتہ کی رہنمائی"
        role="manager"
        roleLabel="Manager & Cashier"
        purpose="See a customer's complete account: DEBIT is fuel taken on credit, CREDIT is money received. Every entry can be corrected or deleted by a manager and the balance updates instantly."
        steps={[
          { step: 1, title: 'Pick the customer (گاہک منتخب کریں)', detail: 'Choose the account from the list. The statement, totals and balance appear below.', urdu: 'فہرست سے گاہک منتخب کریں۔' },
          { step: 2, title: 'Add entries (اندراج)', detail: 'Use "Debit: issue slip" for fuel on credit, "Credit: record payment" for money received, or a debit / credit note for corrections and discounts.', urdu: 'ادھار پرچی، وصولی یا ایڈجسٹمنٹ نوٹ درج کریں۔' },
          { step: 3, title: 'Edit or delete (ترمیم یا حذف)', detail: 'Managers: use the pencil / bin on any row. Deleting a payment also removes its cash-book line. Everything is recorded in the audit trail.', urdu: 'مینیجر کسی بھی اندراج کو درست یا حذف کر سکتا ہے۔' },
          { step: 4, title: 'Delete a customer (گاہک حذف)', detail: 'A customer without history is deleted. One with history is archived (ledger kept) once the balance is Rs 0.', urdu: 'لین دین والا گاہک صرف بیلنس صفر ہونے پر محفوظ شدہ (آرکائیو) ہوتا ہے۔' },
        ]}
      />
    </div>
  )
}
