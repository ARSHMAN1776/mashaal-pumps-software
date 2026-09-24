/** Small building blocks shared by every screen (they reuse the existing look: page banner, KPI strip, forms, tables). */
import type { ButtonHTMLAttributes, FC, ReactNode } from 'react'
import { rs } from '../../lib/money'

// ---- page header ------------------------------------------------------------------
export const PageHeader: FC<{ eyebrow: string; title: string; subtitle?: ReactNode; actions?: ReactNode }> = ({ eyebrow, title, subtitle, actions }) => (
  <div className="page-title-banner">
    <div>
      <span className="page-eyebrow">{eyebrow}</span>
      <h2 className="page-heading">{title}</h2>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
)

// ---- KPI strip ---------------------------------------------------------------------
type Tone = 'gold' | 'green' | 'red' | 'amber' | 'plain'
const toneClass: Record<Tone, string> = { gold: 'text-gold', green: 'text-green', red: 'text-red', amber: '', plain: '' }

export const Kpi: FC<{ label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }> = ({ label, value, sub, tone = 'plain' }) => (
  <div className="kpi-cell">
    <span className="kpi-label">{label}</span>
    <strong className={`kpi-cell-value ${toneClass[tone]}`} style={tone === 'amber' ? { color: '#b45309' } : undefined}>{value}</strong>
    {sub !== undefined && <span className="kpi-cell-sub">{sub}</span>}
  </div>
)

export const KpiStrip: FC<{ children: ReactNode }> = ({ children }) => <div className="executive-kpi-strip">{children}</div>

// ---- form fields ---------------------------------------------------------------------
export const Field: FC<{ label: ReactNode; hint?: ReactNode; children: ReactNode; strong?: boolean; span?: 2 }> = ({ label, hint, children, strong, span }) => (
  <div className="form-group" style={span === 2 ? { gridColumn: '1 / -1' } : undefined}>
    <label className={`form-label ${strong ? 'font-bold text-gold' : ''}`}>{label}</label>
    {children}
    {hint && <small className="form-help">{hint}</small>}
  </div>
)

export const Grid2: FC<{ children: ReactNode }> = ({ children }) => <div className="form-grid-2">{children}</div>
export const Grid3: FC<{ children: ReactNode }> = ({ children }) => <div className="form-grid-3">{children}</div>
export const Grid4: FC<{ children: ReactNode }> = ({ children }) => <div className="form-grid-4">{children}</div>

/** A strip of "label: value" pills previewing a calculation inside a form. */
export const CalcStrip: FC<{ items: { label: string; value: ReactNode; tone?: 'green' | 'red' | 'gold' }[] }> = ({ items }) => (
  <div className="calc-preview-inline-strip">
    {items.map((i) => (
      <div key={i.label} className="calc-pill-item">
        <span className="calc-pill-label">{i.label}</span>
        <span className={`calc-pill-val ${i.tone === 'green' ? 'text-green' : i.tone === 'red' ? 'text-red' : i.tone === 'gold' ? 'text-gold' : ''}`}>{i.value}</span>
      </div>
    ))}
  </div>
)

// ---- buttons ---------------------------------------------------------------------------
export const IconButton: FC<ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'danger' | 'default'; label: string }> = ({ tone = 'default', label, className = '', children, ...rest }) => (
  <button type="button" className={`ui-icon-btn ${tone === 'danger' ? 'ui-icon-btn-danger' : ''} ${className}`} title={label} aria-label={label} {...rest}>
    {children}
  </button>
)

export const RowActions: FC<{ children: ReactNode }> = ({ children }) => <div className="ui-row-actions">{children}</div>

// ---- tables ------------------------------------------------------------------------------
export const EmptyRow: FC<{ colSpan: number; children: ReactNode }> = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} className="ui-empty">
      {children}
    </td>
  </tr>
)

export const Tabs: FC<{ tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="report-tab-strip" role="tablist">
    {tabs.map((t) => (
      <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`report-tab-btn ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
        {t.label}
        {t.count !== undefined && <span className="ui-tab-count">{t.count}</span>}
      </button>
    ))}
  </div>
)

export const Spinner: FC<{ label?: string }> = ({ label }) => (
  <div className="ui-spinner-wrap" role="status">
    <span className="ui-spinner" aria-hidden="true" />
    {label && <span>{label}</span>}
  </div>
)

export const Money: FC<{ value: number; tone?: boolean }> = ({ value, tone }) => (
  <span className={tone ? (value < 0 ? 'text-red' : value > 0 ? 'text-green' : '') : ''}>{rs(value)}</span>
)

/** date range / month picker row used by list pages */
export const FilterBar: FC<{ children: ReactNode }> = ({ children }) => <div className="ui-filter-bar">{children}</div>

export const Notice: FC<{ tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }> = ({ tone = 'info', children }) => (
  <div className={`ui-notice ui-notice-${tone}`}>{children}</div>
)

export const SectionCard: FC<{ title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }> = ({ title, subtitle, actions, children }) => (
  <div className="table-surface">
    <div className="table-surface-header">
      <div>
        <h3 className="surface-heading">{title}</h3>
        {subtitle && <p className="surface-sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-section-actions">{actions}</div>}
    </div>
    {children}
  </div>
)
