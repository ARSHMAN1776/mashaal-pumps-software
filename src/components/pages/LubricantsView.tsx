import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PrinterIcon, CheckCircleIcon, XIcon, CashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'

export const LubricantsView: React.FC = () => {
  const { activeSiteData, updateLubricantStock, addDaybookEntry } = useApp()
  // Use lubricants directly from AppContext instead of local state
  const { lubricants: products, siteInfo } = activeSiteData

  const [saleModalOpen, setSaleModalOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Sale form
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '')
  const [quantity, setQuantity] = useState<number>(1)
  const [customerName, setCustomerName] = useState('Counter Walk-in')

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0]
  const totalSaleAmount = quantity * (selectedProduct?.salePrice || 0)

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || selectedProduct.stockCans < quantity) {
      alert('Insufficient cans in stock.')
      return
    }

    // Persist stock deduction to AppContext (and therefore localStorage)
    updateLubricantStock(selectedProduct.id, quantity)

    // Add sale revenue to daybook
    addDaybookEntry({
      date: new Date().toISOString().split('T')[0],
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      particulars: `Lube Counter Sale: ${quantity}x ${selectedProduct.name} (${customerName})`,
      category: 'Lube Sale',
      cashIn: totalSaleAmount,
      cashOut: 0,
      balanceAfter: 0, // auto-computed by addDaybookEntry fix
      referenceNo: `LUB-${Math.floor(100 + Math.random() * 900)}`,
      handledBy: siteInfo.managerName,
    })

    setSaleModalOpen(false)
  }

  const totalStockValue = products.reduce((sum, p) => sum + p.stockCans * p.costPrice, 0)
  const totalRetailValue = products.reduce((sum, p) => sum + p.stockCans * p.salePrice, 0)
  const lowStockCount = products.filter((p) => p.stockCans <= p.minStockAlert).length

  return (
    <div className="page-content-wrapper">
      <div className="page-title-banner">
        <div>
          <span className="page-eyebrow">MOTOR OILS &amp; LUBRICANTS</span>
          <h2 className="page-heading">Lubricants Inventory &amp; Point of Sale</h2>
          <p className="page-sub">
            Engine oils, brake fluids, grease cans stock, low inventory alerts, and instant counter billing
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setPrintOpen(true)}>
            <PrinterIcon size={16} />
            <span>Print Stock Sheet</span>
          </button>
          <button className="btn btn-primary" onClick={() => setSaleModalOpen(true)}>
            <CashIcon size={16} />
            <span>Record Counter Sale</span>
          </button>
        </div>
      </div>

      <ModuleGuide
        title="Motor Oils & Lubricants POS SOP"
        urduTitle="لیوبریکینٹس اور انجن آئل کاؤنٹر سیل کے اصول"
        role="cashier"
        roleLabel="Forecourt Cashier"
        purpose="Manage station motor oils, engine lubes, and counter transactions. Record instant cash collections with live warehouse stock deduction."
        steps={[
          {
            step: 1,
            title: 'Select Lubricant Product (تیل کا انتخاب)',
            detail: 'Select the exact oil pack size (e.g., 4L Helix HX6, 1L Rimula, Brake Fluid).',
            urdu: 'گاہک کے لیے مطلوبہ ڈبہ منتخب کریں اور موٹر سائیکل یا گاڑی کا نمبر لکھیں۔',
          },
          {
            step: 2,
            title: 'Verify Physical Cans (ڈبوں کی گنتی)',
            detail: 'Input customer vehicle registration number and count of physical cans delivered.',
            urdu: 'ڈبوں کی تعداد درج کریں اور نقد رقم وصول کر کے کسٹمر کے حوالے کریں۔',
          },
          {
            step: 3,
            title: 'Automatic Daybook & Stock Sync (خودکار اندراج)',
            detail: 'Cash automatically syncs directly to Safe Cash daybook and deducts physical warehouse stock.',
            urdu: 'سیل مکمل ہوتے ہی رقم خود بخود ڈے بک میں جمع ہو جائے گی اور گودام کا سٹاک کم ہو جائے گا۔',
          },
        ]}
        criticalChecks={[
          'Do not hand over open-seal cans. In case of damaged foil seals, notify manager before selling.',
          'Low stock alert triggers automatically when cans reach reorder thresholds.',
          'Print physical inventory valuation sheets for weekly stock auditing by station manager.',
        ]}
      />

      {/* KPI Ribbon */}
      <div className="executive-kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Total Cans in Stock</span>
          <strong className="kpi-cell-value">
            {products.reduce((acc, p) => acc + p.stockCans, 0)} Units
          </strong>
          <span className="kpi-cell-sub">{products.length} Products cataloged</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Stock Value (Cost)</span>
          <strong className="kpi-cell-value text-gold">Rs {totalStockValue.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Wholesale valuation</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Potential Retail Revenue</span>
          <strong className="kpi-cell-value text-green">Rs {totalRetailValue.toLocaleString()}</strong>
          <span className="kpi-cell-sub">Estimated margin: Rs {(totalRetailValue - totalStockValue).toLocaleString()}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Low Inventory Alert</span>
          <strong className="kpi-cell-value" style={{ color: lowStockCount > 0 ? '#b45309' : '#27ae60' }}>
            {lowStockCount > 0 ? `${lowStockCount} Items Low` : 'All Stock Healthy'}
          </strong>
          <span className="kpi-cell-sub">Reorder threshold monitoring</span>
        </div>
      </div>

      {/* Products Table */}
      <div className="table-surface">
        <div className="table-surface-header">
          <div>
            <h3 className="surface-heading">Lubricant Products Inventory</h3>
            <p className="surface-sub">Current warehouse count and pricing</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Brand &amp; Grade</th>
                <th>Pack Size</th>
                <th>Cost Price</th>
                <th>Retail Price</th>
                <th>Stock Available</th>
                <th>Stock Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((prod) => {
                const isLow = prod.stockCans <= prod.minStockAlert
                return (
                  <tr key={prod.id}>
                    <td>
                      <strong>{prod.name}</strong>
                    </td>
                    <td>
                      <div>{prod.brand}</div>
                      <div className="text-muted text-xs">{prod.grade}</div>
                    </td>
                    <td>
                      <span className="vehicle-pill">{prod.packSize}</span>
                    </td>
                    <td>Rs {prod.costPrice.toLocaleString()}</td>
                    <td className="text-gold font-bold">Rs {prod.salePrice.toLocaleString()}</td>
                    <td>
                      <strong className="text-lg">{prod.stockCans} Cans</strong>
                    </td>
                    <td>
                      {isLow ? (
                        <span className="badge badge-danger">Low (≤{prod.minStockAlert})</span>
                      ) : (
                        <span className="badge badge-success">In Stock</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setSelectedProductId(prod.id)
                          setSaleModalOpen(true)
                        }}
                      >
                        Sell Can
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Counter Sale */}
      {saleModalOpen && (
        <div className="modal-backdrop" onClick={() => setSaleModalOpen(false)}>
          <div className="modal-container compact-zero-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-heading">Record Lubricant Counter Sale</h3>
                <span className="modal-sub">Deducts inventory stock and posts cash directly into daybook</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSaleModalOpen(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSale} className="modal-form-compact">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Select Lubricant Product</label>
                  <select
                    className="form-input"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.packSize}) — In Stock: {p.stockCans} Cans (Rs {p.salePrice})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Customer / Vehicle #</label>
                  <input
                    type="text"
                    className="form-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Number of Cans Sold</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct?.stockCans || 10}
                    className="form-input"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Retail Price / Can</label>
                  <div className="read-only-box">
                    <strong>Rs {selectedProduct?.salePrice.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              <div className="calc-preview-inline-strip">
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Selected Item</span>
                  <span className="calc-pill-val">{selectedProduct?.name} ({selectedProduct?.packSize})</span>
                </div>
                <div className="calc-pill-item">
                  <span className="calc-pill-label">Quantity</span>
                  <span className="calc-pill-val">{quantity} Cans</span>
                </div>
                <div className="calc-pill-item highlight-green">
                  <span className="calc-pill-label">Cash Collected</span>
                  <span className="calc-pill-val">Rs {totalSaleAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setSaleModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircleIcon size={16} />
                  <span>Complete Sale &amp; Deduct Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Slip */}
      <PrintReceiptModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Station Lubricants Inventory Valuation"
        stationName={siteInfo.name}
        stationLocation={siteInfo.location}
        stationPhone={siteInfo.phone}
      >
        <table className="slip-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Pack</th>
              <th>Stock</th>
              <th>Cost (PKR)</th>
              <th>Retail (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.packSize}</td>
                <td>{p.stockCans} Cans</td>
                <td>Rs {p.costPrice.toLocaleString()}</td>
                <td>Rs {p.salePrice.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-divider" />
        <div className="slip-row highlight">
          <span>Total Wholesale Valuation:</span>
          <strong>Rs {totalStockValue.toLocaleString()}</strong>
        </div>
      </PrintReceiptModal>
    </div>
  )
}
