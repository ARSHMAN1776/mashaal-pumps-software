import React, { useState } from 'react'
import { BookOpenIcon, ChevronDownIcon, AlertCircleIcon, ShieldIcon, CheckCircleIcon } from './Icons'

export interface GuideStep {
  step: number
  title: string
  detail: string
  urdu?: string
}

export interface ModuleGuideProps {
  title: string
  urduTitle?: string
  role: 'cashier' | 'manager' | 'owner' | 'all'
  roleLabel: string
  purpose: string
  steps: GuideStep[]
  criticalChecks?: string[]
  defaultOpen?: boolean
}

export const ModuleGuide: React.FC<ModuleGuideProps> = ({
  title,
  urduTitle,
  role,
  roleLabel,
  purpose,
  steps,
  criticalChecks = [],
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const roleBadgeColor =
    role === 'cashier' ? '#2563eb' : role === 'manager' ? '#0d9488' : role === 'owner' ? '#475569' : '#64748b'

  return (
    <div className={`module-guide-card ${isOpen ? 'guide-expanded' : 'guide-collapsed'}`}>
      <div className="module-guide-header" onClick={() => setIsOpen(!isOpen)} role="button" tabIndex={0}>
        <div className="guide-header-left">
          <div className="guide-icon-pill">
            <BookOpenIcon size={16} color="#475569" />
          </div>
          <div>
            <div className="guide-title-line">
              <strong className="guide-title">{title}</strong>
              {urduTitle && <span className="guide-urdu-title">{urduTitle}</span>}
              <span className="guide-role-badge" style={{ backgroundColor: roleBadgeColor }}>
                <ShieldIcon size={11} color="#ffffff" />
                <span>{roleLabel}</span>
              </span>
            </div>
            <p className="guide-purpose-preview">{purpose}</p>
          </div>
        </div>

        <button
          type="button"
          className="guide-toggle-btn"
          aria-expanded={isOpen}
          title={isOpen ? 'Collapse Guide' : 'Open Operational Guide'}
        >
          <span>{isOpen ? 'Hide Guide' : 'Operational Guide / رہنمائی'}</span>
          <span className={`guide-chevron ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={14} />
          </span>
        </button>
      </div>

      {isOpen && (
        <div className="module-guide-body">
          <div className="guide-steps-grid">
            {steps.map((item) => (
              <div key={item.step} className="guide-step-item">
                <div className="guide-step-number">{item.step}</div>
                <div className="guide-step-content">
                  <strong className="step-title">{item.title}</strong>
                  {item.urdu && <span className="step-urdu">{item.urdu}</span>}
                  <p className="step-detail">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {criticalChecks.length > 0 && (
            <div className="guide-critical-box">
              <div className="critical-header">
                <AlertCircleIcon size={15} color="#b45309" />
                <strong>Critical Forecourt Rules (اہم احتیاطی ہدایات):</strong>
              </div>
              <ul className="critical-list">
                {criticalChecks.map((rule, idx) => (
                  <li key={idx}>
                    <CheckCircleIcon size={13} color="#15803d" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
