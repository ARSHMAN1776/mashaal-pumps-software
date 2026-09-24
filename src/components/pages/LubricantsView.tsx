import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { LubricantMovement, LubricantProduct } from '../../types'
import { formatDate, todayISO } from '../../lib/dates'
import { rs } from '../../lib/money'
import { PrinterIcon, CheckCircleIcon, CashIcon, PlusIcon, EditIcon, TrashIcon } from '../common/Icons'
import { PrintReceiptModal } from '../common/PrintReceiptModal'
import { ModuleGuide } from '../common/ModuleGuide'
import { Modal, FormError } from '../common/Modal'
import { useConfirm } from '../common/Confirm'
import { useToast } from '../common/Toast'
import { useSubmit } from '../common/useSubmit'
import { CalcStrip, EmptyRow, Field, Grid2, Grid3, IconButton, Kpi, KpiStrip, PageHeader, RowActions, SectionCard, Tabs } from '../common/kit'

const ProductModal: React.FC<{ product?: LubricantProduct; onClose: () => void }> = ({ product, onClose }) => {
  const [version] = useState(product?.updatedAt) // the record's version when this window was opened
  const { act } = useApp()
  const toast = useToast()
  const [name, setName] = useState(product?.name ?? '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [grade, setGrade] = useState(product?.grade ?? '')
  const [pack, setPack] = useState(product?.packSize ?? '')
  const [opening, setOpening] = useState(String(product?.openingStock ?? 0))
  const [minAlert, setMinAlert] = useState(String(product?.minStockAlert ?? 5))
  const [cost, setCost] = useState(String(product?.costPrice ?? ''))
  const [price, setPrice] = useState(String(product?.salePrice ?? ''))
  const [active, setActive] = useState(product?.isActive ?? true)
  const { busy, error, run } = useSubmit()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const base = { name, brand, grade, packSize: pack, minStockAlert: Number(minAlert), costPrice: Number(cost), salePrice: Number(price) }
    if (product) void run(() => act.updateProduct(product.id, { ...base, isActive: active, version }), () => { toast.success('Product updated.'); onClose() })
    else void run(() => act.addProduct({ ...base, openingStock: Number(opening) }), (p) => { toast.success(`Added ${p.name}.`); onClose() })
  }

  return (
    <Modal title={product ? 'Edit Product' : 'Add Lubricant Product'} onClose={onClose} busy={busy} width={640}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid2>
          <Field label="Product name"><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Total Quartz 9000 Energy" required autoFocus /></Field>
          <Field label="Brand"><input className="form-input" value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Grade"><input className="form-input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 5W-40 Fully Synthetic" /></Field>
          <Field label="Pack size"><input className="form-input" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="e.g. 4 Liters" /></Field>
        </Grid2>
        <Grid3>
          <Field label="Cost price (PKR)"><input type="number" min={0} step="any" className="form-input" value={cost} onChange={(e) => setCost(e.target.value)} required /></Field>
          <Field label="Retail price (PKR)"><input type="number" min={0} step="any" className="form-input" value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
          <Field label="Low-stock alert (cans)"><input type="number" min={0} step={1} className="form-input" value={minAlert} onChange={(e) => setMinAlert(e.target.value)} required /></Field>
        </Grid3>
        {product ? (
          <label className="ui-checkbox-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active (untick to stop selling it; history is kept)</span></label>
        ) : (
          <Field label="Opening stock (cans)" hint="Cans on the shelf today. Later use Restock or Stock adjustment."><input type="number" min={0} step={1} className="form-input" value={opening} onChange={(e) => setOpening(e.target.value)} required /></Field>
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

type MoveMode = 'sale' | 'restock' | 'adjust'

const MoveModal: React.FC<{ mode: MoveMode; productId?: string; onClose: () => void }> = ({ mode, productId, onClose }) => {
  const { activeSiteData, act, currentUser } = useApp()
  const toast = useToast()
  const isManager = currentUser?.role !== 'cashier'
  const products = activeSiteData.lubricants.filter((p) => p.isActive)
  const [id, setId] = useState(productId ?? products[0]?.id ?? '')
  const p = products.find((x) => x.id === id)
  const [qty, setQty] = useState('1')
  const suppliers = activeSiteData.suppliers.filter((s) => s.isActive)
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '') // '' = a shop that is not in the supplier list
  const [who, setWho] = useState(mode === 'sale' ? 'Counter Walk-in' : '')
  const [price, setPrice] = useState(String(p?.salePrice ?? ''))
  const [cost, setCost] = useState(String(p?.costPrice ?? ''))
  const [ref, setRef] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayISO())
  const { busy, error, run } = useSubmit()
  const q = Number(qty) || 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'sale') {
      void run(() => act.sellLube({ productId: id, quantity: Number(qty), counterparty: who, unitPrice: isManager ? Number(price) : undefined, date }), (m) => { toast.success(`Sold ${m.quantity} can(s) — ${rs(m.totalAmount)} added to the daybook.`); onClose() })
    } else if (mode === 'restock') {
      void run(() => act.restockLube({ productId: id, quantity: Number(qty), unitCost: Number(cost), supplierId: supplierId || undefined, supplierName: who, referenceNo: ref, date }), (m) => { toast.success(supplierId ? `Received ${m.quantity} can(s). ${rs(m.totalAmount)} added to the supplier account.` : `Received ${m.quantity} can(s).`); onClose() })
    } else {
      void run(() => act.adjustLubeStock({ productId: id, quantity: Number(qty), direction, reason, date }), () => { toast.success('Stock adjusted.'); onClose() })
    }
  }

  const title = mode === 'sale' ? 'Record Lubricant Counter Sale' : mode === 'restock' ? 'Receive Lubricant Stock' : 'Stock Adjustment'
  const sub = mode === 'sale' ? 'Deducts stock and posts the cash to the daybook' : mode === 'restock' ? 'Adds cans to stock. Choose the supplier and the bill is added to their account.' : 'Correct stock for damage, counting differences or samples'

  return (
    <Modal title={title} subtitle={sub} onClose={onClose} busy={busy} width={740}>
      <form className="modal-form-compact" onSubmit={submit}>
        <Grid3>
          <Field label="Product">
            <select className="form-input" value={id} onChange={(e) => { setId(e.target.value); const n = products.find((x) => x.id === e.target.value); if (n) { setPrice(String(n.salePrice)); setCost(String(n.costPrice)) } }} required>
              {products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.packSize}) — stock {x.stockCans}</option>)}
            </select>
          </Field>
          <Field label={mode === 'adjust' ? 'Cans' : 'Number of cans'}><input type="number" min={1} step={1} className="form-input" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus /></Field>
          <Field label="Date" hint={!isManager ? 'Today only' : undefined}><input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={!isManager} required /></Field>
        </Grid3>
        {mode === 'sale' && (
          <Grid2>
            <Field label="Customer / vehicle #"><input className="form-input" value={who} onChange={(e) => setWho(e.target.value)} /></Field>
            <Field label="Price per can (Rs)" hint={isManager ? undefined : 'Fixed list price'}><input type="number" min={0} step="any" className="form-input" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!isManager} /></Field>
          </Grid2>
        )}
        {mode === 'restock' && (
          <>
            <Grid3>
              <Field label="Bought from">
                <select className="form-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="">Someone else</option>
                </select>
              </Field>
              <Field label="Cost per can (Rs)"><input type="number" min={0} step="any" className="form-input" value={cost} onChange={(e) => setCost(e.target.value)} required /></Field>
              {supplierId === '' ? (
                <Field label="Shop / person name"><input className="form-input" value={who} onChange={(e) => setWho(e.target.value)} /></Field>
              ) : (
                <Field label="Bill number" hint="Optional"><input className="form-input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
              )}
            </Grid3>
            {supplierId !== '' && q > 0 && <p className="ui-muted" style={{ margin: 0, fontSize: 12.5 }}>{rs(q * (Number(cost) || 0))} will be added to this supplier&apos;s account as an unpaid bill.</p>}
          </>
        )}
        {mode === 'adjust' && (
          <Grid2>
            <Field label="Direction"><select className="form-input" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}><option value="out">Remove cans (damaged, lost, sample)</option><option value="in">Add cans (count correction)</option></select></Field>
            <Field label="Reason"><input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
          </Grid2>
        )}
        {p && (
          <CalcStrip items={mode === 'sale'
            ? [{ label: 'In stock', value: `${p.stockCans} cans` }, { label: 'After sale', value: `${p.stockCans - q} cans` }, { label: 'Cash collected', value: rs(q * (isManager ? Number(price) || 0 : p.salePrice)), tone: 'green' }]
            : [{ label: 'In stock', value: `${p.stockCans} cans` }, { label: 'After', value: `${mode === 'restock' || direction === 'in' ? p.stockCans + q : p.stockCans - q} cans`, tone: 'gold' }]} />
        )}
        <FormError message={error} />
        <div className="modal-actions-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || products.length === 0}><CheckCircleIcon size={16} /><span>{busy ? 'Saving…' : mode === 'sale' ? 'Complete sale' : 'Save'}</span></button>
        </div>
      </form>
    </Modal>
  )
}

export const LubricantsView: React.FC = () => {
  const { activeSiteData, act, currentUser } = useApp()
  const { lubricants, lubricantMovements, siteInfo } = activeSiteData
  const isManager = currentUser?.role !== 'cashier'
  const confirm = useConfirm()
  const toast = useToast()
  const [tab, setTab] = useState<'products' | 'movements'>('products')
  const [productForm, setProductForm] = useState<{ product?: LubricantProduct } | null>(null)
  const [move, setMove] = useState<{ mode: MoveMode; productId?: string } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const products = lubricants.filter((p) => showInactive || p.isActive)
  const live = lubricants.filter((p) => p.isActive)
  const stockCost = live.reduce((s, p) => s + p.stockCans * p.costPrice, 0)
  const stockRetail = live.reduce((s, p) => s + p.stockCans * p.salePrice, 0)
  const low = live.filter((p) => p.stockCans <= p.minStockAlert).length
  const today = todayISO()
  const todaySales = lubricantMovements.filter((m) => m.type === 'Sale' && m.date === today).reduce((s, m) => s + m.totalAmount, 0)
  const productName = (id: string) => lubricants.find((p) => p.id === id)?.name ?? 'Removed product'

  const removeProduct = async (p: LubricantProduct) => {
    if (!(await confirm({ title: `Remove ${p.name}?`, message: 'A product without history is deleted; one with sales history is deactivated (history kept). Stock must be 0 first.', confirmLabel: 'Remove product', tone: 'danger' }))) return
    const r = await act.removeProduct(p.id)
    if (r.ok) toast.success(r.value.mode === 'deleted' ? 'Product deleted.' : 'Product deactivated — history kept.'); else toast.error(r.error)
  }
  const removeMove = async (m: LubricantMovement) => {
    if (!(await confirm({ title: `Delete this ${m.type.toLowerCase()}?`, message: `${m.quantity} can(s) of ${productName(m.productId)} on ${formatDate(m.date)}${m.type === 'Sale' ? '. The cash line in the daybook is removed too.' : '.'} Stock is recalculated.`, confirmLabel: 'Delete', tone: 'danger' }))) return
    const r = await act.removeLubeMovement(m.id)
    if (r.ok) toast.success('Deleted.'); else toast.error(r.error)
  }

  return (
    <div className="page-content-wrapper">
      <PageHeader
        eyebrow="MOTOR OILS & LUBRICANTS"
        title="Lubricants Inventory & Point of Sale"
        subtitle="Engine oils, brake fluids and grease: stock, low-inventory alerts, restocking and counter billing"
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPrintOpen(true)}><PrinterIcon size={16} /><span>Print Stock Sheet</span></button>
            {isManager && <button type="button" className="btn btn-outline" style={{ borderColor: '#967938', color: '#967938', fontWeight: 600 }} onClick={() => setProductForm({})}><PlusIcon size={16} /><span>Add Product</span></button>}
            {isManager && <button type="button" className="btn btn-outline" onClick={() => setMove({ mode: 'restock' })} disabled={live.length === 0}><span>Receive Stock</span></button>}
            <button type="button" className="btn btn-primary" onClick={() => setMove({ mode: 'sale' })} disabled={live.length === 0}><CashIcon size={16} /><span>Record Counter Sale</span></button>
          </>
        }
      />

      <KpiStrip>
        <Kpi label="Cans in stock" value={`${live.reduce((a, p) => a + p.stockCans, 0)} units`} sub={`${live.length} product(s)`} />
        <Kpi label="Stock value (cost)" value={rs(stockCost)} tone="gold" sub="Wholesale valuation" />
        <Kpi label="Retail value" value={rs(stockRetail)} tone="green" sub={`Margin ${rs(stockRetail - stockCost)}`} />
        <Kpi label="Sales today" value={rs(todaySales)} sub="Counter sales" />
        <Kpi label="Low inventory" value={low > 0 ? `${low} item(s) low` : 'All healthy'} tone={low > 0 ? 'amber' : 'green'} sub="Reorder monitoring" />
      </KpiStrip>

      <Tabs tabs={[{ id: 'products', label: 'Products', count: products.length }, { id: 'movements', label: 'Sales & stock movements', count: lubricantMovements.length }]} active={tab} onChange={(t) => setTab(t as typeof tab)} />

      {tab === 'products' ? (
        <SectionCard title="Lubricant Products Inventory" subtitle="Current shelf stock and pricing" actions={isManager && <label className="ui-checkbox-row" style={{ margin: 0 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /><span>Show inactive</span></label>}>
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Product</th><th>Brand & grade</th><th>Pack</th><th>Cost</th><th>Retail</th><th>Stock</th><th>Status</th><th /></tr></thead>
              <tbody>
                {products.length === 0 ? <EmptyRow colSpan={8}>No products yet.{isManager ? ' Click "Add Product".' : ''}</EmptyRow> : products.map((p) => {
                  const isLow = p.stockCans <= p.minStockAlert
                  return (
                    <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.55 }}>
                      <td><strong>{p.name}</strong>{!p.isActive && <div className="text-muted text-xs">inactive</div>}</td>
                      <td><div>{p.brand}</div><div className="text-muted text-xs">{p.grade}</div></td>
                      <td><span className="vehicle-pill">{p.packSize || '—'}</span></td>
                      <td>{rs(p.costPrice)}</td>
                      <td className="text-gold font-bold">{rs(p.salePrice)}</td>
                      <td><strong>{p.stockCans} cans</strong></td>
                      <td>{isLow ? <span className="badge badge-danger">Low (≤{p.minStockAlert})</span> : <span className="badge badge-success">In stock</span>}</td>
                      <td>
                        <RowActions>
                          <button type="button" className="btn btn-sm btn-outline" disabled={!p.isActive} onClick={() => setMove({ mode: 'sale', productId: p.id })}>Sell</button>
                          {isManager && <button type="button" className="btn btn-sm btn-outline" disabled={!p.isActive} onClick={() => setMove({ mode: 'restock', productId: p.id })}>Restock</button>}
                          {isManager && <button type="button" className="btn btn-sm btn-outline" disabled={!p.isActive} onClick={() => setMove({ mode: 'adjust', productId: p.id })}>Adjust</button>}
                          {isManager && <IconButton label="Edit product" onClick={() => setProductForm({ product: p })}><EditIcon size={14} /></IconButton>}
                          {isManager && <IconButton label="Remove product" tone="danger" onClick={() => void removeProduct(p)}><TrashIcon size={14} /></IconButton>}
                        </RowActions>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Sales & Stock Movements" subtitle="Newest first">
          <div className="table-responsive">
            <table className="clean-table">
              <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Cans</th><th>Amount</th><th>Party / reason</th><th>Ref</th><th>By</th>{isManager && <th />}</tr></thead>
              <tbody>
                {lubricantMovements.length === 0 ? <EmptyRow colSpan={isManager ? 9 : 8}>No movements yet.</EmptyRow> : lubricantMovements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.date)}</td><td><strong>{productName(m.productId)}</strong></td>
                    <td><span className={`badge ${m.type === 'Sale' ? 'badge-success' : m.type === 'Restock' ? 'badge-gold' : 'badge-neutral'}`}>{m.type}</span></td>
                    <td>{m.type === 'Sale' || m.type === 'Adjustment Out' ? '−' : '+'}{m.quantity}</td>
                    <td>{m.totalAmount > 0 ? rs(m.totalAmount) : '—'}</td><td>{m.counterparty || '—'}</td><td>{m.referenceNo || '—'}</td><td>{m.recordedBy}</td>
                    {isManager && <td><RowActions><IconButton label="Delete" tone="danger" onClick={() => void removeMove(m)}><TrashIcon size={14} /></IconButton></RowActions></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {productForm && <ProductModal product={productForm.product} onClose={() => setProductForm(null)} />}
      {move && <MoveModal mode={move.mode} productId={move.productId} onClose={() => setMove(null)} />}

      <PrintReceiptModal isOpen={printOpen} onClose={() => setPrintOpen(false)} title="Station Lubricants Inventory Valuation" stationName={siteInfo.name} stationLocation={siteInfo.location} stationPhone={siteInfo.phone}>
        <table className="slip-table">
          <thead><tr><th>Product</th><th>Pack</th><th>Stock</th><th>Cost</th><th>Retail</th></tr></thead>
          <tbody>{live.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.packSize}</td><td>{p.stockCans}</td><td>{rs(p.costPrice)}</td><td>{rs(p.salePrice)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-divider" />
        <div className="slip-row highlight"><span>Total wholesale valuation:</span><strong>{rs(stockCost)}</strong></div>
      </PrintReceiptModal>

      <ModuleGuide
        title="Motor Oils & Lubricants POS SOP"
        urduTitle="لیوبریکینٹس اور انجن آئل کاؤنٹر سیل کے اصول"
        role="cashier"
        roleLabel="Forecourt Cashier"
        purpose="Manage engine oils and counter sales. A sale deducts stock and posts the cash to the daybook; managers add products, receive stock and correct records."
        steps={[
          { step: 1, title: 'Select the product (تیل کا انتخاب)', detail: 'Choose the exact oil and pack size.', urdu: 'مطلوبہ ڈبہ منتخب کریں۔' },
          { step: 2, title: 'Count the cans (ڈبوں کی گنتی)', detail: 'Enter how many cans and who bought them.', urdu: 'ڈبوں کی تعداد اور گاہک کا نام درج کریں۔' },
          { step: 3, title: 'Automatic entries (خودکار اندراج)', detail: 'Cash goes to the daybook and stock is reduced — nothing else to enter.', urdu: 'رقم ڈے بک میں اور سٹاک کم ہو جاتا ہے۔' },
          { step: 4, title: 'Restock & adjust (سٹاک کی درستگی)', detail: 'Managers: "Receive Stock" when a delivery arrives; "Adjust" for damage or counting differences.', urdu: 'مینیجر نیا مال وصول یا سٹاک درست کر سکتا ہے۔' },
        ]}
        criticalChecks={[
          'Do not hand over open-seal cans; report damaged seals to the manager.',
          'The low-stock alert shows when cans reach the reorder level.',
          'Print the valuation sheet for the weekly stock audit.',
        ]}
      />
    </div>
  )
}
